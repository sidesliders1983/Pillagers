import test from 'node:test';
import assert from 'node:assert/strict';
import { runFoodScenario } from '../scripts/qa/run-food-resilience.mjs';
import { runEconomyScenario } from '../scripts/qa/run-aptitude-calibration.mjs';

test('Food controls retain the canonical passive and prepared command trajectories', () => {
    for (const [scenario, policy] of [['A', 'default'], ['B', 'aware']]) {
        const actual = runFoodScenario({ seed: 32, scenario, winters: 2 });
        const canonical = runEconomyScenario({ seed: 32, model: 'control', policy, winters: 2 });
        assert.equal(actual.initialFingerprint, canonical.initialFingerprint);
        assert.equal(actual.finalStateHash, canonical.finalStateHash);
        assert.deepEqual(actual.commands, canonical.commands);
        assert.equal(actual.annual.at(-1).food, canonical.annual.at(-1).food);
        assert.equal(actual.annual.at(-1).materials, canonical.annual.at(-1).materials);
        assert.deepEqual(actual.ruleConfiguration, canonical.ruleConfiguration);
    }
});

test('spoilage is rounded down after the whole Winter and protected reserves are left intact', () => {
    const spoiled = runFoodScenario({ seed: 32, scenario: 'C10', winters: 1 });
    const protectedStock = runFoodScenario({ seed: 32, scenario: 'C10-safe', winters: 1 });
    // The independent canonical B fixture ends Winter 800 with 44 Food and a newborn.
    assert.equal(spoiled.annual[1].beforeSpoilage, 44);
    assert.equal(spoiled.annual[1].spoiled, 4);
    assert.equal(spoiled.annual[1].food, 40);
    assert.equal(spoiled.annual[1].births, 1);
    assert.equal(protectedStock.annual[1].protectedFood, 48);
    assert.equal(protectedStock.annual[1].spoiled, 0);
    assert.equal(protectedStock.annual[1].food, 44);
});

test('occupation capacity is shared fairly before integer work, while Materials output is unaffected', async () => {
    const { runFoodCommandProbe } = await import('../scripts/qa/run-food-resilience.mjs');
    const commands = Array.from({ length: 10 }, (_, index) => ({ type: 'AssignOccupation',
        personaId: 'founder-' + (index + 1), occupation: index < 8 ? 'hunter' : 'woodworker' }));
    const result = runFoodCommandProbe({ seed: 32, scenario: 'D2', commands, ticks: 500 });
    const hunters = result.workers.filter(worker => worker.occupation === 'hunter');
    assert.equal(hunters.length, 8);
    // 2 full slots + .75 + .50 + .25 + .10 + .10 + .10 = 3.8 slots / 8 workers.
    assert.ok(hunters.every(worker => worker.capacityBps === 4750));
    assert.ok(result.workers.filter(worker => worker.occupation === 'woodworker').every(worker => worker.capacityBps === 10000));
    assert.ok(result.ledger.workLost.hunter > 0);
    assert.equal(result.ledger.workLost.farmer, 0);
    assert.ok(Object.values(result.ledger.workLost).every(Number.isSafeInteger));
    assert.ok(result.commands.every(command => command.accepted));
    const uncapped = runFoodCommandProbe({ seed: 32, scenario: 'B', commands, ticks: 500 });
    assert.ok(result.stocks.food < uncapped.stocks.food);
    assert.equal(result.stocks.materials, uncapped.stocks.materials);
    assert.deepEqual(result.workers.filter(worker => worker.occupation === 'woodworker'),
        uncapped.workers.filter(worker => worker.occupation === 'woodworker'));
});

test('annual Food ledgers account for capacity work loss, spoilage and unchanged Harsh consumption once', () => {
    const result = runFoodScenario({ seed: 0, scenario: 'E10', winters: 6, resumeAt: 3 });
    const repeated = runFoodScenario({ seed: 0, scenario: 'E10', winters: 6 });
    assert.deepEqual(result, repeated);
    assert.ok(result.annual.slice(1).some(row => row.capacityLostEquivalent > 0));
    for (const row of result.annual.slice(1)) {
        assert.equal(row.food, row.previousFood + row.nominalFoodEquivalent - row.capacityLostEquivalent - row.foodConsumed - row.spoiled);
        assert.ok([row.food, row.materials, row.spoiled, row.capacityLostEquivalent].every(Number.isSafeInteger));
        if (row.weather === 'Harsh') {
            assert.equal(row.foodProduced, 0);
            assert.equal(row.producedByRole.woodworker, 0);
            assert.equal(row.residentRequired, Math.ceil(row.residentBaseAtConsumption * 1.5));
            assert.equal(row.cattleRequired, Math.ceil(row.cattleBaseAtConsumption * 1.5));
        }
    }
    const unchanged = runFoodScenario({ seed: 0, scenario: 'B', winters: 6 });
    assert.deepEqual(result.ruleConfiguration, unchanged.ruleConfiguration);
    const harsh = unchanged.annual.find(row => row.weather === 'Harsh');
    assert.equal(harsh.foodProduced, 0);
});

test('partial work and experiment ledgers resume identically and reject a different recipe', async () => {
    const { runFoodCommandProbe } = await import('../scripts/qa/run-food-resilience.mjs');
    const commands = [{ type: 'AssignOccupation', personaId: 'founder-1', occupation: 'hunter' }];
    const continuous = runFoodCommandProbe({ seed: 32, scenario: 'E10', commands, ticks: 1000 });
    const resumed = runFoodCommandProbe({ seed: 32, scenario: 'E10', commands, ticks: 1000, resumeAt: 500 });
    assert.deepEqual(resumed, continuous);
    assert.throws(() => runFoodCommandProbe({ seed: 32, scenario: 'E10', commands,
        ticks: 1000, resumeAt: 500, readAsScenario: 'C10' }), /identity mismatch/);
});

test('public study publishes matched raw campaigns and explicit experimental configurations', async () => {
    const { runFoodStudy } = await import('../scripts/qa/run-food-resilience.mjs');
    const { mkdtempSync, readFileSync, rmSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const directory = mkdtempSync(join(tmpdir(), 'food-study-'));
    try {
        const result = await runFoodStudy({ output: directory, seedCount: 1, winters: 1, workers: 1,
            scenarios: ['A', 'B', 'C10', 'D2', 'E10'], verificationSeeds: [], extendedSeeds: [] });
        assert.equal(result.scenarios.length, 5);
        assert.ok(result.scenarios.every(row => row.seeds === 1));
        const manifest = JSON.parse(readFileSync(join(directory, 'manifest.json'), 'utf8'));
        assert.equal(manifest.campaigns, 5);
        assert.equal(manifest.productionDefaultsChanged, false);
        assert.equal(manifest.recipes.C10.spoilageBps, 1000);
        assert.equal(manifest.recipes.D2.capacity.fullWorkers, 2);
        assert.ok(manifest.artifacts.some(file => file.path === 'runs25/seed-0.json.gz' && file.sha256.length === 64));
        const { verifyFoodStudy } = await import('../scripts/qa/verify-food-study.mjs');
        const audit = verifyFoodStudy(directory);
        assert.equal(audit.campaigns, 5);
        const { appendFileSync } = await import('node:fs');
        appendFileSync(join(directory, 'summary.json'), ' ');
        assert.throws(() => verifyFoodStudy(directory), /Artifact checksum mismatch/);
    } finally {
        assert.ok(directory.startsWith(join(tmpdir(), 'food-study-')));
        rmSync(directory, { recursive: true, force: true });
    }
});

test('domestic study follows the complete world engine at the agreed measurement seam', () => {
    for (const scenario of ['B', 'E10']) {
        const domestic = runFoodScenario({ seed: 0, scenario, winters: 2 });
        const world = runFoodScenario({ seed: 0, scenario, winters: 2, fullWorld: true });
        assert.equal(world.finalDomesticHash, domestic.finalDomesticHash);
        assert.equal(typeof world.finalDomesticHash, 'string');
        assert.deepEqual(world.annual, domestic.annual);
    }
});

test('documented CLI creates a complete small study and rejects unknown options', async () => {
    const { execFileSync } = await import('node:child_process');
    const { mkdtempSync, readFileSync, rmSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const directory = mkdtempSync(join(tmpdir(), 'food-study-'));
    const { fileURLToPath } = await import('node:url');
    const entry = fileURLToPath(new URL('../scripts/qa/run-food-resilience.mjs', import.meta.url));
    try {
        execFileSync(process.execPath, [entry, '--output', directory,
            '--seed-start', '1', '--seeds', '1', '--winters', '1', '--workers', '1']);
        const manifest = JSON.parse(readFileSync(join(directory, 'manifest.json'), 'utf8'));
        assert.equal(manifest.campaigns, 13);
        assert.equal(manifest.seeds.start, 1);
        assert.throws(() => execFileSync(process.execPath, [entry, '--unknown']), /Unknown option/);
    } finally {
        assert.ok(directory.startsWith(join(tmpdir(), 'food-study-')));
        rmSync(directory, { recursive: true, force: true });
    }
});

test('published annual rows distinguish unmet events and effective work from structural eligibility', () => {
    const run = runFoodScenario({ seed: 1, scenario: 'E10', winters: 25 });
    assert.ok(run.annual.some(row => row.shortfall > 0));
    for (const row of run.annual.slice(1)) {
        assert.ok(Number.isSafeInteger(row.unmetConsumptionEvents));
        assert.equal(row.unmetConsumptionEvents > 0, row.shortfall > 0);
        assert.equal(row.foodDelta, row.food - row.previousFood);
        if (row.weather === 'Harsh') {
            assert.equal(row.productiveFoodWorkers, 0);
            assert.equal(row.productiveMaterialsWorkers, 0);
        }
    }
});
