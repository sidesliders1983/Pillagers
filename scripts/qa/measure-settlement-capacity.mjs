import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { loadTypeScript } from '../load-typescript.mjs';
import { sourceAtRevision } from './source-at-revision.mjs';
import { inspectCampaignCapacity } from './campaign-capacity.mjs';
const source = new URL('../../src/world-generation/GenerateWorld.ts', import.meta.url);
const { generateWorld } = loadTypeScript(source);
const { parseWorld, serializeWorld } = loadTypeScript(new URL('../../src/world-generation/WorldSave.ts', import.meta.url));
const revision = '86eb21913f45545dbc49ecc0fc6b4b36efc131a6';
const previous = sourceAtRevision(revision)(source);
const output = process.env.QA_OUTPUT || 'scratch/settlement-capacity';
await mkdir(output, { recursive: true });
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
// Held-out list is fixed before examining any result. No failed seed is replaced.
const fixed = [17, 42, 91, 1983, 1337, 18, 104, 211, 512, 819];
const heldOut = [7, 73, 256, 4096, 65537];
const report = { date: new Date().toISOString(), revision, fixed, heldOut, results: [] };
for (const seed of [...fixed, ...heldOut]) {
    const request = { seed, preset: 'island', generatorVersion: 'fjordside-island-v0.3e', conifers: 'ez-tree' };
    let started = performance.now();
    const baseline = previous.generateWorld(request);
    const baselineMs = performance.now() - started;
    const stages = {};
    started = performance.now();
    const world = generateWorld(request, sample => {
        const stage = stages[sample.stage] ??= { calls: 0, milliseconds: 0 };
        stage.calls++;
        stage.milliseconds += sample.milliseconds;
    });
    const generationMs = performance.now() - started;
    assert.equal(hash(world), hash(baseline), 'optimization must retain every canonical field');
    assert.deepEqual(parseWorld(serializeWorld(world)), world);
    assert.equal(hash(generateWorld(request)), hash(world));
    const selected = world.siteSelection.selected;
    const candidatePair = selected ?? world.siteSelection.pairs.find(pair =>
        pair.centerDistance >= 160 && pair.bufferDistance >= 40);
    const regions = candidatePair ? [candidatePair.playerId, candidatePair.rivalId].map(id => {
        const candidate = world.siteSelection.candidates.find(c => c.id === id);
        return inspectCampaignCapacity(world, candidate);
    }) : [];
    const failures = {};
    for (const pair of world.siteSelection.pairs) for (const reason of pair.reasons) {
        failures[reason] = (failures[reason] ?? 0) + 1;
    }
    report.results.push({ seed, batch: fixed.includes(seed) ? 'fixed' : 'held-out',
        accepted: world.validation.accepted, baselineAccepted: baseline.validation.accepted,
        baselineMs, generationMs, stages, hash: hash(world), exactPreviousBlueprint: true,
        deterministic: true, saveLoad: true, selected, reasons: world.validation.reasons, failures,
        regionsAreSelected: Boolean(selected), regions,
        compartments: world.siteSelection.compartments,
        search: { candidates: world.siteSelection.candidates.length,
            attempts: world.siteSelection.candidates.reduce((n, c) => n + c.fitSearch.attempts, 0),
            nodes: world.siteSelection.candidates.reduce((n, c) => n + c.fitSearch.nodes, 0) } });
    await writeFile(output + '/batch.json', JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ seed, accepted: world.validation.accepted, baselineMs, generationMs,
        founding: regions.map(r => [r.founding.containedHouseholds, r.founding.households, r.founding.viable]) }));
}
