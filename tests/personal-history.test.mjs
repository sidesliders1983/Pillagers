import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTypeScript } from '../scripts/load-typescript.mjs';
const core = loadTypeScript(new URL('../src/simulation/SimulationCore.ts', import.meta.url));
const history = loadTypeScript(new URL('../src/lore/PersonalHistory.ts', import.meta.url));
const quiet = { fertilityChanceBps: 0, partnershipChanceBps: 0, careerReviewWinters: 0 };
test('personal involvement uses typed canonical IDs, never matching names, context people or housing IDs', () => {
    let state = core.createSettlement(41, quiet);
    state.personas.einar.name = 'Same name';
    state.personas.liv.name = 'Same name';
    state = core.applyCommand(state, { type: 'AssignOccupation', personaId: 'einar', occupation: 'woodworker' });
    const source = state.events.at(-1);
    source.details.people.push({ id: 'liv', name: 'Same name', age: 30 });
    state.events.push({ id: 'event-' + (state.events.length + 1), type: 'HouseBuilt', time: { ...state.time },
        details: { buildingId: 'liv', householdId: 'einar', cost: 10 } });
    state = core.reconstructState(JSON.stringify(state));
    const own = history.projectPersonalHistory(state, 'einar');
    assert.equal(own.records.length, 1);
    assert.equal(own.records[0].sourceEventId, source.id);
    assert.match(own.records[0].text, /Same name became a woodworker/);
    assert.deepEqual(own.records[0].roles, ['resident']);
    assert.equal(history.projectPersonalHistory(state, 'liv').records.length, 0);
    assert.equal(history.projectPersonalHistory(state, 'astrid').records.length, 0);
});
test('shared births and partnerships keep the same source identity and event-time names after later changes', () => {
    let state = core.createSettlement(41, { ...quiet, childcareWinters: 0, fertilityChanceBps: 10000, mortalityBands: [{ minAge: 0, chanceBps: 0 }] });
    state.stocks.food = 100;
    state.stocks.materials = 100;
    state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 3000 });
    const birth = state.events.find(event => event.type === 'ChildBorn');
    assert.ok(birth);
    state.personas.liv.name = 'Renamed later';
    const child = history.projectPersonalHistory(state, birth.personaId);
    assert.equal(child.records.length, 1);
    assert.equal(child.records[0].sourceEventId, birth.id);
    assert.deepEqual(child.records[0].roles, ['child']);
    for (const id of birth.details.parentIds) {
        const view = history.projectPersonalHistory(state, id);
        const record = view.records.find(record => record.sourceEventId === birth.id);
        assert.ok(record);
        assert.deepEqual(record.roles, ['parent']);
        assert.match(record.text, /Einar and Liv/);
        assert.doesNotMatch(record.text, /Renamed later/);
        assert.deepEqual(record.time, { winter: 803, tick: 0 });
    }
    assert.equal(history.projectPersonalHistory(state, 'astrid').records.length, 0);
    const landed = core.createCampaign(32);
    const partnership = landed.events.find(event => event.type === 'FoundingPartnershipPresent');
    for (const id of partnership.details.participants) {
        const records = history.projectPersonalHistory(landed, id).records;
        assert.ok(records.some(record => record.sourceEventId === partnership.id));
        assert.ok(records.some(record => record.sourceEventId === 'event-1'));
    }
});
test('housing records freeze affected residents before later moves and demolition; unknown old attribution stays partial', () => {
    const { GameplaySession } = loadTypeScript(new URL('../src/gameplay-lab/GameplaySession.ts', import.meta.url));
    const session = new GameplaySession(41, 1, false);
    let state = core.createSettlement(41, quiet);
    state.stocks.materials = 100;
    session.loadJSON(core.serializeState(state));
    session.command({ type: 'BuildHouse', householdId: 'home' });
    const built = session.snapshot().events.find(event => event.type === 'HouseBuilt');
    assert.deepEqual(built.details.housingResidents.residentIds, ['einar', 'liv', 'astrid']);
    state = session.snapshot();
    state.households.home.memberIds = ['liv', 'astrid'];
    state.households.moved = { id: 'moved', memberIds: ['einar'], residenceId: null };
    session.loadJSON(core.serializeState(state));
    session.command({ type: 'SpecializeBuilding', buildingId: 'house-1', occupation: 'woodworker' });
    session.command({ type: 'UpgradeBuilding', buildingId: 'house-1' });
    session.command({ type: 'SalvageBuilding', buildingId: 'house-1' });
    state = session.snapshot();
    const salvage = state.events.find(event => event.type === 'BuildingSalvaged');
    assert.deepEqual(salvage.details.housingResidents.residentIds, ['liv', 'astrid']);
    const einar = history.projectPersonalHistory(state, 'einar');
    assert.ok(einar.records.some(record => record.sourceEventId === built.id));
    assert.equal(einar.records.some(record => record.sourceEventId === salvage.id), false);
    assert.ok(history.projectPersonalHistory(state, 'liv').records.some(record => record.sourceEventId === salvage.id));
    const legacy = structuredClone(state);
    for (const event of legacy.events)
        delete event.details?.housingResidents;
    const partial = history.projectPersonalHistory(legacy, 'einar');
    assert.equal(partial.records.some(record => record.sourceEventId === built.id), false);
    assert.equal(partial.partialAttribution, true);
});
test('actual social participants retain distinct disputant/helper roles and attempt versus success', () => {
    function run(success) {
        let state = core.createSettlement(41, { ...quiet, childcareWinters: 0, mortalityBands: [{ minAge: 0, chanceBps: 0 }] }, { enabled: true, quarrelMinBps: 10000, quarrelMaxBps: 10000, mediationMinBps: 10000, mediationMaxBps: 10000,
            mediationSuccessBps: success ? 10000 : 0, reconciliationMinBps: 0, reconciliationMaxBps: 0 });
        state.personas.astrid.birthWinter = 780;
        state.personas.astrid.dna.age = 20;
        state.mechanics.people.liv.lastBirthWinter = 780;
        state.mechanics.people.liv.childcareUntilWinter = 780;
        state.stocks.food = 0;
        state.stocks.materials = 100;
        return core.applyCommand(core.reconstructState(JSON.stringify(state)), { type: 'AdvanceTicks', ticks: 2000 });
    }
    const success = run(true), attempt = success.events.find(event => event.type === 'MediationAttempted');
    const opening = success.events.find(event => event.type === 'ResidentQuarrelled');
    const resolution = success.events.find(event => event.type === 'ResidentsReconciled');
    const helper = history.projectPersonalHistory(success, attempt.details.mediatorId);
    assert.equal(helper.records.some(record => record.sourceEventId === opening.id), false);
    assert.deepEqual(helper.records.find(record => record.sourceEventId === attempt.id).roles, ['mediator']);
    assert.deepEqual(helper.records.find(record => record.sourceEventId === resolution.id).roles, ['mediator']);
    for (const id of opening.details.participants) {
        const view = history.projectPersonalHistory(success, id);
        assert.deepEqual(view.records.find(record => record.sourceEventId === opening.id).roles, ['disputant']);
        assert.ok(view.records.some(record => record.sourceEventId === resolution.id));
        assert.equal(view.records.some(record => /consumed|produced/.test(record.text)), false);
    }
    const failed = run(false), failure = failed.events.find(event => event.type === 'MediationAttempted');
    const record = history.projectPersonalHistory(failed, failure.details.mediatorId).records.find(record => record.sourceEventId === failure.id);
    assert.match(record.text, /remained unresolved/);
    assert.doesNotMatch(record.text, /succeeded|reconciled/);
});
test('deceased and archived/childless outsider identities retain recorded experiences without propagating to relatives', () => {
    const deceased = core.advanceWinter(core.createSettlement(41, { ...quiet, mortalityBands: [{ minAge: 0, chanceBps: 0 }, { minAge: 33, chanceBps: 10000 }] }));
    const death = deceased.events.find(event => event.type === 'PersonaDied');
    assert.ok(history.projectPersonalHistory(deceased, 'einar').records.some(record => record.sourceEventId === death.id));
    assert.equal(history.projectPersonalHistory(deceased, 'liv').records.some(record => record.sourceEventId === death.id), false);
    let state = core.createSettlement(41, quiet);
    state = core.applyCommand(state, { type: 'AssignOccupation', personaId: 'einar', occupation: 'woodworker' });
    state.personaArchive = { einar: structuredClone(state.personas.einar) };
    delete state.personas.einar;
    delete state.mechanics.people.einar;
    state.personas.liv.partnerId = null;
    state.households.home.memberIds = ['liv', 'astrid'];
    state.events.push({ id: 'event-' + (state.events.length + 1), time: { ...state.time }, type: 'PersonaTransferredOut',
        details: { personaId: 'einar', name: 'Einar', destinationClanId: 'cpu-east' } });
    state.personas.guest = { ...structuredClone(state.personaArchive.einar), id: 'guest', name: 'Guest', birthWinter: 776,
        parentIds: [], partnerId: null, occupation: null, occupationHistory: [], workProgress: 0, originClanId: 'other-clan' };
    state.mechanics.people.guest = { ...structuredClone(state.mechanics.people.astrid) };
    state.households['guest-home'] = { id: 'guest-home', memberIds: ['guest'], residenceId: null };
    state.events.push({ id: 'event-' + (state.events.length + 1), time: { ...state.time }, type: 'PersonaTransferredIn', personaId: 'guest',
        details: { personaId: 'guest', name: 'Guest', originClanId: 'other-clan' } });
    state = core.reconstructState(JSON.stringify(state));
    const archived = history.projectPersonalHistory(state, 'einar');
    assert.equal(archived.records.length, 2);
    assert.match(archived.records[0].text, /Einar.*transferred/);
    const guest = history.projectPersonalHistory(state, 'guest');
    assert.equal(guest.records.length, 1);
    assert.match(guest.records[0].text, /Guest arrived/);
    assert.doesNotMatch(guest.records[0].text, /other-clan|event-/);
    assert.equal(Object.values(state.families).some(family => family.memberIds.includes('guest')), false);
});
test('expedition relevance follows recorded departure/result participants, not the edited current group', () => {
    let state = core.createCampaign(32, {}, quiet, { enabled: false }, { casualtyBps: { Recon: 0, Surveillance: 0, Pillage: 0 } });
    const participants = Object.keys(state.personas).slice(0, 2), later = Object.keys(state.personas)[3];
    state = core.applyCommand(state, { type: 'CreateExpeditionGroup', name: 'First scouts', memberIds: participants });
    state = core.applyCommand(state, { type: 'DispatchExpedition', groupId: 'group-1', regionId: 'region-east', mission: 'Recon' });
    state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 250 });
    state = core.applyCommand(state, { type: 'EditExpeditionGroup', groupId: 'group-1', name: 'New members', memberIds: [later] });
    const departed = state.events.find(event => event.type === 'ExpeditionDeparted');
    const returned = state.events.find(event => event.type === 'ExpeditionReturned');
    for (const id of participants) {
        const records = history.projectPersonalHistory(state, id).records;
        assert.ok(records.some(record => record.sourceEventId === departed.id));
        assert.deepEqual(records.find(record => record.sourceEventId === returned.id).roles, ['expedition participant']);
        assert.doesNotMatch(records.find(record => record.sourceEventId === returned.id).text, /region-east/);
    }
    assert.equal(history.projectPersonalHistory(state, later).records.some(record => record.sourceEventId === departed.id || record.sourceEventId === returned.id), false);
});
test('care records identify the actual mother and proxy, without claiming every child participated', () => {
    let state = core.createSettlement(41, quiet);
    state.personas.guest = { ...structuredClone(state.personas.einar), id: 'guest', name: 'Guest', birthWinter: 776,
        parentIds: [], partnerId: null, occupation: null, occupationHistory: [], workProgress: 0 };
    state.personas.guest.dna.sex = 'female';
    state.mechanics.people.guest = { ...structuredClone(state.mechanics.people.astrid) };
    state.households['guest-home'] = { id: 'guest-home', memberIds: ['guest'], residenceId: null };
    state = core.applyCommand(core.reconstructState(JSON.stringify(state)), { type: 'AssignCaregiver', motherId: 'liv', caregiverId: 'guest' });
    const source = state.events.at(-1);
    assert.deepEqual(history.projectPersonalHistory(state, 'liv').records.find(record => record.sourceEventId === source.id).roles, ['care recipient']);
    assert.deepEqual(history.projectPersonalHistory(state, 'guest').records.find(record => record.sourceEventId === source.id).roles, ['caregiver']);
    assert.equal(history.projectPersonalHistory(state, 'astrid').records.some(record => record.sourceEventId === source.id), false);
});
test('published excerpts stay exact; mixed passages offer context links while recent and omitted records remain factual', () => {
    const { ClanBook } = loadTypeScript(new URL('../src/lore/ClanBook.ts', import.meta.url));
    let state = core.createSettlement(41, { ...quiet, mortalityBands: [{ minAge: 0, chanceBps: 0 }] });
    state.stocks.food = 200;
    state.stocks.materials = 200;
    const book = new ClanBook(state, false, 1);
    state = core.applyCommand(state, { type: 'AssignOccupation', personaId: 'einar', occupation: 'woodworker' });
    const first = state.events.at(-1);
    assert.equal(history.projectPersonalHistory(state, 'einar', book.snapshot().chapters).records[0].publications.length, 0);
    state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 5000 });
    book.closeCheckpoint(state);
    const saved = book.snapshot().chapters[1];
    const paragraph = saved.paragraphs.find(part => part.templateId.startsWith('clan-book.thread.work'));
    const own = history.projectPersonalHistory(state, 'einar', book.snapshot().chapters).records.find(record => record.sourceEventId === first.id);
    assert.equal(own.publications[0].excerpt, paragraph.text);
    assert.equal(own.publications[0].chapterIndex, 1);
    const frozen = JSON.stringify(book.snapshot());
    const cursor = state.events.length;
    state = core.applyCommand(state, { type: 'AssignOccupation', personaId: 'einar', occupation: 'hunter' });
    state = core.applyCommand(state, { type: 'AssignOccupation', personaId: 'liv', occupation: 'fisher' });
    const next = state.events[cursor];
    state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 5000 });
    book.closeCheckpoint(state);
    const view = history.projectPersonalHistory(state, 'einar', book.snapshot().chapters);
    const shared = view.records.find(record => record.sourceEventId === next.id).publications.find(reference => reference.chapterIndex === 2);
    assert.ok(shared);
    assert.equal(shared.excerpt, undefined, 'A paragraph including Liv\'s separate work is context, not Einar\'s excerpt');
    assert.equal(book.snapshot().chapters[1].text, saved.text);
    const afterRead = JSON.stringify(state);
    history.projectPersonalHistory(state, 'liv', book.snapshot().chapters);
    assert.equal(JSON.stringify(state), afterRead);
    assert.ok(frozen.includes(saved.text.replaceAll('\n', '\\n')));
    assert.equal(view.records.filter(record => record.sourceEventId === first.id).length, 1);
});
test('shared personal-history queries reset on rollback and handoff without changing Core, book text or clock intent', () => {
    const { SharedSettlement } = loadTypeScript(new URL('../src/play/SharedSettlement.ts', import.meta.url));
    const owner = new SharedSettlement(41, 1, false);
    let state = core.createSettlement(41, quiet);
    state.stocks.food = 100;
    state.stocks.materials = 100;
    owner.importJSON(core.serializeState(state));
    owner.command({ type: 'AssignOccupation', personaId: 'einar', occupation: 'woodworker' });
    const saved = owner.fjord.exportJSON(), canonical = owner.session.saveJSON();
    owner.session.setRunning(true);
    const original = owner.session.personalHistory('einar');
    assert.equal(original.records.length, 1);
    assert.equal(owner.session.personalHistory('liv').records.length, 0);
    original.records[0].text = 'An editable fake';
    assert.notEqual(owner.session.personalHistory('einar').records[0].text, 'An editable fake');
    assert.equal(owner.session.saveJSON(), canonical);
    assert.equal(owner.session.running, true);
    owner.command({ type: 'AdvanceTicks', ticks: 5000 });
    const published = owner.session.personalHistory('einar');
    assert.ok(published.records[0].publications.length);
    const transfer = SharedSettlement.restore(owner.handoff('fjord'), 'fjord');
    assert.deepEqual(transfer.session.personalHistory('einar'), published);
    assert.equal(transfer.session.running, true);
    owner.importJSON(saved);
    assert.equal(owner.session.personalHistory('einar').records[0].publications.length, 0);
    assert.equal(owner.session.personalHistory('einar').records[0].time.winter, 800);
    assert.equal(owner.session.saveJSON(), canonical);
    owner.newCampaign(17, false, false);
    assert.equal(owner.session.personalHistory('einar').records.length, 0);
    assert.equal(Object.hasOwn(JSON.parse(owner.session.saveJSON()), 'personalHistory'), false);
});
test('personal dates use the known campaign origin; missing event-time names remain unknown', () => {
    let state = core.createSettlement(41, quiet);
    state = core.applyCommand(state, { type: 'AssignOccupation', personaId: 'einar', occupation: 'hunter' });
    const event = state.events.at(-1);
    delete event.details.people;
    delete event.details.name;
    state.personas.einar.name = 'Current name is not historical evidence';
    const record = history.projectPersonalHistory(state, 'einar').records[0];
    assert.equal(record.text, 'A resident (name not recorded) became a hunter.');
    assert.equal(record.date, 'Campaign opening · Winter');
    assert.doesNotMatch(record.text, /einar|Current name/);
    state.events = [{ ...event, time: { winter: 807, tick: 300 } }];
    assert.equal(history.projectPersonalHistory(state, 'einar').records[0].date, 'Date relative to arrival unavailable · Spring');
});
test('a housing snapshot must match the recorded housing reference; empty occupancy is known, absent metadata is not inferred', () => {
    let state = core.createSettlement(41, quiet);
    state.stocks.materials = 100;
    state = core.applyCommand(state, { type: 'BuildHouse', householdId: 'home' });
    const built = state.events.find(event => event.type === 'HouseBuilt');
    built.details.housingResidents.buildingId = 'different-building';
    const unknown = history.projectPersonalHistory(state, 'einar');
    assert.equal(unknown.records.some(record => record.sourceEventId === built.id), false);
    assert.equal(unknown.partialAttribution, true);
    built.details.housingResidents.buildingId = built.details.buildingId;
    built.details.housingResidents.residentIds = [];
    state.events = state.events.filter(event => event.id === built.id);
    const vacant = history.projectPersonalHistory(state, 'einar');
    assert.equal(vacant.records.length, 0);
    assert.equal(vacant.partialAttribution, false);
});
test('dated callbacks keep one original birth with several saved references; broad arrival anchors are not personal stories', () => {
    const { ClanBook } = loadTypeScript(new URL('../src/lore/ClanBook.ts', import.meta.url));
    let state = core.createCampaign(32);
    const book = new ClanBook(state, false, 1);
    state = core.applyCommand(state, { type: 'AssignOccupation', personaId: 'founder-1', occupation: 'woodworker' });
    state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 5000 });
    book.closeCheckpoint(state);
    const unrelated = history.projectPersonalHistory(state, 'founder-9', book.snapshot().chapters, 100);
    const arrival = unrelated.records.find(record => record.kind === 'FoundingPartyLanded');
    assert.deepEqual(arrival.publications.map(reference => reference.chapterIndex), [0]);
    // A saved fixture reuses the actual supported ChildBorn schema and explicit saved paragraph boundaries.
    state = core.createSettlement(41, { ...quiet, childcareWinters: 0, fertilityChanceBps: 10000, mortalityBands: [{ minAge: 0, chanceBps: 0 }] });
    state.stocks.food = 500;
    state.stocks.materials = 500;
    state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 3000 });
    const birth = state.events.find(event => event.type === 'ChildBorn');
    const template = structuredClone(book.snapshot().chapters[1]);
    const chapter = (index, text) => ({ ...structuredClone(template), index,
        sourceEventIds: [birth.id], plan: { threads: [{ theme: 'family', sourceEventIds: [], callbackEventIds: [birth.id] }] },
        paragraphs: [{ text, templateId: 'clan-book.thread.family.fixture', sourceEventIds: [birth.id] }] });
    const view = history.projectPersonalHistory(state, birth.personaId, [chapter(1, 'Exact saved first callback.'), chapter(2, 'Exact saved second callback.')]);
    assert.equal(view.records.filter(record => record.sourceEventId === birth.id).length, 1);
    const record = view.records.find(record => record.sourceEventId === birth.id);
    assert.deepEqual(record.time, { winter: 803, tick: 0 });
    assert.deepEqual(record.publications.map(reference => reference.excerpt), ['Exact saved first callback.', 'Exact saved second callback.']);
});
