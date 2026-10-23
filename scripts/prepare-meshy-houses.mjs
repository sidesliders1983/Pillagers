import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTTextureWebP } from '@gltf-transform/extensions';
import { dedup, prune, meshopt, getBounds, simplify, weld } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
import { readFile, writeFile, mkdir, copyFile, access } from 'node:fs/promises';
import { resolve, dirname, basename } from 'node:path';
import { createHash } from 'node:crypto';

const sourceRoot = resolve(process.argv[2] ?? 'C:/Users/Devoteam/iCloudDrive/Pillagers/Houses');
const output = resolve('public/game-assets/houses');
await mkdir(output, { recursive: true });
await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready, MeshoptSimplifier.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
    'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder
});
const sources = {
    greatHall: 'Standard/GreatHouse/house-greathouse.glb',
    hut: 'Standard/Hut/house-hut.glb',
    homestead: 'Standard/Homestead/house-homestead.glb',
    longhouse: 'Standard/LongHouse/house-longhouse.glb',
    farmHut: 'Farmyard/Hut/farm-hut.glb',
    farmHomestead: 'Farmyard/Homestead/farm-homestead.glb',
    farmHutTerrain: 'Farmyard/Hut/farm-hut-terrain.glb',
    farmHomesteadTerrain: 'Farmyard/Homestead/farm-homestead-terrain.glb',
    smithHut: 'Smith/Hut/Smith-hut.glb',
    smithHomestead: 'Smith/Homestead/Smith-homestead.glb'
};
const selected = new Set((process.env.HOUSING_ASSET_ONLY ?? '').split(',').filter(Boolean));
for (const key of selected) if (!Object.hasOwn(sources, key)) throw new Error('Unknown house asset: ' + key);
const previous = selected.size ? JSON.parse(await readFile(resolve(output, 'manifest.json'), 'utf8')) : null;
const assets = {};
const triangleCount = doc => doc.getRoot().listMeshes().reduce((total, mesh) => total +
    mesh.listPrimitives().reduce((count, primitive) => count +
        (primitive.getIndices()?.getCount() ?? primitive.getAttribute('POSITION').getCount()) / 3, 0), 0);

for (const [key, relative] of Object.entries(sources)) {
    // Partial preparation leaves existing runtime bytes and their measured metadata untouched.
    if (selected.size && !selected.has(key)) {
        if (!previous.assets[key]) throw new Error('Existing house publication is missing: ' + key);
        assets[key] = previous.assets[key];
        continue;
    }
    let path = resolve(sourceRoot, relative);
    try {
        await access(path);
    } catch (error) {
        path = resolve('Assets/Houses', relative);
        try {
            await access(path);
        } catch {
            if (key === 'farmHomesteadTerrain') continue;
            throw error;
        }
    }
    const bytes = await readFile(path);
    const local = resolve('Assets/Houses', relative);
    await mkdir(dirname(local), { recursive: true });
    if (path !== local) await copyFile(path, local);
    const doc = await io.read(path);
    const bounds = getBounds(doc.getRoot().listScenes()[0]);
    doc.createExtension(EXTTextureWebP).setRequired(true);
    const exactMaps = new Set(doc.getRoot().listMaterials().flatMap(material => [
        material.getNormalTexture(), material.getMetallicRoughnessTexture(), material.getOcclusionTexture()
    ].filter(Boolean)));
    for (const texture of doc.getRoot().listTextures()) {
        const image = sharp(texture.getImage()).resize({
            width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true
        });
        const data = await image.webp(exactMaps.has(texture)
            ? { lossless: true, effort: 4 } : { quality: 85, alphaQuality: 100, effort: 4 }).toBuffer();
        texture.setImage(data).setMimeType('image/webp');
    }
    const sourceTriangles = triangleCount(doc);
    if (sourceTriangles > 20000) await doc.transform(weld(), simplify({
        simplifier: MeshoptSimplifier, ratio: 20000 / sourceTriangles, error: .005, lockBorder: false
    }));
    await doc.transform(dedup(), prune(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
    const result = await io.writeBinary(doc);
    const file = basename(relative).toLowerCase();
    await writeFile(resolve(output, file), result);
    assets[key] = {
        file, source: 'Assets/Houses/' + relative, sourceBytes: bytes.length, textureLimit: 1024,
        sourceTriangles, sourceSha256: createHash('sha256').update(bytes).digest('hex'),
        bytes: result.length, bounds, triangles: triangleCount(doc)
    };
}
await writeFile(resolve(output, 'manifest.json'), JSON.stringify({ schemaVersion: 1, assets }, null, 2) + '\n');
console.log(JSON.stringify(assets, null, 2));
