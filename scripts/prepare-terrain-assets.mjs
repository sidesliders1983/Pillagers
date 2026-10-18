import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { Logger } from '@gltf-transform/core';
import { EXTMeshoptCompression } from '@gltf-transform/extensions';
import { dedup, prune, reorder, getBounds } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import { terrainIO } from './terrain-io.mjs';

const source = resolve(process.argv[2] ?? 'Assets/Terrain');
const output = resolve('public/terrain');
const io = (await terrainIO()).setLogger(new Logger(Logger.Verbosity.ERROR));
const files = (await readdir(source)).filter(file => file.endsWith('.glb')).sort();
if (!files.length) throw new Error('No Terrain GLBs found in ' + source);
await mkdir(output, { recursive: true });
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const stats = doc => ({
    bounds: getBounds(doc.getRoot().listScenes()[0]),
    triangles: doc.getRoot().listMeshes().reduce((sum, mesh) => sum + mesh.listPrimitives()
        .reduce((count, p) => count + (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3, 0), 0),
    materials: doc.getRoot().listMaterials().length
});
const assets = {};
for (const file of files) {
    const original = await readFile(resolve(source, file));
    const doc = await io.readBinary(original);
    const before = stats(doc);
    // Original files are already Draco-compressed. Try lossless vertex reordering/meshopt;
    // preserve the existing payload if recompression would increase its size.
    doc.getRoot().listExtensionsUsed().find(ext => ext.extensionName === 'KHR_draco_mesh_compression')?.dispose();
    await doc.transform(dedup(), prune(), reorder({ encoder: MeshoptEncoder, target: 'size' }));
    doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({
        method: EXTMeshoptCompression.EncoderMethod.QUANTIZE
    });
    const candidate = await io.writeBinary(doc);
    const bytes = candidate.length < original.length ? candidate : original;
    const after = stats(await io.readBinary(bytes));
    if (after.triangles !== before.triangles || after.materials !== before.materials ||
        ['min', 'max'].some(key => before.bounds[key].some((v, axis) => Math.abs(v - after.bounds[key][axis]) > 1e-6)))
        throw new Error('Terrain geometry changed during publication: ' + file);
    await writeFile(resolve(output, file), bytes);
    assets[file.slice(0, -4)] = {
        file, bytes: bytes.length, sha256: sha256(bytes), ...after,
        source: 'Assets/Terrain/' + file, sourceBytes: original.length, sourceSha256: sha256(original),
        encoding: bytes === original ? 'original-draco' : 'meshopt-lossless'
    };
}
const manifest = { schemaVersion: 1, optimization: 'Smallest verified Draco or lossless Meshopt payload; no geometry simplification.', assets };
await writeFile(resolve(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
const values = Object.values(assets);
console.log(JSON.stringify({ files: files.length, sourceBytes: values.reduce((n, a) => n + a.sourceBytes, 0),
    publishedBytes: values.reduce((n, a) => n + a.bytes, 0), meshopt: values.filter(a => a.encoding === 'meshopt-lossless').length }));
