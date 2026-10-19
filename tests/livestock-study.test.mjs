import test from 'node:test';
import assert from 'node:assert/strict';
import { runLivestockScenario } from '../scripts/qa/livestock-scenario.mjs';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('the public species study runs the real player and CPU with auditable stock accounting and save/load', () => {
    const first = runLivestockScenario({ seed: 1, species: 'chicken', policy: 'herd', winters: 2 });
    const resumed = runLivestockScenario({ seed: 1, species: 'chicken', policy: 'herd', winters: 2, resumeAt: 1 });
    assert.equal(first.status, 'complete');
    assert.equal(first.initial.player.species, 'chicken');
    assert.notEqual(first.initial.cpu.species, 'chicken');
    assert.equal(first.initial.player.food, 15);
    assert.equal(first.initial.cpu.food, 30);
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
    const result = runLivestockScenario({ seed: 1, species: 'cattle', policy: 'herd', winters: 5 });
    assert.ok(result.annual.some(row => row.player.slaughters > 0));
    assert.ok(result.commands.some(command => command.type === 'SlaughterLivestock'));
    assert.ok(result.annual.some(row => row.player.slaughterFood > 0 && row.player.hidesReceived > 0));
    const full = runLivestockScenario({ seed: 1, species: 'cattle', policy: 'herd', winters: 5, fullWorld: true });
    assert.deepEqual(full.annual, result.annual);
    assert.equal(full.finalStateHash, result.finalStateHash);
});
