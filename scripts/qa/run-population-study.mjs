import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { runPopulationScenario } from './population-scenario.mjs';

// The worker limit is an observation budget, never a population or herd rule.
if (!isMainThread) {
    try {
        const result = runPopulationScenario({...workerData, onYear: (row, context) => parentPort.postMessage({year: row, context})});
        parentPort.postMessage({result});
    } catch (error) { parentPort.postMessage({error: error.stack}); }
} else {
    const options = { seeds: '1,2,3,7,17,32,41,78', candidates: 'control30,baseline15,human-reserve,mortality',
        policies: 'passive', winters: '80', out: 'docs/qa/population-continuity/pilot', workers: '2',
        timeout: '150000', maxCattle: '2000', replay: 'false' };
    for (const arg of process.argv.slice(2)) {
        const match = /^--([^=]+)=(.+)$/.exec(arg);
        if (!match || !Object.hasOwn(options, match[1])) throw new Error('Unknown study argument: ' + arg);
        options[match[1]] = match[2];
    }
    for (const key of ['winters', 'workers', 'timeout', 'maxCattle']) {
        options[key] = Number(options[key]);
        if (!Number.isSafeInteger(options[key]) || options[key] < 1) throw new Error('Invalid ' + key);
    }
    if (options.workers > 2 || options.winters > 100 || !['true','false'].includes(options.replay)) throw new Error('Invalid study bounds');
    const seeds = options.seeds.split(',').map(Number);
    if (seeds.some(n => !Number.isInteger(n) || n < 0 || n > 0xffffffff) || new Set(seeds).size !== seeds.length) throw new Error('Invalid seeds');
    const candidates = options.candidates.split(','), policies = options.policies.split(',');
    const directory = resolve(options.out);
    mkdirSync(directory, {recursive: true});
    const manifestFile = join(directory, 'manifest.json');
    if (existsSync(manifestFile)) throw new Error('Refusing to replace existing measurement: ' + directory);
    const revision = execFileSync('git', ['rev-parse', 'HEAD'], {encoding: 'utf8'}).trim();
    const dirty = !!execFileSync('git', ['status', '--porcelain'], {encoding: 'utf8'}).trim();
    const manifest = {version: 1, revision, dirty, node: process.version, platform: process.platform,
        startedAt: new Date().toISOString(), options, observations: [], finishedAt: null};
    const saveManifest = () => writeFileSync(manifestFile, JSON.stringify(manifest, null, 2) + '\n');
    saveManifest();
    const jobs = candidates.flatMap(candidate => policies.flatMap(policy => seeds.map(seed => ({candidate, policy, seed,
        winters: options.winters, maxCattle: options.maxCattle, maxMilliseconds: options.timeout - 10000,
        resumeAt: options.replay === 'true' ? Math.floor(options.winters / 2) : null }))));
    async function execute(job) {
        const start = performance.now(), checkpoint = [];
        let context = null;
        const result = await new Promise(resolveResult => {
            const worker = new Worker(new URL(import.meta.url), {workerData: job, resourceLimits: {maxOldGenerationSizeMb: 512}});
            let settled = false;
            const finish = result => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                worker.terminate();
                resolveResult(result);
            };
            const incomplete = (reason, error = null) => ({...job, status: 'resource-limit', stopReason: reason,
                annual: checkpoint, ...context, error});
            const timer = setTimeout(() => finish(incomplete('worker-time-budget')), options.timeout);
            worker.on('message', message => {
                if (message.year) { checkpoint.push(message.year); context = message.context; }
                else if (message.result) finish(message.result);
                else if (message.error) finish({...incomplete('worker-error', message.error), status: 'failed'});
            });
            worker.on('error', error => finish({...incomplete('worker-error', error.stack), status: 'failed'}));
            worker.on('exit', code => { if (!settled) finish({...incomplete('worker-exit-' + code), status: 'failed'}); });
        });
        const bytes = gzipSync(Buffer.from(JSON.stringify(result) + '\n'));
        const file = `${job.candidate}-${job.policy}-${job.seed}.json.gz`;
        writeFileSync(join(directory, file), bytes);
        const entry = {...job, status: result.status, stopReason: result.stopReason, completedWinter: result.annual.at(-1)?.winter ?? 800,
            elapsedMs: Math.round(performance.now() - start), file, bytes: bytes.length,
            sha256: createHash('sha256').update(bytes).digest('hex'), identity: result.identity ?? null};
        manifest.observations.push(entry);
        saveManifest();
        console.log(`${job.candidate}/${job.policy}/${job.seed}: ${entry.status}, ${entry.completedWinter - 800} Winters, ${entry.elapsedMs}ms`);
    }
    await Promise.all(Array.from({length: options.workers}, async () => {
        while (jobs.length) await execute(jobs.shift());
    }));
    manifest.finishedAt = new Date().toISOString();
    manifest.observations.sort((a,b) => a.file.localeCompare(b.file, 'en'));
    saveManifest();
    if (manifest.observations.some(r => r.status === 'failed')) process.exitCode = 1;
}
