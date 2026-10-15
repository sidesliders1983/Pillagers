import { readFile, readdir, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
const directory = process.argv[2];
const profiles = [];
for (const file of (await readdir(directory + '/profiles')).filter(file => file.endsWith('.cpuprofile.gz'))) {
    const profile = JSON.parse(gunzipSync(await readFile(directory + '/profiles/' + file)));
    const nodes = new Map(profile.nodes.map(node => [node.id, node]));
    const parents = new Map();
    for (const node of profile.nodes) for (const child of node.children || []) parents.set(child, node.id);
    const rows = new Map();
    const identity = node => JSON.stringify([node.callFrame.functionName,
        node.callFrame.url.replace(/^https?:\/\/127\.0\.0\.1:\d+/, ''), node.callFrame.lineNumber]);
    const row = node => {
        const key = identity(node);
        if (!rows.has(key)) rows.set(key, { function: node.callFrame.functionName,
            url: node.callFrame.url.replace(/^https?:\/\/127\.0\.0\.1:\d+/, ''),
            line: node.callFrame.lineNumber + 1, selfMs: 0, inclusiveMs: 0 });
        return rows.get(key);
    };
    profile.samples.forEach((sample, index) => {
        const ms = profile.timeDeltas[index] / 1000;
        row(nodes.get(sample)).selfMs += ms;
        const seen = new Set();
        for (let id = sample; id !== undefined; id = parents.get(id)) {
            const node = nodes.get(id), key = identity(node);
            if (!seen.has(key)) row(node).inclusiveMs += ms;
            seen.add(key);
        }
    });
    const all = [...rows.values()];
    profiles.push({ path: 'profiles/' + file, durationMs: (profile.endTime - profile.startTime) / 1000,
        topSelf: all.toSorted((a, b) => b.selfMs - a.selfMs).slice(0, 50),
        relevant: all.filter(row => /route|segment|safe|bodyClearance|applyDNA|refit|setFromObject|expandByObject|applyBoneTransform|fitPart|humanPreviewGroundSpeed/.test(row.function))
            .sort((a, b) => b.inclusiveMs - a.inclusiveMs),
        note: 'Sampled V8 self/inclusive CPU; inclusive call trees overlap and must not be summed. CPU-only profiles include the final inspection/export postlude.' });
}
await writeFile(directory + '/native-summary.json', JSON.stringify({ profiles }, null, 2) + '\n');
console.log(JSON.stringify(profiles.map(profile => ({ path: profile.path, relevant: profile.relevant.slice(0, 12) }))));
