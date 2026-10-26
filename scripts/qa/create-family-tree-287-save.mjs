import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadTypeScript } from '../load-typescript.mjs';

const core = loadTypeScript(new URL('../../src/simulation/SimulationCore.ts', import.meta.url));
const { SharedSettlement } = loadTypeScript(new URL('../../src/play/SharedSettlement.ts', import.meta.url));

/** Recording fixture only: all identities, births, partnerships and deaths are real Core results. */
export function createLegacyGameplaySave() {
    const normal = core.createCampaign(32).mechanics.config;
    let state = core.createCampaign(32, {}, {
        fertilityChanceBps: 10000, partnershipChanceBps: 10000, childcareWinters: 0,
        mortalityBands: [{ minAge: 0, chanceBps: 0 }], careerReviewWinters: 0,
    }, { enabled: false });
    delete state.world; // Domestic legacy campaign; no staged external settlement or invented residents.
    state.stocks.food = state.stocks.materials = 100000;
    while (Object.keys(state.personas).length < 50 && state.time.winter < 900)
        state = core.applyCommand(state, { type: 'AdvanceWinter' });
    state.mechanics.config.fertilityChanceBps = 0;
    state.mechanics.config.partnershipChanceBps = 0;
    state.mechanics.config.mortalityBands = [{ minAge: 0, chanceBps: 0 }, { minAge: 65, chanceBps: 10000 }];
    state = core.applyCommand(state, { type: 'AdvanceWinter' });
    state.mechanics.config = structuredClone(normal);

    const roles = ['farmer', 'woodworker', 'fisher', 'hunter'];
    let assigned = 0;
    for (const person of Object.values(state.personas)) {
        if (person.deathWinter !== null || core.personaAge(state, person.id) < normal.workAge || person.occupation) continue;
        state = core.applyCommand(state, { type: 'AssignOccupation', personaId: person.id, occupation: roles[assigned++ % roles.length] });
    }
    const homes = Object.values(state.households).filter(home =>
        home.memberIds.some(id => state.personas[id]?.deathWinter === null)).slice(0, 6);
    for (let index = 0; index < homes.length; index++) {
        const id = homes[index].id;
        state = core.applyCommand(state, { type: 'BuildHouse', householdId: id });
        const buildingId = state.residences[state.households[id].residenceId].buildingId;
        state = core.applyCommand(state, { type: 'SpecializeBuilding', buildingId, occupation: roles[index % roles.length] });
        if (index < 4) state = core.applyCommand(state, { type: 'UpgradeBuilding', buildingId });
        if (index < 2) state = core.applyCommand(state, { type: 'UpgradeBuilding', buildingId });
    }
    state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 500 - state.time.tick });
    // Recording supplies are presentation-fixture preparation, not a claim of a normal economy run.
    state.stocks.food = 200;
    state.stocks.materials = 60;
    state = core.reconstructState(core.serializeState(state));
    const owner = new SharedSettlement(32, 32, false);
    owner.importJSON(core.serializeState(state));
    owner.session.setRunning(false);
    owner.session.setMinutesPerWinter(5);
    owner.session.book.notifyPending();
    const fire = owner.fjord.readProjection().entities.find(entity => entity.kind === 'campfire').transform;
    owner.setPresentation({ quality: 'low', effects: 'low', camera: {
        position: [fire.x + 32, fire.y + 40, fire.z + 42], target: [fire.x, fire.y, fire.z],
    } });
    const text = owner.fjord.exportJSON();
    const restored = SharedSettlement.restore(text, 'fjord');
    const imported = new SharedSettlement(184, 1, false);
    imported.importJSON(text);
    const tree = restored.session.familyTree();
    if (imported.session.saveJSON() !== restored.session.saveJSON())
        throw new Error('Normal in-game Import and startup recovery must reproduce the same Core.');
    if (tree.nodes.length < 50 || Math.max(...tree.nodes.map(node => node.row)) < 2 ||
        restored.session.running || new Set(tree.nodes.map(node => node.id)).size !== tree.nodes.length)
        throw new Error('The recording fixture must restore as a paused, factual three-generation family.');
    return { text, summary: {
        scope: 'Explicit recording/test scenario. Actual Core identities and lifecycle events; accelerated test-only births and mortality, normal mechanics restored, prepared supplies and six homes. No invented person or kinship record.',
        seed: state.seed, time: state.time, founders: state.landing.founderIds.length,
        treeRecords: tree.nodes.length, generations: Math.max(...tree.nodes.map(node => node.row)) + 1,
        living: tree.nodes.filter(node => node.status === 'Present').length,
        deceased: tree.nodes.filter(node => node.status === 'Deceased').length,
        food: state.stocks.food, materials: state.stocks.materials, running: false,
    } };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
    const directory = 'docs/qa/family-tree-287';
    mkdirSync(directory, { recursive: true });
    const { text, summary } = createLegacyGameplaySave();
    writeFileSync(directory + '/legacy-gameplay-save.json', text);
    writeFileSync(directory + '/testsave-summary.json', JSON.stringify(summary, null, 2) + '\n');
    console.log(JSON.stringify(summary, null, 2));
}
