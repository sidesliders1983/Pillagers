import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { summarizeLivestockStudy } from '../scripts/qa/summarize-livestock-study.mjs';

test('study summaries retain limited cases, exclude censored finals, and verify raw checksums', context => {
    const directory = mkdtempSync(join(tmpdir(), 'livestock-report-219-'));
    assert.ok(resolve(directory).startsWith(resolve(tmpdir()) + sep));
    context.after(() => rmSync(directory, { recursive: true }));
    const initial = { food: 15, population: 10, herd: 3, species: 'chicken' };
    const first = { food: 25, population: 11, herd: 4, humanBirths: 1, humanShortfall: 0,
        animalShortfall: 0, foodProduced: 30, humanConsumed: 18, animalConsumed: 2,
        foodResidual: 0, materialsResidual: 0, herdResidual: 0, adultDescendantsReached: 0 };
    const second = { ...first, food: 35, population: 12, herd: 5 };
    const complete = { seed: 1, species: 'chicken', policy: 'herd', status: 'complete',
        initial: { player: initial, cpu: { ...initial, food: 30, species: 'goat' } },
        ruleConfiguration: { cpu: { livestock: { version: 2 } } },
        identity: { sourceHash: 'fixture-source', candidateHash: 'fixture-candidate' },
        annual: [{ year: 1, player: first, cpu: first }, { year: 2, player: second, cpu: second }] };
    const limited = { seed: 2, species: 'chicken', policy: 'herd', status: 'resource-limit',
        stopReason: 'worker-time-budget', annual: [] };
    const observations = [complete, limited].map((raw, index) => {
        const bytes = gzipSync(Buffer.from(JSON.stringify(raw)));
        const file = `case-${index}.json.gz`;
        writeFileSync(join(directory, file), bytes);
        return { seed: raw.seed, species: raw.species, policy: raw.policy, status: raw.status,
            completedYears: raw.annual.length, file,
            sha256: createHash('sha256').update(bytes).digest('hex') };
    });
    writeFileSync(join(directory, 'manifest.json'), JSON.stringify({ finishedAt: 'fixture',
        options: { seeds: '1,2', species: 'chicken', policies: 'herd', winters: 2 }, observations }));
    const report = summarizeLivestockStudy(directory);
    assert.equal(report.expectedCases, 2);
    assert.equal(report.completedCases, 1);
    assert.equal(report.limitedCases, 1);
    const cohort = report.player[0];
    assert.equal(cohort.complete, 1);
    assert.equal(cohort.limited, 1);
    assert.equal(cohort.finalFood.median, 35);
    assert.equal(cohort.births, 2);
    assert.equal(cohort.observedYears, 2);
    assert.equal(cohort.clanExtinctions, 0);
    writeFileSync(join(directory, observations[0].file), 'corrupted');
    assert.throws(() => summarizeLivestockStudy(directory), /checksum/i);
});
