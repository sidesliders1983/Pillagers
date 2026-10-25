import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load-source.mjs';

const { newFjordScenario } = load('../src/fjord-play/FjordScenario.ts');
const { GameplaySession } = load('../src/gameplay-lab/GameplaySession.ts');
const { SharedSettlement, localSettlementText } = load('../src/play/SharedSettlement.ts');
const { fjordCampaignKey, sharedCampaignKey } = load('../src/fjord-play/FjordCampaign.ts');
const guide = load('../src/fjord-play/FirstStepsState.ts');
const core = load('../src/simulation/SimulationCore.ts');

function active() { return { ...guide.newFirstSteps(), status: 'active' }; }

test('founding species share truthful housing costs and only suggest Materials work when it is missing', () => {
    const species = new Set();
    for (let seed = 0; seed < 20; seed++) {
        const session = newFjordScenario(seed);
        const before = session.saveJSON();
        const state = session.readSnapshot();
        species.add(Object.values(state.landing.cattle)[0].species);
        const facts = guide.firstStepsFacts(state, active());
        assert.equal(facts.cost, state.mechanics.config.houseCost);
        assert.equal(facts.shortfall, facts.cost - state.stocks.materials);
        assert.equal(facts.housing.allowed, false);
        assert.match(facts.housing.reason, /Materials/);
        assert.ok(facts.person && facts.home && facts.worker);
        if (facts.work.resource === 'materials')
            assert.equal(facts.workPlan, undefined, 'Already suitable work is not changed for a tutorial');
        else assert.equal(facts.workPlan.occupation, 'woodworker', 'A real missing producer gets an eligible task preview');
        assert.equal(session.saveJSON(), before, 'Guidance adds no events, RNG draws, inventory or time');
    }
    assert.deepEqual([...species].sort(), ['cattle', 'goat', 'pig', 'sheep']);
});

test('missing Materials work uses the existing eligible task preview without gifting housing or committing a role', () => {
    const session = newFjordScenario(32);
    for (const person of Object.values(session.readSnapshot().personas))
        if (person.occupation === 'woodworker') session.command({ type: 'AssignOccupation', personaId: person.id, occupation: 'hunter' });
    const before = session.saveJSON();
    const facts = guide.firstStepsFacts(session.readSnapshot(), active());
    assert.equal(facts.workPlan.occupation, 'woodworker');
    assert.equal(facts.workPlan.buildHouse, false);
    assert.equal(facts.workPlan.specialize, false);
    const { previewWork } = load('../src/fjord-play/WorkPlan.ts');
    assert.deepEqual(previewWork(session.readSnapshot(), facts.workPlan).commands.map(c => c.type), ['AssignOccupation']);
    assert.equal(session.saveJSON(), before);
});

test('out-of-order real inspections count and an already built home never requires another house', () => {
    const session = new GameplaySession();
    session.loadJSON(core.serializeState(core.createCampaign(32, { initialMaterials: 10 })));
    const household = Object.values(session.readSnapshot().households)[0];
    session.command({ type: 'BuildHouse', householdId: household.id });
    const before = session.saveJSON();
    let progress = active();
    progress = guide.inspectFirstSteps(progress, session.readSnapshot(), 'household', household.id);
    assert.equal(progress.watch.kind, 'home');
    progress = guide.inspectFirstSteps(progress, session.readSnapshot(), 'resources');
    progress = guide.inspectFirstSteps(progress, session.readSnapshot(), 'resident', household.memberIds[0]);
    assert.equal(guide.firstStepsStep(progress), 3);
    assert.equal(session.saveJSON(), before);
    assert.ok(guide.firstStepsFacts(session.readSnapshot(), progress).buildingId);
});

test('only a real appended outcome after the watched decision completes observation; stocks and passing time alone do not', () => {
    const session = newFjordScenario(32);
    const facts = guide.firstStepsFacts(session.readSnapshot(), active());
    const cursor = session.readSnapshot().events.length;
    const progress = { ...active(), watch: { kind: 'work', id: facts.worker.id, afterEvent: cursor } };
    assert.equal(guide.observeFirstSteps(progress, session.readSnapshot(), cursor).evidenceId, null);
    session.command({ type: 'AdvanceTicks', ticks: 1 });
    assert.equal(guide.observeFirstSteps(progress, session.readSnapshot(), cursor).evidenceId, null);
    session.command({ type: 'AdvanceTicks', ticks: 1000 });
    const observed = guide.observeFirstSteps(progress, session.readSnapshot(), cursor);
    const event = guide.firstStepsEvidence(session.readSnapshot(), observed);
    assert.equal(event.type, 'ResourceProduced');
    assert.equal(event.personaId, facts.worker.id);
    assert.ok(event.details.units > 0);
    assert.ok(Number(event.id.slice(6)) > cursor);
    assert.equal(guide.observeFirstSteps(observed, session.readSnapshot(), session.readSnapshot().events.length).evidenceId, event.id);
});

test('unavailable subjects gracefully change targets; stale instructions cannot refer to a dead or absent worker', () => {
    const state = structuredClone(newFjordScenario(32).readSnapshot());
    const original = guide.firstStepsFacts(state, active());
    state.personas[original.person.id].deathWinter = state.time.winter;
    const replacement = guide.firstStepsFacts(state, { ...active(), residentId: original.person.id });
    assert.notEqual(replacement.person.id, original.person.id);
    state.personas[original.worker.id].deathWinter = state.time.winter;
    const progress = { ...active(), watch: { kind: 'work', id: original.worker.id, afterEvent: state.events.length } };
    assert.equal(guide.observeFirstSteps(progress, state, state.events.length).watch, null);
});

test('progress is bounded presentation metadata, survives exact saves/imports, and resets for the same founders and a new history', () => {
    const shared = new SharedSettlement(newFjordScenario(32));
    const canonical = shared.session.saveJSON();
    const progress = { ...active(), residentId: 'founder-1', resourcesSeen: true, workerId: 'founder-9', collapsed: true };
    shared.fjord.firstSteps = progress;
    const resumed = SharedSettlement.restore(shared.persist(), 'fjord');
    assert.deepEqual(resumed.fjord.firstSteps, progress);
    assert.equal(resumed.session.saveJSON(), canonical);
    const storage = new Map();
    shared.saveLocal({ getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) });
    assert.deepEqual(JSON.parse(localSettlementText({ getItem: key => storage.get(key) ?? null })).firstSteps, progress);
    storage.set(sharedCampaignKey, core.serializeState(core.applyCommand(shared.session.readSnapshot(), { type: 'AdvanceTicks', ticks: 1 })));
    assert.equal(JSON.parse(localSettlementText({ getItem: key => storage.get(key) ?? null })).firstSteps, undefined,
        'A sidecar for a different canonical history cannot lend its progress');
    resumed.restart(true);
    assert.equal(resumed.fjord.firstSteps, undefined, 'Identical founders and seed do not reuse old completion');
    resumed.newCampaign(17, true);
    assert.equal(resumed.fjord.firstSteps, undefined);
    resumed.importJSON(shared.fjord.exportJSON());
    assert.deepEqual(resumed.fjord.firstSteps, progress);
    assert.equal(resumed.session.saveJSON(), canonical);
    assert.ok(storage.has(fjordCampaignKey));
});

test('malformed presentation data is rejected before a campaign is replaced, and unknown fields are not retained', () => {
    const shared = new SharedSettlement(32);
    const saved = JSON.parse(shared.fjord.exportJSON());
    const before = shared.persist();
    saved.firstSteps = { ...active(), residentId: 'x'.repeat(97) };
    assert.throws(() => shared.importJSON(JSON.stringify(saved)), /first-steps/);
    assert.equal(shared.persist(), before);
    assert.throws(() => guide.readFirstSteps({ ...active(), watch: { kind: 'work', id: 'founder-1', afterEvent: 99999999 } }, shared.session.readSnapshot()), /first-steps/);
    assert.equal(guide.readFirstSteps({ ...active(), arbitrary: 'not retained' }, shared.session.readSnapshot()).arbitrary, undefined);
    assert.ok(JSON.stringify(guide.newFirstSteps()).length < 400);
});

test('a worker who changes to a non-producing occupation releases the saving instruction', () => {
    const session = newFjordScenario(32);
    const facts = guide.firstStepsFacts(session.readSnapshot(), active());
    const cursor = session.readSnapshot().events.length;
    const progress = { ...active(), watch: { kind: 'work', id: facts.worker.id, afterEvent: cursor } };
    session.command({ type: 'AssignOccupation', personaId: facts.worker.id, occupation: 'smith' });
    const next = guide.observeFirstSteps(progress, session.readSnapshot(), cursor);
    assert.equal(next.watch, null);
    assert.equal(next.evidenceId, null);
    assert.ok(guide.firstStepsFacts(session.readSnapshot(), next).workPlan);
});

test('real unpaid upkeep is an observable consequence even when the home has no production', () => {
    const session = new GameplaySession();
    session.loadJSON(core.serializeState(core.createCampaign(32, { initialMaterials: 10, initialFood: 100 })));
    for (const person of Object.values(session.readSnapshot().personas))
        session.command({ type: 'AssignOccupation', personaId: person.id, occupation: 'smith' });
    const household = Object.values(session.readSnapshot().households)[0];
    session.command({ type: 'BuildHouse', householdId: household.id });
    const buildingId = session.readSnapshot().residences[session.readSnapshot().households[household.id].residenceId].buildingId;
    const cursor = session.readSnapshot().events.length;
    const progress = { ...active(), householdId: household.id, watch: { kind: 'home', id: buildingId, afterEvent: cursor } };
    session.command({ type: 'AdvanceTicks', ticks: 1000 });
    const observed = guide.observeFirstSteps(progress, session.readSnapshot(), cursor);
    const evidence = guide.firstStepsEvidence(session.readSnapshot(), observed);
    assert.equal(evidence.type, 'MaintenanceDebtIncreased');
    assert.equal(evidence.details.reason, 'unpaid');
    assert.equal(evidence.details.buildingId, buildingId);
    assert.deepEqual(guide.readFirstSteps(observed, session.readSnapshot()), observed);
});
