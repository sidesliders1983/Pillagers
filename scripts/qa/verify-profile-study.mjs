import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { profileEngine } from './profile-engine.mjs';
import { sampleProfiles } from './profile-models.mjs';
import { summarizeAptitudes, summarizeProfileEconomy, pairProfileEconomy, conditionKey } from './profile-statistics.mjs';
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const readJSON = path => JSON.parse(readFileSync(path, 'utf8'));
const compressed = path => JSON.parse(gunzipSync(readFileSync(path)));

export function verifyProfileStudy(directory) {
    const manifest = readJSON(join(directory, 'manifest.json'));
    const summary = readJSON(join(directory, 'summary.json'));
    const expectedPaths = ['founders.json.gz', 'descendants.json.gz', 'summary.json'];
    for (let seed = manifest.seeds.start; seed < manifest.seeds.start + manifest.seeds.count; seed++) {
        expectedPaths.push('runs/seed-' + seed + '.json.gz');
    }
    assert.deepEqual(manifest.artifacts.map(file => file.path).sort(), expectedPaths.sort(),
        'Incomplete artifact inventory');

    assert.equal(manifest.productionRulesChanged, false);
    assert.equal(manifest.campaigns, manifest.seeds.count * 18);
    const matrix = ['A', 'B', 'C'].flatMap(model => ['default', 'random', 'aware'].flatMap(policy =>
        ['base', 'protected'].map(economy => [model, policy, economy].join('/')))).sort();
    for (const artifact of manifest.artifacts) {
        const bytes = readFileSync(join(directory, artifact.path));
        assert.equal(digest(bytes), artifact.sha256, 'Artifact checksum mismatch: ' + artifact.path);
        assert.equal(bytes.length, artifact.bytes);
    }
    for (const [file, expected] of Object.entries(manifest.harnessHashes)) {
        assert.equal(digest(readFileSync(new URL(file, import.meta.url), 'utf8').replace(/\r\n/g, '\n')),
            expected, 'Harness changed: ' + file);
    }
    for (const kind of ['founders', 'descendants']) {
        const source = readFileSync(new URL('../../docs/qa/occupation-aptitude-v03/' + kind + '.json.gz', import.meta.url));
        assert.equal(digest(source), manifest.cohortSources[kind]);
        assert.deepEqual(compressed(join(directory, kind + '.json.gz')), sampleProfiles({
            seedStart: manifest.seeds.start, seedCount: manifest.seeds.count, kind,
        }));
    }
    for (const key of matrix) {
        const [model, policy, economy] = key.split('/');
        assert.deepEqual(profileEngine({ model, policy, economy }).identity, manifest.identities[key]);
    }
    const founders = compressed(join(directory, 'founders.json.gz'));
    const descendants = compressed(join(directory, 'descendants.json.gz'));
    assert.equal(founders.length / 3, manifest.seeds.count * 10);
    const runs = [], verification = [];
    let winterRows = 0, historicalControls = 0, spoilageControls = 0, divergentRngPairs = 0;
    for (let seed = manifest.seeds.start; seed < manifest.seeds.start + manifest.seeds.count; seed++) {
        const record = compressed(join(directory, 'runs/seed-' + seed + '.json.gz'));
        assert.equal(record.seed, seed);
        assert.deepEqual(record.runs.map(conditionKey).sort(), matrix, 'Incomplete matched matrix');
        assert.equal(new Set(record.runs.map(run => run.initialFingerprint)).size, 1);
        runs.push(...record.runs);
        verification.push(...record.verification);
        for (const run of record.runs) {
            assert.equal(run.seed, seed);
            assert.equal(run.winters, manifest.winters);
            assert.deepEqual(run.identity, manifest.identities[conditionKey(run)]);
            assert.deepEqual(run.ruleConfiguration, manifest.ruleConfigurations[conditionKey(run)]);
            assert.equal(run.recipe.capacity, null);
            assert.equal(run.recipe.policy, run.policy);
            assert.equal(run.recipe.spoilageBps, run.economy === 'protected' ? 1000 : 0);
            assert.equal(run.recipe.protectedWinters, run.economy === 'protected' ? 2 : 0);
            assert.equal(run.annual.length, manifest.winters + 1);
            assert.ok(run.commands.every(command => command.accepted));
            const initialScores = founders.filter(row => row.campaignSeed === seed && row.model === run.model);
            for (const worker of run.annual[1].workers.filter(worker => worker.occupation)) {
                assert.equal(worker.aptitudeBps, initialScores.find(row => row.personaId === worker.id).aptitudes[worker.occupation]);
            }
            for (const row of run.annual.slice(1)) {
                winterRows++;
                assert.ok([row.food, row.materials, row.foodProduced, row.foodConsumed, row.spoiled, row.shortfall]
                    .every(value => Number.isSafeInteger(value) && value >= 0));
                assert.equal(row.food, row.previousFood + row.foodProduced - row.foodConsumed - row.spoiled);
                assert.equal(row.materials, row.previousMaterials + row.producedByRole.woodworker +
                    row.materialsRecovered - row.materialsSpent - row.upkeep);
                assert.equal(row.spoiled, Math.floor(Math.max(0, row.beforeSpoilage - row.protectedFood) * run.recipe.spoilageBps / 10000));
                assert.equal(row.capacityLostEquivalent, 0);
                assert.ok(row.workers.every(worker => worker.capacityBps === 10000));
                if (row.weather === 'Harsh') {
                    assert.equal(row.foodProduced, 0);
                    assert.equal(row.producedByRole.woodworker, 0);
                    assert.equal(row.residentRequired, Math.ceil(row.residentBaseAtConsumption * 1.5));
                    assert.equal(row.cattleRequired, Math.ceil(row.cattleBaseAtConsumption * 1.5));
                }
                if (row.weather === 'Severe') {
                    assert.equal(row.residentRequired, row.residentBaseAtConsumption);
                    assert.equal(row.cattleRequired, row.cattleBaseAtConsumption * 3);
                }
            }
            if (run.model !== 'A') {
                const baseline = record.runs.find(other => other.model === 'A' &&
                    other.policy === run.policy && other.economy === run.economy);
                if (run.annual.some((row, index) => row.rngState !== baseline.annual[index].rngState)) divergentRngPairs++;
            }
            if (manifest.winters === 25 && run.model === 'A') {
                const folder = run.economy === 'base' ? 'occupation-aptitude-v03/runs' : 'food-resilience-v03/runs25';
                if (run.economy === 'base' || run.policy === 'aware') {
                    const old = compressed(new URL('../../docs/qa/' + folder + '/seed-' + seed + '.json.gz', import.meta.url));
                    const match = old.runs.find(other => run.economy === 'base'
                        ? other.model === 'control' && other.policy === run.policy : other.scenario === 'C10-safe');
                    assert.equal(run.finalStateHash, match.finalStateHash, 'Historical control changed');
                    assert.equal(run.initialFingerprint, match.initialFingerprint);
                    assert.deepEqual(run.commands, match.commands);
                    if (run.economy === 'base') historicalControls++;
                    else spoilageControls++;
                }
            }
        }
    }
    assert.equal(runs.length, manifest.campaigns);
    assert.deepEqual(summary.founders, summarizeAptitudes(founders));
    assert.deepEqual(summary.descendants, descendants.length ? summarizeAptitudes(descendants) : {});
    assert.deepEqual(summary.economy, summarizeProfileEconomy(runs));
    assert.deepEqual(summary.paired, pairProfileEconomy(runs));
    assert.deepEqual(summary.verification, verification);
    assert.equal(verification.filter(row => row.kind === 'repeat-and-save').length, manifest.verificationSeeds.length * 18);
    assert.equal(verification.filter(row => row.kind === 'full-world-equivalence').length, manifest.verificationSeeds.length * 6);
    for (const proof of verification) {
        const run = runs.find(run => run.seed === proof.seed && run.model === proof.model &&
            run.policy === proof.policy && run.economy === proof.economy);
        assert.equal(proof.hash, proof.kind === 'repeat-and-save' ? run.finalStateHash : run.finalDomesticHash);
    }
    assert.equal(summary.partialReplay.length, 6);
    assert.ok(summary.partialReplay.every(proof => proof.workProgress > 0 && proof.continuousHash === proof.resumedHash));
    const audit = { campaigns: runs.length, winterRows, founders: founders.length / 3,
        descendants: descendants.length / 3, artifacts: manifest.artifacts.length,
        historicalControls, spoilageControls, divergentRngPairs,
        repeatAndSave: manifest.verificationSeeds.length * 18,
        fullWorld: manifest.verificationSeeds.length * 6, partialReplay: 6 };
    writeFileSync(join(directory, 'audit.json'), JSON.stringify(audit, null, 2) + '\n');
    return audit;
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
    console.log(JSON.stringify(verifyProfileStudy(process.argv[2])));
}
