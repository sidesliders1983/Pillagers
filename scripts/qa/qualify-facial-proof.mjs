import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { Vector3 } from 'three';
import { loadTypeScript } from '../load-typescript.mjs';

globalThis.self = globalThis;
globalThis.createImageBitmap = async () => ({ width: 2048, height: 2048, close() {} });
const load = path => loadTypeScript(new URL('../../src/' + path + '.ts', import.meta.url));
const { MeshyHumanFactory } = load('characters/MeshyHuman');
const { projectFacialIdentity, facialAxes } = load('characters/FacialIdentity');
const { createSettlement } = load('simulation/SimulationCore');
const { generateCharacterDNA } = load('characters/generateCharacterDNA');
const { FjordWardrobe, fjordHairAssets, fjordBeardAssets } = load('fjord-play/FjordWardrobe');
const { nativeFacialAxes } = load('characters/NativeFacialGeometry');
const buffer = bytes => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const factory = new MeshyHumanFactory(async url =>
    loader.parseAsync(buffer(await readFile('public' + url.split('?')[0])), ''),
async url => buffer(await readFile('public' + url.split('?')[0])));
const failures = [], cases = [], topology = [], attachmentCases = [];
const wardrobe = new FjordWardrobe(factory, message => failures.push(message));
const face = projectFacialIdentity(createSettlement(1983), 'einar');
const baseDNA = generateCharacterDNA(1983);
baseDNA.age = 32; baseDNA.sex = 'male';

for (const lod of [0, 1, 2]) {
    const model = await factory.create(baseDNA, lod, undefined, undefined, face);
    const geometry = model.fit.sourceGeometry, position = geometry.getAttribute('position');
    const indices = model.fit.source.indices;
    const original = Array.from({ length: position.count }, (_, i) => new Vector3().fromBufferAttribute(position, i));
    const a = new Vector3(), b = new Vector3(), normal = new Vector3(), changedNormal = new Vector3();
    let reversed = 0, worstDot = 1, checked = 0;
    const reversals = [];
    const combinations = 2 ** nativeFacialAxes.length;
    for (let combination = 0; combination < combinations; combination++) {
        const points = original.map(point => point.clone());
        for (const [axis, attribute] of geometry.morphAttributes.position.entries()) {
            const weight = combination & (1 << axis) ? 1 : axis < facialAxes.length ? -1 : 0;
            for (let i = 0; i < points.length; i++)
                points[i].addScaledVector(new Vector3().fromBufferAttribute(attribute, i), weight);
        }
        for (let index = 0; index < indices.length; index += 3) {
            const [x, y, z] = indices.slice(index, index + 3);
            if ([x, y, z].every(i => model.fit.source.positions[i * 3 + 1] <= 1.44)) continue;
            normal.crossVectors(a.subVectors(original[y], original[x]), b.subVectors(original[z], original[x]));
            changedNormal.crossVectors(a.subVectors(points[y], points[x]), b.subVectors(points[z], points[x]));
            if (normal.lengthSq() < 1e-16) continue;
            const dot = normal.normalize().dot(changedNormal.normalize());
            worstDot = Math.min(worstDot, dot); checked++;
            if (dot <= 0) {
                reversed++;
                if (reversals.length < 20) reversals.push({ combination, triangle: index / 3, dot,
                    points: [x, y, z].map(i => model.fit.source.positions.slice(i * 3, i * 3 + 3)) });
            }
        }
    }
    topology.push({ lod, combinations, checkedFaceTriangles: checked, reversed, worstDot, reversals });
    if (reversed) failures.push(`LOD ${lod}: ${reversed} face-triangle orientation reversals in all-corner stress sweep.`);
    model.dispose();
}

for (const lod of process.argv.includes('--topology-only') ? [] : [0, 1, 2]) for (const extreme of [-1, 1]) {
    for (const occupation of ['farmer', 'fisher', 'hunter', 'smith']) {
        const identity = { ...face, axes: Object.fromEntries(facialAxes.map(axis => [axis, extreme])) };
        const human = await factory.create(baseDNA, lod, undefined, undefined, identity);
        try {
            const entity = { kind: 'persona', id: 'stress', dna: baseDNA,
                status: { occupation, sex: 'male', age: 32 } };
            await wardrobe.reconcile(human, entity);
            const fitRuns = human.modules.fitRuns;
            const installed = human.root.userData.selectedAssets;
            assert.equal(installed.headwear, 'headwear/occupation-' + occupation);
            const correction = [];
            human.root.traverse(node => {
                if (node.userData.facialCorrective) correction.push({ mesh: node.name, ...node.userData.facialCorrective });
            });
            let sampledVertices = 0;
            for (const animation of ['Idle', 'Walk', 'Run']) for (const time of [.1, .55]) {
                human.setAnimation(animation); human.sample(time);
                human.root.updateMatrixWorld(true); human.fit.nativeSkeleton.update();
                human.root.traverse(node => {
                    if (!node.isSkinnedMesh) return;
                    const count = node.geometry.getAttribute('position').count;
                    for (let vertex = 0; vertex < count; vertex += 37) {
                        const point = node.getVertexPosition(vertex, new Vector3());
                        assert.ok(point.toArray().every(Number.isFinite)); sampledVertices++;
                    }
                });
            }
            human.applyDNA({ ...baseDNA, age: 33 });
            await wardrobe.reconcile(human, { ...entity, dna: { ...baseDNA, age: 33 } });
            assert.equal(human.modules.fitRuns, fitRuns);
            cases.push({ lod, extreme, occupation, installed, correction,
                sampledVertices, animationFitRunsUnchanged: human.modules.fitRuns === fitRuns });
        } finally { human.dispose(); }
    }
}
// Deliberate QA outfit overrides cover every supported hair/beard and hat source.
// These are fitting probes, not claims that a resident actually wears this mix.
if (!process.argv.includes('--topology-only')) {
    const hats = ['farmer', 'fisher', 'hunter', 'smith'];
    const checkAttachment = (human, id) => {
        assert.ok(human.fit.modules.has(id), 'Required attachment must load: ' + id);
        human.fit.modules.get(id).traverse(node => {
            if (!node.isSkinnedMesh) return;
            for (let vertex = 0; vertex < node.geometry.getAttribute('position').count; vertex += 37)
                assert.ok(node.getVertexPosition(vertex, new Vector3()).toArray().every(Number.isFinite));
        });
    };
    for (const lod of [0, 1, 2]) for (const extreme of [-1, 1]) {
        for (const sex of ['male', 'female']) for (const [variant, hair] of fjordHairAssets.entries()) {
            const age = variant % 2 ? 64 : 32;
            const dna = { ...baseDNA, age, sex };
            const profile = { ...face, axes: Object.fromEntries(facialAxes.map(axis => [axis, extreme])) };
            const presentation = { hair, beard: sex === 'male' ? fjordBeardAssets[variant] : 'none',
                headwear: 'headwear/occupation-' + hats[variant], outfit: 'none', equipment: 'none' };
            const human = await factory.create(dna, lod, undefined, presentation, profile);
            try {
                human.setAnimation('Run');
                human.sample(.55);
                human.root.updateMatrixWorld(true);
                human.fit.nativeSkeleton.update();
                for (const id of [presentation.hair, presentation.beard, presentation.headwear].filter(id => id !== 'none'))
                    checkAttachment(human, id);
                attachmentCases.push({ lod, extreme, age, sex, presentation, finite: true });
            } finally { human.dispose(); }
        }
        const child = { ...baseDNA, age: 8, sex: 'female' };
        const childProfile = { ...face, axes: Object.fromEntries(facialAxes.map(axis => [axis, extreme])) };
        const childHair = fjordHairAssets[0];
        const young = await factory.create(child, lod, undefined,
            { hair: childHair, beard: 'none', headwear: 'none', outfit: 'none', equipment: 'none' },
            childProfile);
        try {
            young.setAnimation('Run'); young.sample(.55);
            young.root.updateMatrixWorld(true); young.fit.nativeSkeleton.update();
            checkAttachment(young, childHair);
            attachmentCases.push({ lod, extreme, age: 8, sex: 'female',
                presentation: { hair: childHair }, finite: true });
        } finally { young.dispose(); }
    }
}
const files = ['src/characters/FacialIdentity.ts', 'src/characters/NativeFacialGeometry.ts',
    'src/characters/BodyCoverage.ts',
    'src/characters/PreparedNativeOutfit.ts',
    'src/characters/MeshyHuman.ts', 'src/characters/MeshyBodyFitAdapter.ts', 'src/characters/MeshyModuleRuntime.ts',
    'src/characters/UniversalHumanProfile.ts',
    'scripts/qa/qualify-facial-proof.mjs'];
const hashes = {};
for (const file of files) hashes[file] = createHash('sha256').update(await readFile(file)).digest('hex');
await writeFile('docs/qa/facial-identity/qualification.json', JSON.stringify({
    baselineRevision: 'd36d7ef3cbd27ec45bb5bd6cc2fbcc7e8c761d2b',
    generatedAt: new Date().toISOString(), hashes, topology, cases, attachmentCases, failures,
    limitation: 'Finite geometry and stable refit checks are not a visual clearance proof; owner review and physical-device observations remain required.',
}, null, 2));
console.log(JSON.stringify({ topology, cases: cases.length, attachmentCases: attachmentCases.length, failures }, null, 2));
if (failures.length) process.exitCode = 1;
