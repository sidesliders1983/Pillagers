import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { createHash } from 'node:crypto';
import { Vector3, Box3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { createArmStretchMeasure } from './qa/outfit-arm-stretch.js';

const files = [
    { path: '/character-lab/candidates/meshy-grid-trial-002/outfit.binding.json',
        measurements: 'src/characters/GridTrialOutfitMeasurements.ts' },
    { path: '/character-lab/candidates/meshy-additional-005/low-shoes.binding.json',
        measurements: 'src/characters/AdditionalOutfitMeasurements.ts' },
];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const candidates = new Map(), changes = [];
for (const file of files) {
    const original = await readFile('public' + file.path), binding = JSON.parse(original);
    assert.equal(hash(await readFile('public' + file.path.replace('.binding.json', '.glb'))), binding.moduleSha256,
        'Age qualification cannot change or silently replace existing garment geometry');
    const previous = binding.recipe.ageRangeQualification?.predecessorBindingSha256 ?? hash(original);
    binding.supportedAges = { min: 16, max: 100 };
    binding.recipe.ageRangeQualification = { id: 'field-teen-native-16-17', version: 1,
        predecessorBindingSha256: previous, geometryChanged: false,
        qualification: 'Native factory geometry and sleeve-stretch checks; visual owner QA remains pending' };
    const bytes = Buffer.from(JSON.stringify(binding, null, 2) + '\n');
    candidates.set(file.path, bytes);
    changes.push({ ...file, predecessorBindingSha256: previous, previousSha256: hash(original), candidateSha256: hash(bytes),
        moduleSha256: binding.moduleSha256, bytes });
}
// Isolate module ownership and patch only the exact candidate metadata hashes in memory.
// The real native factory still verifies every supplied candidate binding byte hash.
const nativeRequire = createRequire(import.meta.url), moduleCache = new Map(), sourceFiles = [];
function loadTypeScript(url) {
    const key = new URL(url).href;
    if (moduleCache.has(key)) return moduleCache.get(key);
    const module = { exports: {} };
    moduleCache.set(key, module.exports);
    let source = readFileSync(new URL(key), 'utf8');
    const originalHash = hash(source);
    for (const change of changes) if (key.endsWith('/' + change.measurements)) {
        assert.ok(source.includes(change.previousSha256));
        source = source.replaceAll(change.previousSha256, change.candidateSha256);
    }
    sourceFiles.push({ path: new URL(key).pathname, sourceSha256: originalHash,
        candidateSha256: hash(source) });
    const javascript = ts.transpileModule(source, { compilerOptions: {
        module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    new Function('require', 'module', 'exports', javascript)(name => name.startsWith('.') ?
        loadTypeScript(new URL(name.endsWith('.json') ? name : name + '.ts', key)) : nativeRequire(name), module, module.exports);
    return module.exports;
}
const { MeshyHumanFactory } = loadTypeScript(new URL('../src/characters/MeshyHuman.ts', import.meta.url));
const { defaultDNA } = loadTypeScript(new URL('../src/characters/CharacterDNA.ts', import.meta.url));
globalThis.self = globalThis;
globalThis.createImageBitmap = async () => ({ width: 2048, height: 2048, close() {} });
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const buffer = bytes => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
const publicBytes = path => readFile('public' + path.split('?')[0]);
const factory = new MeshyHumanFactory(async path => loader.parseAsync(buffer(await publicBytes(path)), ''),
    async path => buffer(candidates.get(path.split('?')[0]) ?? await publicBytes(path)));
const rows = [];
for (const age of [16, 17, 18]) for (const sex of ['male', 'female']) {
    const human = await factory.create({ ...defaultDNA(), age, sex }, 2, undefined,
        { hair: 'none', beard: 'none', outfit: 'garment/meshy-grid-trial-001',
            shoes: 'garment/meshy-low-shoes-005', equipment: 'none',
            equipmentItems: ['equipment/native-wooden-spear', 'equipment/native-wooden-shield'] });
    try {
        const top = human.fit.modules.get('garment/meshy-grid-trial-001');
        assert.ok(top && human.fit.modules.has('garment/meshy-low-shoes-005'));
        assert.ok(human.fit.modules.has('equipment/native-wooden-spear') &&
            human.fit.modules.has('equipment/native-wooden-shield'));
        assert.equal(human.fit.nativeSkeleton.bones.length, 44);
        assert.notEqual(human.fit.mesh.geometry, human.fit.sourceGeometry);
        assert.ok(human.fit.mesh.geometry.index.count > 0);
        human.sampleAnimation('Idle_02', 0);
        const sleeve = createArmStretchMeasure({ meshes: top.children.map(mesh => ({ mesh,
            vertices: Array.from({ length: mesh.geometry.attributes.position.count }, (_, vertex) =>
                mesh.getVertexPosition(vertex, new Vector3())) })) });
        const fitRuns = human.modules.fitRuns, row = { age, sex,
            childWeight: human.root.userData.universalHumanProfile.weights.Child,
            nativeBones: 44, coverageIndices: human.fit.mesh.geometry.index.count,
            sourceIndices: human.fit.sourceGeometry.index.count, frames: [], maximumSleeveRatio: 0 };
        for (const clip of ['Idle_02', 'Walking', 'Running']) for (let phase = 0; phase < 8; phase++) {
            const duration = human.clips.find(value => value.name === clip).duration;
            human.sampleAnimation(clip, duration * phase / 8);
            human.root.updateMatrixWorld(true);
            const stretch = sleeve();
            assert.ok(stretch.checkedTriangles > 0);
            assert.equal(stretch.stretchedTriangles, 0, age + '/' + sex + '/' + clip + '/' + phase);
            const bounds = new Box3();
            for (const group of human.fit.modules.values()) group.traverse(mesh => {
                if (!mesh.isSkinnedMesh) return;
                assert.equal(mesh.skeleton, human.fit.nativeSkeleton);
                for (let vertex = 0; vertex < mesh.geometry.attributes.position.count; vertex += 97) {
                    const point = mesh.getVertexPosition(vertex, new Vector3()).applyMatrix4(mesh.matrixWorld);
                    assert.ok(point.toArray().every(Number.isFinite));
                    bounds.expandByPoint(point);
                }
            });
            row.maximumSleeveRatio = Math.max(row.maximumSleeveRatio, stretch.maximumRatio);
            row.frames.push({ clip, phase, checkedSleeveTriangles: stretch.checkedTriangles,
                stretchedSleeveTriangles: stretch.stretchedTriangles, maximumRatio: stretch.maximumRatio,
                sampledBounds: { min: bounds.min.toArray(), max: bounds.max.toArray() } });
        }
        assert.equal(human.modules.fitRuns, fitRuns);
        row.motionRefits = human.modules.fitRuns - fitRuns;
        rows.push(row);
        console.log(age + '/' + sex + ': 24 frames; no stretched sleeve triangles or motion refits');
    } finally {
        human.dispose();
    }
}
const report = { schemaVersion: 1, qualification: 'Numeric native fit qualification, not visual UAT',
    changedGeometry: false, supportedMinimumAge: 16,
    scope: 'Existing generic tunic/low shoes at ages16/17 with both actual supplied props; age18 controls',
    limitations: 'No whole-garment penetration certification, authored combat-pose qualification or physical device acceptance.',
    bindings: changes.map(({ bytes, ...record }) => record), sourceFiles, rows };
await mkdir('docs/qa/visible-equipment-309', { recursive: true });
await writeFile('docs/qa/visible-equipment-309/teen-clothing-measurements.json', JSON.stringify(report, null, 2) + '\n');
if (process.argv.includes('--apply')) {
    for (const change of changes) {
        let measurements = await readFile(change.measurements, 'utf8');
        assert.ok(measurements.includes(change.previousSha256), 'The existing binding hash must be updated explicitly');
        measurements = measurements.replaceAll(change.previousSha256, change.candidateSha256);
        await writeFile('public' + change.path, change.bytes);
        await writeFile(change.measurements, measurements);
    }
    console.log('Applied only the qualified age descriptors and their exact binding hashes; geometry is unchanged.');
}
