import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTTextureWebP } from '@gltf-transform/extensions';
import { dedup, getBounds, meshopt, prune } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import sharp from 'sharp';

const source = resolve(process.argv[2]);
const output = resolve('public/scenery/meshy-campfire-v1');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const provenance = [];
for (const file of (await readdir(source)).filter(file => /\.(fbx|png)$/.test(file)).sort()) {
    const bytes = await readFile(resolve(source, file));
    provenance.push({ file, bytes: bytes.length, sha256: hash(bytes) });
}
await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
    'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder,
});
const document = await io.read('Assets/StoneCampFire/campfire-source.glb');
const scene = document.getRoot().listScenes()[0];
const sourceBounds = getBounds(scene);
const frame = document.createNode('Stone campfire · canonical metres').setTranslation([
    -(sourceBounds.min[0] + sourceBounds.max[0]) / 2, -sourceBounds.min[1],
    -(sourceBounds.min[2] + sourceBounds.max[2]) / 2,
]);
for (const node of scene.listChildren()) frame.addChild(node);
scene.addChild(frame);
const exactMaps = new Set(document.getRoot().listMaterials().flatMap(material => [
    material.getNormalTexture(), material.getMetallicRoughnessTexture(), material.getOcclusionTexture(),
].filter(Boolean)));
document.createExtension(EXTTextureWebP).setRequired(true);
for (const texture of document.getRoot().listTextures()) {
    texture.setImage(await sharp(texture.getImage())
        .resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true })
        .webp(exactMaps.has(texture) ? { lossless: true, effort: 4 } : { quality: 88, effort: 4 })
        .toBuffer()).setMimeType('image/webp');
}
await document.transform(dedup(), prune(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
const bytes = await io.writeBinary(document);
const manifest = {
    schemaVersion: 1, file: 'campfire.glb', provider: 'Meshy', source: 'StoneCampFire', provenance,
    bytes: bytes.length, sha256: hash(bytes), bounds: getBounds(scene), units: 'metres', up: '+Y',
    textureLimit: 1024, geometry: 'Source geometry and proportions preserved; centered and grounded.',
    triangles: document.getRoot().listMeshes().reduce((sum, mesh) => sum + mesh.listPrimitives()
        .reduce((count, p) => count + p.getIndices().getCount() / 3, 0), 0),
};
await mkdir(output, { recursive: true });
await writeFile(resolve(output, 'campfire.glb'), bytes);
await writeFile(resolve(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify(manifest));
