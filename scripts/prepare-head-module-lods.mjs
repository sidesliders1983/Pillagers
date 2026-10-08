import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createHash } from 'node:crypto';

// Prototype tiers deliberately reuse a qualified surface. Only glTF names and
// declared LOD provenance change; positions, indices, normals and material bytes
// remain identical. Every alias still needs final actual-public browser review.
const [input, output, lodText] = process.argv.slice(2);
const lod = Number(lodText);
if (!input || !output || ![0, 1, 2].includes(lod) || existsSync(output)) {
  throw new Error('Usage: prepare-head-module-lods.mjs input.glb NEW-output.glb 0|1|2');
}
const bytes = readFileSync(input), jsonLength = bytes.readUInt32LE(12);
const document = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString());
const binaryChunk = bytes.subarray(20 + jsonLength);
for (const collection of [document.nodes ?? [], document.meshes ?? []]) {
  for (const item of collection) if (item.name) {
    item.name = item.name.replace(/_LOD[012](?=$|\b)/g, `_LOD${lod}`);
    // Blender may append a generic duplicate suffix while joining a source
    // scene. Alias names can normalize it without touching authored bytes.
    item.name = item.name.replace(/(_LOD[012])\.\d{3}$/, '$1');
  }
}
const text = Buffer.from(JSON.stringify(document));
const padded = Buffer.concat([text, Buffer.alloc((4 - text.length % 4) % 4, 0x20)]);
const header = Buffer.alloc(20);
header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4);
header.writeUInt32LE(20 + padded.length + binaryChunk.length, 8);
header.writeUInt32LE(padded.length, 12); header.writeUInt32LE(0x4e4f534a, 16);
const result = Buffer.concat([header, padded, binaryChunk]);
const digest = value => createHash('sha256').update(value).digest('hex');
const provenancePath = value => value.replace(/\.glb$/i, '.provenance.json');
const parent = JSON.parse(readFileSync(provenancePath(input), 'utf8').replace(/^\ufeff/, ''));
const record = {
  reviewRequired: true, kind: parent.kind ?? (document.meshes[0].name.startsWith('Hair_') ? 'hair' : 'beard'),
  style: parent.style, lod, source: resolve(input), sourceSha256: digest(bytes),
  outputSha256: digest(result), sourceProvenance: parent, fit: parent.fit,
  geometryOptimization: { ...parent.geometryOptimization, prototypeTierPolicy: 'same source-qualified canonical surface in every declared tier',
    geometryAndMaterialBytesUnchanged: true, aliasNameOnly: true },
};
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, result); writeFileSync(provenancePath(output), JSON.stringify(record, null, 2) + '\n');
console.log(JSON.stringify({ sourceSha256: digest(bytes), outputSha256: digest(result), lod, geometryAndMaterialBytesUnchanged: true }));
