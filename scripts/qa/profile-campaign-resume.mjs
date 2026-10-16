import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { Worker } from 'node:worker_threads';
import { createHash } from 'node:crypto';
import { loadTypeScript } from '../load-typescript.mjs';
const { SharedSettlement } = loadTypeScript(new URL('../../src/play/SharedSettlement.ts', import.meta.url));
const { adoptCampaignIsland } = loadTypeScript(new URL('../../src/fjord-play/CampaignIsland.ts', import.meta.url));
const fixture = await readFile('docs/qa/fjord-runtime-performance/fixtures/developed-810.json', 'utf8');
const started = performance.now();
let validationMs = 0, workerWallMs = 0, adoptionMs = 0, preparedAt = 0;
const restored = await SharedSettlement.restoreAsync(fixture, 'fjord', async metadata => {
    validationMs = performance.now() - started;
    const workerStarted = performance.now();
    const worker = new Worker(new URL('../../tests/fixtures/generation-worker.mjs', import.meta.url), { execArgv: [] });
    const result = await new Promise((resolve, reject) => {
        worker.on('error', reject);
        worker.on('message', message => {
            if (message.type === 'error') reject(new Error(message.message));
            if (message.type === 'result') resolve(message.result);
        });
        worker.postMessage({ kind: 'campaign', seed: metadata.seed });
    }).finally(() => worker.terminate());
    workerWallMs = performance.now() - workerStarted;
    const adoptStarted = performance.now();
    adoptCampaignIsland(metadata.seed, result.world, result.plan);
    adoptionMs = performance.now() - adoptStarted;
    preparedAt = performance.now();
});
const result = { runtime: process.version, validationMs, workerWallMs, adoptionMs,
    commitMs: performance.now() - preparedAt, totalMs: performance.now() - started,
    exactCore: JSON.stringify(restored.session.readSnapshot()) === JSON.stringify(JSON.parse(fixture).fjord.campaign),
    sourceSha256: Object.fromEntries(await Promise.all(['src/play/SharedSettlement.ts', 'src/fjord-play/FjordCampaign.ts'].map(async path =>
        [path, createHash('sha256').update(await readFile(path)).digest('hex')]))),
    note: 'Diagnostic Node wall times, not a controlled speed benchmark or physical Safari/GPU measurement. Island generation uses a real worker; authoritative metadata and commit remain on the caller thread.' };
await mkdir('artifacts/campaign-resume', { recursive: true });
await writeFile('artifacts/campaign-resume/async-restore.json', JSON.stringify(result, null, 2));
console.log(JSON.stringify(result));
