import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Group, Color, Vector4, Vector3, SRGBColorSpace } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { load } from './load-source.mjs';

const { MeshyHumanFactory } = load('../src/characters/MeshyHuman.ts');
const { defaultDNA } = load('../src/characters/CharacterDNA.ts');
const { characterAsset } = load('../src/characters/CharacterAssets.ts');
const { fjordClothingSets } = load('../src/fjord-play/FjordWardrobe.ts');
const armorId = 'garment/native-leather-body-armor';
const tunicId = 'garment/meshy-grid-trial-001';
const meshName = 'Module_grid_trial_top_0';
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
globalThis.self = globalThis;
globalThis.createImageBitmap = async () => ({ width: 2048, height: 2048, close() {} });

function geometryDigest(geometry) {
    const hash = createHash('sha256');
    for (const [name, attribute] of Object.entries(geometry.attributes)) {
        hash.update(name);
        hash.update(new Uint8Array(attribute.array.buffer, attribute.array.byteOffset, attribute.array.byteLength));
    }
    if (geometry.index) hash.update(new Uint8Array(geometry.index.array.buffer,
        geometry.index.array.byteOffset, geometry.index.array.byteLength));
    return hash.digest('hex');
}
const moduleMesh = (human, id, name) => human.fit.modules.get(id).children
    .find(mesh => mesh.isSkinnedMesh && (!name || mesh.name === name));
let technicalFit;
async function sampleTechnicalFit() {
    if (technicalFit) return structuredClone(technicalFit);
    const bytes = await readFile('public/character-lab/candidates/meshy-grid-trial-002/outfit.glb');
    const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder)
        .parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
    const mesh = gltf.scene.getObjectByName(meshName), positions = mesh.geometry.getAttribute('position');
    technicalFit = { version: 1, meshName, maximumDisplacementMetres: .002,
        vertices: [100, 101].map(vertex => ({ vertex,
            position: [positions.getX(vertex) - .001, positions.getY(vertex), positions.getZ(vertex)] })) };
    return structuredClone(technicalFit);
}

/** These two small offsets exercise the public fitting contract, not artwork acceptance. */
async function fixture(t, mutate = () => {}, alterMaterial) {
    const asset = characterAsset(armorId), original = asset.metadata.nativeBinding;
    const binding = JSON.parse(await readFile('public' + original.path, 'utf8'));
    binding.bodyArmorLayer.underlayFit = await sampleTechnicalFit();
    mutate(binding);
    const bindingBytes = Buffer.from(JSON.stringify(binding));
    asset.metadata.nativeBinding = { ...original, sha256: digest(bindingBytes) };
    t.after(() => { asset.metadata.nativeBinding = original; });
    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder), sources = [];
    const bytes = async path => {
        const value = path.split('?')[0] === original.path ? bindingBytes : await readFile('public' + path.split('?')[0]);
        return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
    };
    const factory = new MeshyHumanFactory(async path => {
        const gltf = await loader.parseAsync(await bytes(path), '');
        if (alterMaterial && path.split('?')[0] === asset.lods[2]) gltf.scene.traverse(mesh => {
            if (mesh.isMesh) for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material])
                alterMaterial(material);
        });
        sources.push(gltf.scene); return gltf;
    }, bytes);
    const base = { ...fjordClothingSets.generic, hair: 'none', beard: 'none' };
    return { factory, sources, base, armored: { ...base, bodyArmor: armorId }, binding };
}

function sourceDigests(sources) {
    return sources.flatMap(scene => {
        const values = []; scene.traverse(mesh => { if (mesh.isMesh) values.push(geometryDigest(mesh.geometry)); });
        return values;
    });
}

test('a qualified vest fits only private declared tunic vertices and restores its exact source on unequip', async t => {
    const { factory, sources, base, armored, binding } = await fixture(t);
    const human = await factory.create(defaultDNA(), 2, undefined, base);
    const twin = await factory.create(defaultDNA(), 2, undefined, base);
    try {
        const original = moduleMesh(human, tunicId, meshName).geometry;
        const originalDigest = geometryDigest(original), originalIndices = Array.from(original.index.array);
        const originalAttributes = Object.fromEntries(Object.entries(original.attributes)
            .map(([name, attribute]) => [name, Array.from(attribute.array)]));
        const twinDigest = geometryDigest(moduleMesh(twin, tunicId, meshName).geometry);
        const bodyDigest = geometryDigest(human.fit.mesh.geometry);
        const trousersDigest = geometryDigest(moduleMesh(human, tunicId, 'Module_grid_trial_trousers_0').geometry);
        const cachedSources = sourceDigests(sources);
        await factory.equip(human, armored);
        const fitted = moduleMesh(human, tunicId, meshName).geometry;
        assert.deepEqual(Array.from(fitted.index.array), originalIndices, 'Fitting preserves every original face');
        const declared = new Map(binding.bodyArmorLayer.underlayFit.vertices.map(value => [value.vertex, value]));
        const position = fitted.getAttribute('position'), inverseEncoding = human.fit.encoding.clone().invert();
        let changed = 0;
        for (let vertex = 0; vertex < position.count; vertex++) {
            const actual = [position.getX(vertex), position.getY(vertex), position.getZ(vertex)];
            const before = originalAttributes.position.slice(vertex * 3, vertex * 3 + 3);
            if (declared.has(vertex)) {
                const expected = new Vector3(...declared.get(vertex).position).applyMatrix4(inverseEncoding).toArray();
                assert.ok(actual.every((value, axis) => Math.abs(value - expected[axis]) < 1e-6));
                assert.notDeepEqual(actual, before); changed++;
            } else assert.deepEqual(actual, before, 'Every exposed/unlisted source position is exact');
        }
        assert.equal(changed, declared.size);
        for (const [name, values] of Object.entries(originalAttributes)) {
            if (name !== 'position' && name !== 'normal')
                assert.deepEqual(Array.from(fitted.getAttribute(name).array), values, name + ' remains exact');
        }
        const normalNeighbors = new Set(declared.keys());
        for (let offset = 0; offset < originalIndices.length; offset += 3) {
            const face = originalIndices.slice(offset, offset + 3);
            if (face.some(vertex => declared.has(vertex))) face.forEach(vertex => normalNeighbors.add(vertex));
        }
        const normals = fitted.getAttribute('normal');
        for (let vertex = 0; vertex < normals.count; vertex++) if (!normalNeighbors.has(vertex))
            assert.deepEqual([normals.getX(vertex), normals.getY(vertex), normals.getZ(vertex)],
                originalAttributes.normal.slice(vertex * 3, vertex * 3 + 3), 'Distant exposed normals stay exact');
        assert.equal(geometryDigest(human.fit.mesh.geometry), bodyDigest);
        assert.equal(geometryDigest(moduleMesh(human, tunicId, 'Module_grid_trial_trousers_0').geometry), trousersDigest);
        assert.equal(geometryDigest(moduleMesh(twin, tunicId, meshName).geometry), twinDigest);
        const fitRuns = human.modules.fitRuns;
        human.sampleAnimation('Run', .3); human.update(.1);
        assert.equal(human.modules.fitRuns, fitRuns, 'Motion does not recalculate garment fitting');
        await factory.equip(human, base);
        assert.equal(geometryDigest(moduleMesh(human, tunicId, meshName).geometry), originalDigest);
        assert.deepEqual(sourceDigests(sources).slice(0, cachedSources.length), cachedSources);
    } finally { human.dispose(); twin.dispose(); }
});

test('malformed underlay fit fails atomically before replacing a live outfit', async t => {
    const cases = [
        ['wrong mesh', fit => { fit.meshName = 'Module_grid_trial_trousers_0'; }, /underlay fit/],
        ['wrong version', fit => { fit.version = 2; }, /underlay fit/],
        ['duplicate vertex', fit => { fit.vertices.push(structuredClone(fit.vertices[0])); }, /underlay fit/],
        ['negative vertex', fit => { fit.vertices[0].vertex = -1; }, /underlay fit/],
        ['fractional vertex', fit => { fit.vertices[0].vertex = 1.5; }, /underlay fit/],
        ['out of range vertex', fit => { fit.vertices[0].vertex = 10000000; }, /vertex count/],
        ['nonfinite position', fit => { fit.vertices[0].position[0] = Infinity; }, /underlay fit/],
        ['invalid coordinate length', fit => { fit.vertices[0].position.pop(); }, /underlay fit/],
        ['understated displacement', fit => { fit.maximumDisplacementMetres = .0001; }, /displacement/],
        ['unbounded displacement', fit => { fit.maximumDisplacementMetres = 10; }, /displacement/],
        ['unpaired joints', fit => { fit.vertices[0].joints = [0, 1, 2, 3]; }, /native influences/],
        ['invalid joint', fit => { fit.vertices[0].joints = [0, 1, 2, 1000]; fit.vertices[0].weights = [.25, .25, .25, .25]; }, /native influences/],
        ['unnormalized influences', fit => { fit.vertices[0].joints = [0, 1, 2, 3]; fit.vertices[0].weights = [1, 1, 1, 1]; }, /native influences/],
    ];
    for (const [label, mutate, expected] of cases) await t.test(label, async child => {
        const { factory, base, armored } = await fixture(child, binding => mutate(binding.bodyArmorLayer.underlayFit));
        const human = await factory.create(defaultDNA(), 2, undefined, base);
        try {
            const group = human.fit.modules.get(tunicId), geometry = moduleMesh(human, tunicId, meshName).geometry;
            const before = geometryDigest(geometry), bodyBefore = geometryDigest(human.fit.mesh.geometry);
            await assert.rejects(factory.equip(human, armored), expected);
            assert.equal(human.fit.modules.get(tunicId), group);
            assert.equal(moduleMesh(human, tunicId, meshName).geometry, geometry);
            assert.equal(geometryDigest(geometry), before);
            assert.equal(geometryDigest(human.fit.mesh.geometry), bodyBefore);
            assert.equal(human.fit.modules.has(armorId), false);
        } finally { human.dispose(); }
    });
});


test('fitted native influences affect only declared private vertices and restore on removal', async t => {
    const { factory, base, armored } = await fixture(t, binding => {
        binding.bodyArmorLayer.underlayFit.vertices[0].joints = [0, 1, 2, 3];
        binding.bodyArmorLayer.underlayFit.vertices[0].weights = [.1, .2, .3, .4];
    });
    const human = await factory.create(defaultDNA(), 2, undefined, base);
    try {
        const original = moduleMesh(human, tunicId, meshName).geometry;
        const before = geometryDigest(original), oldJoints = Array.from(original.getAttribute('skinIndex').array);
        const oldWeights = Array.from(original.getAttribute('skinWeight').array);
        await factory.equip(human, armored);
        const geometry = moduleMesh(human, tunicId, meshName).geometry;
        const joints = geometry.getAttribute('skinIndex'), weights = geometry.getAttribute('skinWeight');
        assert.deepEqual(Array.from(joints.array).slice(400, 404), [0, 1, 2, 3]);
        assert.ok(Array.from(weights.array).slice(400, 404).every((value, i) => Math.abs(value - [.1, .2, .3, .4][i]) < 1e-6));
        assert.deepEqual(Array.from(joints.array).slice(0, 400), oldJoints.slice(0, 400));
        assert.deepEqual(Array.from(joints.array).slice(404), oldJoints.slice(404));
        assert.deepEqual(Array.from(weights.array).slice(0, 400), oldWeights.slice(0, 400));
        assert.deepEqual(Array.from(weights.array).slice(404), oldWeights.slice(404));
        await factory.equip(human, base);
        assert.equal(geometryDigest(moduleMesh(human, tunicId, meshName).geometry), before);
    } finally { human.dispose(); }
});

test('stale sources, native body changes and nonopaque layers fail before replacing the wearer', async t => {
    const cases = [
        ['wrong tunic hash', binding => { binding.bodyArmorLayer.underlaySha256 = '0'.repeat(64); }, /qualified field tunic/],
        ['wrong tunic identity', binding => { binding.bodyArmorLayer.underlayId = 'garment/meshy-fisherman-tunic-009'; }, /qualified field tunic/],
        ['extra body coverage', binding => { binding.precomputedNative.moduleCoverage = [{ regions: ['TORSO_UPPER'], minimumY: 1, maximumY: 1.4 }]; }, /unchanged native body coverage/],
        ['extra body opening', binding => { binding.precomputedNative.bodyOpenings = [{ minimumY: 1, maximumY: 1.4, planes: [] }]; }, /unchanged native body coverage/],
        ['transparent layer', () => {}, /opaque Body Armor/, material => { material.transparent = true; }],
        ['partial opacity', () => {}, /opaque Body Armor/, material => { material.opacity = .5; }],
        ['cutout material', () => {}, /opaque Body Armor/, material => { material.alphaTest = .5; }],
        ['invisible layer', () => {}, /opaque Body Armor/, material => { material.colorWrite = false; }],
    ];
    for (const [label, mutate, expected, material] of cases) await t.test(label, async child => {
        const { factory, base, armored } = await fixture(child, mutate, material);
        const human = await factory.create(defaultDNA(), 2, undefined, base);
        try {
            const group = human.fit.modules.get(tunicId), geometry = moduleMesh(human, tunicId, meshName).geometry;
            const before = geometryDigest(geometry), body = geometryDigest(human.fit.mesh.geometry);
            const presentation = JSON.stringify(human.root.userData.presentation);
            await assert.rejects(factory.equip(human, armored), expected);
            assert.equal(human.fit.modules.get(tunicId), group);
            assert.equal(moduleMesh(human, tunicId, meshName).geometry, geometry);
            assert.equal(geometryDigest(geometry), before);
            assert.equal(geometryDigest(human.fit.mesh.geometry), body);
            assert.equal(JSON.stringify(human.root.userData.presentation), presentation);
        } finally { human.dispose(); }
    });
});

test('absent underlay fit leaves the normal tunic exact and unsupported age restores the complete native body', async t => {
    const { factory, base, armored } = await fixture(t, binding => {
        delete binding.bodyArmorLayer.underlayFit; return binding;
    });
    const human = await factory.create({ ...defaultDNA(), age: 16 }, 2, undefined, base);
    try {
        const before = geometryDigest(moduleMesh(human, tunicId, meshName).geometry);
        await factory.equip(human, armored);
        assert.equal(geometryDigest(moduleMesh(human, tunicId, meshName).geometry), before);
        human.applyDNA({ ...human.dna, age: 15 });
        assert.equal(human.fit.modules.has(armorId), false);
        assert.equal(human.fit.modules.has(tunicId), false);
        assert.equal(human.fit.mesh.geometry, human.fit.sourceGeometry);
    } finally { human.dispose(); }
});

test('an age fallback removes the private fit and a failed borrowed portrait preserves the fitted wearer', async t => {
    const { factory, base, armored } = await fixture(t, binding => {
        return binding;
    });
    const human = await factory.create({ ...defaultDNA(), age: 16 }, 2, undefined, armored);
    const world = new Group(); world.add(human.root); human.root.position.set(3, 0, 5);
    const state = { target: null, viewport: new Vector4(0, 0, 800, 600), scissor: new Vector4(0, 0, 800, 600), test: false };
    const renderer = { toneMapping: 3, toneMappingExposure: .7, autoClear: false,
        outputColorSpace: SRGBColorSpace, shadowMap: { enabled: true },
        getRenderTarget: () => state.target, getActiveCubeFace: () => 0, getActiveMipmapLevel: () => 0,
        setRenderTarget: value => { state.target = value; }, getViewport: out => out.copy(state.viewport),
        setViewport: value => state.viewport.copy(value), getScissor: out => out.copy(state.scissor),
        setScissor: value => state.scissor.copy(value), getScissorTest: () => state.test,
        setScissorTest: value => { state.test = value; }, getClearColor: out => out.copy(new Color('#123456')),
        getClearAlpha: () => 1, setClearColor() {}, render() { throw new Error('QA graphics boundary'); },
    };
    const { ResidentPortraitStudio } = load('../src/characters/ResidentPortraitStudio.ts');
    const studio = new ResidentPortraitStudio(renderer, () => 'unreachable');
    try {
        const geometry = moduleMesh(human, tunicId, meshName).geometry;
        const before = geometryDigest(geometry), fits = human.modules.fitRuns;
        assert.throws(() => studio.capture(human, 1, 'equipment'), /QA graphics boundary/);
        assert.equal(human.root.parent, world);
        assert.equal(geometryDigest(moduleMesh(human, tunicId, meshName).geometry), before);
        assert.equal(human.modules.fitRuns, fits);
        assert.equal(state.target, null);
        human.applyDNA({ ...human.dna, age: 15 });
        assert.equal(human.fit.modules.has(armorId), false);
        assert.equal(human.fit.mesh.geometry, human.fit.sourceGeometry);
        human.applyDNA({ ...human.dna, age: 16 });
        await factory.equip(human, base);
        assert.equal(moduleMesh(human, tunicId, meshName).geometry.index.count, 276297);
    } finally { studio.dispose(); human.dispose(); }
});
