import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { hash } from './aptitude-economy.mjs';
import { createHash } from 'node:crypto';
import { profileModels, profilesFor, sampleProfiles } from './profile-models.mjs';
import { summarizeAptitudes, summarizeProfileEconomy, pairProfileEconomy } from './profile-statistics.mjs';
import { proveProfileReplay } from './profile-scenario.mjs';
import { sampleAptitudes } from './aptitude-sampling.mjs';
const digest = bytes => createHash('sha256').update(bytes).digest('hex');

export async function runProfileStudy({ output, seedStart = 0, seedCount = 100, winters = 25,
    workers = 4, verificationSeeds = [0, 7, 32, 99], onProgress = () => {} } = {}) {
    if (!output || !Number.isSafeInteger(winters) || winters < 1 || winters > 100 ||
        !Number.isSafeInteger(workers) || workers < 1 || workers > 8) throw new Error('Invalid study options');
    const founders = sampleProfiles({ seedStart, seedCount });
    const descendants = sampleProfiles({ seedStart, seedCount, kind: 'descendants' });
    const generated = sampleAptitudes({ seedStart, seedCount });
    assert.deepEqual(founders.filter(row => row.model === 'A').map(row => ({ ...row, model: 'control' })),
        generated, 'Frozen #83 founders must match the current real generator and canonical scores');
    mkdirSync(join(output, 'runs'), { recursive: true });
    const artifacts = [];
    const write = (path, value, compressed = false) => {
        const json = JSON.stringify(value, null, compressed ? 0 : 2) + '\n';
        const bytes = compressed ? gzipSync(json) : Buffer.from(json);
        writeFileSync(join(output, path), bytes);
        artifacts.push({ path, bytes: bytes.length, sha256: digest(bytes) });
    };
    write('founders.json.gz', founders, true);
    write('descendants.json.gz', descendants, true);
    const completed = [], pool = [];
    let next = seedStart;
    try {
        await new Promise((resolve, reject) => {
            let finished = 0;
            for (let index = 0; index < Math.min(workers, seedCount); index++) {
                const worker = new Worker(new URL('./profile-worker.mjs', import.meta.url),
                    { workerData: { winters, verificationSeeds } });
                pool.push(worker);
                worker.on('error', reject);
                worker.on('exit', code => {
                    if (code !== 0 && finished < seedCount) reject(new Error('Profile worker exited: ' + code));
                });
                worker.on('message', record => {
                    try {
                        if (record.error) throw new Error(record.error);
                        write('runs/seed-' + record.seed + '.json.gz', record, true);
                        completed.push(record);
                        finished++;
                        onProgress({ completed: finished, total: seedCount });
                        if (finished === seedCount) resolve();
                        else if (next < seedStart + seedCount) worker.postMessage(next++);
                    } catch (error) { reject(error); }
                });
                worker.postMessage(next++);
            }
        });
    } finally {
        await Promise.all(pool.map(worker => worker.terminate()));
    }
    completed.sort((a, b) => a.seed - b.seed);
    const runs = completed.flatMap(record => record.runs);
    const summary = { founders: summarizeAptitudes(founders),
        descendants: descendants.length ? summarizeAptitudes(descendants) : {},
        economy: summarizeProfileEconomy(runs), paired: pairProfileEconomy(runs),
        verification: completed.flatMap(record => record.verification),
        partialReplay: Object.keys(profileModels).flatMap(model =>
            ['base', 'protected'].map(economy => proveProfileReplay({ model, economy }))) };
    write('summary.json', summary);
    const harness = ['run-occupation-profiles.mjs', 'profile-models.mjs', 'profile-engine.mjs',
        'verify-profile-study.mjs', 'profile-scenario.mjs', 'profile-worker.mjs', 'profile-statistics.mjs', 'profile-study.mjs',
        'food-engine.mjs', 'food-scenario.mjs', 'food-policy.mjs', 'food-recipes.mjs',
        'aptitude-engine.mjs', 'aptitude-models.mjs', 'aptitude-economy.mjs', 'aptitude-statistics.mjs',
        'aptitude-sampling.mjs', '../load-typescript.mjs'];
    const manifest = { version: 1, productionRulesChanged: false,
        baseRevision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
        runtime: { node: process.version, platform: process.platform, architecture: process.arch },
        seeds: { start: seedStart, count: seedCount }, winters, campaigns: runs.length,
        cohorts: { founders: founders.length / 3, descendants: descendants.length / 3, source: '#83 frozen control cohort' },
        models: profileModels, profiles: Object.fromEntries(Object.keys(profileModels).map(model => [model, profilesFor(model)])),
        policies: ['default', 'random', 'aware'], economies: ['base', 'protected'],
        domesticOnly: true, verificationSeeds: verificationSeeds.filter(seed => seed >= seedStart && seed < seedStart + seedCount),
        identities: Object.fromEntries(runs.slice(0, 18).map(run => [[run.model, run.policy, run.economy].join('/'), run.identity])),
        ruleConfigurations: Object.fromEntries(runs.slice(0, 18).map(run => [[run.model, run.policy, run.economy].join('/'), run.ruleConfiguration])),
        cohortSources: Object.fromEntries(['founders', 'descendants'].map(kind => [kind, digest(
            readFileSync(new URL('../../docs/qa/occupation-aptitude-v03/' + kind + '.json.gz', import.meta.url)))])),
        harnessHashes: Object.fromEntries(harness.map(file => [file,
            hash(readFileSync(new URL(file, import.meta.url), 'utf8').replace(/\r\n/g, '\n'))])),
        artifacts: artifacts.sort((a, b) => a.path.localeCompare(b.path, 'en')) };
    writeFileSync(join(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
    return summary;
}
