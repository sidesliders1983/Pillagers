import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTypeScript } from '../scripts/load-typescript.mjs';

const core = loadTypeScript(new URL('../src/simulation/SimulationCore.ts', import.meta.url));
const { eventFacts } = loadTypeScript(new URL('../src/simulation/EventFacts.ts', import.meta.url));
const profile = {
    youngAdultAge: 1, adultAge: 2, adultFood: 1, youngFood: 0,
    femaleFoodPerWinter: 4, maleFoodPerWinter: 0, femaleMaterialsPerWinter: 0, maleMaterialsPerWinter: 0,
    exposedProductivityBps: 5000, youngSlaughterFood: 2, youngAdultSlaughterFood: 4, slaughterFood: 8,
    birthChanceBps: 10000, fertileMinAge: 2, fertileMaxAge: 6, birthInterval: 2,
    mortalityBands: [{ minAge: 0, chanceBps: 0 }], crowdingBps: 0,
    weatherMortalityBps: 0, capacityWeightBps: 10000,
};

// An explicit unplayed mixed-herd contract fixture, never a species conversion command.
function mixedHerd(changes = {}, options = {}) {
    let state = core.configureLivestock(core.createCampaign(32, { initialFood: 1000, initialMaterials: 100 },
        { fertilityChanceBps: 0, mortalityBands: [{ minAge: 0, chanceBps: 0 }] }, { enabled: false }),
        { goat: profile, sheep: { ...profile, capacityWeightBps: 5000 } });
    const reference = structuredClone(state.landing.cattle['cattle-1']);
    state.landing.cattle = Object.fromEntries([['goat', 'female'], ['goat', 'male'],
        ['sheep', 'female'], ['sheep', 'male']].map(([species, sex], index) => {
        const id = 'cattle-' + (index + 1);
        return [id, { ...structuredClone(reference), id, species, sex }];
    }));
    for (const [id, fields] of Object.entries(changes)) Object.assign(state.landing.cattle[id], fields);
    if (options.seededRules) state.landing.livestock = {
        version: 2, founding: { version: 1 },
        profiles: Object.fromEntries(['chicken', 'pig', 'sheep', 'goat', 'goose'].map(species =>
            [species, species === 'sheep' ? { ...profile, capacityWeightBps: 5000 } : profile])),
        breeding: { requireFed: true, capacityLimited: true, unassignedCapacityUnits: options.outdoorUnits ?? 60000 },
        hides: { cattle: 1, chicken: 0, pig: 1, sheep: 1, goat: 1, goose: 0 },
    };
    const event = state.events.find(event => event.type === 'FoundingPartyLanded');
    const details = { ...event.details, cattleIds: Object.keys(state.landing.cattle) };
    delete details.livestock;
    event.details = eventFacts(state, details);
    return core.reconstructState(core.serializeState(state));
}

test('breeding status counts each species separately and never mistakes another species male for a partner', () => {
    const state = mixedHerd(), before = core.serializeState(state);
    const summary = core.inspectLivestockBreeding(state);
    assert.deepEqual(summary.species.map(row => [row.species, row.living, row.structuralPairs]),
        [['sheep', 2, 1], ['goat', 2, 1]]);
    assert.equal(core.serializeState(state), before);
    const after = core.applyCommand(state, { type: 'SlaughterLivestock', livestockId: 'cattle-2' });
    const goat = core.inspectLivestockBreeding(after).species.find(row => row.species === 'goat');
    assert.equal(goat.structuralPairs, 0);
    assert.deepEqual(goat.herds[0].constraints, ['missing-male']);
    assert.equal(core.inspectLivestockBreeding(after).species.find(row => row.species === 'sheep').structuralPairs, 1);
    assert.deepEqual(core.inspectLivestockBreeding(core.reconstructState(core.serializeState(after))),
        core.inspectLivestockBreeding(after));
});

test('separate Farmyards are not a usable pair and real reassignment restores the correct mixed-herd status', () => {
    let state = mixedHerd();
    const yards = [];
    for (const personaId of ['founder-1', 'founder-2']) {
        const home = Object.values(state.households).find(home => home.memberIds.includes(personaId));
        state = core.applyCommand(state, { type: 'AssignOccupation', personaId, occupation: 'farmer' });
        state = core.applyCommand(state, { type: 'HouseHousehold', householdId: home.id });
        yards.push(core.landingSummary(state).farmyards.find(yard => yard.householdId === home.id).id);
    }
    for (const id of ['cattle-1', 'cattle-3', 'cattle-4'])
        state = core.applyCommand(state, { type: 'AssignLivestock', livestockId: id, farmyardId: yards[0] });
    state = core.applyCommand(state, { type: 'AssignLivestock', livestockId: 'cattle-2', farmyardId: yards[1] });
    let goats = core.inspectLivestockBreeding(state).species.find(row => row.species === 'goat');
    assert.equal(goats.structuralPairs, 0);
    assert.equal(goats.separated, true);
    assert.equal(goats.herds.length, 2);
    assert.equal(core.landingSummary(state).farmyards[0].occupancy, 2,
        'One goat and two half-space sheep use their actual weights');
    state = core.applyCommand(state, { type: 'AssignLivestock', livestockId: 'cattle-2', farmyardId: yards[0] });
    goats = core.inspectLivestockBreeding(state).species.find(row => row.species === 'goat');
    assert.equal(goats.structuralPairs, 1);
    assert.equal(goats.separated, false);
    assert.equal(core.landingSummary(state).farmyards[0].occupancy, 3);
});

test('young replacements, old animals and birth intervals remain distinct from current structural pairs', () => {
    const state = mixedHerd({ 'cattle-2': { birthWinter: 799 }, 'cattle-3': { lastCalvingWinter: 800 } });
    const summary = core.inspectLivestockBreeding(state);
    const goats = summary.species.find(row => row.species === 'goat');
    assert.equal(goats.structuralPairs, 0);
    assert.deepEqual(goats.herds[0].youngMaleIds, ['cattle-2']);
    const sheep = summary.species.find(row => row.species === 'sheep');
    assert.equal(sheep.structuralPairs, 1);
    assert.deepEqual(sheep.herds[0].readyFemaleIds, []);
    assert.ok(sheep.herds[0].constraints.includes('birth-interval'));
    const next = core.advanceWinter(state);
    assert.ok(Object.values(next.landing.cattle).some(animal => animal.parentIds.includes('cattle-2')),
        'A young possible replacement can actually mature and become a parent');
    const older = mixedHerd({ 'cattle-2': { birthWinter: 793 } });
    const past = core.inspectLivestockBreeding(older).species.find(row => row.species === 'goat');
    assert.equal(past.structuralPairs, 0);
    assert.deepEqual(past.herds[0].pastWindowIds, ['cattle-2']);
    assert.deepEqual(past.herds[0].youngMaleIds, []);
});

test('breeding status uses the actual outdoor capacity and same-boundary feeding guard without storing a shortage flag', () => {
    const full = mixedHerd({}, { seededRules: true, outdoorUnits: 30000 });
    assert.ok(core.inspectLivestockBreeding(full).species.every(row =>
        row.structuralPairs === 1 && row.herds[0].constraints.includes('capacity')));
    let hungry = mixedHerd({}, { seededRules: true });
    hungry.stocks.food = 0;
    for (const personaId of Object.keys(hungry.personas))
        hungry = core.applyCommand(hungry, { type: 'AssignOccupation', personaId, occupation: null });
    hungry = core.advanceWinter(hungry);
    assert.equal(core.inspectLivestockBreeding(hungry).feedingBlocked, true);
    assert.ok(core.inspectLivestockBreeding(hungry).species.every(row => row.herds[0].constraints.includes('feeding')));
    assert.equal(Object.values(hungry.landing.cattle).filter(animal => animal.origin === 'reproduction').length, 0);
    const later = core.applyCommand(hungry, { type: 'AdvanceTicks', ticks: 1 });
    assert.equal(core.inspectLivestockBreeding(later).feedingBlocked, false,
        'The UI must not invent a permanent feeding block from historical shortages');
});

test('current animal cards and slaughter previews show a young replacement without blocking the risky action', () => {
    const { SettlementPanel } = loadTypeScript(new URL('../src/play/SettlementPanel.ts', import.meta.url));
    const { slaughterBreedingWarning } = loadTypeScript(new URL('../src/play/LivestockBreedingView.ts', import.meta.url));
    const state = mixedHerd();
    const next = core.applyCommand(state, { type: 'SlaughterLivestock', livestockId: 'cattle-2' });
    assert.match(slaughterBreedingWarning(state, next, 'cattle-2'), /last age-eligible breeding combination/);
    const young = mixedHerd({ 'cattle-2': { birthWinter: 799 } });
    assert.equal(core.inspectLivestock(young, 'cattle-2').sexTerm, 'Kid');
    const html = new SettlementPanel().render(young, { kind: 'cattle', id: 'cattle-1' });
    assert.match(html, /Breeding stock/);
    assert.match(html, /No fertile male/);
    assert.match(html, /Possible young replacements: 0 female, 1 male/);
    assert.doesNotMatch(html, /inbreed|incest/i);
    assert.equal(core.canApplyCommand(state, { type: 'SlaughterLivestock', livestockId: 'cattle-2' }), true);
});
