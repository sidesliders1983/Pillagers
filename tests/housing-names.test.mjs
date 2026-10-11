import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load-source.mjs';
const core = load('../src/simulation/SimulationCore.ts');
const { SharedSettlement } = load('../src/play/SharedSettlement.ts');
const { projectSettlement } = load('../src/play/SettlementView.ts');

function campaign() {
    const state = core.createCampaign(32, { initialMaterials: 500, initialFood: 500, foundingCoupleChanceBps: 0 },
        { fertilityChanceBps: 0, partnershipChanceBps: 0, careerReviewWinters: 0,
            mortalityBands: [{ minAge: 0, chanceBps: 0 }] }, { enabled: false });
    state.personas['founder-9'].name = 'Daugirdė';
    state.personas['founder-8'].name = 'Sigrid';
    const owner = new SharedSettlement(32);
    owner.importJSON(core.serializeState(state));
    return owner;
}

test('both settlement presentations identify homes and households by their residents while keys stay canonical', () => {
    const owner = campaign();
    const tent = owner.fjord.project().entities.find(e => e.kind === 'household' && e.id === 'founder-9');
    assert.equal(tent.label, 'Daugirdė’s household');
    owner.command({ type: 'BuildHouse', householdId: 'founder-9' });
    const canonical = owner.session.saveJSON();
    const house = owner.fjord.project().entities.find(e => e.kind === 'building' && e.id === 'house-1');
    assert.equal(house.label, 'Daugirdė’s home');
    assert.equal(house.selectionKey, 'building:house-1');
    assert.equal(projectSettlement(owner.session.snapshot()).entities.find(e => e.id === 'house-1').label, 'Daugirdė’s home');
    assert.equal(owner.session.saveJSON(), canonical);
});

test('new book references freeze event-time resident designations through moves and save/load', () => {
    const { projectChronicle } = load('../src/lore/Chronicle.ts');
    const owner = campaign();
    owner.command({ type: 'BuildHouse', householdId: 'founder-9' });
    owner.command({ type: 'SpecializeBuilding', buildingId: 'house-1', occupation: 'farmer' });
    owner.command({ type: 'UpgradeBuilding', buildingId: 'house-1' });
    owner.command({ type: 'AssignResidence', householdId: 'founder-9', residenceId: null });
    owner.command({ type: 'AssignResidence', householdId: 'founder-8', residenceId: 'house-1' });
    const entries = projectChronicle(owner.session.snapshot().events).flatMap(group => group.entries);
    assert.equal(entries.find(e => e.templateId === 'HouseBuilt').text,
        'Daugirdė’s home was completed for Daugirdė’s household for 10 Materials.');
    assert.equal(entries.find(e => e.templateId === 'BuildingUpgraded').text,
        'Daugirdė’s home reached upgrade level 1 for 5 Materials.');
    assert.equal(entries.filter(e => e.templateId === 'ResidenceAssigned').at(-1).text,
        'Sigrid’s household moved to Sigrid’s home.');
    assert.equal(owner.fjord.project().entities.find(e => e.id === 'house-1').label, 'Sigrid’s home');
    owner.command({ type: 'AdvanceTicks', ticks: 5000 });
    const chapter = owner.session.book.snapshot().chapters[1];
    assert.ok(chapter.text.includes('Daugirdė’s home was completed'));
    const restored = SharedSettlement.restore(owner.handoff('board'), 'board');
    assert.deepEqual(restored.session.book.snapshot(), owner.session.book.snapshot());
    const renamed = restored.session.snapshot();
    renamed.personas['founder-9'].name = 'Later name';
    assert.equal(projectChronicle(renamed.events).flatMap(group => group.entries)
        .find(e => e.templateId === 'HouseBuilt').text, entries.find(e => e.templateId === 'HouseBuilt').text);
    assert.equal(chapter.facts.ledger.materials.otherSpending >= 15, true);
});

test('salvage and collapse record the occupied home name before deleting or converting it', () => {
    const { projectChronicle } = load('../src/lore/Chronicle.ts');
    const owner = campaign();
    owner.command({ type: 'BuildHouse', householdId: 'founder-9' });
    owner.command({ type: 'SalvageBuilding', buildingId: 'house-1' });
    assert.equal(projectChronicle(owner.session.snapshot().events).flatMap(g => g.entries)
        .find(e => e.templateId === 'BuildingSalvaged').text, 'Daugirdė’s home was salvaged for 5 Materials.');
    const collapse = campaign();
    collapse.command({ type: 'BuildHouse', householdId: 'founder-9' });
    const state = collapse.session.snapshot();
    state.stocks.materials = 0;
    state.mechanics.config.collapseDebtWinters = 1;
    state.mechanics.config.baseUpkeep = 10000;
    const next = core.applyCommand(state, { type: 'AdvanceWinter' });
    assert.equal(projectChronicle(next.events).flatMap(g => g.entries)
        .find(e => e.templateId === 'BuildingCollapsed').text, 'Daugirdė’s home collapsed; 5 Materials were salvaged.');
    assert.equal(next.buildings['house-1'], undefined);
    assert.equal(next.residences['house-1'].kind, 'tent');
});

test('equal readable names keep distinct canonical homes and names include every household member', () => {
    const owner = campaign();
    const initial = owner.session.snapshot();
    initial.personas['founder-8'].name = 'Daugirdė';
    owner.importJSON(core.serializeState(initial));
    owner.command({ type: 'BuildHouse', householdId: 'founder-9' });
    owner.command({ type: 'BuildHouse', householdId: 'founder-8' });
    const homes = owner.fjord.project().entities.filter(e => e.kind === 'building');
    assert.deepEqual(homes.map(e => e.label), ['Daugirdė’s home', 'Daugirdė’s home']);
    assert.deepEqual(homes.map(e => e.selectionKey), ['building:house-1', 'building:house-2']);
    const withFamily = owner.session.snapshot();
    withFamily.households['founder-9'].memberIds.push('founder-8');
    withFamily.households['founder-8'].memberIds = [];
    withFamily.personas['founder-8'].householdId = 'founder-9';
    withFamily.personas['founder-8'].name = 'Sigrid';
    owner.importJSON(core.serializeState(withFamily));
    owner.command({ type: 'SpecializeBuilding', buildingId: 'house-1', occupation: 'farmer' });
    assert.equal(owner.fjord.project().entities.find(e => e.id === 'house-1').label,
        'Daugirdė and Sigrid’s home');
    owner.command({ type: 'UpgradeBuilding', buildingId: 'house-1' });
    const { projectChronicle } = load('../src/lore/Chronicle.ts');
    assert.equal(projectChronicle(owner.session.snapshot().events).flatMap(g => g.entries)
        .find(e => e.templateId === 'BuildingUpgraded').text,
        'Daugirdė and Sigrid’s home reached upgrade level 1 for 5 Materials.');
});

test('old published prose is immutable while new recorded events use the readable designation', () => {
    const owner = campaign();
    owner.command({ type: 'BuildHouse', householdId: 'founder-9' });
    owner.command({ type: 'AdvanceTicks', ticks: 5000 });
    const legacy = JSON.parse(owner.fjord.exportJSON());
    const text = 'Permanent home house-1 was completed for household founder-9 for 10 Materials.';
    legacy.narrative.chapters[1].text = text;
    owner.importJSON(JSON.stringify(legacy));
    owner.command({ type: 'SpecializeBuilding', buildingId: 'house-1', occupation: 'farmer' });
    owner.command({ type: 'UpgradeBuilding', buildingId: 'house-1' });
    owner.command({ type: 'AdvanceTicks', ticks: 5000 });
    assert.equal(owner.session.book.snapshot().chapters[1].text, text);
    assert.ok(owner.session.book.snapshot().chapters[2].text.includes('Daugirdė’s home reached upgrade'));
    assert.equal(SharedSettlement.restore(owner.persist(), 'fjord').session.book.snapshot().chapters[1].text, text);
});

test('incomplete or mismatched historical housing snapshots stay neutral and keep provenance', () => {
    const { projectChronicle } = load('../src/lore/Chronicle.ts');
    const events = [undefined, { version: 1, building: { id: 'house-2', name: 'Wrong owner’s home' } },
        { version: 2, building: { id: 'house-1', name: 'Unknown version’s home' } }]
        .map((housingNames, i) => ({ id: 'record-' + i, type: 'HouseBuilt', time: { winter: 800, tick: 0 },
            details: { buildingId: 'house-1', householdId: 'founder-9', cost: 10, housingNames } }));
    const entries = projectChronicle(events)[0].entries;
    assert.deepEqual(entries.map(e => e.text), Array(3).fill('A permanent home was completed for a household for 10 Materials.'));
    assert.deepEqual(entries.map(e => e.sourceEventIds), [['record-0'], ['record-1'], ['record-2']]);
});
