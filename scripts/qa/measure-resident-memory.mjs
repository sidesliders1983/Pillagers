import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { load } from '../../tests/load-source.mjs';

globalThis.self = globalThis;
globalThis.ProgressEvent = class { constructor(type, options) { this.type = type; Object.assign(this, options); } };
globalThis.createImageBitmap = async blob => {
    const meta = await sharp(Buffer.from(await blob.arrayBuffer())).metadata();
    return { width: meta.width, height: meta.height, close() {} };
};
const requests = [];
const nativeFetch = globalThis.fetch;
globalThis.fetch = async input => {
    if (String(input).startsWith('blob:')) return nativeFetch(input);
    const path = new URL(String(input), 'http://fixture.invalid').pathname;
    const bytes = await readFile('public' + decodeURIComponent(path));
    requests.push({ path, bytes: bytes.length });
    return new Response(bytes, { headers: { 'content-length': String(bytes.length) } });
};
const { MeshyHumanFactory } = load('../src/characters/MeshyHuman.ts');
const { FjordWardrobe } = load('../src/fjord-play/FjordWardrobe.ts');
const { projectResidentAppearance } = load('../src/characters/ResidentAppearance.ts');
const { createCampaign } = load('../src/simulation/SimulationCore.ts');
const source = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const relevantPaths = ['src/characters/BodyCoverage.ts', 'src/characters/PreparedNativeOutfit.ts',
    'src/characters/MeshyHuman.ts', 'src/fjord-play/FjordWardrobe.ts',
    'scripts/qa/measure-resident-memory.mjs'];
const hashes = Object.fromEntries(await Promise.all(relevantPaths.map(async path =>
    [path, createHash('sha256').update(await readFile(path)).digest('hex')])));
const state = createCampaign(32, {}, {}, {}, {}, {}, {}, 'summer-800-v1');
const factory = new MeshyHumanFactory();
const wardrobe = new FjordWardrobe(factory, message => { throw new Error(message); });
const models = [], rows = [], start = performance.now();
const fixtures = [];
function triangleDigest(geometry) {
    const attributes = [...Object.entries(geometry.attributes).sort(),
        ...Object.entries(geometry.morphAttributes).sort().flatMap(([name, targets]) =>
            targets.map((attribute, index) => ['morph:' + name + ':' + index, attribute]))];
    const hash = createHash('sha256');
    for (const [name, attribute] of attributes) {
        hash.update(name + ':' + attribute.itemSize + '\n');
        const values = new Float32Array(geometry.index.count * attribute.itemSize);
        for (let corner = 0; corner < geometry.index.count; corner++) for (let component = 0; component < attribute.itemSize; component++)
            values[corner * attribute.itemSize + component] = attribute.getComponent(geometry.index.getX(corner), component);
        hash.update(Buffer.from(values.buffer));
    }
    return hash.digest('hex');
}
function inspect(label) {
    globalThis.gc?.();
    const buffers = new Set(), textures = new Set(), images = new Set();
    let geometryBytes = 0, imageBytes = 0, vertices = 0;
    for (const human of models) human.root.traverse(node => {
        if (!node.isMesh) return;
        const geometry = node.geometry;
        vertices += geometry.getAttribute('position').count;
        for (const attribute of [...Object.values(geometry.attributes), ...Object.values(geometry.morphAttributes).flat(), geometry.index].filter(Boolean)) {
            const array = attribute.array ?? attribute.data?.array;
            if (array && !buffers.has(array.buffer)) { buffers.add(array.buffer); geometryBytes += array.buffer.byteLength; }
        }
        for (const material of Array.isArray(node.material) ? node.material : [node.material]) for (const value of Object.values(material)) {
            if (!value?.isTexture) continue;
            textures.add(value);
            const image = value.source?.data;
            if (image && !images.has(image)) { images.add(image); imageBytes += (image.width ?? 0) * (image.height ?? 0) * 4; }
        }
    });
    rows.push({ label, elapsedMs: performance.now() - start, memory: process.memoryUsage(), modelCount: models.length,
        vertices, uniqueTextureObjects: textures.size, uniqueImages: images.size, geometryBytes,
        estimatedDecodedRgbaBytes: imageBytes, note: 'Headless preparation with image dimensions only; no measured GPU allocation.' });
    console.log(JSON.stringify(rows.at(-1)));
}
inspect('baseline');
for (let index = 0; index < 2; index++) for (const persona of Object.values(state.personas)) {
    const appearance = projectResidentAppearance(state, persona.id);
    const human = await factory.createWorld(appearance.dna, undefined, appearance.face);
    await wardrobe.reconcile(human, { kind: 'persona', id: persona.id, dna: appearance.dna,
        status: { living: true, sex: appearance.dna.sex, occupation: persona.occupation } });
    if (!index) {
        const geometry = human.fit.mesh.geometry;
        fixtures.push({ id: persona.id, occupation: persona.occupation, vertices: geometry.attributes.position.count,
            sourceVertices: human.fit.sourceGeometry.attributes.position.count, usedVertices: new Set(geometry.index.array).size,
            triangles: geometry.index.count / 3, morphTargets: geometry.morphAttributes.position.length,
            digest: triangleDigest(geometry) });
        console.log(JSON.stringify(fixtures.at(-1)));
    }
    models.push(human);
    inspect('resident-' + models.length);
}
for (const model of models) model.dispose();
models.length = 0;
inspect('disposed-instances');
const output = resolve(process.argv[2] ?? 'scratch/sites-memory-audit/result.json');
await mkdir(dirname(output), { recursive: true });
await writeFile(output, JSON.stringify({ source, hashes, fixtures, rows, requests }, null, 2));
console.log('Saved ' + output);
