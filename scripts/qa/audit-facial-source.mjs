import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { Box3, Vector3 } from 'three';
import { loadTypeScript } from '../load-typescript.mjs';
import { terrainIO } from '../terrain-io.mjs';

// Geometry/skin audit only; browser review must decode and display real textures.
globalThis.self = globalThis;
globalThis.createImageBitmap = async () => ({ width: 2048, height: 2048, close() {} });
const load = path => loadTypeScript(new URL('../../src/' + path + '.ts', import.meta.url));
const { MeshyHumanFactory } = load('characters/MeshyHuman');
const { generateCharacterDNA } = load('characters/generateCharacterDNA');
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const buffer = bytes => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
const factory = new MeshyHumanFactory(async url =>
    loader.parseAsync(buffer(await readFile('public' + url.split('?')[0])), ''),
async url => buffer(await readFile('public' + url.split('?')[0])));
const output = 'docs/qa/facial-identity/source-audit';
const imageOutput = 'scratch/facial-identity/source-audit';
await mkdir(output, { recursive: true });
await mkdir(imageOutput, { recursive: true });
const imagePaths = new Map();
const rows = [];
for (const lod of [0, 1, 2]) {
    const dna = generateCharacterDNA(1983);
    dna.age = 32;
    const human = await factory.create(dna, lod);
    const { fit } = human, geometry = fit.sourceGeometry;
    const headJoint = fit.nativeSkeleton.bones.findIndex(bone => bone.name === 'mixamorigHead');
    const head = [], blend = [], weights = geometry.getAttribute('skinWeight'), joints = geometry.getAttribute('skinIndex');
    const point = index => new Vector3().fromArray(fit.source.positions, index * 3);
    for (let index = 0; index < weights.count; index++) {
        let headWeight = 0;
        for (let channel = 0; channel < 4; channel++)
            if (joints.getComponent(index, channel) === headJoint) headWeight += weights.getComponent(index, channel);
        if (headWeight > .999) head.push(index);
        else if (headWeight > 0) blend.push(index);
    }
    const bounds = indices => new Box3().setFromPoints(indices.map(point));
    const headBounds = bounds(head), mixedBounds = bounds(blend);
    const faceBands = [];
    for (let y = 1.38; y < 1.66; y += .02) {
        const points = Array.from({ length: weights.count }, (_, index) => point(index))
            .filter(p => Math.abs(p.y - y) < .01 && Math.abs(p.x) < .026);
        faceBands.push({ y: Number(y.toFixed(2)), count: points.length,
            front: points.sort((a, b) => b.z - a.z)[0]?.toArray() });
    }
    const headSet = new Set(head), triangles = fit.source.indices;
    let fullyHeadTriangles = 0;
    for (let face = 0; face < triangles.length; face += 3)
        if (triangles.slice(face, face + 3).every(index => headSet.has(index))) fullyHeadTriangles++;
    const path = 'public' + fit.body.path;
    const bytes = await readFile('public/game-assets/human/Human_LOD' + lod + '.glb');
    const document = await (await terrainIO()).readBinary(bytes);
    const images = [];
    for (const [index, texture] of document.getRoot().listTextures().entries()) {
        const image = texture.getImage();
        const extension = texture.getMimeType().split('/')[1];
        const sha256 = image && createHash('sha256').update(image).digest('hex');
        let filename = imagePaths.get(sha256);
        if (image && !filename) {
            filename = imageOutput + `/lod${lod}-texture${index}.${extension}`;
            await writeFile(filename, image);
            imagePaths.set(sha256, filename);
        }
        images.push({ name: texture.getName(), mime: texture.getMimeType(), bytes: image?.length, sha256, filename });
    }
    rows.push({ lod, asset: fit.body, sha256: createHash('sha256').update(bytes).digest('hex'),
        vertices: weights.count, triangles: fit.source.triangles,
        authoredMorphTargets: Object.fromEntries(Object.entries(geometry.morphAttributes).map(([key, value]) => [key, value.length])),
        headJoint, joints: fit.nativeSkeleton.bones.map(bone => bone.name),
        fullyHeadVertices: head.length, mixedHeadVertices: blend.length, fullyHeadTriangles, faceBands,
        fullyHeadBounds: { min: headBounds.min.toArray(), max: headBounds.max.toArray() },
        mixedHeadBounds: { min: mixedBounds.min.toArray(), max: mixedBounds.max.toArray() },
        encoding: fit.encoding.elements, clips: human.clips.map(clip => clip.name), images,
        sockets: Object.fromEntries(['socket_head_top', 'socket_face', 'socket_jaw', 'socket_neck']
            .map(name => [name, fit.socketFrame(name)])) });
    human.dispose();
}
await writeFile(output + '/audit.json', JSON.stringify({ revision: 'd36d7ef3cbd27ec45bb5bd6cc2fbcc7e8c761d2b',
    note: 'Actual production native Meshy runtime assets; no source substitutions. Images are unmodified embedded runtime textures.', rows }, null, 2));
console.log(JSON.stringify(rows.map(({ lod, vertices, triangles, fullyHeadVertices, mixedHeadVertices,
    fullyHeadTriangles, fullyHeadBounds, mixedHeadBounds, authoredMorphTargets }) => ({ lod, vertices, triangles,
    fullyHeadVertices, mixedHeadVertices, fullyHeadTriangles, fullyHeadBounds, mixedHeadBounds, authoredMorphTargets })), null, 2));
