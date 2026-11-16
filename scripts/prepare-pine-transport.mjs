import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import sharp from 'sharp';
import { pineDirectory, pineSourceFile, pineTransportFile, pineTransportManifest,
    pineEncoding, preservedPineFiles, preservedPineReceipt, pineDerivationInputs, receipt, webpFilename,
    losslessPineGltf, verifyPineTransportGeometry, verifyPinePixels } from './pine-transport-tools.mjs';

const read = file => readFile(resolve(pineDirectory, file));
const preservedSources = [];
for (const file of preservedPineFiles) preservedSources.push(preservedPineReceipt(file, await read(file)));
const source = JSON.parse(await read(pineSourceFile));
const transport = losslessPineGltf(source);
verifyPineTransportGeometry(source, transport);
const gltfBytes = Buffer.from(JSON.stringify(transport));
const images = [];
const outputs = new Map([[pineTransportFile, gltfBytes]]);
for (const image of source.images) {
    const before = await read(image.uri);
    const encoded = await sharp(before).webp(pineEncoding).toBuffer();
    const file = webpFilename(image.uri);
    images.push({ source: receipt(image.uri, before), transport: receipt(file, encoded),
        pixels: await verifyPinePixels(before, encoded) });
    outputs.set(file, encoded);
}
const authoring = JSON.parse(await read('manifest.json'));
const originalImageBytes = images.reduce((sum, image) => sum + image.source.bytes, 0);
const encodedImageBytes = images.reduce((sum, image) => sum + image.transport.bytes, 0);
assert.ok(encodedImageBytes < originalImageBytes);
const manifest = {
    schemaVersion: 1,
    purpose: 'Pixel-identical image transport for the existing static Large pine.',
    source: receipt(pineSourceFile, await read(pineSourceFile)),
    transport: receipt(pineTransportFile, gltfBytes),
    preservedSources,
    images,
    encoding: pineEncoding,
    encoder: { sharp: sharp.versions.sharp, vips: sharp.versions.vips, webp: sharp.versions.webp },
    derivationInputs: await pineDerivationInputs(),
    sourceProvenance: { revision: authoring.sourceRevision, sourceLock: authoring.sourceLock,
        retainedNotices: ['LICENSE-EZ-Tree.txt', 'NOTICE.txt', 'TEXTURE-ATTRIBUTION.md'] },
    fallback: 'Original PNG texture.source remains available to readers ignoring EXT_texture_webp. Three r187 does not retry PNG; an image failure can leave missing maps while the model still loads.',
    measurements: { originalImageBytes, encodedImageBytes, savedBytes: originalImageBytes - encodedImageBytes,
        decodedRgbaBytes: images.reduce((sum, image) => sum + image.pixels.decodedRgbaBytes, 0) },
};
outputs.set(pineTransportManifest, Buffer.from(JSON.stringify(manifest, null, 2) + '\n'));
// Generate only new derivatives; every original model, PNG, manifest and attribution stays untouched.
for (const [file, bytes] of outputs) await writeFile(resolve(pineDirectory, file), bytes);
console.log(JSON.stringify({ images: images.length, ...manifest.measurements }));
