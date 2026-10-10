import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load-source.mjs';
test('view handoff preserves selection, running pace, fractional time and exact Fjord', () => {
    const { SharedSettlement } = load('../src/play/SharedSettlement.ts');
    const first = new SharedSettlement(32);
    first.select({ kind: 'persona', id: 'founder-1' });
    first.session.setMinutesPerWinter(1);
    first.session.setRunning(true);
    first.session.elapse(30);
    const handoff = first.handoff('fjord');
    const second = SharedSettlement.restore(handoff, 'fjord');
    assert.equal(second.session.running, true);
    assert.equal(second.session.minutesPerWinter, 1);
    assert.deepEqual(second.selection, first.selection);
    assert.deepEqual(second.fjord.blueprint, first.fjord.blueprint);
    assert.deepEqual(second.fjord.layout, first.fjord.layout);
    assert.equal(second.session.saveJSON(), first.session.saveJSON());
    second.session.elapse(30);
    assert.equal(second.session.snapshot().time.tick, 1, 'half ticks survive a view handoff');
    assert.equal(first.session.running, false, 'the outgoing view relinquishes clock ownership');
    const refreshed = SharedSettlement.restore(second.persist(), 'fjord');
    assert.equal(refreshed.session.running, false, 'refresh never starts offline advancement');
    assert.equal(refreshed.session.saveJSON(), second.session.saveJSON());
});
test('shared commands use Core availability and update both projections without moving the plot', () => {
    const { SharedSettlement } = load('../src/play/SharedSettlement.ts');
    const { projectSettlement } = load('../src/play/SettlementView.ts');
    const shared = new SharedSettlement(32);
    const core = load('../src/simulation/SimulationCore.ts');
    shared.fjord.importJSON(core.serializeState(core.createCampaign(32, { initialMaterials: 100 })));
    shared.select({ kind: 'household', id: 'founder-1' });
    const plot = shared.fjord.project().entities.find(e => e.id === 'founder-1' && e.kind === 'household').transform;
    const build = { type: 'HouseHousehold', householdId: 'founder-1' };
    assert.equal(shared.availability(build).allowed, true);
    shared.command(build);
    assert.equal(projectSettlement(shared.session.snapshot()).entities.filter(e => e.kind === 'building').length, 1);
    assert.deepEqual(shared.fjord.project().entities.find(e => e.kind === 'building').transform, plot);
    const unavailable = { type: 'AssignOccupation', personaId: 'missing', occupation: 'farmer' };
    assert.equal(shared.availability(unavailable).allowed, false);
    assert.ok(shared.availability(unavailable).reason.length);
    const before = shared.persist();
    assert.throws(() => shared.command(unavailable));
    assert.equal(shared.persist(), before, 'invalid commands do not mutate the shared campaign');
});
test('shared import is atomic and new/restart campaigns reset both presentations while retaining saved rules', () => {
    const { SharedSettlement } = load('../src/play/SharedSettlement.ts');
    const shared = new SharedSettlement(32);
    shared.command({ type: 'AdvanceTicks', ticks: 1500 });
    shared.select({ kind: 'cattle', id: 'cattle-1' });
    const exported = shared.fjord.exportJSON();
    const before = shared.persist();
    assert.throws(() => shared.importJSON('{broken'));
    assert.equal(shared.persist(), before);
    shared.restart(true, false);
    assert.equal(shared.session.snapshot().time.winter, 800);
    assert.equal(shared.selection, null);
    assert.equal(shared.session.snapshot().weather.config.enabled, false);
    const originalGeography = JSON.parse(exported).blueprint;
    assert.deepEqual(shared.fjord.blueprint, originalGeography);
    shared.newCampaign(17, true);
    assert.equal(shared.session.snapshot().seed, 17);
    assert.equal(shared.fjord.blueprint.config.seed, 17);
    shared.importJSON(exported);
    assert.equal(shared.session.snapshot().time.winter, 801);
    assert.equal(shared.session.snapshot().time.tick, 500);
    assert.deepEqual(shared.selection, { kind: 'cattle', id: 'cattle-1' });
    assert.equal(shared.session.running, false);
    assert.deepEqual(shared.fjord.blueprint, originalGeography);
});
test('paired 2D/Fjord ownership transfers retain deterministic replay through Winters and exact local saves', () => {
    const { SharedSettlement } = load('../src/play/SharedSettlement.ts');
    const core = load('../src/simulation/SimulationCore.ts');
    let owner = new SharedSettlement(32);
    let reference = core.createCampaign(32);
    for (const [view, ticks] of [['board', 350], ['fjord', 650], ['board', 1500], ['fjord', 2500]]) {
        owner = SharedSettlement.restore(owner.handoff(view), view);
        owner.command({ type: 'AdvanceTicks', ticks });
        owner.fjord.project();
        reference = core.applyCommand(reference, { type: 'AdvanceTicks', ticks });
        assert.equal(owner.session.saveJSON(), core.serializeState(reference));
    }
    owner.select({ kind: 'persona', id: 'founder-1' });
    const records = new Map();
    const storage = { getItem: key => records.get(key) ?? null, setItem: (key, value) => records.set(key, value) };
    owner.saveLocal(storage);
    const saved = owner.fjord.exportJSON();
    owner.command({ type: 'AdvanceWinter' });
    owner.loadLocal(storage);
    assert.equal(owner.fjord.exportJSON(), saved);
    const stateBefore = owner.persist();
    records.set('pillagers.gameplay-lab.v1', '{broken');
    assert.throws(() => owner.loadLocal(storage));
    assert.equal(owner.persist(), stateBefore);
});
test('same-seed saves from an earlier campaign clear unavailable identities from the Fjord sidecar', () => {
    const { SharedSettlement } = load('../src/play/SharedSettlement.ts');
    const shared = new SharedSettlement(32);
    const sidecar = JSON.parse(shared.fjord.exportJSON());
    sidecar.selection = { kind: 'cattle', id: 'future-calf' };
    const records = new Map([
        ['pillagers.gameplay-lab.v1', shared.session.saveJSON()],
        ['pillagers.fjord-play.v1', JSON.stringify(sidecar)]
    ]);
    shared.loadLocal({ getItem: key => records.get(key) ?? null, setItem: (key, value) => records.set(key, value) });
    assert.equal(shared.selection, null);
    assert.equal(shared.session.snapshot().time.winter, 800);
});
test('resident selection identifies the canonical partner, child and home; home selection identifies its occupants', () => {
    const { SharedSettlement } = load('../src/play/SharedSettlement.ts');
    const core = load('../src/simulation/SimulationCore.ts');
    let state = core.createCampaign(32, { initialFood: 1000, initialMaterials: 500, foundingCoupleChanceBps: 10000 }, { fertilityChanceBps: 10000, mortalityBands: [{ minAge: 0, chanceBps: 0 }] }, { enabled: false });
    state = core.applyCommand(state, { type: 'AdvanceWinter' });
    const child = Object.values(state.personas).find(p => p.parentIds.length === 2);
    assert.ok(child, 'the real Core must create the family fixture');
    const [fatherId, motherId] = child.parentIds;
    const home = Object.values(state.households).find(h => h.memberIds.includes(fatherId));
    state = core.applyCommand(state, { type: 'BuildHouse', householdId: home.id });
    const shared = new SharedSettlement(32);
    shared.importJSON(core.serializeState(state));
    shared.select({ kind: 'persona', id: fatherId });
    const before = shared.session.saveJSON();
    assert.deepEqual(shared.selectionPresentation().map(m => [m.role, m.kind, m.id]), [
        ['selected', 'persona', fatherId], ['partner', 'persona', motherId],
        ['child', 'persona', child.id], ['home', 'building', 'house-1']
    ]);
    assert.equal(shared.session.saveJSON(), before, 'family markers are presentation only');
    shared.select({ kind: 'building', id: 'house-1' });
    assert.deepEqual(shared.selectionPresentation().filter(m => m.role === 'resident').map(m => m.id).sort(), [fatherId, motherId, child.id].sort());
    shared.select({ kind: 'persona', id: fatherId });
    shared.command({ type: 'AssignResidence', householdId: home.id, residenceId: null });
    const markers = shared.selectionPresentation();
    assert.equal(markers.find(m => m.role === 'home').kind, 'household');
    assert.equal(markers.find(m => m.role === 'home').id, home.id);
    shared.select(null);
    assert.deepEqual(shared.selectionPresentation(), []);
});
