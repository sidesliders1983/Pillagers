import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, readdir, rename } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const options = Object.fromEntries(process.argv.slice(2).map(argument => argument.replace(/^--/, '').split('=')));
const output = resolve(root, options.output ?? 'scratch/island-seed-expansion/run-1');
const concurrency = Number(options.concurrency ?? 2);
const budgetMinutes = Number(options.minutes ?? 40);
const timeoutMs = Number(options.timeout ?? 120000);
const maxSeeds = Number(options.limit ?? 258);
if (![1, 2].includes(concurrency) || !Number.isFinite(budgetMinutes) || budgetMinutes <= 0 ||
    !Number.isSafeInteger(maxSeeds) || maxSeeds < 1 || maxSeeds > 258 ||
    !Number.isFinite(timeoutMs) || timeoutMs < 1000 || timeoutMs > 180000)
    throw new Error('Use concurrency 1–2, limit 1–258 and timeout 1000–180000 ms.');
const controls = [18, 7, 42, 256, 1983];
const seeds = [...controls, ...Array.from({ length: 256 }, (_, seed) => seed)
    .filter(seed => !controls.includes(seed))].slice(0, maxSeeds);
const sourcePaths = [];
async function collect(directory) {
    for (const entry of (await readdir(resolve(root, directory), { withFileTypes: true }))
        .sort((a, b) => a.name.localeCompare(b.name))) {
        const path = directory + '/' + entry.name;
        if (entry.isDirectory()) await collect(path);
        else if (entry.name.endsWith('.ts')) sourcePaths.push(path);
    }
}
await collect('src');
sourcePaths.push('pnpm-lock.yaml', 'scripts/load-typescript.mjs',
    'scripts/qa/island-seed-candidate.mjs', 'scripts/qa/sweep-island-seeds.mjs');
const hashes = {};
for (const path of sourcePaths.sort()) hashes[path] = createHash('sha256')
    .update(await readFile(resolve(root, path))).digest('hex');
const protocol = { schemaVersion: 1, generatorVersion: 'fjordside-island-v0.3e-r3',
    preparationVersion: 'island-pool-v2', config: { preset: 'island', conifers: 'ez-tree', environment: { version: 1 } },
    seeds, controls, candidateDefinition: 'Any geography seed outside the five historical controls',
    concurrency, budgetMinutes, timeoutMs, maxHeapMBPerChild: 768,
    currentPool: [18, 7], sourceHashes: hashes };
const protocolSha256 = createHash('sha256').update(JSON.stringify(protocol)).digest('hex');
await mkdir(output + '/results', { recursive: true });
let manifest;
try { manifest = JSON.parse(await readFile(output + '/manifest.json', 'utf8')); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
if (manifest && manifest.protocolSha256 !== protocolSha256)
    throw new Error('Resume refused: sources or protocol changed. Use a separate output directory.');
if (!manifest) {
    manifest = { ...protocol, protocolSha256, startedAt: new Date().toISOString(),
        sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
        branch: execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
        localChanges: execFileSync('git', ['status', '--short'], { cwd: root, encoding: 'utf8' }).trim(),
        nodeVersion: process.version, platform: process.platform, architecture: process.arch,
        historicalCommit: 'bec776515326f8c406e9e1a9f12a2dd4da87ef3d',
        limits: 'Prepared candidates are not owner-approved or fully gameplay/browser-qualified. maxRSS is per child, in KiB; concurrent timings are diagnostic, not isolated benchmarks.' };
    await writeFile(output + '/manifest.json', JSON.stringify(manifest, null, 2));
}
const completed = new Map();
for (const seed of seeds) {
    try {
        const row = JSON.parse(await readFile(output + '/results/' + seed + '.json', 'utf8'));
        if (row.protocolSha256 !== protocolSha256) throw new Error('Result protocol mismatch: ' + seed);
        completed.set(seed, row);
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
}
const remaining = seeds.filter(seed => !completed.has(seed));
const deadline = Date.now() + budgetMinutes * 60000;
async function measure(seed) {
    const start = Date.now();
    const row = await new Promise(resolveRow => {
        const child = spawn(process.execPath, ['--max-old-space-size=768',
            resolve(root, 'scripts/qa/island-seed-candidate.mjs'), String(seed), output],
        { cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
        let stdout = '', stderr = '', timedOut = false;
        const timer = setTimeout(() => { timedOut = true; child.kill(); }, timeoutMs);
        child.stdout.on('data', data => { stdout += data; });
        child.stderr.on('data', data => { stderr = (stderr + data).slice(-8000); });
        child.on('error', error => { stderr += error.message; });
        child.on('close', code => {
            clearTimeout(timer);
            if (timedOut) return resolveRow({ seed, status: 'timeout', reasons: ['Per-seed time budget exceeded.'], elapsedMs: Date.now() - start });
            try {
                if (code !== 0) throw new Error('Child exit ' + code + ': ' + stderr);
                resolveRow(JSON.parse(stdout));
            } catch (error) { resolveRow({ seed, status: 'runtime-error', reasons: [error.message], elapsedMs: Date.now() - start }); }
        });
    });
    const record = { ...row, control: controls.includes(seed), protocolSha256,
        finishedAt: new Date().toISOString() };
    const path = output + '/results/' + seed + '.json';
    await writeFile(path + '.tmp', JSON.stringify(record, null, 2));
    await rename(path + '.tmp', path);
    completed.set(seed, record);
    console.log(JSON.stringify({ seed, control: record.control, status: record.status,
        plots: record.plan?.plots.length, seconds: Math.round(record.elapsedMs / 100) / 10,
        completed: completed.size, total: seeds.length }));
}
await Promise.all(Array.from({ length: concurrency }, async () => {
    while (remaining.length && Date.now() < deadline) {
        const seed = remaining.shift();
        await measure(seed);
    }
}));
const rows = seeds.filter(seed => completed.has(seed)).map(seed => completed.get(seed));
const counts = {};
for (const row of rows) counts[row.status] = (counts[row.status] ?? 0) + 1;
const summary = { protocolSha256, updatedAt: new Date().toISOString(),
    expected: seeds.length, completed: rows.length, pending: seeds.filter(seed => !completed.has(seed)),
    counts, newPreparedCandidates: rows.filter(row => !row.control && row.preparationPassed).map(row => row.seed),
    controlResults: rows.filter(row => row.control).map(row => ({ seed: row.seed, status: row.status })),
    output: relative(root, output), rows };
await writeFile(output + '/summary.json', JSON.stringify(summary, null, 2));
console.log(JSON.stringify({ counts, newPreparedCandidates: summary.newPreparedCandidates,
    pending: summary.pending.length, output: summary.output }));
