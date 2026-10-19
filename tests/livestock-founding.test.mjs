import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTypeScript } from '../scripts/load-typescript.mjs';

const core = loadTypeScript(new URL('../src/simulation/SimulationCore.ts', import.meta.url));
const speciesIds = ['cattle', 'chicken', 'pig', 'sheep', 'goat', 'goose'];
// Contract fixtures only. Measured balance candidates live separately in QA.
const profile = {
    youngAdultAge: 1, adultAge: 2, adultFood: 1, youngFood: 0,
    femaleFoodPerWinter: 4, maleFoodPerWinter: 0,
    femaleMaterialsPerWinter: 0, maleMaterialsPerWinter: 0,
    exposedProductivityBps: 5000,
    youngSlaughterFood: 2, youngAdultSlaughterFood: 4, slaughterFood: 8,
    birthChanceBps: 10000, fertileMinAge: 2, fertileMaxAge: 6, birthInterval: 2,
    mortalityBands: [{ minAge: 0, chanceBps: 0 }],
    crowdingBps: 200, weatherMortalityBps: 0, capacityWeightBps: 10000,
};
const rules = {
    version: 2,
    profiles: Object.fromEntries(speciesIds.slice(1).map(species => [species, profile])),
    founding: { version: 1 },
    breeding: { requireFed: true, capacityLimited: true, unassignedCapacityUnits: 40000 },
    hides: { cattle: 1, chicken: 0, pig: 1, sheep: 1, goat: 1, goose: 0 },
};
const campaign = (seed, config = {}, livestock = rules) => core.createCampaign(
    seed, config, {}, { enabled: false }, {}, {}, {}, 'summer-800-v1', undefined, { player: livestock },
);

const bounds = { minX: 0, maxX: 512, minZ: 0, maxZ: 256 };
const landscape = {
    waterLevel: -1,
    terrain: { bounds, spacing: 8, columns: 65, rows: 33, heights: Array(2145).fill(0) },
    navigation: { bounds, spacing: 8, columns: 65, rows: 33, cells: Array(2145).fill(true) },
    settlement: { center: { x: 64, z: 128 }, harbor: null },
    rivalSite: { version: 1, candidateId: 'rival-pocket', center: { x: 352, z: 128 },
        bounds: { minX: 288, maxX: 416, minZ: 64, maxZ: 192 } },
};

test('explicit founding rules create real mature single-species trios without changing human founders or stocks', () => {
    const observed = new Set();
    for (let seed = 0; seed < 48; seed++) {
        const state = campaign(seed);
        const control = core.createCampaign(seed, {}, {}, { enabled: false }, {}, {}, {}, 'summer-800-v1');
        assert.equal(state.landing.livestock.version, 2);
        assert.deepEqual(state.personas, control.personas);
        assert.deepEqual(state.families, control.families);
        assert.deepEqual(state.stocks, { food: 15, materials: 5 });
        assert.equal(state.rngState, control.rngState);
        const animals = Object.values(state.landing.cattle);
        assert.equal(animals.length, 3);
        assert.equal(new Set(animals.map(animal => animal.species)).size, 1);
        observed.add(animals[0].species);
        assert.deepEqual(animals.map(animal => animal.sex), ['female', 'female', 'male']);
        for (const animal of animals) {
            assert.deepEqual(animal.parentIds, []);
            assert.equal(animal.origin, 'founding');
            assert.equal(core.inspectLivestock(state, animal.id).stage, 'Adult');
        }
        const facts = state.events[0].details.livestock.animals;
        assert.deepEqual(facts.map(animal => animal.species), animals.map(animal => animal.species));
        assert.deepEqual(core.reconstructState(core.serializeState(state)), state);
    }
    assert.deepEqual([...observed].sort(), [...speciesIds].sort());
});

test('only the single physical rival excludes the player species and keeps its actual CPU stocks', () => {
    let matchingGraphSpecies = false;
    for (let seed = 0; seed < 24; seed++) {
        const initial = campaign(seed);
        const species = Object.values(initial.landing.cattle)[0].species;
        matchingGraphSpecies ||= Object.values(initial.world.targetClans).some(target =>
            Object.values(target.landing.cattle)[0].species === species);
        const state = core.initializeIslandClans(initial, landscape, 'founding-fixture');
        const rival = state.world.targetClans['island-rival'];
        const animals = Object.values(rival.landing.cattle);
        assert.notEqual(animals[0].species, species);
        assert.equal(new Set(animals.map(animal => animal.species)).size, 1);
        assert.deepEqual(animals.map(animal => animal.sex), ['female', 'female', 'male']);
        assert.equal(rival.stocks.food, 30);
        assert.deepEqual(state.personas, initial.personas);
        assert.deepEqual(state.stocks, initial.stocks);
        assert.deepEqual(core.initializeIslandClans(state, landscape, 'founding-fixture'), state);
    }
    assert.equal(matchingGraphSpecies, true, 'Graph factions independently draw from all six species');
});

const noMortality = {
    cattleBirthChanceBps: 10000, cattleMortalityYoungBps: 0, cattleMortalityAdultBps: 0,
    cattleMortalityOlderBps: 0, cattleMortalityOldBps: 0, cowFoodPerWinter: 0,
};
function breedingCampaign(food, breeding = rules.breeding) {
    const fixture = structuredClone(rules);
    fixture.breeding = breeding;
    for (const profile of Object.values(fixture.profiles)) profile.femaleFoodPerWinter = 0;
    return core.createCampaign(1, { ...noMortality, initialFood: food, initialMaterials: 0 },
        { tentProductivityBps: 0 }, { enabled: false }, {}, {}, {}, 'summer-800-v1', undefined, { player: fixture });
}
const livingAnimals = state => Object.values(state.landing.cattle).filter(animal => animal.deathWinter === null);

test('the saved feeding guard blocks breeding after a real feeding shortfall without consuming a birth roll', () => {
    const breeding = { ...rules.breeding, capacityLimited: false };
    const starved = core.applyCommand(breedingCampaign(0, breeding), { type: 'AdvanceTicks', ticks: 500 });
    const fed = core.applyCommand(breedingCampaign(150, breeding), { type: 'AdvanceTicks', ticks: 500 });
    assert.equal(livingAnimals(starved).length, 3);
    assert.ok(starved.events.some(event => /FoodConsumed$/.test(event.type) && event.details.shortfall > 0));
    assert.equal(livingAnimals(fed).length, 5);
    const legacy = core.createCampaign(1, { ...noMortality, initialFood: 0, initialMaterials: 0 },
        { tentProductivityBps: 0 }, { enabled: false });
    const unchanged = core.applyCommand(legacy, { type: 'AdvanceTicks', ticks: 1000 });
    assert.equal(livingAnimals(unchanged).length, 5, 'Earlier saved rules retain their actual breeding policy');
});

test('outside herds use saved weighted space for breeding and crowding instead of bypassing Farmyard pressure', () => {
    const initial = breedingCampaign(150);
    const next = core.applyCommand(initial, { type: 'AdvanceTicks', ticks: 500 });
    assert.equal(livingAnimals(next).length, 4, 'Only one young animal fits the four-space herd');
    const crowded = breedingCampaign(150, { ...rules.breeding, unassignedCapacityUnits: 20000 });
    for (const animal of livingAnimals(crowded))
        assert.equal(core.inspectLivestock(crowded, animal.id).mortalityRiskBps, 200);
    const compact = structuredClone(rules);
    for (const profile of Object.values(compact.profiles)) profile.capacityWeightBps = 2500;
    const poultry = campaign(1, {}, compact);
    assert.notEqual(livingAnimals(poultry)[0].species, 'cattle');
    assert.equal(core.inspectLivestock(poultry, livingAnimals(poultry)[0].id).mortalityRiskBps, 0);
});

test('saved-rule session restart retains explicit player and CPU livestock rules while a new campaign uses its own defaults', () => {
    const { GameplaySession } = loadTypeScript(new URL('../src/gameplay-lab/GameplaySession.ts', import.meta.url));
    const initial = core.initializeIslandClans(campaign(32), landscape, 'founding-fixture');
    const rival = initial.world.targetClans['island-rival'];
    rival.landing.livestock.profiles.goat.slaughterFood = 17;
    const session = new GameplaySession();
    session.loadJSON(core.serializeState(core.applyCommand(initial, { type: 'AdvanceTicks', ticks: 700 })));
    session.restartCampaign(true);
    session.initializeIslandClans(landscape, 'founding-fixture');
    const restarted = session.snapshot();
    assert.deepEqual(restarted.landing, initial.landing);
    assert.deepEqual(restarted.world.targetClans['island-rival'].landing, rival.landing);
    session.newCampaign(32);
    assert.equal(session.snapshot().landing.livestock.version, 1, 'Unreviewed trials are not the shipping default');
});

test('actual slaughter credits whole specialist Hides once for hide-bearing adults and never changes the general stock shape', () => {
    const seen = new Set();
    for (let seed = 0; seed < 48 && seen.size < 6; seed++) {
        const state = campaign(seed), animal = livingAnimals(state)[0];
        if (seen.has(animal.species)) continue;
        seen.add(animal.species);
        const amount = ['cattle', 'pig', 'sheep', 'goat'].includes(animal.species) ? 1 : 0;
        const command = { type: 'SlaughterLivestock', livestockId: animal.id };
        const result = core.applyCommand(state, command);
        assert.equal(result.specialistStocks?.hides ?? 0, amount);
        assert.deepEqual(Object.keys(result.stocks).sort(), ['food', 'materials']);
        assert.equal(result.events.at(-1).details.hides ?? 0, amount);
        assert.equal(core.canApplyCommand(result, command), false);
        assert.deepEqual(core.reconstructState(core.serializeState(result)), result);
    }
    assert.equal(seen.size, 6);
    const legacy = core.applyCommand(core.createCampaign(1), { type: 'SlaughterCattle', cattleId: 'cattle-1' });
    assert.equal(legacy.specialistStocks, undefined);
    assert.equal(legacy.events.at(-1).details.hides, undefined);
});

test('seeded campaigns retain exact tick-batch and save/load results including a physical CPU clan', () => {
    const initial = core.initializeIslandClans(campaign(32), landscape, 'founding-fixture');
    const full = core.applyCommand(initial, { type: 'AdvanceTicks', ticks: 2173 });
    const partial = core.reconstructState(core.serializeState(core.applyCommand(initial,
        { type: 'AdvanceTicks', ticks: 783 })));
    assert.deepEqual(core.applyCommand(partial, { type: 'AdvanceTicks', ticks: 1390 }), full);
    assert.deepEqual(core.applyCommand(initial, { type: 'AdvanceTicks', ticks: 2173 }), full);
    const malformed = structuredClone(initial);
    malformed.landing.livestock.hides.goat = 0.5;
    assert.throws(() => core.reconstructState(JSON.stringify(malformed)), /livestock rules/);
    const badStock = { ...initial, specialistStocks: { version: 1, hides: -1 } };
    assert.throws(() => core.serializeState(badStock), /specialist stocks/);
});

test('livestock management and the factual Chronicle disclose the actual specialist slaughter receipt', () => {
    const { SettlementPanel } = loadTypeScript(new URL('../src/play/SettlementPanel.ts', import.meta.url));
    const { projectChronicle } = loadTypeScript(new URL('../src/lore/Chronicle.ts', import.meta.url));
    const state = campaign(32), animal = livingAnimals(state)[0];
    assert.equal(animal.species, 'goat');
    const panel = new SettlementPanel();
    assert.match(panel.render(state, { kind: 'cattle', id: animal.id }), /Slaughter \(8 Food, 1 Hides\)/);
    const result = core.applyCommand(state, { type: 'SlaughterLivestock', livestockId: animal.id });
    const entries = projectChronicle(result.events).flatMap(group => group.entries);
    assert.ok(entries.some(entry => /Livestock 1 was slaughtered for 8 Food and 1 Hides\./.test(entry.text)));
});
