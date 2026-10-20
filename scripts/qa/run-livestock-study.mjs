import { Worker, isMainThread, parentPort } from 'node:worker_threads';
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { runLivestockScenario } from './livestock-scenario.mjs';
import { studyHash, livestockStudyCore } from './livestock-study-core.mjs';
import { livestockCandidate } from './livestock-candidates.mjs';
import { summarizeLivestockStudy } from './summarize-livestock-study.mjs';

if (!isMainThread) {
    parentPort.on('message', job => {
        try {
            const result = runLivestockScenario({ ...job, onYear: row => parentPort.postMessage({ year: row }) });
            parentPort.postMessage({ result });
        } catch (error) { parentPort.postMessage({ error: error.stack }); }
    });
} else {
    let resume = false;
    const options = {
        seeds: Array.from({ length: 30 }, (_, index) => index + 1).join(','),
        species: 'control,cattle,chicken,pig,sheep,goat,goose', policies: 'passive,prepared,herd',
        winters: '40', workers: '2', timeout: '300000', maxAnimals: '1000',
        out: 'docs/qa/livestock-founding-219/measurement',
    };
    for (const arg of process.argv.slice(2)) {
        if (arg === '--resume') {
            resume = true;
            continue;
        }
        const match = /^--([^=]+)=(.+)$/.exec(arg);
        if (!match || !Object.hasOwn(options, match[1])) throw new Error('Unknown study argument: ' + arg);
        options[match[1]] = match[2];
    }
    for (const key of ['winters', 'workers', 'timeout', 'maxAnimals']) {
        options[key] = Number(options[key]);
        if (!Number.isSafeInteger(options[key]) || options[key] < 1) throw new Error('Invalid ' + key);
    }
    if (options.workers > 2 || options.winters > 100 || options.timeout < 15000 || options.timeout > 600000)
        throw new Error('Invalid study bounds');
    const seeds = options.seeds.split(',').map(Number);
    const species = options.species.split(','), policies = options.policies.split(',');
    if (seeds.some(seed => !Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) ||
        new Set(seeds).size !== seeds.length ||
        species.some(value => !['control', 'cattle', 'chicken', 'pig', 'sheep', 'goat', 'goose'].includes(value)) ||
        policies.some(value => !['passive', 'prepared', 'herd'].includes(value)) ||
        new Set(species).size !== species.length || new Set(policies).size !== policies.length)
        throw new Error('Invalid study matrix');
    const directory = resolve(options.out), manifestFile = join(directory, 'manifest.json');
    if (existsSync(manifestFile) && !resume) throw new Error('Refusing to replace an existing measurement');
    if (resume && !existsSync(manifestFile)) throw new Error('Cannot resume a missing measurement');
    mkdirSync(directory, { recursive: true });
    const runIdentity = {
        revision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
        dirty: !!execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim(),
        runnerHash: studyHash(readFileSync(new URL(import.meta.url), 'utf8').replace(/\r\n/g, '\n')),
        startedAt: new Date().toISOString(),
    };
    const manifest = resume ? JSON.parse(readFileSync(manifestFile, 'utf8')) : {
        version: 1, kind: 'livestock-founding-study', node: process.version, platform: process.platform,
        ...runIdentity,
        startedAt: new Date().toISOString(), finishedAt: null, options, observations: [],
    };
    if (resume) {
        summarizeLivestockStudy(directory, { allowPartial: true });
        if (manifest.node !== process.version || manifest.platform !== process.platform ||
            Object.keys(options).some(key => key !== 'out' && manifest.options[key] !== options[key]))
            throw new Error('Resume requires the original runtime and matrix options');
        const protocol = {
            ...livestockStudyCore(seeds[0], species[0]).identity,
            scenarioHash: studyHash(readFileSync(new URL('./livestock-scenario.mjs', import.meta.url),
                'utf8').replace(/\r\n/g, '\n')),
            foodPolicyHash: studyHash(readFileSync(new URL('./food-policy.mjs', import.meta.url),
                'utf8').replace(/\r\n/g, '\n')),
            candidateHash: studyHash(livestockCandidate),
        };
        for (const observation of manifest.observations) {
            for (const key of ['sourceHash', 'adapterHash', 'scenarioHash', 'foodPolicyHash', 'candidateHash']) {
                if (observation.identity?.[key] !== protocol[key])
                    throw new Error('Resume protocol mismatch: ' + key);
            }
        }
        manifest.resumptions ??= [];
        manifest.resumptions.push(runIdentity);
        manifest.finishedAt = null;
    }
    const save = () => writeFileSync(manifestFile, JSON.stringify(manifest, null, 2) + '\n');
    save();
    const observed = new Set(manifest.observations.map(row => `${row.seed}/${row.species}/${row.policy}`));
    const batches = seeds.map(seed => species.flatMap(species => policies.map(policy => ({ seed, species, policy,
        winters: options.winters, maxAnimals: options.maxAnimals, maxMilliseconds: options.timeout - 10000,
        resumeAt: Math.floor(options.winters / 2) })))
        .filter(job => !observed.has(`${job.seed}/${job.species}/${job.policy}`)));
    async function execute(job, slot) {
        const started = performance.now(), annual = [];
        const result = await new Promise(resolveResult => {
            const worker = slot.worker ??= new Worker(new URL(import.meta.url), {
                resourceLimits: { maxOldGenerationSizeMb: 512 },
            });
            let settled = false;
            const finish = result => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                worker.removeAllListeners('message');
                worker.removeAllListeners('error');
                worker.removeAllListeners('exit');
                if (result.stopReason === 'worker-time-budget' || result.status === 'failed') {
                    worker.terminate();
                    slot.worker = null;
                }
                resolveResult(result);
            };
            const incomplete = (stopReason, error = null) => ({ ...job,
                status: error ? 'failed' : 'resource-limit', stopReason, error, annual });
            const timer = setTimeout(() => finish(incomplete('worker-time-budget')), options.timeout);
            worker.on('message', message => {
                if (message.year) annual.push(message.year);
                else if (message.result) finish(message.result);
                else if (message.error) finish(incomplete('worker-error', message.error));
            });
            worker.on('error', error => finish(incomplete('worker-error', error.stack)));
            worker.on('exit', code => {
                if (!settled) finish(incomplete('worker-exit-' + code, 'Worker exited without a result'));
            });
            worker.postMessage(job);
        });
        const file = `${job.species}-${job.policy}-${job.seed}.json.gz`;
        const bytes = gzipSync(Buffer.from(JSON.stringify(result) + '\n'));
        writeFileSync(join(directory, file), bytes, { flag: 'wx' });
        const observation = { ...job, file, bytes: bytes.length, sha256: studyHash(bytes),
            status: result.status, stopReason: result.stopReason,
            completedYears: result.annual.length, elapsedMs: Math.round(performance.now() - started),
            identity: result.identity ?? null };
        manifest.observations.push(observation);
        save();
        console.log(`${job.species}/${job.policy}/${job.seed}: ${result.status}, ${observation.completedYears} years, ${observation.elapsedMs}ms`);
    }
    await Promise.all(Array.from({ length: options.workers }, async () => {
        const slot = { worker: null };
        try {
            // Keep each seed on one worker so paired policies reuse the same CPU trace.
            while (batches.length) for (const job of batches.shift()) await execute(job, slot);
        }
        finally { if (slot.worker) await slot.worker.terminate(); }
    }));
    manifest.observations.sort((a, b) => a.file.localeCompare(b.file, 'en'));
    manifest.finishedAt = new Date().toISOString();
    save();
    if (manifest.observations.some(observation => observation.status !== 'complete')) process.exitCode = 1;
}
