import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTTextureWebP } from '@gltf-transform/extensions';
import { dedup, getBounds, meshopt, prune } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';

const sourceDirectory = process.argv[2];
assert.ok(sourceDirectory, 'Usage: node scripts/prepare-community-hearth.mjs <source directory>');
const assetDirectory = 'game-assets/community-hearth';
const output = resolve('public', assetDirectory);
const textureLimit = 512;
const sources = {
    1: {
        file: 'Meshy_AI_Timber_Hall_1105102350_texture.glb',
        sha256: 'c45a4dce559cf3c41c13485e82d3ea5f54138f4d2a69be262556c1e2653ff310',
        runtimeFile: 'gathering-shelter.glb',
        scale: 1,
    },
    2: {
        file: 'Meshy_AI_Nordic_Hearth_Hall_1105102323_texture.glb',
        sha256: 'c5f8593db3367e60bdfe74a7f904cb6ce373dfca0b62da0ae8a22626b24b27c0',
        runtimeFile: 'clan-hall.glb',
        scale: .8,
    },
};

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const triangleCount = root => root.listMeshes().reduce((sum, mesh) =>
    sum + mesh.listPrimitives().reduce((count, primitive) =>
        count + (primitive.getIndices()?.getCount() ??
            primitive.getAttribute('POSITION').getCount()) / 3, 0), 0);

await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
    'meshopt.decoder': MeshoptDecoder,
    'meshopt.encoder': MeshoptEncoder,
});

async function prepare(source) {
    const original = await readFile(resolve(sourceDirectory, source.file));
    assert.equal(digest(original), source.sha256, 'Source changed: ' + source.file);
    const document = await io.readBinary(original);
    const root = document.getRoot();
    assert.equal(root.listScenes().length, 1);
    const scene = root.listScenes()[0];
    const sourceBounds = getBounds(scene);
    const triangles = triangleCount(root);
    const { min, max } = sourceBounds;

    // Both supplied facades already face +Z. Keep all props inside the measured footprint.
    const frame = document.createNode('Community hearth · canonical metres')
        .setScale([source.scale, source.scale, source.scale])
        .setTranslation([
            -(min[0] + max[0]) * source.scale / 2,
            -min[1] * source.scale,
            -(min[2] + max[2]) * source.scale / 2,
        ]);
    for (const node of scene.listChildren()) frame.addChild(node);
    scene.addChild(frame);

    const exactMaps = new Set(root.listMaterials().flatMap(material => [
        material.getNormalTexture(), material.getMetallicRoughnessTexture(),
        material.getOcclusionTexture(),
    ].filter(Boolean)));
    document.createExtension(EXTTextureWebP).setRequired(true);
    for (const texture of root.listTextures()) {
        const image = await sharp(texture.getImage())
            .resize({ width: textureLimit, height: textureLimit, fit: 'inside', withoutEnlargement: true })
            .webp(exactMaps.has(texture) ? { lossless: true, effort: 4 } : { quality: 88, effort: 4 })
            .toBuffer();
        texture.setImage(image).setMimeType('image/webp');
    }
    await document.transform(dedup(), prune(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
    const bytes = await io.writeBinary(document);

    const decoded = (await io.readBinary(bytes)).getRoot();
    const bounds = getBounds(decoded.listScenes()[0]);
    assert.equal(triangleCount(decoded), triangles, 'Preparation changed triangle count');
    let texturePixelsRGBA = 0;
    for (const texture of decoded.listTextures()) {
        const { width, height, format } = await sharp(texture.getImage()).metadata();
        assert.equal(format, 'webp');
        assert.ok(width <= textureLimit && height <= textureLimit, 'Texture exceeds runtime budget');
        texturePixelsRGBA += width * height * 4;
    }
    assert.ok(bytes.length < 1_500_000, 'Encoded model exceeds runtime budget');
    return {
        bytes,
        runtime: {
            path: assetDirectory + '/' + source.runtimeFile,
            bytes: bytes.length,
            sha256: digest(bytes),
            bounds,
            triangles,
            texturePixelsRGBA,
        },
        provenance: {
            provider: 'Meshy',
            file: source.file,
            bytes: original.length,
            sha256: source.sha256,
            bounds: sourceBounds,
            scale: source.scale,
        },
    };
}

const assets = {};
const provenance = {};
await mkdir(output, { recursive: true });
for (const [tier, source] of Object.entries(sources)) {
    const prepared = await prepare(source);
    assets[tier] = prepared.runtime;
    provenance[tier] = prepared.provenance;
    await writeFile(resolve(output, source.runtimeFile), prepared.bytes);
}
await writeFile(resolve(output, 'manifest.json'), JSON.stringify({
    schemaVersion: 1, units: 'metres', up: '+Y', front: '+Z', textureLimit, assets, provenance,
}, null, 4) + '\n');
await writeFile('src/fjord-play/CommunityHearthAssets.ts',
    '// Generated by scripts/prepare-community-hearth.mjs.\n' +
    'export const communityHearthAssets = ' + JSON.stringify(assets, null, 4) + ' as const;\n');
console.log(JSON.stringify(assets, null, 4));
