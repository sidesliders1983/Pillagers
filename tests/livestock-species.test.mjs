import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadTypeScript } from '../scripts/load-typescript.mjs';

const core = loadTypeScript(new URL('../src/simulation/SimulationCore.ts', import.meta.url));
const { bookLedger } = loadTypeScript(new URL('../src/lore/BookLedger.ts', import.meta.url));
const { eventFacts } = loadTypeScript(new URL('../src/simulation/EventFacts.ts', import.meta.url));
const { SettlementPanel } = loadTypeScript(new URL('../src/play/SettlementPanel.ts', import.meta.url));

// Deliberate contract fixtures, not proposed production coefficients for these species.
const profile = {
    youngAdultAge: 1, adultAge: 2, adultFood: 1, youngFood: 0,
    femaleFoodPerWinter: 4, maleFoodPerWinter: 0,
    femaleMaterialsPerWinter: 0, maleMaterialsPerWinter: 0,
    exposedProductivityBps: 5000,
    youngSlaughterFood: 5, youngAdultSlaughterFood: 10, slaughterFood: 15,
    birthChanceBps: 10000, fertileMinAge: 2, fertileMaxAge: 6, birthInterval: 2,
    mortalityBands: [{ minAge: 0, chanceBps: 0 }],
    crowdingBps: 200, weatherMortalityBps: 0, capacityWeightBps: 10000,
};

// Declare an unplayed species fixture together with its initial factual record. This is
// fixture construction, never a gameplay command that converts an existing animal.
function declareSpecies(state, assignments) {
    for (const [id, species] of Object.entries(assignments)) state.landing.cattle[id].species = species;
    const founding = state.events.find(event => event.type === 'FoundingPartyLanded');
    const details = { ...founding.details };
    delete details.livestock;
    founding.details = eventFacts(state, details);
    return state;
}

test('management shows species and stable labels in animal details and mixed Farmyard rosters', () => {
    let state = core.configureLivestock(core.createCampaign(32, { initialMaterials: 50 }),
        { goat: profile });
    declareSpecies(state, { 'cattle-2': 'goat' });
    state = core.applyCommand(state, { type: 'AssignOccupation', personaId: 'founder-1', occupation: 'farmer' });
    state = core.applyCommand(state, { type: 'HouseHousehold', householdId: 'founder-1' });
    state = core.applyCommand(state, { type: 'AssignLivestock', livestockId: 'cattle-2', farmyardId: 'house-1' });
    const before = core.serializeState(state), panel = new SettlementPanel();
    const animal = panel.render(state, { kind: 'cattle', id: 'cattle-2' });
    assert.match(animal, /<h2>Livestock 2<\/h2>/);
    assert.match(animal, /Goat · Doe · female · 3 Winters · Adult/);
    assert.match(animal, /SlaughterLivestock/);
    const yard = panel.render(state, { kind: 'building', id: 'house-1' });
    assert.match(yard, /data-select="cattle-2">Livestock 2/);
    assert.match(yard, /1 livestock · space 1\/4/);
    assert.equal(core.serializeState(state), before);
});

test('Fjord labels cattle by local designation and never depicts another species using a cattle model', () => {
    const { generateWorld } = loadTypeScript(new URL('../src/world-generation/GenerateWorld.ts', import.meta.url));
    const { createFjordLayout, projectFjordSettlement } = loadTypeScript(new URL('../src/fjord-play/FjordProjection.ts', import.meta.url));
    const state = core.configureLivestock(core.createCampaign(32), { goat: profile });
    declareSpecies(state, { 'cattle-2': 'goat' });
    const before = core.serializeState(state), world = generateWorld({ seed: 32 });
    const view = projectFjordSettlement(state, world, createFjordLayout(world));
    assert.deepEqual(view.entities.filter(entity => entity.kind === 'cattle').map(entity =>
        [entity.id, entity.label, entity.status.species, entity.status.sexTerm]), [
        ['cattle-1', 'Livestock 1', 'cattle', 'Cow'], ['cattle-3', 'Livestock 3', 'cattle', 'Bull'],
    ]);
    const { projectSettlement } = loadTypeScript(new URL('../src/play/SettlementView.ts', import.meta.url));
    assert.equal(projectSettlement(state).cattle, 3, 'The shared 2D total includes animals without a native sprite');
    assert.equal(core.serializeState(state), before);
});

test('the saved book and Chronicle retain real species and exact receipts through session handoff', () => {
    const { SharedSettlement } = loadTypeScript(new URL('../src/play/SharedSettlement.ts', import.meta.url));
    const { ClanBook } = loadTypeScript(new URL('../src/lore/ClanBook.ts', import.meta.url));
    const { projectChronicle } = loadTypeScript(new URL('../src/lore/Chronicle.ts', import.meta.url));
    let state = core.configureLivestock(core.createCampaign(32, { initialFood: 1000 },
        { mortalityBands: [{ minAge: 0, chanceBps: 0 }], fertilityChanceBps: 0 }, { enabled: false }),
        { goat: { ...profile, femaleMaterialsPerWinter: 2, birthChanceBps: 0 } });
    declareSpecies(state, { 'cattle-1': 'goat', 'cattle-2': 'goat', 'cattle-3': 'goat' });
    const opening = new ClanBook(state, true, 17).snapshot().chapters[0];
    assert.match(opening.text, /two adult does and one adult buck/);
    assert.equal(opening.facts.livestock.animals[0].name, 'Livestock 1');
    const owner = new SharedSettlement(32);
    owner.session.loadJSON(core.serializeState(state));
    owner.command({ type: 'SlaughterLivestock', livestockId: 'cattle-3' });
    owner.command({ type: 'AdvanceTicks', ticks: 5000 });
    state = owner.session.snapshot();
    const chapter = owner.session.book.snapshot().chapters.at(-1);
    assert.match(chapter.text, /adult buck.*slaughtered/i);
    assert.doesNotMatch(chapter.text, /cattle-3|calf|cow|bull/);
    assert.equal(chapter.facts.ledger.food.otherReceipts, 15);
    assert.equal(chapter.facts.ledger.materials.cattleProduction, 10);
    assert.equal(chapter.facts.demographics.filter(event => event.type === 'LivestockSlaughtered').length, 1);
    const entries = projectChronicle(state.events).flatMap(winter => winter.entries);
    assert.ok(entries.some(entry => /Livestock 3.*slaughtered for 15 Food/.test(entry.text)));
    assert.ok(entries.some(entry => /herd produced.*Materials/.test(entry.text)));
    const restored = SharedSettlement.restore(owner.handoff('board'), 'board');
    assert.deepEqual(restored.session.snapshot(), state);
    assert.deepEqual(restored.session.book.snapshot(), owner.session.book.snapshot());
});

test('Farmyard suggestions use the shared occupancy weights and production cursors retain real resource sources', () => {
    const { proposeWork, previewWork } = loadTypeScript(new URL('../src/fjord-play/WorkPlan.ts', import.meta.url));
    const { FjordProduction } = loadTypeScript(new URL('../src/fjord-play/FjordProduction.ts', import.meta.url));
    let state = core.configureLivestock(core.createCampaign(32, { initialMaterials: 50, farmyardCapacity: 1 },
        {}, { enabled: false }), { chicken: { ...profile, capacityWeightBps: 2500,
            femaleMaterialsPerWinter: 4, birthChanceBps: 0 } });
    declareSpecies(state, Object.fromEntries(Object.keys(state.landing.cattle).map(id => [id, 'chicken'])));
    const plan = proposeWork(state, 'founder-1', 'farmer', 'farmyard');
    assert.deepEqual(plan.cattleIds, ['cattle-1', 'cattle-2', 'cattle-3']);
    const preview = previewWork(state, plan);
    assert.deepEqual([preview.farmyard.occupants, preview.farmyard.occupancy], [3, .75]);
    state = preview.state;
    const cursor = new FjordProduction(state.events);
    const next = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 250 });
    const outputs = cursor.read(next.events).filter(output => output.kind === 'cattle');
    assert.deepEqual(outputs.map(output => [output.id, output.resource, output.units]), [
        ['cattle-1', 'food', 1], ['cattle-1', 'materials', 1],
        ['cattle-2', 'food', 1], ['cattle-2', 'materials', 1],
    ]);
    assert.deepEqual(cursor.read(next.events), []);
});

test('animal inspection exposes stable friendly titles and real species and sex without changing the campaign', () => {
    const state = core.createCampaign(32);
    const before = core.serializeState(state);
    const animals = ['cattle-1', 'cattle-2', 'cattle-3'].map(id => {
        const animal = core.inspectCattle(state, id);
        return { name: animal.name, species: animal.species,
            speciesName: animal.speciesName, sexTerm: animal.sexTerm };
    });
    assert.deepEqual(animals, [
        { name: 'Livestock 1', species: 'cattle', speciesName: 'Cattle', sexTerm: 'Cow' },
        { name: 'Livestock 2', species: 'cattle', speciesName: 'Cattle', sexTerm: 'Cow' },
        { name: 'Livestock 3', species: 'cattle', speciesName: 'Cattle', sexTerm: 'Bull' },
    ]);
    assert.equal(core.serializeState(state), before);
    assert.deepEqual(core.reconstructState(before), state);
});

test('six species use their own explicit saved profiles and sex terms without changing founding animals', () => {
    for (const [species, label, female, male] of [
        ['cattle', 'Cattle', 'Cow', 'Bull'], ['chicken', 'Chicken', 'Hen', 'Rooster'],
        ['pig', 'Pig', 'Sow', 'Boar'], ['sheep', 'Sheep', 'Ewe', 'Ram'],
        ['goat', 'Goat', 'Doe', 'Buck'], ['goose', 'Goose', 'Goose', 'Gander'],
    ]) {
        const original = core.createCampaign(32);
        const state = species === 'cattle' ? original :
            core.configureLivestock(original, { [species]: profile });
        assert.deepEqual(state.personas, original.personas);
        assert.deepEqual(state.stocks, original.stocks);
        assert.equal(state.rngState, original.rngState);
        assert.deepEqual(state.landing.cattle, original.landing.cattle);
        // Existing immutable identities need not encode their species.
        declareSpecies(state, Object.fromEntries(Object.keys(state.landing.cattle).map(id => [id, species])));
        const saved = core.reconstructState(core.serializeState(state));
        assert.deepEqual(['cattle-1', 'cattle-3'].map(id => {
            const animal = core.inspectLivestock(saved, id);
            return [animal.name, animal.species, animal.speciesName, animal.sexTerm, animal.stage];
        }), [
            ['Livestock 1', species, label, female, 'Adult'],
            ['Livestock 3', species, label, male, 'Adult'],
        ]);
    }
});

test('saved species require complete bounded rules and cannot register one animal twice', () => {
    const initial = core.createCampaign(32);
    const before = core.serializeState(initial);
    for (const change of [
        { adultAge: .5 }, { youngAdultAge: 3 }, { fertileMinAge: 1 },
        { fertileMaxAge: 1 }, { birthInterval: 0 }, { birthChanceBps: 10001 },
        { capacityWeightBps: 0 }, { femaleFoodPerWinter: -1 },
        { maleMaterialsPerWinter: 1.5 }, { unknown: 1 },
        { mortalityBands: [] }, { mortalityBands: [{ minAge: 2, chanceBps: 0 }] },
        { mortalityBands: [{ minAge: 0, chanceBps: 0 }, { minAge: 0, chanceBps: 100 }] },
    ]) assert.throws(() => core.configureLivestock(initial, { goat: { ...profile, ...change } }),
        /livestock/i);
    for (const species of ['goat', 'dragon']) {
        const invalid = structuredClone(initial);
        invalid.landing.cattle['cattle-1'].species = species;
        assert.throws(() => core.reconstructState(JSON.stringify(invalid)), /livestock/i);
    }
    const duplicated = structuredClone(initial);
    duplicated.landing.cattleArchive = { 'cattle-1': structuredClone(duplicated.landing.cattle['cattle-1']) };
    assert.throws(() => core.reconstructState(JSON.stringify(duplicated)), /livestock/i);
    assert.equal(core.serializeState(initial), before);
});

test('a mature female breeds only with her own species and preserves parentage, cooldown and event-time identity', () => {
    let state = core.createCampaign(32, {
        cattleBirthChanceBps: 10000, cattleMortalityYoungBps: 0, cattleMortalityAdultBps: 0,
        cattleMortalityOlderBps: 0, cattleMortalityOldBps: 0,
    }, { mortalityBands: [{ minAge: 0, chanceBps: 0 }], fertilityChanceBps: 0 }, { enabled: false });
    state = core.configureLivestock(state, { goat: profile, chicken: profile });
    declareSpecies(state, { 'cattle-1': 'goat', 'cattle-2': 'chicken', 'cattle-3': 'goat' });
    state = core.advanceWinter(state);
    const born = Object.values(state.landing.cattle).filter(animal => animal.origin === 'reproduction');
    assert.equal(born.length, 1);
    assert.equal(born[0].species, 'goat');
    assert.deepEqual(born[0].parentIds, ['cattle-1', 'cattle-3']);
    const event = state.events.find(event => event.type === 'LivestockBorn');
    const identity = event.details.livestock.animals.find(animal => animal.id === born[0].id);
    assert.deepEqual([identity.name, identity.species, identity.age, identity.stage],
        ['Livestock 4', 'goat', 0, 'Young']);
    const recorded = structuredClone(event);
    state = core.advanceWinter(core.reconstructState(core.serializeState(state)));
    assert.equal(Object.values(state.landing.cattle).filter(animal => animal.origin === 'reproduction').length, 1);
    assert.equal(state.landing.cattle['cattle-1'].lastCalvingWinter, 801);
    assert.deepEqual(state.events.find(event => event.id === recorded.id), recorded);
});

test('loaded animal genealogy cannot cross species even when both profiles are valid', () => {
    let state = core.configureLivestock(core.createCampaign(32), { goat: profile, chicken: profile });
    declareSpecies(state, { 'cattle-1': 'goat', 'cattle-2': 'goat', 'cattle-3': 'goat' });
    state = core.advanceWinter(state);
    const child = Object.values(state.landing.cattle).find(animal => animal.origin === 'reproduction');
    assert.ok(child);
    for (const change of [
        altered => { altered.landing.cattle[child.id].species = 'chicken'; },
        altered => { altered.landing.cattle[child.parentIds[1]].species = 'chicken'; },
    ]) {
        const altered = structuredClone(state);
        change(altered);
        assert.throws(() => core.reconstructState(JSON.stringify(altered)), /genealogy|species/i);
    }
});

test('explicit species outputs accumulate whole Food and Materials with exact annual feeding and ledger accounting', () => {
    let state = core.createCampaign(32, {
        initialFood: 100, cattleMortalityYoungBps: 0, cattleMortalityAdultBps: 0,
        cattleMortalityOlderBps: 0, cattleMortalityOldBps: 0,
    }, { careerReviewWinters: 0, fertilityChanceBps: 0, partnershipChanceBps: 0,
        mortalityBands: [{ minAge: 0, chanceBps: 0 }] }, { enabled: false });
    state = core.configureLivestock(state, {
        goat: { ...profile, exposedProductivityBps: 10000, birthChanceBps: 0,
            maleFoodPerWinter: 2, femaleMaterialsPerWinter: 2, maleMaterialsPerWinter: 1 },
        chicken: { ...profile, adultFood: 2, femaleFoodPerWinter: 0, birthChanceBps: 0 },
    });
    for (const personaId of Object.keys(state.personas))
        state = core.applyCommand(state, { type: 'AssignOccupation', personaId, occupation: null });
    declareSpecies(state, { 'cattle-1': 'goat', 'cattle-2': 'chicken', 'cattle-3': 'goat' });
    const opening = { ...state.stocks }, start = state.events.length;
    const initial = core.serializeState(state);
    state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 500 });
    // Half a year: 2 female Food + 1 male Food; 1 female Materials + half a male unit.
    assert.deepEqual(state.stocks, { food: 103, materials: 6 });
    state = core.applyCommand(core.reconstructState(core.serializeState(state)),
        { type: 'AdvanceTicks', ticks: 500 });
    const events = state.events.slice(start);
    const output = events.filter(event => event.type === 'LivestockResourceProduced');
    assert.equal(output.filter(event => event.details.resource === 'food')
        .reduce((sum, event) => sum + event.details.units, 0), 6);
    assert.equal(output.filter(event => event.details.resource === 'materials')
        .reduce((sum, event) => sum + event.details.units, 0), 3);
    assert.ok(output.every(event => event.details.units === 1));
    assert.equal(events.find(event => event.type === 'LivestockFoodConsumed').details.required, 4);
    const ledger = bookLedger(events, opening, state.stocks);
    assert.equal(ledger.food.cattleProduction, 6);
    assert.equal(ledger.materials.cattleProduction, 3);
    assert.ok(ledger.food.complete && ledger.materials.complete);
    const whole = core.advanceWinter(core.reconstructState(initial));
    assert.equal(core.serializeState(state), core.serializeState(whole));
});

test('one mixed Farmyard uses weighted soft capacity and each species crowding risk', () => {
    let state = core.createCampaign(32, { initialMaterials: 50, farmyardCapacity: 1,
        cattleMortalityAdultBps: 0, cattleCrowdingBps: 200 }, {}, { enabled: false });
    state = core.configureLivestock(state, { chicken: { ...profile,
        capacityWeightBps: 2500, crowdingBps: 400 } });
    declareSpecies(state, { 'cattle-2': 'chicken', 'cattle-3': 'chicken' });
    state = core.applyCommand(state, { type: 'AssignOccupation', personaId: 'founder-1', occupation: 'farmer' });
    state = core.applyCommand(state, { type: 'HouseHousehold', householdId: 'founder-1' });
    for (const cattleId of Object.keys(state.landing.cattle))
        state = core.applyCommand(state, { type: 'AssignCattle', cattleId, farmyardId: 'house-1' });
    const yard = core.landingSummary(state).farmyards[0];
    assert.deepEqual([yard.occupants, yard.capacity, yard.occupancy, yard.overcrowding], [3, 1, 1.5, .5]);
    assert.equal(core.inspectLivestock(state, 'cattle-1').mortalityRiskBps, 100);
    assert.equal(core.inspectLivestock(state, 'cattle-2').mortalityRiskBps, 200);
    state = core.applyCommand(state, { type: 'SlaughterCattle', cattleId: 'cattle-3' });
    assert.equal(core.landingSummary(state).farmyards[0].occupancy, 1.25);
    assert.equal(core.inspectLivestock(state, 'cattle-2').mortalityRiskBps, 100);
    assert.deepEqual(core.reconstructState(core.serializeState(state)), state);
});

test('new cattle campaigns record versioned founding designations while preserving founder RNG and economics', () => {
    const reference = JSON.parse(readFileSync(new URL('./fixtures/livestock-legacy-218.json', import.meta.url), 'utf8'));
    const old = reference.cases.find(entry => entry.name === 'outside-17').input;
    const current = core.createCampaign(17);
    assert.deepEqual(current.landing.livestock, { version: 1, profiles: {} });
    assert.ok(Object.values(current.landing.cattle).every(animal => animal.species === 'cattle'));
    assert.deepEqual(current.personas, old.personas);
    assert.deepEqual(current.stocks, old.stocks);
    assert.deepEqual(current.landing.config, old.landing.config);
    assert.equal(current.rngState, old.rngState);
    const identity = current.events[0].details.livestock;
    assert.equal(identity.recordedClanId, current.clan.id);
    assert.deepEqual(identity.animals.map(animal => [animal.name, animal.species]),
        [['Livestock 1', 'cattle'], ['Livestock 2', 'cattle'], ['Livestock 3', 'cattle']]);
    const after = core.applyCommand(current, { type: 'SlaughterCattle', cattleId: 'cattle-1' });
    assert.equal(after.events.at(-1).details.livestock.animals[0].name, 'Livestock 1');
    assert.deepEqual(after.events[0], current.events[0]);
});

test('species mortality retains each dead animal and freezes its age and recorded designation', () => {
    let state = core.configureLivestock(core.createCampaign(32, {}, {
        mortalityBands: [{ minAge: 0, chanceBps: 0 }], fertilityChanceBps: 0,
    }, { enabled: false }), { goat: { ...profile, femaleFoodPerWinter: 0, birthChanceBps: 0,
        mortalityBands: [{ minAge: 0, chanceBps: 0 }, { minAge: 4, chanceBps: 10000 }] } });
    declareSpecies(state, { 'cattle-1': 'goat', 'cattle-2': 'goat', 'cattle-3': 'goat' });
    state = core.advanceWinter(state);
    const deaths = state.events.filter(event => event.type === 'LivestockDied');
    assert.equal(deaths.length, 3);
    assert.ok(deaths.every(event => event.details.mortalityRiskBps === 10000));
    assert.deepEqual(deaths.map(event => event.details.livestock.animals[0].name),
        ['Livestock 1', 'Livestock 2', 'Livestock 3']);
    const recorded = structuredClone(deaths);
    state = core.advanceWinter(core.reconstructState(core.serializeState(state)));
    assert.equal(Object.keys(state.landing.cattle).length, 3);
    for (const id of Object.keys(state.landing.cattle)) {
        const animal = core.inspectLivestock(state, id);
        assert.equal(animal.deathWinter, 801);
        assert.equal(animal.age, 4);
        assert.equal(animal.farmyardId, null);
    }
    assert.deepEqual(state.events.filter(event => event.type === 'LivestockDied'), recorded);
});

test('generic livestock commands assign real animals and grant stage-specific slaughter Food exactly once', () => {
    let state = core.configureLivestock(core.createCampaign(32, { initialMaterials: 50 }), {
        pig: { ...profile, youngSlaughterFood: 3, youngAdultSlaughterFood: 11, slaughterFood: 31 },
    });
    state.landing.cattle['cattle-1'].birthWinter = 800;
    state.landing.cattle['cattle-2'].birthWinter = 799;
    declareSpecies(state, { 'cattle-1': 'pig', 'cattle-2': 'pig', 'cattle-3': 'pig' });
    state = core.applyCommand(state, { type: 'AssignOccupation', personaId: 'founder-1', occupation: 'farmer' });
    state = core.applyCommand(state, { type: 'HouseHousehold', householdId: 'founder-1' });
    state = core.applyCommand(state, { type: 'AssignLivestock', livestockId: 'cattle-1', farmyardId: 'house-1' });
    assert.equal(state.landing.cattle['cattle-1'].farmyardId, 'house-1');
    assert.equal(state.events.at(-1).type, 'LivestockAssigned');
    const opening = { ...state.stocks }, start = state.events.length;
    for (const [index, food] of [3, 11, 31].entries()) {
        const id = 'cattle-' + (index + 1), before = state.stocks.food;
        state = core.applyCommand(state, { type: 'SlaughterLivestock', livestockId: id });
        assert.equal(state.stocks.food - before, food);
        const event = state.events.at(-1);
        assert.equal(event.type, 'LivestockSlaughtered');
        assert.equal(event.details.livestockId, id);
        assert.equal(event.details.livestock.animals[0].name, 'Livestock ' + (index + 1));
        assert.equal(core.inspectLivestock(state, id).species, 'pig');
        assert.throws(() => core.applyCommand(state, { type: 'SlaughterLivestock', livestockId: id }));
        state = core.reconstructState(core.serializeState(state));
    }
    const ledger = bookLedger(state.events.slice(start), opening, state.stocks);
    assert.equal(ledger.food.otherReceipts, 45);
    assert.equal(ledger.food.complete, true);
});

test('species profile setup is restricted to the saved founding phase and cannot retune a running campaign', () => {
    const winter = core.createCampaign(32);
    const summer = core.createCampaign(32, {}, {}, {}, {}, {}, {}, 'summer-800-v1');
    for (const initial of [winter, summer]) {
        const configured = core.configureLivestock(initial, { goose: profile });
        assert.deepEqual(configured.time, initial.time);
        const later = core.applyCommand(configured, { type: 'AdvanceTicks', ticks: 1 });
        const before = core.serializeState(later);
        assert.throws(() => core.configureLivestock(later, { goose: { ...profile, adultFood: 2 } }), /founding|setup/i);
        assert.equal(core.serializeState(later), before);
        assert.deepEqual(core.reconstructState(before).landing.livestock, configured.landing.livestock);
    }
});

test('existing real transfers keep local titles unique, reserve dead titles and retain source observations', () => {
    let state = core.createCampaign(32, { initialFood: 400, cattleBirthChanceBps: 0,
        cattleMortalityYoungBps: 0, cattleMortalityAdultBps: 0,
        cattleMortalityOlderBps: 0, cattleMortalityOldBps: 0 }, {
        mortalityBands: [{ minAge: 0, chanceBps: 0 }], fertilityChanceBps: 0, partnershipChanceBps: 0,
    }, { enabled: false }, {
        successBps: { Recon: 10000, Surveillance: 10000, Pillage: 10000 },
        casualtyBps: { Recon: 0, Surveillance: 0, Pillage: 0 },
    });
    const region = Object.values(state.world.regions).find(region => region.targetClanId && !region.requiresShip);
    state = core.applyCommand(state, { type: 'CreateExpeditionGroup', name: 'Group 1', memberIds: ['founder-1'] });
    state = core.applyCommand(state, { type: 'DispatchExpedition', groupId: 'group-1', regionId: region.id, mission: 'Recon' });
    state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 250 });
    const founding = structuredClone(state.world.targetClans[region.targetClanId].events[0]);
    state = core.applyCommand(state, { type: 'DispatchExpedition', groupId: 'group-1', regionId: region.id,
        mission: 'Pillage', priorities: ['Cattle'] });
    state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 500 });
    const capturedId = core.inspectWorld(state).missions.at(-1).result.cattleIds[0];
    assert.ok(capturedId);
    assert.equal(core.inspectLivestock(state, capturedId).name, 'Livestock 4');
    assert.equal(state.world.targetClans[region.targetClanId].landing.cattle[capturedId], undefined);
    state = core.applyCommand(state, { type: 'SlaughterLivestock', livestockId: 'cattle-1' });
    state = core.reconstructState(core.serializeState(state));
    state = core.applyCommand(state, { type: 'DispatchExpedition', groupId: 'group-1', regionId: region.id,
        mission: 'Pillage', priorities: ['Cattle'] });
    state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 500 });
    const secondId = core.inspectWorld(state).missions.at(-1).result.cattleIds[0];
    assert.equal(core.inspectLivestock(state, capturedId).name, 'Livestock 4');
    assert.equal(core.inspectLivestock(state, secondId).name, 'Livestock 5');
    const source = state.world.targetClans[region.targetClanId];
    const history = core.inspectLivestock(source, capturedId);
    assert.equal(history.historical, true);
    assert.equal(history.name, 'Livestock 1');
    assert.equal(history.age, 3);
    assert.deepEqual(history.observedAt, { winter: 800, tick: 750 });
    assert.deepEqual(source.events[0], founding);
    assert.equal(core.inspectLivestock(state, 'cattle-1').name, 'Livestock 1');
    assert.deepEqual(core.reconstructState(core.serializeState(state)), state);
});
