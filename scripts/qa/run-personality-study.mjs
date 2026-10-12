import {Worker} from 'node:worker_threads';
import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {gzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const output = fileURLToPath(new URL('../../docs/qa/personality-life-events/', import.meta.url));
mkdirSync(join(output, 'runs'), {recursive: true});
const jobs = [false, true].flatMap(fixture => Array.from({length: 100}, (_, seed) =>
    ({seed, winters: 25, fixture, verify: [0, 7, 32, 99].includes(seed)})));
jobs.push(...[0, 7, 32, 99].map(seed => ({seed, winters: 25, fullWorld: true, verify: true})));
const results = [], artifacts = [], pool = [];
const digest = data => createHash('sha256').update(data).digest('hex');
let next = 0;
try {
    await new Promise((resolve, reject) => {
        for (let index = 0; index < 2; index++) {
            const worker = new Worker(new URL('./personality-worker.mjs', import.meta.url)); pool.push(worker);
            worker.on('error', reject);
            worker.on('message', message => {
                if (message.error) { reject(new Error(message.error)); return; }
                const run = message.run;
                const kind = run.fullWorld ? 'full-world' : run.fixture ? 'controlled' : 'default';
                const path = 'runs/' + kind + '-seed-' + run.seed + '.json.gz';
                const bytes = gzipSync(JSON.stringify(run)); writeFileSync(join(output, path), bytes);
                artifacts.push({path, bytes: bytes.length, sha256: digest(bytes)});
                const {initial, final, ...small} = run; results.push(small);
                if (results.length % 10 === 0 || run.fullWorld) console.log(results.length + '/' + jobs.length + ' completed');
                if (results.length === jobs.length) resolve();
                else if (next < jobs.length) worker.postMessage(jobs[next++]);
            });
            worker.postMessage(jobs[next++]);
        }
    });
} finally { await Promise.all(pool.map(worker => worker.terminate())); }
function summarize(runs) {
    const keys = Object.keys(runs[0].counts);
    const totals = Object.fromEntries(keys.map(key => [key, runs.reduce((sum, run) => sum + Number(run.counts[key]), 0)]));
    return {runs: runs.length, totals, allBaselineParity: runs.every(run => run.baselineParity),
        verification: runs.filter(run => Object.keys(run.verification).length).map(run => ({seed: run.seed, ...run.verification})),
        perSeed: runs.map(run => ({seed: run.seed, ...run.counts, byPerson: run.byPerson, byPair: run.byPair, helpers: run.helpers})),
        annualTimingMs: {enabledMean: runs.reduce((sum, run) => sum + run.timing.enabledMs, 0) / runs.length / 25,
            disabledMean: runs.reduce((sum, run) => sum + run.timing.disabledMs, 0) / runs.length / 25}};
}
results.sort((a,b) => a.seed - b.seed);
const summary = {
    defaultCohort: summarize(results.filter(run => !run.fixture && !run.fullWorld)),
    controlledCohort: summarize(results.filter(run => run.fixture)),
    fullWorld: summarize(results.filter(run => run.fullWorld))
};
writeFileSync(join(output, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
const files = ['src/simulation/PersonalityLifeEvents.ts', 'src/simulation/SimulationCore.ts', 'src/simulation/Mechanics.ts',
    'src/simulation/WorldExpeditions.ts', 'scripts/qa/personality-scenario.mjs', 'scripts/qa/personality-worker.mjs',
    'scripts/qa/run-personality-study.mjs'];
writeFileSync(join(output, 'manifest.json'), JSON.stringify({version: 1,
    sourceRevision: execFileSync('git', ['rev-parse', 'HEAD'], {encoding: 'utf8'}).trim(),
    sourceHashes: Object.fromEntries(files.map(path => [path, digest(readFileSync(path, 'utf8').replace(/\r\n/g, '\n'))])),
    seeds: {start: 0, count: 100}, winters: 25, workers: 2, pairedCampaigns: jobs.length * 2,
    fixture: {initialFood: 0, initialMaterials: 100, residents: ['Einar (32)', 'Liv (30)', 'Astrid (20)'],
        overrides: {fertilityChanceBps: 0, partnershipChanceBps: 0, careerReviewWinters: 0,
            childcareWinters: 0, mortalityBands: [{minAge: 0, chanceBps: 0}]}, occupations: 'none'},
    defaultBalanceChanged: false, productionSocialDefaultEnabled: false,
    domesticScope: 'Default cohort removes world only; four independent full-world seeds retain CPU targets.',
    timing: 'Paired wall time per annual Core command; run summaries, not individual frame samples. No performance gate.',
    runtime: {node: process.version, platform: process.platform, architecture: process.arch},
    artifacts: artifacts.sort((a,b) => a.path.localeCompare(b.path, 'en'))}, null, 2) + '\n');
console.log(JSON.stringify(Object.fromEntries(Object.entries(summary).map(([key,value]) => [key,value.totals])), null, 2));
