import test from 'node:test';
import assert from 'node:assert/strict';
import { runLivestockScenario } from '../scripts/qa/livestock-scenario.mjs';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { livestockCandidate } from '../scripts/qa/livestock-candidates.mjs';

test('the public species study runs the real player and CPU with auditable stock accounting and save/load', () => {
    const first = runLivestockScenario({ seed: 1, species: 'chicken', policy: 'herd', winters: 2 });
    const resumed = runLivestockScenario({ seed: 1, species: 'chicken', policy: 'herd', winters: 2, resumeAt: 1 });
    assert.equal(first.status, 'complete');
    assert.equal(first.initial.player.species, 'chicken');
    assert.notEqual(first.initial.cpu.species, 'chicken');
    assert.equal(first.initial.player.food, 15);
    assert.equal(first.initial.cpu.food, 30);
    assert.equal(first.initial.player.adultDescendantsReached, 0);
    assert.deepEqual(first.initial.player.sex, { female: 2, male: 1 });
    assert.equal(first.annual.length, 2);
    for (const row of first.annual) for (const clan of [row.player, row.cpu]) {
        assert.equal(clan.foodResidual, 0);
        assert.equal(clan.materialsResidual, 0);
        assert.equal(clan.herdResidual, 0);
    }
    assert.deepEqual(resumed.annual, first.annual);
    assert.equal(resumed.finalStateHash, first.finalStateHash);
    const full = runLivestockScenario({ seed: 1, species: 'chicken', policy: 'herd', winters: 2, fullWorld: true });
    assert.deepEqual(full.annual, first.annual);
    assert.equal(full.finalStateHash, first.finalStateHash);
    const limited = runLivestockScenario({ seed: 1, species: 'chicken', winters: 2, maxAnimals: 2 });
    assert.equal(limited.status, 'resource-limit');
    assert.equal(limited.annual.length, 0);
    assert.equal(limited.initial.player.herd, 3, 'An observation limit does not cull canonical animals');
    assert.throws(() => runLivestockScenario({ species: 'horse' }), /species/);
});

test('the bounded study CLI keeps raw observations and refuses to overwrite an existing measurement', () => {
    const out = mkdtempSync(join(tmpdir(), 'livestock-study-219-'));
    const args = ['scripts/qa/run-livestock-study.mjs', '--seeds=1', '--species=chicken',
        '--policies=passive', '--winters=1', '--workers=1', '--timeout=60000', '--out=' + out];
    execFileSync(process.execPath, args, { encoding: 'utf8' });
    const manifest = JSON.parse(readFileSync(join(out, 'manifest.json'), 'utf8'));
    assert.equal(manifest.observations.length, 1);
    assert.equal(manifest.observations[0].status, 'complete');
    assert.match(manifest.observations[0].sha256, /^[a-f0-9]{64}$/);
    assert.throws(() => execFileSync(process.execPath, args, { stdio: 'pipe' }), /Command failed/);
    assert.throws(() => execFileSync(process.execPath, ['scripts/qa/run-livestock-study.mjs',
        '--species=horse'], { stdio: 'pipe' }), /Command failed/);
});

test('sensible herd management removes surplus adult males to retain breeding space and records the real slaughter cost', () => {
    // Fixed contract fixture. Changing a proposed balance must not silently change
    // the conditions under which this specific surplus-adult regression is tested.
    const livestockRules = { ...livestockCandidate,
        breeding: { requireFed: true, capacityLimited: true, unassignedCapacityUnits: 40000 } };
    const result = runLivestockScenario({ seed: 1, species: 'cattle', policy: 'herd', winters: 5, livestockRules });
    assert.ok(result.annual.some(row => row.player.slaughters > 0));
    assert.ok(result.commands.some(command => command.type === 'SlaughterLivestock'));
    assert.ok(result.annual.some(row => row.player.slaughterFood > 0 && row.player.hidesReceived > 0));
    const full = runLivestockScenario({ seed: 1, species: 'cattle', policy: 'herd', winters: 5,
        fullWorld: true, livestockRules });
    assert.deepEqual(full.annual, result.annual);
    assert.equal(full.finalStateHash, result.finalStateHash);
});

test('an interrupted study resumes only missing cases and preserves verified raw evidence', () => {
    const out = mkdtempSync(join(tmpdir(), 'livestock-study-resume-219-'));
    const args = ['scripts/qa/run-livestock-study.mjs', '--seeds=1', '--species=chicken,goat',
        '--policies=passive', '--winters=1', '--workers=1', '--timeout=60000', '--out=' + out];
    execFileSync(process.execPath, args, { stdio: 'pipe' });
    const manifestPath = join(out, 'manifest.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    const missing = manifest.observations.pop();
    unlinkSync(join(out, missing.file));
    manifest.finishedAt = null;
    writeFileSync(manifestPath, JSON.stringify(manifest));
    const retained = manifest.observations[0];
    const retainedBytes = readFileSync(join(out, retained.file));
    const output = execFileSync(process.execPath, [...args, '--resume'], { encoding: 'utf8' });
    const resumed = JSON.parse(readFileSync(manifestPath, 'utf8'));
    assert.equal(resumed.observations.length, 2);
    assert.ok(resumed.finishedAt);
    assert.deepEqual(resumed.observations.find(row => row.file === retained.file), retained);
    assert.deepEqual(readFileSync(join(out, retained.file)), retainedBytes);
    assert.match(output, new RegExp(missing.species + '/passive/1: complete'));
    assert.doesNotMatch(output, new RegExp(retained.species + '/passive/1: complete'));
    writeFileSync(join(out, retained.file), 'corrupted');
    const corruptManifest = readFileSync(manifestPath);
    assert.throws(() => execFileSync(process.execPath, [...args, '--resume'], { stdio: 'pipe' }),
        /Command failed/);
    assert.deepEqual(readFileSync(manifestPath), corruptManifest);
});
