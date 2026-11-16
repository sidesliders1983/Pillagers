import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pineDirectory, pineSourceFile, pineTransportFile, pineTransportManifest,
    pineEncoding, preservedPineFiles, preservedPineReceipt, pineDerivationInputs, receipt, webpFilename,
    verifyPineTransportGeometry, verifyPinePixels } from './pine-transport-tools.mjs';

/** The read seam permits corruption tests without changing any published or original file. */
export async function validatePineTransport({ read = file => readFile(resolve(pineDirectory, file)) } = {}) {
    const manifest = JSON.parse(await read(pineTransportManifest));
    assert.equal(manifest.schemaVersion, 1);
    assert.deepEqual(manifest.encoding, pineEncoding);
    assert.deepEqual(manifest.derivationInputs, await pineDerivationInputs(), 'Stale pine derivation inputs');
    assert.deepEqual(manifest.preservedSources.map(entry => entry.file), preservedPineFiles);
    for (const entry of manifest.preservedSources)
        assert.deepEqual(preservedPineReceipt(entry.file, await read(entry.file)), entry,
            'Preserved pine source: ' + entry.file);
    const sourceBytes = await read(pineSourceFile);
    const transportBytes = await read(pineTransportFile);
    assert.deepEqual(receipt(pineSourceFile, sourceBytes), manifest.source);
    assert.deepEqual(receipt(pineTransportFile, transportBytes), manifest.transport);
    const source = JSON.parse(sourceBytes);
    verifyPineTransportGeometry(source, JSON.parse(transportBytes));
    assert.deepEqual(manifest.images.map(image => image.source.file), source.images.map(image => image.uri));
    for (const image of manifest.images) {
        assert.equal(image.transport.file, webpFilename(image.source.file));
        const before = await read(image.source.file);
        const encoded = await read(image.transport.file);
        assert.deepEqual(receipt(image.source.file, before), image.source);
        assert.deepEqual(receipt(image.transport.file, encoded), image.transport);
        assert.deepEqual(await verifyPinePixels(before, encoded), image.pixels, 'Stale pine pixel proof');
    }
    const authoring = JSON.parse(await read('manifest.json'));
    assert.equal(manifest.sourceProvenance.revision, authoring.sourceRevision);
    assert.equal(manifest.sourceProvenance.sourceLock, authoring.sourceLock);
    assert.deepEqual(manifest.sourceProvenance.retainedNotices,
        ['LICENSE-EZ-Tree.txt', 'NOTICE.txt', 'TEXTURE-ATTRIBUTION.md']);
    const originalImageBytes = manifest.images.reduce((sum, image) => sum + image.source.bytes, 0);
    const encodedImageBytes = manifest.images.reduce((sum, image) => sum + image.transport.bytes, 0);
    const decodedRgbaBytes = manifest.images.reduce((sum, image) => sum + image.pixels.decodedRgbaBytes, 0);
    const measurements = { originalImageBytes, encodedImageBytes,
        savedBytes: originalImageBytes - encodedImageBytes, decodedRgbaBytes };
    assert.deepEqual(manifest.measurements, measurements);
    assert.ok(encodedImageBytes < originalImageBytes, 'Lossless pine transport must reduce transfer bytes.');
    return { images: manifest.images.length, ...measurements };
}
