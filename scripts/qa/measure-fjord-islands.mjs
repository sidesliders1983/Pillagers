import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { loadTypeScript } from '../load-typescript.mjs';
const { SharedSettlement } = loadTypeScript(new URL('../../src/play/SharedSettlement.ts', import.meta.url));
const { campaignIslandPlan } = loadTypeScript(new URL('../../src/fjord-play/CampaignIsland.ts', import.meta.url));
const core = loadTypeScript(new URL('../../src/simulation/SimulationCore.ts', import.meta.url));
const rows = [];
await mkdir('docs/qa/fjord-island', { recursive: true });
for (const seed of [32, 33]) {
    const started = performance.now();
    const owner = new SharedSettlement(seed, 123, true, 'island-pool-v1');
    const preparationMs = performance.now() - started;
    const reference = new SharedSettlement(seed, 123, true);
    assert.equal(owner.session.saveJSON(), reference.session.saveJSON());
    const plan = campaignIslandPlan(owner.fjord.blueprint);
    let state = core.createCampaign(seed, { foundingCoupleCap: 0, initialMaterials: 10000 });
    state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 500 });
    owner.importJSON(core.serializeState(state));
    const founding = owner.fjord.project();
    assert.equal(founding.entities.filter(e => e.kind === 'household' && e.transform).length, 10);
    assert.ok(founding.entities.every(e => e.transform));
    for (const householdId of Object.keys(state.households)) owner.command({ type: 'BuildHouse', householdId });
    const built = owner.fjord.project();
    assert.equal(built.ground.paths.length, 10);
    const restored = SharedSettlement.restore(owner.persist(), 'fjord');
    assert.equal(restored.fjord.exportJSON(), owner.fjord.exportJSON());
    const newInstance = new SharedSettlement(seed, 123, true, 'island-pool-v1');
    assert.deepEqual(newInstance.fjord.blueprint, owner.fjord.blueprint);
    rows.push({ campaignSeed: seed, recipe: plan.recipe, plots: plan.plots.length,
        maximumAdjustment: plan.maximumAdjustment, access: plan.access,
        foundingHouseholds: 10, foundingResidents: 10, foundingCattle: 3,
        convertedHomes: 10, connectedHomePaths: built.ground.paths.length,
        saveBytes: Buffer.byteLength(owner.fjord.exportJSON()), preparationMs,
        repeat: true, saveLoad: true, coreUnchanged: true });
    if (seed === 33) await writeFile('scratch/fjord-island-touch.json', owner.persist());
}
await writeFile('docs/qa/fjord-island/measurements.json', JSON.stringify({
    timingContext: 'Diagnostic local run; concurrent validation may affect timings. No frame-time acceptance threshold.', rows }, null, 2));
console.log(JSON.stringify(rows, null, 2));
