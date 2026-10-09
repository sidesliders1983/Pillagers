import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { foodEngine } from './food-engine.mjs';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const json = path => JSON.parse(readFileSync(path, 'utf8'));

/** Verify the published archive independently of report generation. */
export function verifyFoodStudy(directory) {
    const manifest = json(join(directory, 'manifest.json'));
    const summary = json(join(directory, 'summary.json'));
    for (const artifact of manifest.artifacts) {
        const bytes = readFileSync(join(directory, artifact.path));
        assert.equal(digest(bytes), artifact.sha256, 'Artifact checksum mismatch: ' + artifact.path);
        assert.equal(bytes.length, artifact.bytes);
    }
    for (const [file, expected] of Object.entries(manifest.harnessHashes)) {
        const source = readFileSync(new URL(file, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
        assert.equal(digest(source), expected, 'Harness checksum mismatch: ' + file);
    }
    for (const [scenario, expected] of Object.entries(manifest.identities)) {
        assert.deepEqual(foodEngine(scenario).identity, expected, 'Source or recipe changed: ' + scenario);
    }
    let campaigns = 0;
    let winterRows = 0;
    let unchangedHistoricalControls = 0;
    let extendedPrefixChecks = 0;
    const allowedCommands = new Set(['AssignOccupation', 'SalvageLongship', 'BuildHouse',
        'SpecializeBuilding', 'AssignCattle', 'UpgradeBuilding']);
    for (const artifact of manifest.artifacts.filter(file => file.path.endsWith('.json.gz'))) {
        const record = JSON.parse(gunzipSync(readFileSync(join(directory, artifact.path))));
        assert.equal(record.runs.length, Object.keys(manifest.recipes).length);
        const primary = record.kind === 'runs50' ? JSON.parse(gunzipSync(readFileSync(
            join(directory, 'runs25/seed-' + record.seed + '.json.gz')))).runs : [];

        assert.equal(new Set(record.runs.map(run => run.initialFingerprint)).size, 1);
        for (const run of record.runs) {
            campaigns++;
            if (primary.length) {
                const shorter = primary.find(other => other.scenario === run.scenario);
                assert.deepEqual(run.annual.slice(0, manifest.winters + 1), shorter.annual);
                assert.deepEqual(run.commands.filter(command => command.winter < 800 + manifest.winters), shorter.commands);
                extendedPrefixChecks++;
            }
            assert.deepEqual(run.ruleConfiguration, manifest.ruleConfiguration);
            assert.deepEqual(run.recipe, manifest.recipes[run.scenario]);
            assert.equal(run.annual.length, run.winters + 1);
            assert.ok(run.commands.every(command => command.accepted && allowedCommands.has(command.type)));
            for (const row of run.annual.slice(1)) {
                winterRows++;
                assert.ok([row.food, row.materials, row.spoiled, row.capacityLostEquivalent].every(value => Number.isSafeInteger(value) && value >= 0));
                assert.equal(row.food, row.previousFood + row.foodProduced - row.foodConsumed - row.spoiled);
                assert.equal(row.nominalFoodEquivalent - row.capacityLostEquivalent, row.foodProduced);
                assert.equal(row.materials, row.previousMaterials + row.producedByRole.woodworker + row.materialsRecovered - row.materialsSpent - row.upkeep);
                for (const role of ['farmer', 'fisher', 'hunter']) {
                    const workers = row.workers.filter(worker => worker.occupation === role);
                    assert.ok(new Set(workers.map(worker => worker.capacityBps)).size <= 1);
                }
                if (row.weather === 'Harsh') {
                    assert.equal(row.foodProduced, 0);
                    assert.equal(row.producedByRole.woodworker, 0);
                    assert.equal(row.residentRequired, Math.ceil(row.residentBaseAtConsumption * 1.5));
                    assert.equal(row.cattleRequired, Math.ceil(row.cattleBaseAtConsumption * 1.5));
                }
            }
            if (record.kind === 'runs25' && run.winters === 25 && ['A', 'B'].includes(run.scenario)) {
                const oldFile = new URL('../../docs/qa/occupation-aptitude-v03/runs/seed-' + run.seed + '.json.gz', import.meta.url);
                if (existsSync(oldFile)) {
                    const old = JSON.parse(gunzipSync(readFileSync(oldFile))).runs.find(other =>
                        other.model === 'control' && other.policy === (run.scenario === 'A' ? 'default' : 'aware'));
                    assert.equal(run.finalStateHash, old.finalStateHash, 'Historical control drift: ' + run.seed + '/' + run.scenario);
                    assert.equal(run.initialFingerprint, old.initialFingerprint);
                    assert.deepEqual(run.commands, old.commands);
                    unchangedHistoricalControls++;
                }
            }
        }
    }
    assert.equal(campaigns, manifest.campaigns);
    return { campaigns, winterRows, checksumVerifiedArtifacts: manifest.artifacts.length,
        unchangedHistoricalControls, extendedPrefixChecks, verificationRecords: summary.verification.length,
        repeatAndSaveChecks: summary.verification.filter(record => record.kind === 'repeat-and-save').length,
        fullWorldChecks: summary.verification.filter(record => record.kind === 'full-world-equivalence').length };
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
    const directory = process.argv[2];
    const result = verifyFoodStudy(directory);
    writeFileSync(join(directory, 'audit.json'), JSON.stringify(result, null, 2) + '\n');
    console.log(JSON.stringify(result));
}
