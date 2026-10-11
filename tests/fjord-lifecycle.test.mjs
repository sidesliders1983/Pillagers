import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load-source.mjs';

const core = load('../src/simulation/SimulationCore.ts');
const { generateWorld } = load('../src/world-generation/GenerateWorld.ts');
const { createFjordLayout, projectFjordSettlement } = load('../src/fjord-play/FjordProjection.ts');

test('a child grows from canonical age while household placement and gameplay remain unchanged', () => {
    let state = core.createSettlement(32, { fertilityChanceBps: 0, mortalityBands: [{ minAge: 0, chanceBps: 0 }] });
    const world = generateWorld({ seed: 32 });
    let view = projectFjordSettlement(state, world, createFjordLayout(world));
    const child = () => view.entities.find(e => e.id === 'astrid');
    assert.equal(child().status.age, 0);
    assert.equal(child().transform, null, 'young children remain canonical but indoors');
    for (let i = 0; i < 5; i++) state = core.applyCommand(state, { type: 'AdvanceWinter' });
    view = projectFjordSettlement(state, world, view.layout);
    const position = { x: child().transform.x, y: child().transform.y, z: child().transform.z };
    assert.equal(child().transform.scale, .4 + .6 * 5 / 16);
    for (let i = 0; i < 3; i++) state = core.applyCommand(state, { type: 'AdvanceWinter' });
    const before = core.serializeState(state);
    view = projectFjordSettlement(state, world, view.layout);
    assert.equal(child().status.age, 8);
    assert.equal(child().transform.scale, .7);
    assert.deepEqual({ x: child().transform.x, y: child().transform.y, z: child().transform.z }, position);
    assert.equal(core.serializeState(state), before);
    for (let i = 0; i < 8; i++) state = core.applyCommand(state, { type: 'AdvanceWinter' });
    view = projectFjordSettlement(state, world, view.layout);
    assert.equal(child().status.age, 16);
    assert.equal(child().transform.scale, 1);
    assert.deepEqual(projectFjordSettlement(core.reconstructState(core.serializeState(state)), world, view.layout), view);
});


test('Fjord weather presentation follows each canonical class and restores the disabled baseline', () => {
    const world = generateWorld({ seed: 32 });
    const visuals = {};
    for (const kind of core.weatherClasses) {
        const profiles = structuredClone(core.defaultWeatherConfig.profiles);
        for (const [name, profile] of Object.entries(profiles)) profile.probabilityBps = name === kind ? 10000 : 0;
        const state = core.createCampaign(32, {}, {}, { profiles });
        const before = core.serializeState(state);
        const view = projectFjordSettlement(state, world, createFjordLayout(world));
        assert.equal(view.weatherVisual.class, kind);
        assert.equal(core.serializeState(state), before);
        visuals[kind] = view.weatherVisual;
    }
    assert.equal(visuals.Normal.snow, 0);
    assert.equal(visuals.Harsh.snow, .35);
    assert.equal(visuals.Severe.snow, 1);
    assert.ok(visuals.Severe.lighting.fogNear < visuals.Harsh.lighting.fogNear);
    assert.ok(visuals.Harsh.lighting.fogNear < visuals.Normal.lighting.fogNear);
    assert.ok(visuals.Mild.lighting.sunIntensity > visuals.Normal.lighting.sunIntensity);
    const disabled = core.createCampaign(32, {}, {}, { enabled: false });
    const view = projectFjordSettlement(disabled, world, createFjordLayout(world));
    assert.equal(view.weatherVisual.class, null);
    assert.deepEqual(view.weatherVisual.lighting, visuals.Normal.lighting);
    assert.equal(view.weatherVisual.snow, 0);
});

test('personal production feedback reads new integer Core awards, aggregates batches and never replays a loaded history', () => {
    const { FjordProduction } = load('../src/fjord-play/FjordProduction.ts');
    let state = core.createCampaign(32, { initialFood: 1000, initialMaterials: 500 },
        { fertilityChanceBps: 0, mortalityBands: [{ minAge: 0, chanceBps: 0 }] }, { enabled: false });
    for (const id of Object.keys(state.personas))
        state = core.applyCommand(state, { type: 'AssignOccupation', personaId: id,
            occupation: id === 'founder-1' ? 'fisher' : id === 'founder-2' ? 'woodworker' : null });
    const feedback = new FjordProduction(state.events);
    state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 1 });
    assert.deepEqual(feedback.read(state.events), [], 'work progress alone is not production');
    const singles = [];
    for (let tick = 0; tick < 998 && !singles.some(x => x.resource === 'materials'); tick++) {
        state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 1 });
        singles.push(...feedback.read(state.events));
    }
    assert.ok(singles.some(x => x.id === 'founder-1' && x.resource === 'food' && x.units === 1));
    assert.ok(singles.some(x => x.id === 'founder-2' && x.resource === 'materials' && x.units === 1));
    const from = state.events.length;
    state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 3000 });
    const canonical = state.events.slice(from).filter(e => e.type === 'ResourceProduced' || e.type === 'CattleFoodProduced');
    const batch = feedback.read(state.events);
    for (const output of batch) {
        assert.equal(output.units, canonical.filter(e => (e.personaId ?? e.details.cattleId) === output.id && (e.type === 'CattleFoodProduced' ? 'food' : e.details.resource) === output.resource)
            .reduce((sum, e) => sum + e.details.units, 0));
        assert.ok(output.kind === 'persona' || output.kind === 'cattle');
    }
    assert.ok(batch.some(x => x.units > 1));
    assert.deepEqual(feedback.read(state.events), [], 'each award is consumed exactly once');
    const restored = core.reconstructState(core.serializeState(state));
    feedback.reset(restored.events);
    assert.deepEqual(feedback.read(restored.events), [], 'restore starts after historical awards');
    restored.stocks.food += 500; // A non-personal stock change cannot create an attributed popup.
    assert.deepEqual(feedback.read(restored.events), []);
    const salvaged = core.applyCommand(restored, { type: 'SalvageLongship', longshipId: 'founding-longship' });
    assert.deepEqual(feedback.read(salvaged.events), []);
});

test('25 actual Winters retain every present living identity, cattle stage and attributed production through save/load', () => {
    const { FjordProduction } = load('../src/fjord-play/FjordProduction.ts');
    let state = core.createCampaign(17, { initialFood: 10000, initialMaterials: 1000, foundingCoupleChanceBps: 10000 });
    const world = generateWorld({ seed: 17, conifers: 'ez-tree' });
    let view = projectFjordSettlement(state, world, createFjordLayout(world));
    const production = new FjordProduction(state.events);
    const start = state.events.length;
    const totals = new Map();
    state = core.applyCommand(state, { type: 'AssignOccupation', personaId: 'founder-1', occupation: 'farmer' });
    for (const home of Object.values(state.households).filter(h => h.memberIds.length))
        state = core.applyCommand(state, { type: 'BuildHouse', householdId: home.id });
    const farm = Object.values(state.households).find(h => h.memberIds.includes('founder-1')).residenceId;
    for (const id of Object.keys(state.landing.cattle))
        state = core.applyCommand(state, { type: 'AssignCattle', cattleId: id, farmyardId: farm });
    for (let year = 1; year <= 25; year++) {
        state = core.applyCommand(state, { type: 'AdvanceWinter' });
        const saved = core.reconstructState(core.serializeState(state));
        assert.deepEqual(saved, state);
        view = projectFjordSettlement(state, world, view.layout);
        assert.equal(view.weatherVisual.class, core.inspectWeather(state).class);
        const residents = Object.values(state.personas).filter(p => p.deathWinter === null && !core.personaAway(state, p.id)).map(p => p.id).sort();
        const rendered = view.entities.filter(e => e.kind === 'persona' && e.transform).map(e => e.id).sort();
        assert.deepEqual(view.entities.filter(e => e.kind === 'persona').map(e => e.id).sort(), residents, 'Indoor residents keep their canonical identity');
        const outdoors = residents.filter(id => core.personaAge(state, id) >= 5 && !core.isProvidingCare(state, id));
        assert.deepEqual(rendered, outdoors, 'Every outdoor resident needs a position in Winter ' + state.time.winter);
        assert.deepEqual(view.entities.filter(e => e.kind === 'cattle' && e.transform).map(e => e.id).sort(),
            Object.values(state.landing.cattle).filter(c => c.deathWinter === null).map(c => c.id).sort());
        for (const entity of view.entities.filter(e => e.kind === 'cattle')) {
            const cattle = core.inspectCattle(state, entity.id);
            assert.equal(entity.status.stage, cattle.stage);
            assert.equal(entity.status.sheltered, cattle.sheltered);
            assert.equal(entity.status.overcrowding, cattle.overcrowding);
            assert.deepEqual(entity.status.parentIds, cattle.parentIds);
            assert.equal(entity.asset, cattle.stage === 'Young' ? 'baby' : cattle.stage === 'Young Adult' ? 'young-adult' : cattle.sex === 'female' ? 'adult-female' : 'adult-male');
        }
        for (const output of production.read(state.events)) {
            const key = output.kind + ':' + output.id + ':' + output.resource;
            totals.set(key, (totals.get(key) ?? 0) + output.units);
        }
    }
    const canonical = new Map();
    for (const event of state.events.slice(start).filter(e => e.type === 'ResourceProduced' || e.type === 'CattleFoodProduced')) {
        const key = event.type === 'CattleFoodProduced' ? 'cattle:' + event.details.cattleId + ':food' :
            'persona:' + event.personaId + ':' + event.details.resource;
        canonical.set(key, (canonical.get(key) ?? 0) + event.details.units);
    }
    assert.deepEqual(totals, canonical);
    assert.ok(state.events.some(e => e.type === 'ChildBorn'));
    assert.ok(state.events.some(e => e.type === 'CattleBorn'));
    assert.ok(state.events.some(e => e.type === 'PersonaDied'));
    assert.ok(state.events.some(e => e.type === 'CattleDied'));
});

test('dead residents release outdoor reservations without moving surviving residents', () => {
    let state = core.createCampaign(17, { initialFood: 10000, initialMaterials: 1000 },
        { mortalityBands: [{ minAge: 0, chanceBps: 10000 }] }, { enabled: false });
    const world = generateWorld({ seed: 17 });
    const before = projectFjordSettlement(state, world, createFjordLayout(world));
    assert.ok(Object.keys(before.layout.points).some(key => key.startsWith('persona:')));
    state = core.applyCommand(state, { type: 'AdvanceWinter' });
    const after = projectFjordSettlement(state, world, before.layout);
    assert.equal(after.entities.filter(e => e.kind === 'persona').length, 0);
    assert.equal(Object.keys(after.layout.points).filter(key => key.startsWith('persona:')).length, 0);
    for (const entity of after.entities.filter(e => e.kind === 'cattle' && before.entities.some(old => old.selectionKey === e.selectionKey)))
        assert.deepEqual(entity.transform, before.entities.find(e => e.selectionKey === entity.selectionKey).transform);
});

test('empty tent households and obsolete livestock assignments release only their old presentation reservations', () => {
    let state = core.createCampaign(17, { initialFood: 10000, initialMaterials: 1000 },
        { mortalityBands: [{ minAge: 0, chanceBps: 10000 }] }, { enabled: false });
    const world = generateWorld({ seed: 17 });
    let view = projectFjordSettlement(state, world, createFjordLayout(world));
    state = core.applyCommand(state, { type: 'AssignOccupation', personaId: 'founder-1', occupation: 'farmer' });
    state = core.applyCommand(state, { type: 'BuildHouse', householdId: 'founder-1' });
    state = core.applyCommand(state, { type: 'AssignCattle', cattleId: 'cattle-1', farmyardId: 'house-1' });
    view = projectFjordSettlement(state, world, view.layout);
    const building = view.entities.find(e => e.kind === 'building');
    state = core.applyCommand(state, { type: 'AdvanceWinter' });
    view = projectFjordSettlement(state, world, view.layout);
    assert.deepEqual(Object.keys(view.layout.plots), ['building:house-1'], 'Empty physical houses remain; departed tent households free their plots.');
    const vacant = view.entities.find(e => e.id === 'house-1');
    assert.deepEqual(['x', 'y', 'z', 'scale'].map(key => vacant.transform[key]),
        ['x', 'y', 'z', 'scale'].map(key => building.transform[key]));
    assert.equal(vacant.status.farmyard, false);
    assert.equal(Object.keys(view.layout.points).filter(key => key.startsWith('cattle:cattle-1@')).length, 1);
    assert.ok(Object.keys(view.layout.points).some(key => key.startsWith('cattle:cattle-1@outside@')));
});


test('real cow Food awards create livestock feedback while bulls, calves and slaughter do not', () => {
    const { FjordProduction } = load('../src/fjord-play/FjordProduction.ts');
    let state = core.createCampaign(32, { cattleBirthChanceBps: 10000, cattleMortalityYoungBps: 0,
        cattleMortalityAdultBps: 0, cattleMortalityOlderBps: 0, cattleMortalityOldBps: 0 },
        { fertilityChanceBps: 0, mortalityBands: [{ minAge: 0, chanceBps: 0 }] }, { enabled: false });
    for (const id of Object.keys(state.personas))
        state = core.applyCommand(state, { type: 'AssignOccupation', personaId: id, occupation: null });
    const feedback = new FjordProduction(state.events);
    state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 1 });
    assert.deepEqual(feedback.read(state.events), [], 'Progress is not an awarded unit.');
    state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 999 });
    assert.deepEqual(feedback.read(state.events), [
        { kind: 'cattle', id: 'cattle-1', resource: 'food', units: 2 },
        { kind: 'cattle', id: 'cattle-2', resource: 'food', units: 2 }
    ]);
    const calves = Object.values(state.landing.cattle).filter(c => c.origin === 'reproduction');
    assert.ok(calves.length > 0);
    state = core.applyCommand(state, { type: 'AdvanceWinter' });
    assert.deepEqual(feedback.read(state.events), [
        { kind: 'cattle', id: 'cattle-1', resource: 'food', units: 2 },
        { kind: 'cattle', id: 'cattle-2', resource: 'food', units: 2 }
    ], 'Only eligible adult female cattle produce, even when calves are present.');
    const restored = core.reconstructState(core.serializeState(state));
    feedback.reset(restored.events);
    assert.deepEqual(feedback.read(restored.events), []);
    state = core.applyCommand(restored, { type: 'SlaughterCattle', cattleId: calves[0].id });
    assert.deepEqual(feedback.read(state.events), [], 'Slaughter Food is not production.');
});
