import { readFile, readdir, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { resolve, sep } from 'node:path';
const output = process.env.QA_OUTPUT || 'docs/qa/fjord-runtime-performance';
const originless = url => url.replace(/^https?:\/\/127\.0\.0\.1:\d+/, '');
const native = [];
for (const file of (await readdir(output + '/profiles')).filter(file => file.endsWith('.cpuprofile.gz')).sort()) {
    const profile = JSON.parse(gunzipSync(await readFile(output + '/profiles/' + file)));
    const nodes = new Map(profile.nodes.map(node => [node.id, node]));
    const parents = new Map();
    for (const node of profile.nodes) for (const child of node.children || []) parents.set(child, node.id);
    const functions = new Map();
    const key = node => node.callFrame.functionName + '|' + originless(node.callFrame.url);
    const entry = node => {
        const identity = key(node);
        if (!functions.has(identity)) functions.set(identity, { function: node.callFrame.functionName,
            url: originless(node.callFrame.url), selfMs: 0, inclusiveMs: 0 });
        return functions.get(identity);
    };
    for (let index = 0; index < profile.samples.length; index++) {
        let id = profile.samples[index];
        const milliseconds = profile.timeDeltas[index] / 1000;
        entry(nodes.get(id)).selfMs += milliseconds;
        const visited = new Set();
        while (id !== undefined) {
            const node = nodes.get(id), identity = key(node);
            if (!visited.has(identity)) {
                entry(node).inclusiveMs += milliseconds;
                visited.add(identity);
            }
            id = parents.get(id);
        }
    }
    const traceFile = file.replace('.cpuprofile.gz', '.trace.json.gz');
    const trace = JSON.parse(gunzipSync(await readFile(output + '/profiles/' + traceFile)));
    const mainThreads = new Set(trace.traceEvents.filter(event => event.ph === 'M' &&
        event.name === 'thread_name' && /RendererMain/.test(event.args?.name || ''))
        .map(event => event.pid + ':' + event.tid));
    const collections = trace.traceEvents.filter(event => event.ph === 'X' &&
        /^(MinorGC|MajorGC)$/.test(event.name) && mainThreads.has(event.pid + ':' + event.tid));
    // Merge overlapping markers rather than adding nested GC stage timings.
    const intervals = collections.map(event => [event.ts, event.ts + event.dur]).sort((a, b) => a[0] - b[0]);
    let gcWall = 0, end = -Infinity;
    for (const [start, until] of intervals) {
        gcWall += Math.max(0, until - Math.max(start, end));
        end = Math.max(end, until);
    }
    const all = [...functions.values()];
    native.push({ path: 'profiles/' + file, durationMs: (profile.endTime - profile.startTime) / 1000,
        note: 'Self/inclusive V8 samples aggregated by function and URL; recursive duplicates are counted once per sample. Includes the short inspection/export postlude. Inclusive functions overlap; do not sum them.',
        self: all.toSorted((a, b) => b.selfMs - a.selfMs).slice(0, 35),
        relevant: all.filter(row => /snapshot|applyDNA|humanPreviewGroundSpeed|refit|expandByObject|setFromObject|applyBoneTransform|getVertexPosition|updateMatrixWorld|applyCommand|validateState/.test(row.function))
            .sort((a, b) => b.inclusiveMs - a.inclusiveMs).slice(0, 40),
        gc: { classifiedRendererThreads: mainThreads.size,
            minorMarkers: collections.filter(event => event.name === 'MinorGC').length,
            majorMarkers: collections.filter(event => event.name === 'MajorGC').length,
            mergedOuterWallMs: gcWall / 1000, maxOuterMarkerMs: Math.max(0, ...collections.map(event => event.dur / 1000)),
            allocationBytesPerSecond: 'UNKNOWN; marker counts are not allocation measurements' } });
}
await writeFile(output + '/native-summary.json', JSON.stringify({ native }, null, 2) + '\n');
const stock = JSON.parse(await readFile(output + '/stock-production.json', 'utf8'));
const paths = [...new Set(stock.runs.flatMap(run => run.device.resources))].sort();
const files = [];
const root = resolve('.');
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
for (const url of paths) {
    const decoded = decodeURIComponent(url);
    const served = resolve(root, 'dist', decoded.slice(1));
    if (!served.startsWith(resolve(root, 'dist') + sep)) throw Error('Resource escapes the built root: ' + url);
    let source, kind;
    if (decoded.startsWith('/assets/Terrain/')) {
        source = resolve(root, 'Assets', decoded.slice('/assets/'.length)); kind = 'licensed-local-kit';
        if (!source.startsWith(resolve(root, 'Assets') + sep)) throw Error('Invalid kit resource');
    } else if (decoded.startsWith('/draco/')) {
        source = resolve(root, 'node_modules/three/examples/jsm/libs/draco/gltf', decoded.slice('/draco/'.length));
        kind = 'locked-dependency';
    } else if (decoded.startsWith('/assets/')) { source = served; kind = 'production-bundle'; }
    else { source = resolve(root, 'public', decoded.slice(1)); kind = 'public-source'; }
    const read = await Promise.allSettled([readFile(source), readFile(served)]);
    const missing = read.some(result => result.status === 'rejected' && result.reason.code === 'ENOENT');
    const unexpected = read.find(result => result.status === 'rejected' && result.reason.code !== 'ENOENT');
    if (unexpected) throw unexpected.reason;
    if (missing) {
        files.push({ url, kind, missingFromTestedBuild: true,
            sourcePresent: read[0].status === 'fulfilled', builtPresent: read[1].status === 'fulfilled',
            note: 'Requested resource was unavailable. Tolerant AssetManager used its explicit placeholder; no delivered GLB hash is claimed.' });
        continue;
    }
    const [sourceBytes, servedBytes] = read.map(result => result.value);
    if (digest(sourceBytes) !== digest(servedBytes)) throw Error('Served/source asset mismatch: ' + url);
    files.push({ url, kind, bytes: servedBytes.length, sha256: digest(servedBytes), sourceAndBuiltBytesEqual: true });
}
await writeFile(output + '/asset-manifest.json', JSON.stringify({
    note: 'SHA256 of actually requested production resources. Licensed binary bytes are not included. Generated runtime textures and GPU allocations are not represented.', files }, null, 2) + '\n');
console.log(JSON.stringify({ nativeProfiles: native.length, verifiedResources: files.filter(file => !file.missingFromTestedBuild).length, missingResources: files.filter(file => file.missingFromTestedBuild).length }));
