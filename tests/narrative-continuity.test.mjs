import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load-source.mjs';
const core = load('../src/simulation/SimulationCore.ts');
const { SharedSettlement } = load('../src/play/SharedSettlement.ts');

function quietCampaign() {
    const owner = new SharedSettlement(32);
    owner.importJSON(core.serializeState(core.createCampaign(32,
        { initialFood: 1000, initialMaterials: 1000, foundingCoupleChanceBps: 0,
            cattleBirthChanceBps: 0, cattleMortalityYoungBps: 0, cattleMortalityAdultBps: 0,
            cattleMortalityOlderBps: 0, cattleMortalityOldBps: 0 },
        { fertilityChanceBps: 0, partnershipChanceBps: 0, careerReviewWinters: 0,
            mortalityBands: [{ minAge: 0, chanceBps: 0 }] }, { enabled: false })));
    return owner;
}

test('a later saved chapter retrieves the same home construction beyond four earlier intervals', () => {
    const owner = quietCampaign();
    owner.command({ type: 'BuildHouse', householdId: 'founder-9' });
    owner.command({ type: 'SpecializeBuilding', buildingId: 'house-1', occupation: 'woodworker' });
    const built = owner.session.snapshot().events.find(event => event.type === 'HouseBuilt');
    owner.command({ type: 'AdvanceTicks', ticks: 20000 });
    const earlier = owner.session.book.snapshot().chapters.map(chapter => chapter.text);
    owner.command({ type: 'UpgradeBuilding', buildingId: 'house-1' });
    const upgraded = owner.session.snapshot().events.find(event => event.type === 'BuildingUpgraded');
    owner.command({ type: 'AdvanceTicks', ticks: 5000 });
    const chapter = owner.session.book.snapshot().chapters.at(-1);
    assert.ok(chapter.plan, 'The saved book exposes its factual chapter plan');
    assert.ok(chapter.plan.callbackEventIds.includes(built.id));
    assert.match(chapter.text, /In the winter the founding party arrived/);
    assert.ok(chapter.text.includes(built.details.housingNames.building.name));
    assert.ok(chapter.plan.sourceEventIds.includes(upgraded.id));
    assert.match(chapter.text, /same home|same building/);
    assert.match(chapter.text, /twenty winters after its construction/);
    assert.ok(!chapter.sourceEventIds.includes(built.id), 'Older callbacks are not current accounting sources');
    assert.deepEqual(owner.session.book.snapshot().chapters.slice(0, -1).map(chapter => chapter.text), earlier);
    const canonical = owner.session.saveJSON();
    const restored = SharedSettlement.restore(owner.persist(), 'fjord');
    assert.deepEqual(restored.session.book.snapshot(), owner.session.book.snapshot());
    assert.equal(restored.session.saveJSON(), canonical);
});


test('older prose is not factual memory and a changed name keeps the birth tied to the same resident', () => {
    let state = core.createCampaign(32, { initialFood: 5000, initialMaterials: 1000,
        cattleBirthChanceBps: 0 }, { fertilityChanceBps: 10000, partnershipChanceBps: 0,
        careerReviewWinters: 0, mortalityBands: [{ minAge: 0, chanceBps: 0 }] }, { enabled: false });
    state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 1000 });
    const birth = state.events.find(event => event.type === 'ChildBorn');
    assert.ok(birth);
    state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 18000 });
    state.personas[birth.personaId].name = 'Later Name';
    const anotherChild = Object.values(state.personas).find(person => person.id !== birth.personaId && person.parentIds.length);
    if (anotherChild) state.personas[anotherChild.id].name = 'Later Name';
    const owner = new SharedSettlement(32);
    owner.importJSON(core.serializeState(state));
    const envelope = JSON.parse(owner.fjord.exportJSON());
    envelope.narrative.chapters[0].text = 'A made-up mentor taught Later Name in a made-up forge.';
    owner.importJSON(JSON.stringify(envelope));
    owner.command({ type: 'AssignOccupation', personaId: birth.personaId, occupation: 'smith' });
    owner.command({ type: 'AdvanceTicks', ticks: 1000 });
    const chapter = owner.session.book.snapshot().chapters.at(-1);
    assert.ok(chapter.plan.callbackEventIds.includes(birth.id));
    assert.ok(chapter.text.includes('The same resident had been recorded as ' + birth.details.name));
    assert.ok(chapter.text.includes('Later Name became a smith'));
    assert.doesNotMatch(chapter.text, /made-up|mentor|forge/);
    assert.equal(owner.session.book.snapshot().chapters[0].text, envelope.narrative.chapters[0].text);
    owner.command({ type: 'AssignOccupation', personaId: birth.personaId, occupation: null });
    owner.command({ type: 'AdvanceTicks', ticks: 5000 });
    const released = owner.session.book.snapshot().chapters.at(-1).text;
    assert.match(released, /no longer had an assigned occupation/);
    assert.doesNotMatch(released, /between the birth and the new occupation/);
});


test('a foreign callback or a future source in a saved chapter is rejected atomically', () => {
    const owner = quietCampaign();
    owner.command({ type: 'BuildHouse', householdId: 'founder-9' });
    owner.command({ type: 'SpecializeBuilding', buildingId: 'house-1', occupation: 'woodworker' });
    owner.command({ type: 'AdvanceTicks', ticks: 5000 });
    owner.command({ type: 'UpgradeBuilding', buildingId: 'house-1' });
    owner.command({ type: 'AdvanceTicks', ticks: 5000 });
    const original = owner.fjord.exportJSON();
    const envelope = JSON.parse(original);
    envelope.narrative.chapters[1].plan.callbackEventIds = [owner.session.snapshot().events.at(-1).id];
    assert.throws(() => owner.importJSON(JSON.stringify(envelope)), /Clan Book/);
    assert.equal(owner.fjord.exportJSON(), original);
});


test('a fresh opening uses the reviewed voice with frozen shelter, existing couples and English occupation labels', () => {
    const owner = new SharedSettlement(32);
    const opening = owner.session.book.snapshot().chapters[0];
    assert.equal(opening.templateVersion, 4);
    assert.ok(owner.session.book.snapshot().memory.recent[0].paragraphIds.includes(opening.paragraphs[0].templateId));
    assert.ok(opening.paragraphs.length >= 3);
    assert.ok(opening.text.includes('already partners'));
    assert.ok(opening.text.includes('tent'));
    assert.doesNotMatch(opening.text, /textileWorker|leatherAndJewelleryMaker|longship\(s\)|founder-\d/);
    const before = opening.text;
    owner.command({ type: 'SalvageLongship', longshipId: 'founding-longship' });
    assert.equal(owner.session.book.snapshot().chapters[0].text, before);
    assert.equal(owner.session.book.snapshot().styleVersion, 4);
});


test('narrative seeds vary the same opening and retain sourced planning memory through reload', () => {
    const texts = [];
    const canonical = new SharedSettlement(32).session.saveJSON();
    for (let seed = 0; seed < 16; seed++) {
        const owner = new SharedSettlement(32, seed);
        texts.push(owner.session.book.snapshot().chapters[0].text);
        assert.equal(owner.session.saveJSON(), canonical);
        assert.equal(new SharedSettlement(32, seed).session.book.snapshot().chapters[0].text, texts.at(-1));
    }
    assert.ok(new Set(texts).size >= 8, 'Variation changes complete paragraph structures');
    const owner = new SharedSettlement(32, 7);
    owner.command({ type: 'SalvageLongship', longshipId: 'founding-longship' });
    owner.command({ type: 'AdvanceTicks', ticks: 5000 });
    const book = owner.session.book.snapshot();
    assert.ok(book.memory.featuredEventIds.includes(owner.session.snapshot().events.find(event => event.type === 'FoundingLongshipSalvaged').id));
    assert.ok(book.memory.recent.length <= 3);
    assert.deepEqual(SharedSettlement.restore(owner.persist(), 'fjord').session.book.snapshot(), book);
});


test('quiet chapters avoid recent opening and ending reuse, and published paragraphs keep their provenance', () => {
    const owner = quietCampaign();
    owner.command({ type: 'AdvanceTicks', ticks: 20000 });
    const chapters = owner.session.book.snapshot().chapters.slice(1);
    assert.equal(new Set(chapters.map(chapter => chapter.text)).size, 4);
    for (let index = 1; index < chapters.length; index++) {
        assert.notEqual(chapters[index].paragraphs[0].templateId, chapters[index - 1].paragraphs[0].templateId);
        assert.notEqual(chapters[index].paragraphs.at(-1).templateId, chapters[index - 1].paragraphs.at(-1).templateId);
    }
    assert.ok(chapters.every(chapter => /no (?:recorded )?birth/i.test(chapter.text)));
    const saved = JSON.parse(owner.fjord.exportJSON());
    saved.narrative.chapters[1].paragraphs[0].sourceEventIds.push('a-foreign-event');
    assert.throws(() => owner.importJSON(JSON.stringify(saved)), /Clan Book/);
});


test('an already published body is not published again even when old prose was edited', () => {
    const owner = quietCampaign();
    owner.command({ type: 'AdvanceTicks', ticks: 5000 });
    const previous = owner.fjord.exportJSON();
    const preview = new SharedSettlement(32);
    preview.importJSON(previous);
    preview.command({ type: 'AdvanceTicks', ticks: 5000 });
    const expectedBody = preview.session.book.snapshot().chapters.at(-1).text;
    const saved = JSON.parse(previous);
    saved.narrative.chapters[0].text = expectedBody;
    owner.importJSON(JSON.stringify(saved));
    owner.command({ type: 'AdvanceTicks', ticks: 5000 });
    const book = owner.session.book.snapshot();
    assert.notEqual(book.chapters.at(-1).text, expectedBody);
    assert.equal(book.chapters[0].text, expectedBody, 'Previously published text is not rewritten');
});


test('a founder death recalls arrival without inventing a cause or turning an unknown ritual into a fact', () => {
    const owner = new SharedSettlement(32);
    const state = core.createCampaign(32, {},
        { mortalityBands: [{ minAge: 0, chanceBps: 10000 }] }, { enabled: false });
    const unknownId = 'event-' + (state.events.length + 1);
    state.events.push({ id: unknownId, type: 'FutureWedding', time: { ...state.time },
        details: { dialogue: 'The gods promised a great harvest', participants: ['founder-1', 'founder-2'] } });
    owner.importJSON(core.serializeState(state));
    owner.command({ type: 'AdvanceTicks', ticks: 5000 });
    const chapter = owner.session.book.snapshot().chapters.at(-1);
    const arrival = state.events.find(event => event.type === 'FoundingPartyLanded');
    assert.ok(chapter.plan.callbackEventIds.includes(arrival.id));
    assert.match(chapter.text, /had been among the founding party/);
    assert.doesNotMatch(chapter.text, /gods|promised|Wedding|illness|funeral|storm killed/);
    assert.equal(chapter.facts.demographics.filter(event => event.type === 'PersonaDied').length, 10);
    assert.equal(owner.session.snapshot().events.find(event => event.id === unknownId).details.dialogue,
        'The gods promised a great harvest');
});


test('a later complete Food account recalls an earlier shortage without recounting its transactions', () => {
    const state = core.createCampaign(32, { initialFood: 0, initialMaterials: 1000, cattleBirthChanceBps: 0,
        cattleMortalityYoungBps: 0, cattleMortalityAdultBps: 0, cattleMortalityOlderBps: 0, cattleMortalityOldBps: 0 },
        { fertilityChanceBps: 0, partnershipChanceBps: 0, careerReviewWinters: 0,
            mortalityBands: [{ minAge: 0, chanceBps: 0 }] }, { enabled: false });
    const owner = new SharedSettlement(32);
    owner.importJSON(core.serializeState(state));
    for (const persona of Object.values(state.personas))
        owner.command({ type: 'AssignOccupation', personaId: persona.id, occupation: 'woodworker' });
    owner.command({ type: 'AdvanceTicks', ticks: 5000 });
    const shortage = owner.session.book.snapshot().chapters[1];
    assert.equal(shortage.facts.ledger.food.closing, 0);
    assert.ok(shortage.facts.ledger.food.unmetNeed > 0);
    for (const persona of Object.values(state.personas))
        owner.command({ type: 'AssignOccupation', personaId: persona.id, occupation: 'farmer' });
    owner.command({ type: 'AdvanceTicks', ticks: 5000 });
    const chapter = owner.session.book.snapshot().chapters.at(-1);
    assert.ok(chapter.facts.ledger.food.closing > 0);
    assert.equal(chapter.facts.ledger.food.unmetNeed, 0);
    assert.match(chapter.text, /Five years earlier, the Food stores had been empty/);
    const account = chapter.paragraphs.find(paragraph => paragraph.factRefs.includes('chapters.1.ledger.food'));
    assert.ok(account);
    assert.ok(shortage.facts.ledger.transactions.some(transaction => account.sourceEventIds.includes(transaction.eventId)));
    assert.ok(!shortage.facts.ledger.transactions.some(transaction => chapter.sourceEventIds.includes(transaction.eventId)));
    assert.deepEqual(SharedSettlement.restore(owner.persist(), 'fjord').session.book.snapshot(), owner.session.book.snapshot());
    const saved = JSON.parse(owner.fjord.exportJSON());
    saved.narrative.chapters[2].paragraphs.at(-1).factRefs.push('chapters.99.ledger.food');
    assert.throws(() => owner.importJSON(JSON.stringify(saved)), /Clan Book/);
});


test('an expedition return recalls its own earlier departure across the checkpoint', () => {
    const owner = quietCampaign();
    owner.command({ type: 'AdvanceTicks', ticks: 4900 });
    const region = Object.values(owner.session.snapshot().world.regions).find(region => region.targetClanId && !region.requiresShip);
    owner.command({ type: 'CreateExpeditionGroup', name: 'The Western Crew', memberIds: ['founder-1'] });
    owner.command({ type: 'DispatchExpedition', groupId: 'group-1', regionId: region.id, mission: 'Recon' });
    const departure = owner.session.snapshot().events.find(event => event.type === 'ExpeditionDeparted');
    owner.command({ type: 'AdvanceTicks', ticks: 5100 });
    const chapter = owner.session.book.snapshot().chapters.at(-1);
    const returned = owner.session.snapshot().events.find(event => event.type === 'ExpeditionReturned');
    assert.equal(returned.details.missionId, departure.details.missionId);
    assert.ok(chapter.plan.callbackEventIds.includes(departure.id));
    assert.ok(chapter.text.includes('The Western Crew'));
    assert.match(chapter.text, /reconnaissance expedition/);
    assert.ok(!chapter.text.includes(region.id), 'Technical region identities stay in provenance');
    assert.doesNotMatch(chapter.text, /bravely|sword|battle|storm sank|witness/);
    assert.ok(!chapter.sourceEventIds.includes(departure.id));
});


test('a calf recalls its own mother assignment without exposing animal IDs as names', () => {
    const owner = new SharedSettlement(32);
    const state = core.createCampaign(32, { initialFood: 1000, initialMaterials: 1000,
        cattleBirthChanceBps: 10000, cattleFertileMinAge: 8, cattleCrowdingBps: 0,
        cattleMortalityYoungBps: 0, cattleMortalityAdultBps: 0, cattleMortalityOlderBps: 0, cattleMortalityOldBps: 0 },
        { fertilityChanceBps: 0, partnershipChanceBps: 0, careerReviewWinters: 0,
            mortalityBands: [{ minAge: 0, chanceBps: 0 }] }, { enabled: false });
    owner.importJSON(core.serializeState(state));
    owner.command({ type: 'AssignOccupation', personaId: 'founder-9', occupation: 'farmer' });
    owner.command({ type: 'BuildHouse', householdId: 'founder-9' });
    for (const cattleId of ['cattle-1', 'cattle-2', 'cattle-3'])
        owner.command({ type: 'AssignCattle', cattleId, farmyardId: 'house-1' });
    owner.command({ type: 'AdvanceTicks', ticks: 10000 });
    const chapter = owner.session.book.snapshot().chapters.at(-1);
    const birth = owner.session.snapshot().events.find(event => event.type === 'CattleBorn' &&
        chapter.plan.sourceEventIds.includes(event.id));
    assert.ok(birth);
    const mother = owner.session.snapshot().events.find(event => event.type === 'CattleAssigned' &&
        event.details.cattleId === birth.details.parentIds[0]);
    assert.ok(chapter.plan.callbackEventIds.includes(mother.id));
    assert.match(chapter.text, /calf/);
    assert.match(chapter.text, /same Farmyard as its mother/);
    assert.doesNotMatch(chapter.text, /cattle-\d|animal .*healthy|happy/);
});


test('recent opening avoidance compares actual wording, not just paragraph identifiers', () => {
    const owner = quietCampaign();
    const openings = [], endings = [];
    for (let index = 0; index < 4; index++) {
        owner.command({ type: 'AssignOccupation', personaId: 'founder-9', occupation: null });
        owner.command({ type: 'AssignOccupation', personaId: 'founder-9', occupation: 'woodworker' });
        owner.command({ type: 'AdvanceTicks', ticks: 5000 });
        const opening = owner.session.book.snapshot().chapters.at(-1).text.split('\n\n')[0].replace(/\b\d+\b/g, '#');
        assert.ok(!openings.slice(-2).includes(opening), 'A new template ID cannot disguise repeated opening wording');
        openings.push(opening);
        const ending = owner.session.book.snapshot().chapters.at(-1).text.split(/(?<=\.)\s+/).at(-1).replace(/\b\d+\b/g, '#');
        assert.ok(!endings.slice(-2).includes(ending), 'Recent endings must also change their actual wording');
        endings.push(ending);
    }
});

test('livestock passages group slaughter by stage and quantity while preserving exact factual receipts', () => {
    const owner = quietCampaign();
    const state = owner.session.snapshot();
    state.landing.cattle['cattle-1'].birthWinter = 800;
    state.landing.cattle['cattle-2'].birthWinter = 799;
    owner.importJSON(core.serializeState(state));
    const before = owner.session.saveJSON();
    const commands = ['cattle-1', 'cattle-2', 'cattle-3'].map(cattleId => ({ type: 'SlaughterCattle', cattleId }));
    for (const command of commands) owner.command(command);
    owner.command({ type: 'AdvanceTicks', ticks: 5000 });
    const chapter = owner.session.book.snapshot().chapters.at(-1);
    assert.match(chapter.text, /[Oo]ne calf, one heifer and one adult bull were slaughtered/);
    assert.doesNotMatch(chapter.text, /cattle-\d|Animal|\d+ (?:Food|Materials)|healthy|happy|beloved/);
    assert.equal(chapter.facts.ledger.food.otherReceipts, 30);
    assert.deepEqual(chapter.facts.demographics.filter(event => event.type === 'CattleSlaughtered')
        .map(event => event.details.food), [5, 10, 15]);
    let expected = core.reconstructState(before);
    for (const command of [...commands, { type: 'AdvanceTicks', ticks: 5000 }]) expected = core.applyCommand(expected, command);
    assert.equal(owner.session.saveJSON(), core.serializeState(expected));
    assert.deepEqual(SharedSettlement.restore(owner.persist(), 'fjord').session.book.snapshot(), owner.session.book.snapshot());
});

test('a grouped birth passage counts every calf even when more than four cattle events occur', () => {
    const owner = quietCampaign();
    const state = owner.session.snapshot();
    state.landing.config.cattleBirthChanceBps = 10000;
    state.landing.config.cattleBirthInterval = 10;
    state.landing.config.cattleFertileMinAge = 8;
    for (const animal of Object.values(state.landing.cattle)) animal.birthWinter = 792;
    for (let index = 4; index <= 6; index++) state.landing.cattle['cattle-' + index] = {
        ...structuredClone(state.landing.cattle['cattle-1']), id: 'cattle-' + index
    };
    owner.importJSON(core.serializeState(state));
    owner.command({ type: 'AdvanceTicks', ticks: 5000 });
    const chapter = owner.session.book.snapshot().chapters.at(-1);
    const births = chapter.facts.demographics.filter(event => event.type === 'CattleBorn');
    assert.equal(births.length, 5);
    assert.match(chapter.text, /[Ff]ive calves were born/);
    assert.equal((chapter.text.match(/were born/g) ?? []).length, 1);
    assert.ok(births.every(event => chapter.paragraphs.some(paragraph => paragraph.sourceEventIds.includes(event.eventId))));
    assert.doesNotMatch(chapter.text, /cattle-\d|mother|owned|healthy|\d+ (?:Food|Materials)/);
    assert.deepEqual(SharedSettlement.restore(owner.persist(), 'fjord').session.book.snapshot(), owner.session.book.snapshot());
});

test('livestock wording uses event-time ages and the saved lifecycle thresholds, including the opening', () => {
    const fresh = new SharedSettlement(32, 7);
    assert.match(fresh.session.book.snapshot().chapters[0].text, /two adult cows and one adult bull/);
    assert.doesNotMatch(fresh.session.book.snapshot().chapters[0].text, /\d+ (?:Food|Materials)/);
    const owner = quietCampaign();
    const state = owner.session.snapshot();
    state.landing.config.cattleAdultAge = 5;
    state.landing.config.cattleFertileMinAge = 5;
    owner.importJSON(core.serializeState(state));
    owner.command({ type: 'SlaughterCattle', cattleId: 'cattle-1' });
    owner.command({ type: 'AdvanceTicks', ticks: 5000 });
    const chapter = owner.session.book.snapshot().chapters.at(-1);
    assert.match(chapter.text, /[Oo]ne heifer was slaughtered/);
    assert.doesNotMatch(chapter.text, /adult cow/);
    assert.equal(chapter.facts.ledger.food.otherReceipts, 10);
});

test('a plain imported founding account leaves exact salvage amounts in factual sources', () => {
    const state = core.applyCommand(core.createCampaign(32), { type: 'SalvageLongship', longshipId: 'founding-longship' });
    const owner = new SharedSettlement(32);
    owner.importJSON(core.serializeState(state));
    const chapter = owner.session.book.snapshot().chapters[0];
    assert.match(chapter.text, /[Oo]ur longship was salvaged/);
    assert.doesNotMatch(chapter.text, /\d+ (?:Food|Materials)/);
    assert.equal(owner.session.snapshot().events.find(event => event.type === 'FoundingLongshipSalvaged').details.materials, 20);
    assert.equal(chapter.facts.recordedReceipts[0].units, 20);
    assert.deepEqual(SharedSettlement.restore(owner.persist(), 'fjord').session.book.snapshot(), owner.session.book.snapshot());
});

test('repeated assignment records never turn one cow into two livestock in a passage', () => {
    const owner = quietCampaign();
    owner.command({ type: 'AssignOccupation', personaId: 'founder-9', occupation: 'farmer' });
    owner.command({ type: 'BuildHouse', householdId: 'founder-9' });
    owner.command({ type: 'AssignCattle', cattleId: 'cattle-1', farmyardId: 'house-1' });
    owner.command({ type: 'AssignCattle', cattleId: 'cattle-1', farmyardId: 'house-1' });
    owner.command({ type: 'AdvanceTicks', ticks: 5000 });
    const chapter = owner.session.book.snapshot().chapters.at(-1);
    const assignments = chapter.plan.sourceEventIds.filter(id =>
        owner.session.snapshot().events.find(event => event.id === id)?.type === 'CattleAssigned');
    assert.equal(assignments.length, 2);
    assert.match(chapter.text, /[Oo]ne adult cow was assigned to the Farmyard/);
    assert.doesNotMatch(chapter.text, /two adult cows/);
});

test('collapse salvage is qualitative in the passage and exact in its factual ledger', () => {
    const owner = quietCampaign();
    const state = owner.session.snapshot();
    state.mechanics.config.collapseDebtWinters = 1;
    owner.importJSON(core.serializeState(state));
    owner.command({ type: 'BuildHouse', householdId: 'founder-9' });
    owner.command({ type: 'AdvanceTicks', ticks: 5000 });
    owner.command({ type: 'AssignResidence', householdId: 'founder-9', residenceId: null });
    owner.command({ type: 'AdvanceTicks', ticks: 5000 });
    const chapter = owner.session.book.snapshot().chapters.at(-1);
    assert.match(chapter.text, /collapsed; some Materials were salvaged/);
    assert.doesNotMatch(chapter.text, /\d+ (?:Food|Materials)/);
    assert.equal(chapter.facts.ledger.materials.otherReceipts, 5);
});
