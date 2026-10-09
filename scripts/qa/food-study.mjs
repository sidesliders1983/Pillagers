import { Worker } from 'node:worker_threads';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { hash } from './aptitude-economy.mjs';
import { foodScenarios } from './food-recipes.mjs';
import { summarizeFoodRuns, pairedFoodRuns } from './food-statistics.mjs';
import { createHash } from 'node:crypto';
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
export async function runFoodStudy({ output, seedStart = 0, seedCount = 100, winters = 25, workers = 4,
    scenarios = ['A', 'B', 'C05', 'C10', 'C15', 'D2', 'D4', 'E05', 'E10', 'E15', 'C10-safe', 'E10-safe', 'E10-N4'],
    verificationSeeds = [0, 7, 32, 99], extendedSeeds = [0, 7, 8, 11, 15, 32, 34, 41, 55, 90], onProgress = () => {} } = {}) {
    if (!output || !Number.isSafeInteger(seedStart) || seedStart < 0 || !Number.isSafeInteger(seedCount) || seedCount < 1 ||
        seedStart + seedCount > 4294967296 || !Number.isSafeInteger(winters) || winters < 1 || winters > 100 ||
        !Number.isSafeInteger(workers) || workers < 1 || workers > 8) throw new Error('Invalid Food study options');
    if (!scenarios.includes('B') || new Set(scenarios).size !== scenarios.length || scenarios.some(scenario => !Object.hasOwn(foodScenarios, scenario))) {
        throw new Error('Known unique scenarios with prepared control B are required');
    }
    const extension = [...new Set(extendedSeeds)].filter(seed => seed >= seedStart && seed < seedStart + seedCount);
    const jobs = Array.from({ length: seedCount }, (_, index) => ({ seed: seedStart + index, winters, kind: 'runs25' }));
    if (winters < 50) jobs.push(...extension.map(seed => ({ seed, winters: 50, kind: 'runs50' })));
    mkdirSync(join(output, 'runs25'), { recursive: true });
    if (extension.length && winters < 50) mkdirSync(join(output, 'runs50'), { recursive: true });
    const artifacts = [];
    const write = (path, value, compressed = false) => {
        const json = JSON.stringify(value, null, compressed ? 0 : 2) + '\n';
        const bytes = compressed ? gzipSync(json) : Buffer.from(json);
        writeFileSync(join(output, path), bytes);
        artifacts.push({ path, bytes: bytes.length, sha256: digest(bytes) });
    };
    const completed = [];
    const pool = [];
    let next = 0;
    try {
        await new Promise((resolve, reject) => {
            for (let index = 0; index < Math.min(workers, jobs.length); index++) {
                const worker = new Worker(new URL('./food-worker.mjs', import.meta.url), { workerData: { scenarios, verificationSeeds } });
                pool.push(worker);
                worker.on('error', reject);
                worker.on('exit', code => { if (completed.length < jobs.length) reject(new Error('Food worker exited: ' + code)); });
                worker.on('message', result => {
                    if (result.error) {
                        reject(new Error(result.error));
                        return;
                    }
                    write(result.kind + '/seed-' + result.seed + '.json.gz', result, true);
                    completed.push(result);
                    onProgress({ completed: completed.length, total: jobs.length, seed: result.seed, kind: result.kind });
                    if (completed.length === jobs.length) resolve();
                    else if (next < jobs.length) worker.postMessage(jobs[next++]);
                });
                worker.postMessage(jobs[next++]);
            }
        });
    } finally {
        await Promise.all(pool.map(worker => worker.terminate()));
    }
    completed.sort((a, b) => a.kind.localeCompare(b.kind, 'en') || a.seed - b.seed);
    const runs = completed.filter(record => record.kind === 'runs25').flatMap(record => record.runs);
    const longer = completed.filter(record => record.kind === 'runs50').flatMap(record => record.runs);
    const summary = { scenarios: summarizeFoodRuns(runs), paired: pairedFoodRuns(runs),
        extended: summarizeFoodRuns(longer), extendedPaired: longer.length ? pairedFoodRuns(longer) : [],
        verification: completed.flatMap(record => record.verification) };
    write('summary.json', summary);
    const harnessFiles = ['run-food-resilience.mjs', 'food-study.mjs', 'food-worker.mjs', 'food-scenario.mjs',
        'food-engine.mjs', 'food-recipes.mjs', 'food-policy.mjs', 'food-statistics.mjs',
        'aptitude-statistics.mjs', 'aptitude-engine.mjs', 'aptitude-economy.mjs', '../load-typescript.mjs'];
    const harnessHashes = Object.fromEntries(harnessFiles.map(file => [file, hash(readFileSync(new URL(file, import.meta.url), 'utf8').replace(/\r\n/g, '\n'))]));
    const manifest = { version: 1, sourceRevision: execFileSync('git', ['rev-parse', 'HEAD'], {
        cwd: new URL('../../', import.meta.url), encoding: 'utf8' }).trim(),
        seeds: { start: seedStart, count: seedCount }, winters, extendedSeeds: extension, extendedWinters: longer.length ? 50 : null,
        campaigns: runs.length + longer.length, recipes: Object.fromEntries(scenarios.map(scenario => [scenario, foodScenarios[scenario]])),
        ruleConfiguration: runs[0].ruleConfiguration, identities: Object.fromEntries(runs.slice(0, scenarios.length).map(run => [run.scenario, run.identity])),
        verificationSeeds, productionDefaultsChanged: false, domesticOnly: true, harnessHashes,
        runtime: { node: process.version, platform: process.platform, architecture: process.arch },
        artifacts: artifacts.sort((a, b) => a.path.localeCompare(b.path, 'en')) };
    writeFileSync(join(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
    return summary;
}
