import { Worker } from 'node:worker_threads';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { sampleAptitudes } from './aptitude-sampling.mjs';
import { modelDefinitions, scoreAptitude } from './aptitude-models.mjs';
import { distribution, summarizeAptitudes } from './aptitude-statistics.mjs';
import { studyEngine } from './aptitude-engine.mjs';
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const mean = values => values.reduce((sum, value) => sum + value, 0) / values.length;
function economySummary(runs) {
    return [...new Set(runs.map(run => run.model + '/' + run.policy))].map(key => {
        const group = runs.filter(run => run.model + '/' + run.policy === key);
        const end = group.map(run => run.annual.at(-1));
        const total = field => distribution(group.map(run => run.annual.slice(1).reduce((sum, row) => sum + row[field], 0)));
        return { model: group[0].model, policy: group[0].policy, seeds: group.length,
            finalFood: distribution(end.map(row => row.food)), finalMaterials: distribution(end.map(row => row.materials)),
            finalPopulation: distribution(end.map(row => row.population)), finalHouses: distribution(end.map(row => row.houses)),
            finalUpgrades: distribution(end.map(row => row.upgrades)), foodProduced: total('foodProduced'),
            materialsProduced: total('materialsProduced'), foodConsumed: total('foodConsumed'),
            shortfall: total('shortfall'), occupationChanges: total('occupationChanges'),
            births: total('births'), deaths: total('deaths'),
            seedsWithShortfall: group.filter(run => run.annual.some(row => row.shortfall > 0)).length,
            shortageWinters: distribution(group.map(run => run.annual.filter(row => row.shortfall > 0).length)),
            longestShortage: distribution(group.map(run => run.longestShortage)),
            annual: group[0].annual.map((_, index) => ({ elapsedWinter: index,
                food: mean(group.map(run => run.annual[index].food)), materials: mean(group.map(run => run.annual[index].materials)),
                population: mean(group.map(run => run.annual[index].population)),
                shortfall: mean(group.map(run => run.annual[index].shortfall || 0)) })),
        };
    });
}
function pairedSummary(runs) {
    return [...new Set(runs.filter(run => run.model !== 'control').map(run => run.model + '/' + run.policy))].map(key => {
        const group = runs.filter(run => run.model + '/' + run.policy === key);
        const deltas = group.map(run => {
            const control = runs.find(other => other.seed === run.seed && other.model === 'control' && other.policy === run.policy);
            const total = (record, field) => record.annual.slice(1).reduce((sum, row) => sum + row[field], 0);
            return { seed: run.seed, food: run.annual.at(-1).food - control.annual.at(-1).food,
                materials: run.annual.at(-1).materials - control.annual.at(-1).materials,
                population: run.annual.at(-1).population - control.annual.at(-1).population,
                shortfall: total(run, 'shortfall') - total(control, 'shortfall'),
                production: total(run, 'foodProduced') - total(control, 'foodProduced') };
        });
        return { key, count: deltas.length, deltas,
            ...Object.fromEntries(['food', 'materials', 'population', 'shortfall', 'production'].map(field =>
                [field, distribution(deltas.map(row => row[field]))])) };
    });
}
export async function runStudy({ output, seedStart = 0, seedCount = 100, winters = 25, workers = 4,
    models = Object.keys(modelDefinitions), verificationSeeds = [0, 7, 32, 99], onProgress = () => {} } = {}) {
    if (!output) throw new Error('Output directory is required');
    if (!models.includes('control') || new Set(models).size !== models.length || models.some(model => !Object.hasOwn(modelDefinitions, model))) {
        throw new Error('Unique models including control are required');
    }
    if (!Number.isSafeInteger(winters) || winters < 1 || winters > 100 || !Number.isSafeInteger(workers) || workers < 1 || workers > 8) {
        throw new Error('Invalid Winters or worker count');
    }
    const founders = sampleAptitudes({ seedStart, seedCount, models });
    mkdirSync(join(output, 'runs'), { recursive: true });
    const artifacts = [];
    const write = (path, value, compressed = false) => {
        const json = JSON.stringify(value, null, compressed ? 0 : 2) + '\n';
        const bytes = compressed ? gzipSync(json) : Buffer.from(json);
        writeFileSync(join(output, path), bytes);
        artifacts.push({ path, bytes: bytes.length, sha256: digest(bytes) });
    };
    write('founders.json.gz', founders, true);
    const completed = [];
    const pool = [];
    let next = seedStart;
    try {
        await new Promise((resolve, reject) => {
            let finished = 0;
            for (let index = 0; index < Math.min(workers, seedCount); index++) {
                const worker = new Worker(new URL('./aptitude-worker.mjs', import.meta.url), {
                    workerData: { models, winters, verificationSeeds } });
                pool.push(worker);
                worker.on('error', reject);
                worker.on('exit', code => { if (code !== 0 && finished < seedCount) reject(new Error('Measurement worker exited: ' + code)); });
                worker.on('message', result => {
                    if (result.error) { reject(new Error(result.error)); return; }
                    write('runs/seed-' + result.seed + '.json.gz', result, true);
                    completed.push(result);
                    finished++;
                    onProgress({ completed: finished, total: seedCount, seed: result.seed });
                    if (finished === seedCount) resolve();
                    else if (next < seedStart + seedCount) worker.postMessage(next++);
                });
                worker.postMessage(next++);
            }
        });
    } finally {
        await Promise.all(pool.map(worker => worker.terminate()));
    }
    completed.sort((a, b) => a.seed - b.seed);
    const runs = completed.flatMap(result => result.runs);
    const engine = studyEngine('control');
    const roles = engine.core.occupationIds;
    // One frozen observed descendant cohort, never mix candidate-specific survivor populations.
    const children = runs.filter(run => run.model === 'control' && run.policy === 'aware').flatMap(run => run.descendants);
    const descendants = children.flatMap(person => models.map(model => ({ ...person, model,
        aptitudes: Object.fromEntries(roles.map(role => [role,
            scoreAptitude(person.traits, runs[0].configuration.occupations[role], model)])) })));
    write('descendants.json.gz', descendants, true);
    const summary = { founders: summarizeAptitudes(founders), descendants: summarizeAptitudes(descendants),
        economy: economySummary(runs), paired: pairedSummary(runs),
        verification: completed.flatMap(result => result.verification) };
    write('summary.json', summary);
    const harnessFiles = ['run-aptitude-calibration.mjs', 'aptitude-study.mjs', 'aptitude-worker.mjs',
        'aptitude-sampling.mjs', 'aptitude-economy.mjs', 'aptitude-models.mjs', 'aptitude-engine.mjs', 'aptitude-statistics.mjs'];
    const harnessHashes = Object.fromEntries(harnessFiles.map(file => [file,
        digest(readFileSync(new URL(file, import.meta.url), 'utf8').replace(/\r\n/g, '\n'))]));
    const revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: new URL('../../', import.meta.url), encoding: 'utf8' }).trim();
    const manifest = { version: 1, baseRevision: revision, runtime: { node: process.version, platform: process.platform, architecture: process.arch },
        seeds: { start: seedStart, count: seedCount }, winters, models: Object.fromEntries(models.map(model => [model, modelDefinitions[model]])),
        policies: ['default (control only)', 'random', 'aware'], verificationSeeds: verificationSeeds.filter(seed => seed >= seedStart && seed < seedStart + seedCount),
        productionRulesChanged: false, engineIdentity: engine.identity, harnessHashes,
        ruleConfiguration: runs[0].ruleConfiguration, domesticOnly: true,
        artifacts: artifacts.sort((a, b) => a.path.localeCompare(b.path, 'en')) };
    writeFileSync(join(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
    return summary;
}
