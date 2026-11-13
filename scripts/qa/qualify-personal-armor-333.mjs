/** Reproduce a bounded actual native composite qualification; no campaign/UI state is touched. */
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { Box3, Ray, Triangle, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { loadTypeScript } from '../load-typescript.mjs';

const load = path => loadTypeScript(new URL(path, import.meta.url));
const { MeshyHumanFactory } = load('../../src/characters/MeshyHuman.ts');
const { defaultDNA } = load('../../src/characters/CharacterDNA.ts');
const { fjordClothingSets } = load('../../src/fjord-play/FjordWardrobe.ts');
const armorId = 'garment/native-leather-body-armor';
const tunicId = 'garment/meshy-grid-trial-001';
const armorPath = 'public/character-lab/modules/native-personal-armor/leather-body-armor.glb';
const bindingPath = armorPath.replace('.glb', '.binding.json');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const inputPaths = [armorPath, bindingPath, 'scripts/characters/native-personal-armor-underlay-fit.json',
    'src/characters/MeshyModuleRuntime.ts', 'src/characters/NativeHeadwearFit.ts',
    'src/characters/PreparedNativeOutfit.ts', 'src/characters/BodyFitAdapter.ts'];
const inputs = Object.fromEntries(await Promise.all(inputPaths.map(async path => [path, hash(await readFile(path))])));
assert.equal(inputs[armorPath], '1083a715439a5a2acb3b714908070802459d3d0b8f72eb5d270956f9152c002a');
assert.equal(inputs[bindingPath], '8f9653339f32015fd46d56198110e28d4c0ea9c3f466658e992356b8b2d2e4c8');

globalThis.self = globalThis;
globalThis.createImageBitmap = async () => ({ width: 2048, height: 2048, close() {} });
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const bytes = async path => {
    const value = await readFile('public' + path.split('?')[0]);
    return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
};
const factory = new MeshyHumanFactory(async path => loader.parseAsync(await bytes(path), ''), bytes);
const sourceTunic = await loader.parseAsync(await bytes('/character-lab/candidates/meshy-grid-trial-002/outfit.glb'), '');
const sourceTop = sourceTunic.scene.getObjectByName('Module_grid_trial_top_0');
const clothBounds = new Box3().setFromBufferAttribute(sourceTop.geometry.getAttribute('position'));
const assertFinitePoints = points => {
    assert.ok(points.every(point => Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.z)),
        'Every queried posed native point must be finite');
    return points;
};
const worldPoints = mesh => assertFinitePoints(Array.from({ length: mesh.geometry.getAttribute('position').count }, (_, vertex) =>
    mesh.getVertexPosition(vertex, new Vector3()).applyMatrix4(mesh.matrixWorld)));
const bodyPoints = human => {
    const posed = human.fit.surface('posed').positions;
    return assertFinitePoints(Array.from({ length: posed.length / 3 }, (_, vertex) =>
        new Vector3().fromArray(posed, vertex * 3).applyMatrix4(human.fit.mesh.matrixWorld)));
};
const moduleMesh = (human, id, name) => human.fit.modules.get(id).children
    .find(mesh => mesh.isSkinnedMesh && (!name || mesh.name === name));
function geometryDigest(geometry) {
    const value = createHash('sha256');
    for (const [name, attribute] of Object.entries(geometry.attributes)) {
        value.update(name);
        value.update(new Uint8Array(attribute.array.buffer, attribute.array.byteOffset, attribute.array.byteLength));
    }
    value.update(new Uint8Array(geometry.index.array.buffer, geometry.index.array.byteOffset, geometry.index.array.byteLength));
    return value.digest('hex');
}

/** The BVH is a diagnostic ray query, not runtime collision or a material exemption. */
function raySurface(points, indices) {
    const faces = [];
    for (let offset = 0; offset < indices.length; offset += 3) {
        const corners = indices.slice(offset, offset + 3).map(vertex => points[vertex]);
        const triangle = new Triangle(...corners);
        if (triangle.getArea() > 1e-14) faces.push({ face: offset / 3, triangle,
            normal: triangle.getNormal(new Vector3()), box: new Box3().setFromPoints(corners) });
    }
    function build(entries) {
        const box = new Box3(); for (const face of entries) box.union(face.box);
        if (entries.length <= 12) return { box, faces: entries };
        const size = box.getSize(new Vector3());
        const axis = size.x >= size.y && size.x >= size.z ? 'x' : size.y >= size.z ? 'y' : 'z';
        entries.sort((a, b) => a.box.min[axis] + a.box.max[axis] - b.box.min[axis] - b.box.max[axis]);
        const middle = Math.floor(entries.length / 2);
        return { box, left: build(entries.slice(0, middle)), right: build(entries.slice(middle)) };
    }
    const tree = build(faces), ray = new Ray(), hit = new Vector3();
    return (origin, direction) => {
        ray.origin.copy(origin); ray.direction.copy(direction); const hits = [];
        const visit = node => {
            if (!ray.intersectsBox(node.box)) return;
            if (node.faces) for (const face of node.faces) {
                if (!ray.intersectTriangle(face.triangle.a, face.triangle.b, face.triangle.c, false, hit)) continue;
                const distance = hit.distanceTo(origin);
                if (distance > 1e-7 && distance < .12) hits.push({ face: face.face, distance,
                    sign: Math.sign(face.normal.dot(direction)) });
            } else { visit(node.left); visit(node.right); }
        };
        visit(tree); hits.sort((a, b) => a.distance - b.distance);
        return hits.filter((value, i) => i === 0 || value.distance - hits[i - 1].distance > 1e-5);
    };
}

const allStates = [
    { name: 'Idle .6', clip: 'Idle', time: .6 }, { name: 'Walk .25', clip: 'Walk', time: .25 },
    { name: 'Run .3', clip: 'Run', time: .3 }, { name: 'ready .5', action: 'ready', phase: .5 },
    { name: 'spear .5', action: 'spear', phase: .5 }, { name: 'spear 1', action: 'spear', phase: 1 },
    { name: 'shield .5', action: 'shield', phase: .5 }, { name: 'shield 1', action: 'shield', phase: 1 },
    { name: 'brace .5', action: 'brace', phase: .5 }, { name: 'withdraw .5', action: 'withdraw', phase: .5 },
    { name: 'death 0', action: 'death', phase: 0 }, { name: 'death .5', action: 'death', phase: .5 },
    { name: 'death 1', action: 'death', phase: 1 },
];
const compactNames = new Set(['Idle .6', 'spear .5', 'shield 1', 'death 1']);
const profiles = [{ name: 'default adult', dna: defaultDNA(), lods: [2, 0, 1] }];
for (const [name, age, masculinity, height, intelligence] of [
    ['adult female low', 32, .15, 1.16, 1], ['adult male high', 32, .85, 1.60, 0],
    ['teen female low', 16, .15, 1.16, 1], ['teen male high', 16, .85, 1.60, 0],
    ['older female low', 75, .05, 1.16, 1], ['older male high', 100, .95, 1.60, 0],
]) {
    const dna = defaultDNA(); profiles.push({ name, lods: [2], dna: { ...dna, age,
        sex: masculinity < .5 ? 'female' : 'male', morphology: { masculinity, height },
        traits: { ...dna.traits, intelligence } } });
}
const presentation = (armored, shield) => ({ ...fjordClothingSets.generic, hair: 'none', beard: 'none',
    headwear: 'headwear/native-iron-helmet', bodyArmor: armored ? armorId : 'none',
    equipmentItems: ['equipment/native-iron-spear', ...(shield ? ['equipment/native-iron-shield'] : [])] });
const referenceFrames = new Map(), cases = [], crossLOD = [];
const started = performance.now();
for (const profile of profiles) for (const lod of profile.lods) {
    const states = profile.name === 'default adult' && lod === 2 ? allStates : allStates.filter(state => compactNames.has(state.name));
    const human = await factory.create(profile.dna, lod, undefined, presentation(false, true));
    const source = human.fit.source, sourceCount = source.positions.length / 3;
    const domain = [];
    for (let face = 0; face < source.indices.length / 3; face++) {
        const native = new Vector3();
        for (const vertex of source.indices.slice(face * 3, face * 3 + 3)) native.add(new Vector3().fromArray(source.positions, vertex * 3));
        native.multiplyScalar(1 / 3);
        if (native.y >= clothBounds.min.y - .03 && native.y <= clothBounds.max.y + .03)
            domain.push({ face, barycentric: [1 / 3, 1 / 3, 1 / 3], native: native.toArray() });
    }
    const baseline = new Map(), originalTunic = geometryDigest(moduleMesh(human, tunicId, 'Module_grid_trial_top_0').geometry);
    let hasShield = true, armored = false;
    async function sample(state) {
        const shield = state.action !== 'death';
        if (hasShield !== shield) { hasShield = shield; await factory.equip(human, presentation(armored, shield)); }
        const fitRuns = human.modules.fitRuns;
        if (state.clip) human.sampleAnimation(state.clip, state.time);
        else human.sampleEncounterPose({ key: 'bounded-armor-composite', action: state.action,
            startedAt: 0, durationTicks: 8, tick: state.phase * 8, hasSpear: true, hasShield: shield });
        human.root.updateMatrixWorld(true);
        assert.equal(human.modules.fitRuns, fitRuns, 'Motion cannot trigger appearance fitting');
        assert.equal(human.fit.nativeSkeleton.bones.length, 44);
        assert.ok(human.fit.nativeSkeleton.bones.every(bone => bone.matrixWorld.elements.every(Number.isFinite)),
            'Every native bone world-matrix element must be finite');
        assert.equal(JSON.stringify(human.dna), JSON.stringify(profile.dna));
    }
    function inspect(samples, baselineCovered) {
        const points = bodyPoints(human), top = moduleMesh(human, tunicId, 'Module_grid_trial_top_0');
        assert.equal(points.length, sourceCount);
        const cloth = raySurface(worldPoints(top), Array.from(top.geometry.index.array));
        const armor = armored ? moduleMesh(human, armorId) : null;
        const vest = armor ? raySurface(worldPoints(armor), Array.from(armor.geometry.index.array)) : null;
        const covered = new Set(), gaps = [], contacts = []; let comparable = 0;
        const sampleKey = sample => sample.face + ':' + sample.barycentric.map(value => value.toFixed(9)).join(',');
        for (const sample of samples) {
            const ids = Array.from(source.indices.slice(sample.face * 3, sample.face * 3 + 3));
            const corners = ids.map(vertex => points[vertex]);
            const origin = corners.reduce((sum, point, corner) => sum.addScaledVector(point, sample.barycentric[corner]), new Vector3());
            const normal = new Triangle(...corners).getNormal(new Vector3());
            const clothHits = cloth(origin, normal), vestHits = vest?.(origin, normal) ?? [];
            if (clothHits.length || vestHits.length) covered.add(sampleKey(sample));
            if (baselineCovered?.has(sampleKey(sample)) && !clothHits.length && !vestHits.length)
                gaps.push({ ...sample, origin: origin.toArray(), regions: ids.map(vertex => source.regions[vertex]) });
            const outerCloth = clothHits.find(hit => hit.sign > 0), outerVest = vestHits.find(hit => hit.sign > 0);
            if (!outerCloth || !outerVest) continue;
            comparable++;
            const protrusion = outerCloth.distance - outerVest.distance;
            if (protrusion > 0) contacts.push({ ...sample, origin: origin.toArray(),
                regions: ids.map(vertex => source.regions[vertex]), outerCloth, outerVest, protrusionMetres: protrusion });
        }
        contacts.sort((a, b) => b.protrusionMetres - a.protrusionMetres);
        return { covered, samples: samples.length, comparable, potentialNewGaps: gaps,
            positiveOuterClothContacts: contacts.length, maximumProtrusionMetres: contacts[0]?.protrusionMetres ?? 0,
            largestContacts: contacts.slice(0, 12) };
    }
    try {
        const samplesFor = state => {
            const values = [...domain];
            if (profile.name === 'default adult' && lod === 2 && state.name === 'death 1')
                for (const face of [1856, 1857, 1863]) for (let a = 0; a <= 8; a++) for (let b = 0; b <= 8 - a; b++)
                    values.push({ face, barycentric: [a / 8, b / 8, 1 - (a + b) / 8], knownCentralBackProbe: true });
            return values;
        };
        for (const state of states) { await sample(state); baseline.set(state.name, inspect(samplesFor(state)).covered); }
        armored = true; hasShield = true; await factory.equip(human, presentation(true, true));
        for (const state of states) {
            await sample(state);
            const sampled = samplesFor(state);
            const result = inspect(sampled, baseline.get(state.name));
            const record = { profile: profile.name, dna: profile.dna, lod, pose: state,
                bodySourceSha256: human.fit.body.sha256, hasSpear: true, hasShield,
                samples: result.samples, comparable: result.comparable,
                potentialNewGapCount: result.potentialNewGaps.length, potentialNewGaps: result.potentialNewGaps.slice(0, 15),
                positiveOuterClothContacts: result.positiveOuterClothContacts,
                maximumProtrusionMetres: result.maximumProtrusionMetres, largestContacts: result.largestContacts };
            cases.push(record);
            if (profile.name === 'default adult' && compactNames.has(state.name)) {
                const groups = [moduleMesh(human, armorId), moduleMesh(human, tunicId, 'Module_grid_trial_top_0')];
                const values = groups.flatMap(mesh => worldPoints(mesh).flatMap(point => point.toArray()));
                const bones = human.fit.nativeSkeleton.bones.flatMap(bone => bone.matrixWorld.toArray());
                if (lod === 2) referenceFrames.set(state.name, { values, bones });
                else {
                    const reference = referenceFrames.get(state.name);
                    assert.equal(values.length, reference.values.length);
                    let maximumWorldDelta = 0, maximumBoneMatrixDelta = 0;
                    for (let i = 0; i < values.length; i += 3) maximumWorldDelta = Math.max(maximumWorldDelta,
                        Math.hypot(values[i] - reference.values[i], values[i + 1] - reference.values[i + 1], values[i + 2] - reference.values[i + 2]));
                    for (let i = 0; i < bones.length; i++) maximumBoneMatrixDelta = Math.max(maximumBoneMatrixDelta, Math.abs(bones[i] - reference.bones[i]));
                    crossLOD.push({ lod, referenceLOD: 2, pose: state.name, maximumWorldDeltaMetres: maximumWorldDelta, maximumBoneMatrixElementDelta: maximumBoneMatrixDelta });
                }
            }
        }
        armored = false; await factory.equip(human, presentation(false, hasShield));
        assert.equal(geometryDigest(moduleMesh(human, tunicId, 'Module_grid_trial_top_0').geometry), originalTunic,
            'Every sampled wearer restores the exact original normal tunic');
        console.log(JSON.stringify({ profile: profile.name, lod, states: states.length,
            maximumProtrusionMetres: Math.max(...cases.filter(value => value.profile === profile.name && value.lod === lod).map(value => value.maximumProtrusionMetres)),
            potentialGapStates: cases.filter(value => value.profile === profile.name && value.lod === lod && value.potentialNewGapCount).length }));
    } finally { human.dispose(); }
}
assert.equal(cases.length, 45);
for (const [path, sha256] of Object.entries(inputs)) assert.equal(hash(await readFile(path)), sha256, 'Qualification inputs changed during the run');
const report = { version: 1, status: 'MEASURED: bounded native composite; no zero-contact or owner-acceptance claim',
    createdAt: new Date().toISOString(), scriptSha256: hash(await readFile(new URL(import.meta.url))), inputs,
    profiles, states: cases.length, actualPoseEvaluations: cases.length * 2,
    method: 'Actual complete native body triangle centroids in the source normal-tunic height band, plus135 exact known default-Death central-back rays. Compare actual outward cloth and vest walls; normal-tunic baseline identifies potential added cover gaps. No anatomical contact exemption or global pass threshold is applied.',
    mechanicalAssertions: 'PASS:44-bone rig, finite queried body/cloth/vest points and native bone matrices, unchanged DNA, no motion fitting, exact normal-tunic restoration',
    knownMinorArtifact: 'The current combined-QA candidate has an explicitly recorded defaultLOD2 Death central-back cloth contact up to4.55mm; source opening-edge and raw source-self contacts are not claimed absent. All contacts remain reported.',
    crossLOD, cases, durationMilliseconds: performance.now() - started,
    limitations: ['Finite source-surface rays do not prove continuous triangle coverage or every camera/view.',
        'The120mm diagnostic search range and source-tunic height sampling band bound this measurement; they are not collision tolerances.',
        'An outward cloth contact can be a true folded sleeve; source anatomy/native anchors and rendered views must distinguish it from a torso poke.',
        'Age, sex and specified height/face samples are representative; unlisted morphs, hardware/phone thermal/GPU performance and continuous animation remain unqualified.',
        'This script does not requalify the unchanged helmet crown algorithm or replace the separate all-hand-prop matrix.'] };
await mkdir('output/native-personal-armor-333', { recursive: true });
await writeFile('output/native-personal-armor-333/bounded-composite-qualification.json', JSON.stringify(report, null, 2) + String.fromCharCode(10));
console.log(JSON.stringify({ cases: cases.length, crossLOD: crossLOD.length,
    maximumProtrusionMetres: Math.max(...cases.map(value => value.maximumProtrusionMetres)),
    potentialGapCases: cases.filter(value => value.potentialNewGapCount).length, durationMilliseconds: report.durationMilliseconds }));
