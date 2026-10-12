import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTypeScript } from '../scripts/load-typescript.mjs';
const core = loadTypeScript(new URL('../src/simulation/SimulationCore.ts', import.meta.url));
const tree = loadTypeScript(new URL('../src/lore/FamilyTree.ts', import.meta.url));
const quiet = {
    fertilityChanceBps: 0, partnershipChanceBps: 0, mortalityBands: [{ minAge: 0, chanceBps: 0 }], careerReviewWinters: 0
};
test('the actual ten founders stay on one row and use canonical age without any common parent', () => {
    let state = core.createCampaign(32, {}, quiet, { enabled: false });
    const founders = [...state.landing.founderIds];
    state.personas[founders[0]].dna.age = 1;
    state = core.applyCommand(state, { type: 'AdvanceWinter' });
    const before = core.serializeState(state), view = tree.projectFamilyTree(state);
    assert.deepEqual(new Set(view.nodes.filter(node => node.founder).map(node => node.id)), new Set(founders));
    assert.equal(view.nodes.filter(node => node.founder).every(node => node.row === 0), true);
    assert.equal(view.nodes.find(node => node.id === founders[0]).age, core.personaAge(state, founders[0]));
    assert.equal(view.edges.filter(edge => edge.kind === 'parent').length, 0);
    assert.equal(core.serializeState(state), before);
});
function addPerson(state, id, birthWinter, parentIds = [], partnerId = null, sex = 'male') {
    const source = state.personas[state.landing.founderIds[0]];
    state.personas[id] = {
        ...structuredClone(source), id, name: id.startsWith('child') ? 'Same name' : id,
        birthWinter, deathWinter: null, parentIds, partnerId, occupation: null, occupationHistory: [], workProgress: 0
    };
    state.personas[id].dna.sex = sex;
    state.mechanics.people[id] = {
        ...structuredClone(state.mechanics.people[source.id]), caregiverId: null, lastBirthWinter: null, childcareUntilWinter: 0
    };
    state.households['home-' + id] = { id: 'home-' + id, memberIds: [id], residenceId: null };
}
test('real parent links produce three generations, two-parent descent and independent family branches, not an outsider directory', () => {
    let state = core.createCampaign(32, {}, quiet, { enabled: false });
    delete state.world;
    state.time.winter = 822;
    const [father, mother] = state.landing.founderIds;
    addPerson(state, 'child-a', 801, [mother, father], 'new-partner');
    addPerson(state, 'child-b', 802, [father, mother]);
    addPerson(state, 'new-partner', 795, [], 'child-a', 'female');
    addPerson(state, 'grandchild', 820, ['child-a', 'new-partner']);
    addPerson(state, 'unrelated-worker', 790);
    addPerson(state, 'arrival-a', 785, [], 'arrival-b');
    addPerson(state, 'arrival-b', 786, [], 'arrival-a', 'female');
    addPerson(state, 'parent-arrival', 780);
    addPerson(state, 'young-arrival', 821, ['parent-arrival']);
    state = core.reconstructState(JSON.stringify(state));
    state = core.applyCommand(state, { type: 'AssignOccupation', personaId: 'unrelated-worker', occupation: 'woodworker' });
    const original = core.serializeState(state), view = tree.projectFamilyTree(state);
    const node = id => view.nodes.find(node => node.id === id);
    assert.ok(node('child-a'));
    assert.ok(node('child-b'));
    assert.ok(node('new-partner'));
    assert.ok(node('grandchild'));
    assert.equal(node('unrelated-worker'), undefined);
    assert.ok(node('arrival-a'));
    assert.ok(node('arrival-b'));
    assert.ok(node('young-arrival'));
    assert.equal(node('child-a').row, 1);
    assert.equal(node('child-b').row, 1);
    assert.ok(node('grandchild').row > Math.max(node('child-a').row, node('new-partner').row));
    assert.equal(view.nodes.filter(person => person.name === 'Same name').length, 2);
    for (const id of [father, mother])
        assert.ok(view.edges.some(edge => edge.kind === 'parent' && edge.from === id && edge.to === 'child-a'));
    assert.deepEqual(new Set(node('child-a').childIds), new Set(['grandchild']));
    assert.equal(node('arrival-a').branch, 'Independent family');
    assert.equal(view.edges.some(edge => edge.from === father && edge.to === 'arrival-a'), false);
    assert.equal(core.serializeState(state), original);
});
test('qualifying partnerships survive death, re-partnering and departure; last-known facts do not age into an invented future', () => {
    let state = core.createCampaign(32, {}, quiet, { enabled: false });
    delete state.world;
    addPerson(state, 'arrival-a', 776);
    addPerson(state, 'arrival-b', 740, [], null, 'female');
    state.mechanics.config.partnershipChanceBps = 10000;
    state = core.applyCommand(core.reconstructState(JSON.stringify(state)), { type: 'AdvanceWinter' });
    const formed = state.events.find(event => event.type === 'PartnershipFormed' && event.details.participants.includes('arrival-a'));
    assert.deepEqual(new Set(formed.details.participants), new Set(['arrival-a', 'arrival-b']));
    state.mechanics.config.partnershipChanceBps = 0;
    state.mechanics.config.mortalityBands = [{ minAge: 0, chanceBps: 0 }, { minAge: 60, chanceBps: 10000 }];
    state = core.applyCommand(core.reconstructState(JSON.stringify(state)), { type: 'AdvanceWinter' });
    addPerson(state, 'arrival-c', 778, [], null, 'female');
    state.mechanics.config.partnershipChanceBps = 10000;
    state = core.applyCommand(core.reconstructState(JSON.stringify(state)), { type: 'AdvanceWinter' });
    assert.equal(state.personas['arrival-a'].partnerId, 'arrival-c');
    const archived = structuredClone(state.personas['arrival-c']);
    state.personaArchive = { ...state.personaArchive, 'arrival-c': archived };
    delete state.personas['arrival-c'];
    delete state.mechanics.people['arrival-c'];
    for (const home of Object.values(state.households))
        home.memberIds = home.memberIds.filter(id => id !== 'arrival-c');
    state.personas['arrival-a'].partnerId = null;
    state.events.push({
        id: 'event-' + (state.events.length + 1), type: 'PersonaTransferredOut', time: { ...state.time },
        details: {
            personaId: 'arrival-c', name: archived.name, formerPartnerId: 'arrival-a', destinationClanId: 'another-clan'
        }
    });
    state.time.winter = 810;
    const view = tree.projectFamilyTree(state), departed = view.nodes.find(node => node.id === 'arrival-c'), dead = view.nodes.find(node => node.id === 'arrival-b');
    assert.ok(departed);
    assert.equal(departed.age, 25);
    assert.equal(departed.observedWinter, 803);
    assert.equal(departed.status, 'Departed · last known');
    assert.equal(dead.age, 62);
    assert.equal(dead.deathWinter, 802);
    assert.equal(dead.status, 'Deceased');
    assert.ok(view.edges.some(edge => edge.kind === 'partnership' && [edge.from, edge.to].includes('arrival-b')));
    assert.ok(view.edges.some(edge => edge.kind === 'partnership' && [edge.from, edge.to].includes('arrival-c')));
});
test('external parents remain explicit references without importing their ancestry; parent roles use recorded sex rather than slots', () => {
    let state = core.createCampaign(32, {}, quiet, { enabled: false });
    delete state.world;
    state.time.winter = 822;
    const father = state.landing.founderIds.find(id => state.personas[id].dna.sex === 'male');
    const external = {
        ...structuredClone(state.personas[father]), id: 'external-parent', name: 'Known external mother', birthWinter: 770,
        parentIds: ['external-grandparent'], partnerId: null, occupation: null, occupationHistory: []
    };
    external.dna.sex = 'female';
    state.personaArchive = { 'external-parent': external, 'external-grandparent': {
            ...structuredClone(external), id: 'external-grandparent', name: 'Do not import the whole ancestry', birthWinter: 740, parentIds: []
        } };
    addPerson(state, 'child-new', 820, ['external-parent', father]);
    state = core.reconstructState(JSON.stringify(state));
    const view = tree.projectFamilyTree(state), child = view.nodes.find(node => node.id === 'child-new');
    assert.equal(child.age, 2);
    assert.equal(child.status, 'Present');
    assert.equal(view.nodes.some(node => node.id === 'external-parent' || node.id === 'external-grandparent'), false);
    assert.deepEqual(child.parents.map(parent => [parent.id, parent.role, parent.visibility]), [
        ['external-parent', 'Mother', 'external'], [father, 'Father', 'included']
    ]);
    assert.equal(child.parents[0].age, null, 'An archive without observation date must not use stale DNA age');
});
test('malformed archived ancestry is diagnosed without a fabricated parent node or infinite traversal', () => {
    let state = core.createCampaign(32, {}, quiet, { enabled: false });
    delete state.world;
    const [a, b] = state.landing.founderIds;
    state.personaArchive = {};
    for (const id of [a, b]) {
        state.personaArchive[id] = structuredClone(state.personas[id]);
        delete state.personas[id];
        delete state.mechanics.people[id];
        for (const home of Object.values(state.households)) {
            home.memberIds = home.memberIds.filter(person => person !== id);
            if (!home.memberIds.length)
                home.residenceId = null;
        }
    }
    for (const person of Object.values(state.personas))
        if ([a, b].includes(person.partnerId))
            person.partnerId = null;
    state.personaArchive[a].parentIds = [a, b, 'missing-parent'];
    state.personaArchive[b].parentIds = [a];
    state = core.reconstructState(JSON.stringify(state));
    const before = core.serializeState(state), view = tree.projectFamilyTree(state);
    assert.match(view.diagnostics.join(' '), /Self parent|Cyclic/);
    assert.equal(view.nodes.length, 10);
    assert.equal(view.nodes.some(node => node.id === 'missing-parent'), false);
    assert.equal(view.nodes.find(node => node.id === a).parents.find(parent => parent.id === 'missing-parent').visibility, 'incomplete');
    assert.equal(core.serializeState(state), before);
});
test('shared session updates current family facts without publishing stories and rebuilds admission on rollback', () => {
    const { SharedSettlement } = loadTypeScript(new URL('../src/play/SharedSettlement.ts', import.meta.url));
    const owner = new SharedSettlement(32, 1, false);
    let state = core.createCampaign(32, {}, quiet, { enabled: false });
    delete state.world;
    addPerson(state, 'arrival-a', 776);
    addPerson(state, 'arrival-b', 775, [], null, 'female');
    owner.importJSON(core.serializeState(state));
    const original = owner.fjord.exportJSON(), book = JSON.stringify(owner.session.book.snapshot()), before = owner.session.saveJSON();
    owner.session.setRunning(true);
    const initial = owner.session.familyTree();
    assert.equal(initial.nodes.some(node => node.id === 'arrival-a'), false);
    owner.session.familyTree();
    assert.equal(owner.session.saveJSON(), before);
    assert.equal(JSON.stringify(owner.session.book.snapshot()), book);
    owner.command({ type: 'AdvanceTicks', ticks: 1 });
    assert.equal(owner.session.familyTree().revision, initial.revision, 'Routine ticks do not rebuild family topology/cards');
    state = owner.session.snapshot();
    state.mechanics.config.partnershipChanceBps = 10000;
    owner.importJSON(core.serializeState(state));
    owner.command({ type: 'AdvanceWinter' });
    const joined = owner.session.familyTree();
    assert.ok(joined.nodes.some(node => node.id === 'arrival-a'));
    const positions = joined.nodes.map(node => [node.id, node.row, node.column]);
    owner.command({ type: 'AssignOccupation', personaId: 'arrival-a', occupation: 'woodworker' });
    assert.deepEqual(owner.session.familyTree().nodes.map(node => [node.id, node.row, node.column]), positions);
    assert.equal(owner.session.familyTree().nodes.find(node => node.id === 'arrival-a').occupation, 'woodworker');
    const handoff = SharedSettlement.restore(owner.handoff('fjord'), 'fjord');
    assert.deepEqual(handoff.session.familyTree().nodes, owner.session.familyTree().nodes);
    owner.importJSON(original);
    assert.equal(owner.session.familyTree().nodes.some(node => node.id === 'arrival-a'), false);
    assert.equal(Object.hasOwn(JSON.parse(owner.session.saveJSON()), 'familyTree'), false);
});
test('newborns and included indoor mothers are visible immediately; a caregiver proxy never becomes a parent or a family member', () => {
    let state = core.createCampaign(32, {}, { ...quiet, fertilityChanceBps: 10000 }, { enabled: false });
    delete state.world;
    state.stocks.food = 1000;
    state = core.applyCommand(state, { type: 'AdvanceWinter' });
    const birth = state.events.find(event => event.type === 'ChildBorn');
    assert.ok(birth);
    const mother = birth.details.parentIds.find(id => state.personas[id].dna.sex === 'female');
    addPerson(state, 'care-helper', 775, [], null, 'female');
    state = core.applyCommand(core.reconstructState(JSON.stringify(state)), { type: 'AssignCaregiver', motherId: mother, caregiverId: 'care-helper' });
    const view = tree.projectFamilyTree(state), child = view.nodes.find(node => node.id === birth.personaId);
    assert.equal(child.age, 0);
    assert.equal(child.occupation, 'No occupation');
    assert.ok(view.nodes.find(node => node.id === mother).childIds.includes(child.id));
    assert.equal(view.nodes.some(node => node.id === 'care-helper'), false);
    assert.equal(child.parentIds.includes('care-helper'), false);
});
test('later death does not replace an already recorded partnership ending with an invented cause', () => {
    let state = core.createCampaign(32, {}, quiet, { enabled: false });
    delete state.world;
    addPerson(state, 'arrival-a', 776, [], 'arrival-c');
    addPerson(state, 'arrival-c', 775, [], 'arrival-a', 'female');
    const archived = {
        ...structuredClone(state.personas['arrival-c']), id: 'arrival-b', name: 'Former partner', partnerId: 'arrival-a'
    };
    state.personaArchive = { 'arrival-b': archived };
    state.time.winter = 801;
    state.events.push({
        id: 'event-' + (state.events.length + 1), time: { winter: 800, tick: 0 }, type: 'PartnershipFormed', personaId: 'arrival-a', details: { participants: ['arrival-a', 'arrival-b'] }
    });
    state.events.push({
        id: 'event-' + (state.events.length + 1), time: { winter: 801, tick: 0 }, type: 'PersonaTransferredOut', details: {
            personaId: 'arrival-b', formerPartnerId: 'arrival-a', name: archived.name, destinationClanId: 'elsewhere'
        }
    });
    state.mechanics.config.mortalityBands = [{ minAge: 0, chanceBps: 10000 }];
    state = core.applyCommand(core.reconstructState(JSON.stringify(state)), { type: 'AdvanceWinter' });
    const view = tree.projectFamilyTree(state);
    const former = view.edges.find(edge => edge.kind === 'partnership' && [edge.from, edge.to].includes('arrival-b'));
    const currentAtDeath = view.edges.find(edge => edge.kind === 'partnership' && [edge.from, edge.to].includes('arrival-c'));
    assert.equal(former.status, 'Ended by departure');
    assert.equal(currentAtDeath.status, 'Ended by death');
});
test('known external children remain readable relations without turning the tree into an external population directory', () => {
    const state = core.createCampaign(32, {}, quiet, { enabled: false });
    const father = state.landing.founderIds.find(id => state.personas[id].dna.sex === 'male');
    state.personaArchive = { 'known-external-child': {
            ...structuredClone(state.personas[father]), id: 'known-external-child', name: 'Known external child',
            birthWinter: 790, parentIds: [father], partnerId: null, occupation: null, occupationHistory: [], originClanId: 'elsewhere'
        } };
    const view = tree.projectFamilyTree(state), parent = view.nodes.find(node => node.id === father);
    assert.equal(view.nodes.some(node => node.id === 'known-external-child'), false);
    assert.ok(parent.childIds.includes('known-external-child'));
    const child = parent.children.find(child => child.id === 'known-external-child');
    assert.equal(child.visibility, 'external');
    assert.equal(child.age, null);
});
test('an actual local relationship record retains an archived qualified member even when old departure metadata is unavailable', () => {
    const state = core.createCampaign(32, {}, quiet, { enabled: false });
    delete state.world;
    const founder = state.landing.founderIds[0], id = 'historical-partner';
    state.personaArchive = { [id]: {
            ...structuredClone(state.personas[founder]), id, name: 'Historically included person', birthWinter: 770, parentIds: [], partnerId: null, occupation: null, occupationHistory: []
        } };
    state.events.push({
        id: 'event-' + (state.events.length + 1), time: { ...state.time }, type: 'PartnershipFormed', personaId: founder, details: { participants: [founder, id] }
    });
    const view = tree.projectFamilyTree(state), person = view.nodes.find(person => person.id === id);
    assert.ok(person);
    assert.equal(person.age, null);
    assert.equal(person.observedWinter, null);
    assert.equal(view.edges.find(edge => edge.to === id || edge.from === id).status, 'Historical partnership · end not observed');
});
