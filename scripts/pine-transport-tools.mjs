import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import sharp from 'sharp';

export const pineDirectory = 'public/nature/ez-tree-pilot';
export const pineSourceFile = 'pine-large.gltf';
export const pineTransportFile = 'pine-large-lossless.gltf';
export const pineTransportManifest = 'lossless-transport.manifest.json';
export const pineEncoding = { lossless: true, exact: true, effort: 6 };
export const preservedPineFiles = [
    'LICENSE-EZ-Tree.txt', 'NOTICE.txt', 'TEXTURE-ATTRIBUTION.md', 'manifest.json',
    'pine-large.bin', 'pine-large.gltf', 'pine-medium.bin', 'pine-medium.gltf',
    'pine-small.bin', 'pine-small.gltf', 'texture-00e12de668fe6669.png',
    'texture-614ef034a298fef1.png', 'texture-713a5cc87d11921a.png',
    'texture-be24b5c0a3104eba.png',
];
export const digest = bytes => createHash('sha256').update(bytes).digest('hex');
export const receipt = (file, bytes) => ({ file, bytes: bytes.length, sha256: digest(bytes) });

/** Existing notice/manifest files use native checkout line endings; model/image bytes stay raw. */
export function preservedPineReceipt(file, bytes) {
    if (/\.(txt|md|json)$/.test(file))
        return { ...receipt(file, Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'))),
            normalization: 'lf' };
    return receipt(file, bytes);
}

export async function pineDerivationInputs() {
    const files = ['scripts/pine-transport-tools.mjs', 'scripts/prepare-pine-transport.mjs'];
    return Promise.all(files.map(async file => ({ file,
        sha256: digest((await readFile(file, 'utf8')).replace(/\r\n/g, '\n')) })));
}

export function webpFilename(pngFilename) {
    assert.match(pngFilename, /^[\w-]+\.png$/, 'Pine image must remain a local PNG fallback.');
    return pngFilename.replace(/\.png$/, '.webp');
}

/** Add only an optional image transport; retain every authored geometry/material/PNG field. */
export function losslessPineGltf(source) {
    const result = structuredClone(source);
    assert.equal(source.images.length, 4);
    const firstWebpImage = result.images.length;
    result.extensionsUsed = [...new Set([...(result.extensionsUsed ?? []), 'EXT_texture_webp'])];
    assert.ok(!result.extensionsRequired?.includes('EXT_texture_webp'), 'PNG fallback must remain optional.');
    for (const image of source.images) {
        assert.equal(image.mimeType, 'image/png');
        result.images.push({ mimeType: 'image/webp', uri: webpFilename(image.uri) });
    }
    assert.equal(new Set(result.images.map(image => image.uri)).size, result.images.length);
    for (const texture of result.textures) {
        assert.ok(Number.isInteger(texture.source) && texture.source >= 0 && texture.source < firstWebpImage);
        assert.ok(!texture.extensions?.EXT_texture_webp, 'Source already declares WebP transport.');
        texture.extensions = { ...texture.extensions,
            EXT_texture_webp: { source: firstWebpImage + texture.source } };
    }
    return result;
}

export function verifyPineTransportGeometry(source, transport) {
    assert.deepEqual(transport, losslessPineGltf(source),
        'Pine transport must preserve every source field except the declared optional WebP images.');
}

function webpChunks(bytes) {
    assert.equal(bytes.toString('ascii', 0, 4), 'RIFF');
    assert.equal(bytes.toString('ascii', 8, 12), 'WEBP');
    assert.equal(bytes.readUInt32LE(4) + 8, bytes.length, 'WebP container length');
    const chunks = [];
    let offset = 12;
    while (offset < bytes.length) {
        assert.ok(offset + 8 <= bytes.length, 'Truncated WebP chunk header');
        chunks.push(bytes.toString('ascii', offset, offset + 4));
        const length = bytes.readUInt32LE(offset + 4);
        offset += 8 + length + length % 2;
        assert.ok(offset <= bytes.length, 'Truncated WebP chunk');
    }
    assert.deepEqual(chunks, ['VP8L'], 'Pine WebP must contain only lossless pixels, without ICCP/ANIM/EXIF.');
    return chunks;
}

function colorMetadata(metadata) {
    return { width: metadata.width, height: metadata.height, space: metadata.space,
        depth: metadata.depth, channels: metadata.channels, hasAlpha: metadata.hasAlpha,
        iccBytes: metadata.icc?.length ?? 0, iccSha256: metadata.icc ? digest(metadata.icc) : null,
        orientation: metadata.orientation ?? null };
}

export async function verifyPinePixels(sourceBytes, transportBytes) {
    const source = await sharp(sourceBytes).metadata();
    const transport = await sharp(transportBytes).metadata();
    assert.equal(source.format, 'png');
    assert.equal(transport.format, 'webp');
    // This conversion is qualified for the actual unprofiled, unrotated source PNGs only.
    assert.equal(source.icc, undefined);
    assert.equal(source.orientation, undefined);
    assert.equal(transport.icc, undefined);
    assert.equal(transport.exif, undefined);
    assert.equal(transport.orientation, undefined);
    for (const key of ['width', 'height', 'space', 'depth'])
        assert.equal(transport[key], source[key], 'Pine image ' + key);
    assert.equal(source.width, 1024);
    assert.equal(source.height, 1024);
    assert.equal(source.space, 'srgb');
    assert.equal(source.depth, 'uchar');
    const before = await sharp(sourceBytes).ensureAlpha().raw({ depth: 'uchar' }).toBuffer();
    const after = await sharp(transportBytes).ensureAlpha().raw({ depth: 'uchar' }).toBuffer();
    assert.ok(after.equals(before), 'Pine decoded RGBA differs from its source PNG.');
    return { source: colorMetadata(source), transport: colorMetadata(transport),
        decodedRgbaBytes: before.length, sourceRgbaSha256: digest(before), transportRgbaSha256: digest(after),
        containerChunks: webpChunks(transportBytes) };
}
