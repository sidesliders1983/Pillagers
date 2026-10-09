import test from 'node:test';
import assert from 'node:assert/strict';

test('A/B/C report evaluates the same archived founders without changing the canonical control', async () => {
    const { sampleProfiles } = await import('../scripts/qa/run-occupation-profiles.mjs');
    const rows = sampleProfiles({ seedCount: 1 });
    assert.equal(rows.length, 30);
    const first = rows.filter(row => row.personaId === 'founder-1');
    assert.deepEqual(first.map(row => row.model), ['A', 'B', 'C']);
    assert.equal(first[0].aptitudes.farmer, 7488);
    assert.deepEqual(first[0].traits, {
        physicality: .36, agility: .23, intelligence: .77, cunning: .61, temperament: .54,
    });
    for (const row of first) {
        assert.deepEqual(row.traits, first[0].traits);
        assert.equal(row.dnaSeed, 4212728109);
        assert.equal(Object.keys(row.aptitudes).length, 10);
        assert.ok(Object.values(row.aptitudes).every(value =>
            Number.isSafeInteger(value) && value >= 1500 && value <= 10000));
    }
    assert.notDeepEqual(first[1].aptitudes, first[0].aptitudes);
});

test('reported preferences reward steady farming and moderate hunter reactivity rather than maximal temperament', async () => {
    const { evaluateProfiles } = await import('../scripts/qa/run-occupation-profiles.mjs');
    const records = evaluateProfiles([
        { personaId: 'steady-farmer', traits: { physicality: .75, agility: .35, intelligence: .45, cunning: .2, temperament: .1 } },
        { personaId: 'fiery-farmer', traits: { physicality: .75, agility: .35, intelligence: .45, cunning: .2, temperament: 1 } },
        { personaId: 'reactive-hunter', traits: { physicality: .85, agility: .8, intelligence: .3, cunning: .9, temperament: .6 } },
        { personaId: 'impulsive-hunter', traits: { physicality: .85, agility: .8, intelligence: .3, cunning: .9, temperament: 1 } },
    ]).filter(row => row.model === 'B');
    assert.equal(records[0].aptitudes.farmer, 10000);
    assert.equal(records[1].aptitudes.farmer, 6940);
    assert.equal(records[2].aptitudes.hunter, 10000);
    assert.equal(records[3].aptitudes.hunter, 9830);
});

test('profile campaigns execute their reported scoring in real work and keep the canonical control unchanged', async () => {
    const { runProfileScenario, sampleProfiles } = await import('../scripts/qa/run-occupation-profiles.mjs');
    const { runFoodScenario } = await import('../scripts/qa/run-food-resilience.mjs');
    const control = runProfileScenario({ seed: 32, model: 'A', policy: 'aware', economy: 'base', winters: 2 });
    const legacy = runFoodScenario({ seed: 32, scenario: 'B', winters: 2 });
    assert.equal(control.finalStateHash, legacy.finalStateHash);
    assert.deepEqual(control.annual, legacy.annual);
    for (const model of ['B', 'C']) {
        const candidate = runProfileScenario({ seed: 32, model, policy: 'aware', economy: 'base', winters: 2 });
        assert.equal(candidate.initialFingerprint, control.initialFingerprint);
        const scores = sampleProfiles({ seedStart: 32, seedCount: 1 }).filter(row => row.model === model);
        for (const worker of candidate.annual[1].workers.filter(worker => worker.occupation)) {
            assert.equal(worker.aptitudeBps, scores.find(row => row.personaId === worker.id).aptitudes[worker.occupation]);
        }
        assert.notEqual(candidate.finalStateHash, control.finalStateHash);
        for (const row of candidate.annual.slice(1)) {
            assert.equal(row.food, row.previousFood + row.foodProduced - row.foodConsumed - row.spoiled);
        }
    }
});

test('profile experiment saves preserve partial work and reject a different scoring model or economy', async () => {
    const { proveProfileReplay, runProfileScenario } = await import('../scripts/qa/run-occupation-profiles.mjs');
    for (const model of ['A', 'B', 'C']) for (const economy of ['base', 'protected']) {
        const proof = proveProfileReplay({ model, economy });
        assert.ok(proof.workProgress > 0);
        assert.equal(proof.continuousHash, proof.resumedHash);
        const options = { seed: 32, model, policy: 'aware', economy, winters: 2 };
        assert.deepEqual(runProfileScenario({ ...options, resumeAt: 1 }), runProfileScenario(options));
    }
    assert.throws(() => proveProfileReplay({ model: 'B', readAsModel: 'A' }), /identity mismatch/);
    assert.throws(() => proveProfileReplay({ model: 'C', economy: 'protected', readAsEconomy: 'base' }), /identity mismatch/);
});

test('the public study writes all eighteen matched conditions, raw cohorts and audited checksums', async () => {
    const { runProfileStudy } = await import('../scripts/qa/run-occupation-profiles.mjs');
    const { mkdtempSync, readFileSync, rmSync } = await import('node:fs');
    const { join } = await import('node:path');
    const { tmpdir } = await import('node:os');
    const directory = mkdtempSync(join(tmpdir(), 'profile-study-'));
    try {
        const summary = await runProfileStudy({ output: directory, seedCount: 1, winters: 2, workers: 1, verificationSeeds: [0] });
        assert.equal(summary.founders.A.count, 10);
        assert.equal(summary.economy.length, 18);
        assert.equal(summary.paired.length, 12);
        const manifest = JSON.parse(readFileSync(join(directory, 'manifest.json'), 'utf8'));
        assert.equal(manifest.productionRulesChanged, false);
        assert.equal(manifest.campaigns, 18);
        assert.ok(manifest.artifacts.some(file => file.path === 'runs/seed-0.json.gz'));
        assert.equal(summary.verification.filter(row => row.kind === 'repeat-and-save').length, 18);
    } finally {
        assert.ok(directory.startsWith(join(tmpdir(), 'profile-study-')));
        rmSync(directory, { recursive: true, force: true });
    }
});

test('public archive verification rejects changed raw measurements and requires the full matched matrix', async () => {
    const { verifyProfileStudy } = await import('../scripts/qa/verify-profile-study.mjs');
    const { runProfileStudy } = await import('../scripts/qa/run-occupation-profiles.mjs');
    const { mkdtempSync, readFileSync, writeFileSync, rmSync } = await import('node:fs');
    const { join } = await import('node:path');
    const { tmpdir } = await import('node:os');
    const directory = mkdtempSync(join(tmpdir(), 'profile-audit-'));
    try {
        await runProfileStudy({ output: directory, seedCount: 1, winters: 1, workers: 1, verificationSeeds: [] });
        const audit = verifyProfileStudy(directory);
        assert.equal(audit.campaigns, 18);
        assert.equal(audit.winterRows, 18);
        assert.equal(audit.founders, 10);
        const path = join(directory, 'runs/seed-0.json.gz');
        const originalManifest = readFileSync(join(directory, 'manifest.json'), 'utf8');
        const bytes = readFileSync(path);
        writeFileSync(path, Buffer.concat([bytes, Buffer.from('changed')]));
        assert.throws(() => verifyProfileStudy(directory), /Artifact checksum mismatch/);
        const { gunzipSync, gzipSync } = await import('node:zlib');
        const { createHash } = await import('node:crypto');
        const record = JSON.parse(gunzipSync(bytes));
        record.runs.pop();
        const incomplete = gzipSync(JSON.stringify(record));
        writeFileSync(path, incomplete);
        const manifestPath = join(directory, 'manifest.json');
        const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
        const artifact = manifest.artifacts.find(file => file.path === 'runs/seed-0.json.gz');
        artifact.bytes = incomplete.length;
        artifact.sha256 = createHash('sha256').update(incomplete).digest('hex');
        writeFileSync(manifestPath, JSON.stringify(manifest));
        assert.throws(() => verifyProfileStudy(directory), /Incomplete matched matrix/);
        writeFileSync(path, bytes);
        const missingReceipt = JSON.parse(originalManifest);
        missingReceipt.artifacts = missingReceipt.artifacts.filter(file => file.path !== 'runs/seed-0.json.gz');
        writeFileSync(manifestPath, JSON.stringify(missingReceipt));
        assert.throws(() => verifyProfileStudy(directory), /Incomplete artifact inventory/);


    } finally {
        assert.ok(directory.startsWith(join(tmpdir(), 'profile-audit-')));
        rmSync(directory, { recursive: true, force: true });
    }
});

test('the documented profile CLI writes measurements and rejects unknown options', async () => {
    const { mkdtempSync, existsSync, rmSync } = await import('node:fs');
    const { execFileSync } = await import('node:child_process');
    const { join } = await import('node:path');
    const { tmpdir } = await import('node:os');
    const directory = mkdtempSync(join(tmpdir(), 'profile-cli-'));
    try {
        execFileSync(process.execPath, ['scripts/qa/run-occupation-profiles.mjs', '--output', directory,
            '--seeds', '1', '--winters', '1', '--workers', '1'], { timeout: 120000, stdio: 'pipe' });
        assert.ok(existsSync(join(directory, 'manifest.json')));
        assert.throws(() => execFileSync(process.execPath,
            ['scripts/qa/run-occupation-profiles.mjs', '--unknown', '1'], { stdio: 'pipe' }), /Invalid option/);
    } finally {
        assert.ok(directory.startsWith(join(tmpdir(), 'profile-cli-')));
        rmSync(directory, { recursive: true, force: true });
    }
});
