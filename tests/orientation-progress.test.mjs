import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load-source.mjs';

const { newJourney, readJourney } = load('../src/fjord-play/JourneyProgress.ts');
const { newFirstSteps, acknowledgeOrientation, inspectFirstSteps } = load('../src/fjord-play/FirstStepsState.ts');
const { newFjordScenario } = load('../src/fjord-play/FjordScenario.ts');
const { SharedSettlement, commandAvailability } = load('../src/play/SharedSettlement.ts');
const { FoundingJourneyIndex, foundingJourney } = load('../src/fjord-play/FoundingJourney.ts');
const core = load('../src/simulation/SimulationCore.ts');

test('orientation choices survive exact save and restore while older version-one journeys keep their chapter', () => {
    const legacy = { ...newJourney(), chapter: 'discovery', selected: 'sea-travel',
        skipped: ['pillage'], later: ['upgrade-home'] };
    assert.deepEqual(readJourney(legacy), legacy);
    assert.equal(Object.hasOwn(readJourney(legacy), 'orientation'), false);
    assert.equal(newJourney().chapter, 'home');

    const owner = new SharedSettlement(newFjordScenario(32));
    const canonical = owner.session.saveJSON();
    const journey = { ...newJourney('orientation'), selected: 'ui-camera', orientation: ['ui-camera'] };
    assert.equal(journey.chapter, 'orientation');
    owner.fjord.firstSteps = { ...newFirstSteps(), status: 'active', journey };

    const restored = SharedSettlement.restore(owner.persist(), 'fjord');
    assert.deepEqual(restored.fjord.firstSteps, owner.fjord.firstSteps);
    assert.equal(restored.session.saveJSON(), canonical);

    const saved = JSON.parse(owner.fjord.exportJSON());
    const before = owner.persist();
    for (const invalid of [['unknown'], ['ui-camera', 'ui-camera'], Array(7).fill('ui-camera'), 'ui-camera']) {
        saved.firstSteps.journey.orientation = invalid;
        assert.throws(() => owner.importJSON(JSON.stringify(saved)), /journey|Journey/);
        assert.equal(owner.persist(), before, 'Malformed orientation metadata cannot replace the campaign');
    }
});

test('only active guidance accepts explicit camera, time and navigation acknowledgments', () => {
    const start = { ...newFirstSteps(), status: 'active', journey: newJourney('orientation') };
    let progress = start;
    for (const objective of ['ui-camera', 'ui-time', 'ui-navigation']) {
        progress = acknowledgeOrientation(progress, objective);
        assert.deepEqual(acknowledgeOrientation(progress, objective), progress, 'Repeating an acknowledgment is harmless');
    }
    assert.deepEqual(progress.journey.orientation, ['ui-camera', 'ui-time', 'ui-navigation']);
    assert.equal(start.journey.orientation, undefined, 'Acknowledging preserves the previous presentation snapshot');
    for (const objective of ['ui-resident', 'ui-connections', 'ui-home', 'unknown'])
        assert.deepEqual(acknowledgeOrientation(progress, objective), progress, 'An acknowledgment cannot forge a real inspection');
    for (const status of ['offered', 'skipped', 'complete']) {
        const inactive = { ...start, status };
        assert.deepEqual(acknowledgeOrientation(inactive, 'ui-camera'), inactive);
    }
});

test('real inspected residents and valid connections complete their own orientation facts without changing the campaign', () => {
    const owner = new SharedSettlement(newFjordScenario(32));
    const state = owner.session.readSnapshot(), canonical = owner.session.saveJSON();
    const start = { ...newFirstSteps(), status: 'active', journey: newJourney('orientation') };
    const resident = Object.values(state.personas)[0];
    const household = Object.values(state.households).find(home => home.memberIds.includes(resident.id));
    const other = Object.values(state.personas).find(person => !household.memberIds.includes(person.id));
    const otherHome = Object.values(state.households).find(home => !home.memberIds.includes(resident.id));
    const animal = Object.values(state.landing.cattle).find(animal => animal.deathWinter === null);

    assert.equal(inspectFirstSteps(start, state, 'resident-closed', resident.id).journey.orientation, undefined);
    let progress = inspectFirstSteps(start, state, 'resident', resident.id);
    assert.equal(progress.journey.orientation, undefined, 'Opening a resident alone does not acknowledge closing its card');
    progress = inspectFirstSteps(progress, state, 'resident-closed', other.id);
    assert.equal(progress.journey.orientation, undefined, 'Closing a different resident does not count');
    progress = inspectFirstSteps(progress, state, 'resident-closed', resident.id);
    assert.deepEqual(progress.journey.orientation, ['ui-resident']);
    progress = inspectFirstSteps(progress, state, 'household', otherHome.id);
    assert.deepEqual(progress.journey.orientation, ['ui-resident'], 'An unrelated household does not prove the connection');
    progress = inspectFirstSteps(progress, state, 'household', household.id);
    assert.deepEqual(progress.journey.orientation, ['ui-resident', 'ui-connections']);

    const homeList = { ...start, journey: { ...start.journey, householdId: household.id } };
    assert.equal(inspectFirstSteps(homeList, state, 'home-resident', other.id).journey.orientation, undefined);
    assert.deepEqual(inspectFirstSteps(homeList, state, 'home-resident', resident.id).journey.orientation, ['ui-connections']);
    assert.deepEqual(inspectFirstSteps(start, state, 'livestock', animal.id).journey.orientation, ['ui-connections']);
    assert.equal(inspectFirstSteps(start, state, 'livestock', 'unknown').journey.orientation, undefined);

    for (const [kind, objective] of [['home', 'ui-home'], ['time', 'ui-time'], ['interface', 'ui-navigation']]) {
        const observed = inspectFirstSteps(start, state, kind);
        assert.deepEqual(observed.journey.orientation, [objective]);
        assert.deepEqual(inspectFirstSteps(observed, state, kind), observed);
        assert.deepEqual(inspectFirstSteps({ ...start, status: 'skipped' }, state, kind), { ...start, status: 'skipped' });
    }
    assert.equal(owner.session.saveJSON(), canonical);
});

test('six independent orientation lessons project truthful input hints and keep every existing chapter available', () => {
    const owner = new SharedSettlement(newFjordScenario(32));
    const state = owner.session.readSnapshot(), canonical = owner.session.saveJSON();
    const progress = { ...newFirstSteps(), status: 'active', journey: {
        ...newJourney('orientation'), skipped: ['ui-camera'], later: ['ui-time'],
    } };
    const project = (progress, inputKind = 'mouse') => {
        const index = new FoundingJourneyIndex();
        index.update(state);
        return foundingJourney(state, progress, index, command => owner.availability(command), owner.session, inputKind);
    };
    const view = project(progress);
    assert.deepEqual(view.goals.slice(0, 6).map(goal => goal.id), [
        'ui-camera', 'ui-resident', 'ui-connections', 'ui-home', 'ui-time', 'ui-navigation',
    ]);
    assert.deepEqual([...new Set(view.goals.map(goal => goal.chapter))], ['orientation', 'home', 'discovery', 'conflict']);
    assert.equal(view.goals.length, 20);
    assert.deepEqual(view.goals.slice(0, 6).map(goal => goal.action), ['settlement', 'resident', 'resident', 'settlement', 'clock', 'menu']);
    for (const goal of view.goals.slice(0, 6)) {
        assert.equal(goal.checklist.length, 1);
        assert.equal(goal.checklist[0].done, false);
    }
    assert.equal(view.goals[0].status, 'skipped');
    assert.equal(view.goals[4].status, 'later');
    assert.equal(view.goals.find(goal => goal.id === 'personal-gear').status, 'available');
    assert.match(view.goals[0].detail, /left.*drag.*pan/i);
    assert.match(view.goals[0].detail, /right.*drag.*rotat/i);
    assert.match(view.goals[0].detail, /wheel/i);
    const touch = project(progress, 'touch').goals[0];
    assert.match(touch.detail, /one.finger.*drag.*rotat/i);
    assert.match(touch.detail, /pinch.*zoom/i);

    const acknowledged = acknowledgeOrientation(acknowledgeOrientation(progress, 'ui-camera'), 'ui-time');
    const completed = project(acknowledged);
    assert.equal(completed.goals[0].status, 'completed', 'Actual acknowledgment takes precedence over a previous skip');
    assert.equal(completed.goals[4].status, 'completed', 'A deferred lesson remains independently completable');
    assert.equal(completed.goals[0].checklist[0].done, true);
    assert.equal(completed.goals[1].status, 'available', 'Acknowledging one lesson does not complete the next');
    assert.equal(owner.session.saveJSON(), canonical);
});

test('unavailable residents get a truthful block or living animal connection without manufacturing orientation progress', () => {
    let state = core.createCampaign(32, { initialFood: 500 }, {}, { enabled: false },
        { casualtyBps: { Recon: 10000, Surveillance: 10000, Pillage: 10000 } });
    const ids = Object.keys(state.personas);
    const progress = { ...newFirstSteps(), status: 'active', residentId: 'missing-resident', journey: newJourney('orientation') };
    const project = (current, saved = progress) => {
        const index = new FoundingJourneyIndex();
        index.update(current);
        return foundingJourney(current, saved, index, command => commandAvailability(current, command));
    };
    assert.ok(project(state).person, 'A missing saved resident falls back to an actual available resident');
    state = core.applyCommand(state, { type: 'CreateExpeditionGroup', name: 'Everyone away', memberIds: ids });
    state = core.applyCommand(state, { type: 'DispatchExpedition', groupId: 'group-1', regionId: 'region-east', mission: 'Recon' });
    const awayCanonical = core.serializeState(state), away = project(state);
    const lesson = (view, id) => view.goals.find(goal => goal.id === id);
    assert.equal(away.person, undefined);
    assert.equal(lesson(away, 'ui-resident').status, 'blocked');
    assert.match(lesson(away, 'ui-resident').detail, /no local living resident.*return later/i);
    assert.equal(lesson(away, 'ui-connections').status, 'available');
    assert.equal(lesson(away, 'ui-connections').action, 'livestock');
    assert.equal(lesson(away, 'ui-connections').checklist[0].action, 'livestock');
    assert.equal(away.orientationLivestock.deathWinter, null);
    assert.ok(state.landing.cattle[away.orientationLivestock.id]);
    assert.equal(core.serializeState(state), awayCanonical);

    for (const animal of Object.values(state.landing.cattle).filter(animal => animal.deathWinter === null))
        state = core.applyCommand(state, { type: 'SlaughterLivestock', livestockId: animal.id });
    const emptyCanonical = core.serializeState(state), empty = project(state);
    assert.equal(empty.orientationLivestock, undefined);
    assert.equal(lesson(empty, 'ui-connections').status, 'blocked');
    assert.match(lesson(empty, 'ui-connections').detail, /no local living resident or livestock.*return later/i);
    assert.equal(lesson(empty, 'ui-connections').checklist[0].done, false);
    const deferred = { ...progress, journey: { ...progress.journey, later: ['ui-resident', 'ui-connections'] } };
    assert.equal(lesson(project(state, deferred), 'ui-resident').status, 'later');
    assert.equal(lesson(project(state, deferred), 'ui-connections').status, 'later');
    assert.equal(core.serializeState(state), emptyCanonical);

    state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 250 });
    assert.ok(ids.every(id => state.personas[id].deathWinter !== null), 'The returned expedition really lost every resident');
    assert.equal(lesson(project(state), 'ui-resident').status, 'blocked');
    assert.equal(lesson(project(state), 'ui-connections').status, 'blocked');
    assert.equal(progress.journey.orientation, undefined);
});
