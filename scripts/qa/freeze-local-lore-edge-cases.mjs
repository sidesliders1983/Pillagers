import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { loadTypeScript } from '../load-typescript.mjs';

const core = loadTypeScript(new URL('../../src/simulation/SimulationCore.ts', import.meta.url));
const { SharedSettlement } = loadTypeScript(new URL('../../src/play/SharedSettlement.ts', import.meta.url));
const { freezeLoreRequest } = loadTypeScript(new URL('../../src/lore/LocalLoreAdapter.ts', import.meta.url));
const { ClanBook } = loadTypeScript(new URL('../../src/lore/ClanBook.ts', import.meta.url));
const output = 'docs/qa/local-lore/edge-cases';
await mkdir(output, { recursive: true });
const corpus = [];
const stableCattle = { cattleBirthChanceBps: 0, cattleMortalityYoungBps: 0,
    cattleMortalityAdultBps: 0, cattleMortalityOlderBps: 0, cattleMortalityOldBps: 0 };
const stablePeople = { mortalityBands: [{ minAge: 0, chanceBps: 0 }],
    fertilityChanceBps: 0, partnershipChanceBps: 0, careerReviewWinters: 0 };
const harsh = Object.fromEntries(Object.entries(core.defaultWeatherConfig.profiles).map(([name, profile]) =>
    [name, { ...profile, probabilityBps: name === 'Harsh' ? 10000 : 0,
        tentMortalityBps: 0, exposedCattleMortalityBps: 0 }]));

for (const scenario of ['Quiet and duplicate names', 'Unmet Food need', 'Occupation and childcare changes']) {
    const owner = new SharedSettlement(32, 2032);
    const care = scenario === 'Occupation and childcare changes';
    const shortage = scenario === 'Unmet Food need';
    const initial = core.createCampaign(32, { ...stableCattle, initialFood: shortage ? 0 : 1000,
        initialMaterials: 1000, foundingCoupleChanceBps: care ? 10000 : 0 },
        { ...stablePeople, fertilityChanceBps: care ? 10000 : 0 },
        shortage ? { enabled: true, profiles: harsh } : { enabled: false });
    if (scenario === 'Quiet and duplicate names') {
        initial.personas['founder-1'].name = 'Kauppi';
        initial.personas['founder-2'].name = 'Kauppi';
    }
    // These are labelled imported QA fixtures, not changes to campaign defaults.
    owner.importJSON(core.serializeState(initial));
    const envelope = JSON.parse(owner.fjord.exportJSON());
    envelope.narrative = new ClanBook(initial, true, 2032).save(initial);
    owner.importJSON(JSON.stringify(envelope));
    let direct = owner.session.snapshot();
    const commands = [];
    const command = value => {
        owner.command(value);
        direct = core.applyCommand(direct, value);
        commands.push(value);
        assert.equal(owner.session.saveJSON(), core.serializeState(direct));
    };
    const snapshots = [owner.persist()];
    if (care) {
        command({ type: 'AdvanceTicks', ticks: 1000 });
        const state = owner.session.snapshot();
        const mother = Object.keys(state.mechanics.people).find(id =>
            state.mechanics.people[id].childcareUntilWinter > state.time.winter);
        assert.ok(mother, 'Controlled fertility produces a real care group');
        const helper = Object.keys(state.personas).find(id => id !== mother &&
            state.personas[id].dna.sex === 'female' &&
            state.mechanics.people[id].childcareUntilWinter <= state.time.winter);
        assert.ok(helper, 'Fixture has an adult helper without her own care group');
        command({ type: 'AssignOccupation', personaId: helper, occupation: null });
        command({ type: 'AssignCaregiver', motherId: mother, caregiverId: helper });
        command({ type: 'AssignCaregiver', motherId: mother, caregiverId: null });
        command({ type: 'AssignOccupation', personaId: helper, occupation: 'woodworker' });
        command({ type: 'AdvanceTicks', ticks: 4000 });
    } else command({ type: 'AdvanceTicks', ticks: 5000 });
    snapshots.push(owner.persist());
    command({ type: 'AdvanceTicks', ticks: 5000 });
    snapshots.push(owner.persist());
    const restored = SharedSettlement.restore(owner.persist(), 'fjord');
    assert.equal(restored.session.saveJSON(), owner.session.saveJSON());
    assert.deepEqual(restored.session.book.snapshot(), owner.session.book.snapshot());
    const requests = [];
    for (const [index, snapshot] of snapshots.entries()) {
        const checkpoint = SharedSettlement.restore(snapshot, 'fjord');
        requests.push(await freezeLoreRequest(checkpoint.session.snapshot(),
            checkpoint.session.book.save(checkpoint.session.snapshot()), index));
    }
    if (shortage) assert.ok(requests[1].context.facts.ledger.food.unmetNeed > 0);
    const eventTypes = [...new Set(owner.session.snapshot().events.map(event => event.type))];
    if (care) assert.ok(eventTypes.includes('CaregiverAssigned') && eventTypes.includes('OccupationAssigned'));
    corpus.push({ scenario, seed: 32, narrativeSeed: 2032, winters: 10,
        fixture: core.serializeState(initial), commands, snapshots, requests, eventTypes,
        coreIdentical: true, exactBookReload: true });
    console.log('Frozen ' + scenario);
}
const data = JSON.stringify({ version: 1, generatedAt: new Date().toISOString(),
    rules: 'Labelled controlled Core fixtures; default rules are unchanged', corpus }, null, 2) + '\n';
await writeFile(output + '/corpus.json.gz', gzipSync(data, { level: 9 }));
await writeFile(output + '/corpus.sha256', createHash('sha256').update(data).digest('hex') + '\n');
await writeFile(output + '/manifest.json', await readFile('docs/qa/local-lore/manifest.json'));
