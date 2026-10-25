import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import sharp from 'sharp';

export const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const aligned = size => Math.ceil(size / 4) * 4;

export function readGlb(bytes) {
    assert.equal(bytes.readUInt32LE(0), 0x46546c67, 'Expected a GLB');
    assert.equal(bytes.readUInt32LE(4), 2);
    assert.equal(bytes.readUInt32LE(8), bytes.length, 'Truncated GLB');
    const chunks = [];
    for (let offset = 12; offset < bytes.length;) {
        const length = bytes.readUInt32LE(offset);
        chunks.push({ type: bytes.readUInt32LE(offset + 4),
            bytes: bytes.subarray(offset + 8, offset + 8 + length) });
        offset += length + 8;
    }
    assert.deepEqual(chunks.map(chunk => chunk.type), [0x4e4f534a, 0x004e4942]);
    return { document: JSON.parse(chunks[0].bytes.toString()), binary: chunks[1].bytes };
}

function viewBytes(model, view) {
    assert.equal(view.buffer, 0, 'Expected embedded image/compressed data');
    return model.binary.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength);
}

export async function inspectModel(bytes) {
    const model = readGlb(bytes);
    const images = [];
    for (const image of model.document.images ?? []) {
        assert.ok(Number.isInteger(image.bufferView), 'Only embedded runtime images are supported');
        const data = viewBytes(model, model.document.bufferViews[image.bufferView]);
        const metadata = await sharp(data).metadata();
        images.push({ width: metadata.width, height: metadata.height,
            rgbaBytes: metadata.width * metadata.height * 4, sha256: digest(data) });
    }
    return { encodedBytes: bytes.length, sha256: digest(bytes), images,
        rgbaBytes: images.reduce((sum, image) => sum + image.rgbaBytes, 0) };
}

/** Replace image ranges only. Meshopt payloads, accessors, animation and source identity stay intact. */
export async function compactTextures(bytes, maximumPixels) {
    const original = readGlb(bytes);
    const document = structuredClone(original.document);
    const replacements = [];
    for (const image of document.images ?? []) {
        const view = document.bufferViews[image.bufferView];
        const data = viewBytes(original, view);
        const replacement = await sharp(data).resize({ width: maximumPixels, height: maximumPixels,
            fit: 'inside', withoutEnlargement: true }).webp({ lossless: true, effort: 4 }).toBuffer();
        replacements.push({ index: image.bufferView, start: view.byteOffset ?? 0,
            end: aligned((view.byteOffset ?? 0) + view.byteLength), data: replacement });
        image.mimeType = 'image/webp';
    }
    replacements.sort((a, b) => a.start - b.start);
    assert.equal(new Set(replacements.map(value => value.index)).size, replacements.length);
    const parts = [];
    let cursor = 0, length = 0;
    for (const replacement of replacements) {
        assert.ok(replacement.start >= cursor, 'Overlapping image ranges');
        parts.push(original.binary.subarray(cursor, replacement.start));
        length += replacement.start - cursor;
        replacement.offset = length;
        const padding = Buffer.alloc(aligned(replacement.data.length) - replacement.data.length);
        parts.push(replacement.data, padding);
        length += replacement.data.length + padding.length;
        cursor = replacement.end;
    }
    parts.push(original.binary.subarray(cursor));
    const binary = Buffer.concat(parts);
    const moved = offset => {
        let delta = 0;
        for (const replacement of replacements) {
            if (offset >= replacement.end)
                delta += aligned(replacement.data.length) - (replacement.end - replacement.start);
            else assert.ok(offset <= replacement.start, 'Non-image data overlaps an image');
        }
        return offset + delta;
    };
    for (const [index, view] of document.bufferViews.entries()) {
        const replacement = replacements.find(value => value.index === index);
        if (replacement) {
            view.byteOffset = replacement.offset;
            view.byteLength = replacement.data.length;
        } else if (view.buffer === 0) view.byteOffset = moved(view.byteOffset ?? 0);
        const compressed = view.extensions?.EXT_meshopt_compression;
        if (compressed?.buffer === 0) compressed.byteOffset = moved(compressed.byteOffset ?? 0);
    }
    document.buffers[0].byteLength = binary.length;
    const json = Buffer.from(JSON.stringify(document));
    const jsonChunk = Buffer.concat([json, Buffer.alloc(aligned(json.length) - json.length, 0x20)]);
    const header = Buffer.alloc(12), jsonHeader = Buffer.alloc(8), binaryHeader = Buffer.alloc(8);
    header.writeUInt32LE(0x46546c67); header.writeUInt32LE(2, 4);
    header.writeUInt32LE(12 + 8 + jsonChunk.length + 8 + binary.length, 8);
    jsonHeader.writeUInt32LE(jsonChunk.length); jsonHeader.writeUInt32LE(0x4e4f534a, 4);
    binaryHeader.writeUInt32LE(binary.length); binaryHeader.writeUInt32LE(0x004e4942, 4);
    const result = Buffer.concat([header, jsonHeader, jsonChunk, binaryHeader, binary]);
    verifyModelGeometry(bytes, result);
    return result;
}

/** Compare every retained payload and all non-image/layout JSON, rather than just bounds/counts. */
export function verifyModelGeometry(beforeBytes, afterBytes) {
    const before = readGlb(beforeBytes), after = readGlb(afterBytes);
    const images = new Set((before.document.images ?? []).map(image => image.bufferView));
    assert.equal(before.document.bufferViews.length, after.document.bufferViews.length);
    for (const [index, view] of before.document.bufferViews.entries()) {
        if (images.has(index)) continue;
        const other = after.document.bufferViews[index];
        if (view.buffer === 0) assert.deepEqual(viewBytes(before, view), viewBytes(after, other));
        if (view.extensions?.EXT_meshopt_compression) {
            assert.deepEqual(viewBytes(before, view.extensions.EXT_meshopt_compression),
                viewBytes(after, other.extensions.EXT_meshopt_compression));
        }
    }
    const withoutLayout = source => {
        const doc = structuredClone(source);
        for (const buffer of doc.buffers) if (!buffer.uri && !buffer.extensions) delete buffer.byteLength;
        for (const [index, view] of doc.bufferViews.entries()) {
            if (view.buffer === 0) delete view.byteOffset;
            if (images.has(index)) delete view.byteLength;
            if (view.extensions?.EXT_meshopt_compression)
                delete view.extensions.EXT_meshopt_compression.byteOffset;
        }
        for (const image of doc.images ?? []) delete image.mimeType;
        return doc;
    };
    assert.deepEqual(withoutLayout(before.document), withoutLayout(after.document),
        'Only embedded images and their buffer offsets may change');
}
