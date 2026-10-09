import test from 'node:test';
import assert from 'node:assert/strict';
import { sampleAptitudes, runEconomyScenario } from '../scripts/qa/run-aptitude-calibration.mjs';
import { loadTypeScript } from '../scripts/load-typescript.mjs';
const core = loadTypeScript(new URL('../src/simulation/SimulationCore.ts', import.meta.url));

test('the aptitude report measures 1,000 real seeded founders across all ten occupations', () => {
    const rows = sampleAptitudes({ seedStart: 0, seedCount: 100, models: ['control'] });
    assert.equal(rows.length, 1000);
    const original = core.createCampaign(0);
    const first = rows.find(row => row.campaignSeed === 0 && row.personaId === 'founder-1');
    assert.deepEqual(first.traits, original.personas['founder-1'].dna.traits);
    assert.equal(first.dnaSeed, original.personas['founder-1'].dna.seed);
    for (const row of rows) {
        assert.deepEqual(Object.keys(row.aptitudes), core.occupationIds);
        assert.ok(Object.values(row.aptitudes).every(value => Number.isSafeInteger(value)));
    }
    for (const role of core.occupationIds) {
        assert.equal(first.aptitudes[role], core.occupationAptitude(original, 'founder-1', role));
    }
    assert.deepEqual(sampleAptitudes({ seedStart: 0, seedCount: 1, models: ['control'] }), rows.slice(0, 10));
});

test('candidate reports use the same DNA while expanding gaps or differentiating role alignment', () => {
    const rows = sampleAptitudes({ seedStart: 0, seedCount: 2,
        models: ['control', 'expanded', 'quadratic', 'contrast'] });
    assert.equal(rows.length, 80);
    for (const control of rows.filter(row => row.model === 'control')) {
        const variants = rows.filter(row => row.campaignSeed === control.campaignSeed &&
            row.personaId === control.personaId);
        assert.equal(variants.length, 4);
        for (const row of variants) {
            assert.deepEqual(row.traits, control.traits);
            assert.ok(Object.values(row.aptitudes).every(value =>
                Number.isSafeInteger(value) && value >= 1500 && value <= 12500));
        }
        const expanded = variants.find(row => row.model === 'expanded');
        for (const a of core.occupationIds) for (const b of core.occupationIds) {
            if (control.aptitudes[a] <= control.aptitudes[b]) {
                assert.ok(expanded.aptitudes[a] <= expanded.aptitudes[b],
                    'A common increasing curve cannot reverse occupation preference');
            }
        }
        assert.notDeepEqual(expanded.aptitudes, control.aptitudes);
    }
});


test('the matched control policies use public commands, preserve rules and survive save/load', () => {
    const random = runEconomyScenario({ seed: 32, model: 'control', policy: 'random', winters: 2 });
    const aware = runEconomyScenario({ seed: 32, model: 'control', policy: 'aware', winters: 2 });
    const resumed = runEconomyScenario({ seed: 32, model: 'control', policy: 'aware', winters: 2, resumeAt: 1 });
    assert.equal(aware.finalStateHash, resumed.finalStateHash);
    assert.equal(aware.initialFingerprint, random.initialFingerprint);
    assert.deepEqual(aware.configuration, core.createCampaign(32).mechanics.config);
    assert.ok(aware.commands.some(command => command.type === 'AssignOccupation'));
    assert.ok(aware.commands.some(command => command.type === 'BuildHouse'));
    assert.ok(aware.commands.some(command => command.type === 'AssignCattle'));
    assert.ok(aware.commands.every(command => command.accepted));
    for (const row of aware.annual) {
        assert.ok(Number.isSafeInteger(row.food) && row.food >= 0);
        assert.ok(Number.isSafeInteger(row.materials) && row.materials >= 0);
        if (row.elapsedWinter) assert.equal(row.food, row.previousFood + row.foodProduced - row.foodConsumed);
    }
    assert.deepEqual(runEconomyScenario({ seed: 32, model: 'control', policy: 'aware', winters: 2 }), aware);
});

test('candidate economy executes its mapping in real work and resumes with the same experiment identity', () => {
    const control = runEconomyScenario({ seed: 32, model: 'control', policy: 'default', winters: 2 });
    const candidate = runEconomyScenario({ seed: 32, model: 'expanded', policy: 'default', winters: 2 });
    const resumed = runEconomyScenario({ seed: 32, model: 'expanded', policy: 'default', winters: 2, resumeAt: 1 });
    assert.equal(candidate.initialFingerprint, control.initialFingerprint);
    assert.deepEqual(candidate.configuration, control.configuration);
    assert.equal(candidate.finalStateHash, resumed.finalStateHash);
    const rows = sampleAptitudes({ seedStart: 32, seedCount: 1, models: ['expanded'] });
    for (const worker of candidate.annual[1].workers) {
        const row = rows.find(row => row.personaId === worker.id);
        assert.equal(worker.aptitudeBps, row.aptitudes[worker.occupation]);
        assert.notEqual(worker.productivityBps, worker.aptitudeBps,
            'Initial tent/weather productivity remains distinct from innate aptitude');
    }
    assert.notEqual(candidate.finalStateHash, control.finalStateHash);
    for (const row of candidate.annual.slice(1)) {
        assert.equal(row.food, row.previousFood + row.foodProduced - row.foodConsumed);
    }
});

test('domestic-only measurement retains the same domestic outcomes as a full world campaign', () => {
    const domestic = runEconomyScenario({ seed: 0, policy: 'aware', winters: 2 });
    const world = runEconomyScenario({ seed: 0, policy: 'aware', winters: 2, fullWorld: true });
    assert.equal(domestic.finalDomesticHash, world.finalDomesticHash);
    assert.deepEqual(domestic.annual, world.annual);
});

test('public distribution summary reports percentiles, gaps and role correlations from observed rows', async () => {
    const { summarizeAptitudes } = await import('../scripts/qa/run-aptitude-calibration.mjs');
    const rows = [
        { model: 'control', assignedOccupation: 'farmer', aptitudes: { farmer: 4000, hunter: 8000 } },
        { model: 'control', assignedOccupation: 'hunter', aptitudes: { farmer: 8000, hunter: 4000 } },
    ];
    const summary = summarizeAptitudes(rows).control;
    assert.equal(summary.count, 2);
    assert.equal(summary.roles.farmer.mean, 6000);
    assert.equal(summary.roles.farmer.p25, 5000);
    assert.equal(summary.roles.farmer.standardDeviation, 2000);
    assert.equal(summary.gaps.bestWorst.median, 4000);
    assert.equal(summary.gaps.topTwo.median, 4000);
    assert.equal(summary.correlations.farmer.hunter, -1);
    assert.equal(summary.originalAssignment.bestRoleMatches, 0);
});

test('public study output contains matched run records, measured summaries and reproducible artifact hashes', async () => {
    const { runStudy } = await import('../scripts/qa/run-aptitude-calibration.mjs');
    const { mkdtempSync, readFileSync, rmSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const directory = mkdtempSync(join(tmpdir(), 'aptitude-study-'));
    try {
        const output = await runStudy({ output: directory, seedCount: 1, winters: 1, workers: 1,
            models: ['control', 'expanded'], verificationSeeds: [] });
        assert.equal(output.founders.control.count, 10);
        assert.equal(output.founders.expanded.count, 10);
        assert.equal(output.economy.length, 5);
        assert.ok(output.economy.every(row => row.seeds === 1));
        const manifest = JSON.parse(readFileSync(join(directory, 'manifest.json'), 'utf8'));
        assert.equal(manifest.seeds.count, 1);
        assert.equal(manifest.productionRulesChanged, false);
        assert.ok(manifest.artifacts.some(file => file.path === 'runs/seed-0.json.gz' && file.sha256.length === 64));
    } finally {
        // Only remove the exact task-owned temporary directory, after checking its root.
        assert.ok(directory.startsWith(join(tmpdir(), 'aptitude-')));
        rmSync(directory, { recursive: true, force: true });
    }
});

test('the documented CLI completes and writes the study manifest', async () => {
    const { mkdtempSync, existsSync, rmSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const { execFileSync } = await import('node:child_process');
    const directory = mkdtempSync(join(tmpdir(), 'aptitude-cli-'));
    try {
        execFileSync(process.execPath, ['scripts/qa/run-aptitude-calibration.mjs', '--output', directory,
            '--seeds', '1', '--winters', '1', '--workers', '1'], { timeout: 120000, stdio: 'pipe' });
        assert.ok(existsSync(join(directory, 'manifest.json')));
    } finally {
        // Only remove the exact task-owned temporary directory, after checking its root.
        assert.ok(directory.startsWith(join(tmpdir(), 'aptitude-')));
        rmSync(directory, { recursive: true, force: true });
    }
});

test('public replay proof preserves partial work and rejects a mismatched experiment identity', async () => {
    const { proveAptitudeReplay } = await import('../scripts/qa/aptitude-replay.mjs');
    const proof = proveAptitudeReplay({ seed: 32, model: 'contrast' });
    assert.equal(proof.resumedHash, proof.continuousHash);
    assert.equal(proof.savedAtTick, 500);
    assert.ok(proof.savedWorkProgress > 0);
    assert.throws(() => proveAptitudeReplay({ seed: 32, model: 'contrast', readAsModel: 'control' }),
        /identity mismatch/);
});
