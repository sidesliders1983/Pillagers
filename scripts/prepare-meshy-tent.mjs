import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTTextureWebP } from '@gltf-transform/extensions';
import { dedup, getBounds, meshopt, prune } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import sharp from 'sharp';

const source = resolve(process.argv[2] ?? 'Assets/Houses/Tent/tent-meshy-original.glb');
const output = resolve('public/scenery/meshy-tent-v1');
const sourceBytes = await readFile(source);
const provenance = JSON.parse(await readFile(resolve('Assets/Houses/Tent/meshy-provenance.json'), 'utf8'));
const sourceSha256 = createHash('sha256').update(sourceBytes).digest('hex');
if (sourceSha256 !== provenance.sha256)
    throw new Error('Tent source does not match the recorded Meshy original.');
await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
    'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder,
});
const document = await io.readBinary(sourceBytes);
const scene = document.getRoot().listScenes()[0];
const sourceBounds = getBounds(scene);
const scale = 2.6 / (sourceBounds.max[1] - sourceBounds.min[1]);
const frame = document.createNode('Tent · canonical metres · front +Z')
    .setScale([scale, scale, scale])
    .setTranslation([
        -(sourceBounds.min[0] + sourceBounds.max[0]) / 2 * scale,
        -sourceBounds.min[1] * scale,
        -(sourceBounds.min[2] + sourceBounds.max[2]) / 2 * scale,
    ]);
for (const node of scene.listChildren()) frame.addChild(node);
scene.addChild(frame);
const exactMaps = new Set(document.getRoot().listMaterials().flatMap(material => [
    material.getNormalTexture(), material.getMetallicRoughnessTexture(), material.getOcclusionTexture(),
].filter(Boolean)));
document.createExtension(EXTTextureWebP).setRequired(true);
for (const texture of document.getRoot().listTextures()) {
    const bytes = await sharp(texture.getImage())
        .resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true })
        .webp(exactMaps.has(texture) ? { lossless: true, effort: 4 } : { quality: 88, effort: 4 })
        .toBuffer();
    texture.setImage(bytes).setMimeType('image/webp');
}
// Cloth remains visible from inside; this does not make a capped entrance hollow.
for (const material of document.getRoot().listMaterials()) material.setDoubleSided(true);
await document.transform(dedup(), prune(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
const bytes = await io.writeBinary(document);
const triangles = document.getRoot().listMeshes().reduce((total, mesh) => total +
    mesh.listPrimitives().reduce((count, primitive) => count +
        (primitive.getIndices()?.getCount() ?? primitive.getAttribute('POSITION').getCount()) / 3, 0), 0);
const manifest = {
    schemaVersion: 1, file: 'tent.glb', provider: 'Meshy',
    generation: { taskId: provenance.taskId, model: provenance.parameters.ai_model,
        references: provenance.inputs, symmetricSideReference: true },
    source: 'Assets/Houses/Tent/' + source.split(/[\\/]/).at(-1),
    sourceSha256, sourceBytes: sourceBytes.length, bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'), triangles,
    bounds: getBounds(scene), units: 'metres', up: '+Y', front: '+Z', height: 2.6,
    textureLimit: 1024, doubleSided: true,
};
await mkdir(output, { recursive: true });
await writeFile(resolve(output, 'tent.glb'), bytes);
await writeFile(resolve(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify(manifest, null, 2));
