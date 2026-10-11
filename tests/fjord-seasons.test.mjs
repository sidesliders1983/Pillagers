import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load-source.mjs';
const core = load('../src/simulation/SimulationCore.ts');
const { generateWorld } = load('../src/world-generation/GenerateWorld.ts');
const { createFjordLayout, projectFjordSettlement } = load('../src/fjord-play/FjordProjection.ts');

test('canonical Fjord calendar starts in Winter and changes at exact quarter boundaries', () => {
    let state = core.createCampaign(17, undefined, undefined, { enabled: false });
    const world = generateWorld({ seed: 17 });
    let layout = createFjordLayout(world);
    const cases = [
        [0, 'Winter', 800], [249, 'Winter', 800], [250, 'Spring', 800],
        [499, 'Spring', 800], [500, 'Summer', 800], [749, 'Summer', 800],
        [750, 'Autumn', 800], [999, 'Autumn', 800], [1000, 'Winter', 801]
    ];
    let elapsed = 0;
    for (const [ticks, season, year] of cases) {
        if (ticks > elapsed)
            state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: ticks - elapsed });
        const before = core.serializeState(state);
        const view = projectFjordSettlement(state, world, layout);
        assert.equal(view.calendar?.season, season, 'season at elapsed tick ' + ticks);
        assert.equal(view.calendar.year, year);
        assert.equal(view.calendar.progress, (ticks % 1000) / 1000);
        assert.equal(core.serializeState(state), before, 'calendar projection does not mutate Core');
        layout = view.layout;
        elapsed = ticks;
    }
});

const { SharedSettlement } = load('../src/play/SharedSettlement.ts');
const { defaultWeatherConfig, weatherClasses } = load('../src/simulation/Weather.ts');

test('partial-year save, full-year command, local load and both view handoffs retain the canonical season', () => {
    const owner = new SharedSettlement(17);
    owner.command({ type: 'AdvanceTicks', ticks: 430 });
    const saved = owner.session.saveJSON();
    const records = new Map();
    const storage = { getItem: key => records.get(key) ?? null, setItem: (key, value) => records.set(key, value) };
    owner.saveLocal(storage);
    owner.command({ type: 'AdvanceWinter' });
    assert.deepEqual(owner.fjord.project().calendar, { season: 'Spring', year: 801, progress: .43, winterWeight: 0 });
    assert.equal(owner.session.saveJSON(), core.serializeState(core.applyCommand(core.reconstructState(saved), { type: 'AdvanceWinter' })));
    owner.loadLocal(storage);
    assert.equal(owner.session.saveJSON(), saved);
    let transferred = owner;
    for (const target of ['board', 'fjord']) {
        transferred = SharedSettlement.restore(transferred.handoff(target), target);
        assert.deepEqual(transferred.fjord.project().calendar, { season: 'Spring', year: 800, progress: .43, winterWeight: 0 });
        assert.equal(transferred.session.saveJSON(), saved);
        assert.equal(transferred.session.running, false);
    }
    transferred.restart(true, true);
    assert.equal(transferred.fjord.project().calendar.season, 'Winter');
    assert.equal(transferred.fjord.project().calendar.progress, 0);
    transferred.newCampaign(32, false);
    assert.equal(transferred.fjord.project().calendar.season, 'Winter');
});

test('all annual weather classes and weather-off retain seasons and do not reroll at quarter boundaries', () => {
    for (const kind of [null, ...weatherClasses]) {
        const profiles = Object.fromEntries(weatherClasses.map(name => [name,
            { ...defaultWeatherConfig.profiles[name], probabilityBps: name === kind ? 10000 : 0 }]));
        const weather = kind ? { enabled: true, profiles } : { enabled: false };
        const owner = new SharedSettlement(17);
        owner.importJSON(core.serializeState(core.createCampaign(17, undefined, undefined, weather)));
        const initial = owner.session.snapshot();
        for (const [index, season] of ['Winter', 'Spring', 'Summer', 'Autumn'].entries()) {
            if (index) owner.command({ type: 'AdvanceTicks', ticks: 250 });
            const before = owner.session.saveJSON();
            const view = owner.fjord.project();
            assert.equal(view.calendar.season, season);
            assert.equal(view.weatherVisual.class, kind);
            assert.equal(owner.session.saveJSON(), before, 'presentation cannot write Core');
            assert.deepEqual(owner.session.snapshot().weather, initial.weather, 'no weather reroll within a year');
            const current = owner.session.snapshot();
            assert.deepEqual(Object.keys(current.personas).map(id => core.personaAge(current, id)),
                Object.keys(initial.personas).map(id => core.personaAge(initial, id)), 'seasons do not age people');
        }
    }
});

test('quarter projections and save/load leave mortality, cattle, production and RNG replay identical', () => {
    const owner = new SharedSettlement(32);
    let reference = owner.session.snapshot();
    for (let i = 0; i < 24; i++) {
        owner.command({ type: 'AdvanceTicks', ticks: 250 });
        reference = core.applyCommand(reference, { type: 'AdvanceTicks', ticks: 250 });
        owner.fjord.project();
        assert.equal(owner.session.saveJSON(), core.serializeState(reference));
        if (i % 3 === 0) owner.importJSON(owner.fjord.exportJSON());
    }
    assert.equal(owner.fjord.project().calendar.year, 806);
    assert.equal(owner.fjord.project().calendar.season, 'Winter');
    const single = core.applyCommand(core.createCampaign(32), { type: 'AdvanceTicks', ticks: 6000 });
    assert.equal(owner.session.saveJSON(), core.serializeState(single));
});

test('1, 3 and 5 minute year lengths drive the same saved quarter boundaries without a second clock', () => {
    for (const minutes of [1, 3, 5]) {
        const owner = new SharedSettlement(17);
        owner.session.setMinutesPerWinter(minutes);
        owner.session.setRunning(true);
        for (const [index, season] of ['Spring', 'Summer', 'Autumn', 'Winter'].entries()) {
            owner.session.elapse(minutes * 60000 / 4);
            assert.equal(owner.fjord.project().calendar.season, season);
            assert.deepEqual(owner.session.snapshot().time, { winter: index === 3 ? 801 : 800, tick: ((index + 1) * 250) % 1000 });
        }
        const saved = owner.session.saveJSON();
        owner.session.setRunning(false);
        owner.session.elapse(minutes * 60000);
        assert.equal(owner.session.saveJSON(), saved);
    }
});
