import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load-source.mjs';
import { worldFixture } from './fixtures/wildlife-world.mjs';

const core = load('../src/simulation/SimulationCore.ts');
const { newFjordScenario } = load('../src/fjord-play/FjordScenario.ts');
const { SharedSettlement } = load('../src/play/SharedSettlement.ts');
const { newFirstSteps, inspectFirstSteps, readFirstSteps } = load('../src/fjord-play/FirstStepsState.ts');
const { newJourney } = load('../src/fjord-play/JourneyProgress.ts');
const { FoundingJourneyIndex, foundingJourney } = load('../src/fjord-play/FoundingJourney.ts');
const { renderMissionOutcome } = load('../src/fjord-play/MissionOutcomeView.ts');
const active = () => ({ ...newFirstSteps(), status: 'active', journey: newJourney() });
function project(state, progress = active(), index = new FoundingJourneyIndex(), context) {
    index.update(state);
    const offers = context && {
        startExpeditionOffer: id => core.startExpeditionOffer(state, id, context),
        islandMissionOffer: (id, target, type, priorities) => core.islandMissionOffer(state, id, target, type, priorities, context),
    };
    return foundingJourney(state, progress, index, command => {
        try { core.applyCommand(state, command, context); return { allowed: true, reason: '' }; }
        catch (error) { return { allowed: false, reason: error.message }; }
    }, offers);
}
const goal = (view, id) => view.goals.find(goal => goal.id === id);

test('20 real founding seeds share three freely available chapters and truthful costs without changing Core', () => {
    const species = new Set();
    for (let seed = 0; seed < 20; seed++) {
        const session = newFjordScenario(seed), state = session.readSnapshot();
        const canonical = session.saveJSON(), view = project(state);
        species.add(view.livestock.species);
        assert.deepEqual([...new Set(view.goals.map(goal => goal.chapter))], ['home', 'discovery', 'conflict']);
        assert.equal(view.goals.length, 14);
        assert.equal(goal(view, 'permanent-home').status, 'blocked');
        assert.match(goal(view, 'permanent-home').detail, /5 more Materials/);
        assert.match(goal(view, 'longship-choice').detail, /20 Materials/);
        assert.equal(goal(view, 'personal-gear').status, 'available', 'Later chapters are never unlocked by earlier checks');
        assert.equal(session.saveJSON(), canonical);
        let progress = inspectFirstSteps(active(), state, 'resident', view.person.id);
        progress = inspectFirstSteps(progress, state, 'household', view.familyHome.id);
        progress = inspectFirstSteps(progress, state, 'home-resident', view.familyHome.memberIds[0]);
        progress = inspectFirstSteps(progress, state, 'livestock', view.livestock.id);
        progress = inspectFirstSteps(progress, state, 'resources');
        assert.equal(goal(project(state, progress), 'meet-people').status, 'completed');
        assert.equal(goal(project(state, { ...progress, journey: { ...progress.journey, later: ['wildlife-species'],
            skipped: ['pillage'], chapter: 'conflict' } }), 'pillage').status, 'skipped');
    }
    assert.deepEqual([...species].sort(), ['cattle', 'goat', 'pig', 'sheep']);
});

test('existing homes, specialization and upgrades are credited out of order without another purchase', () => {
    let state = core.createCampaign(32, { initialFood: 500, initialMaterials: 200 });
    const household = Object.values(state.households)[0];
    state = core.applyCommand(state, { type: 'BuildHouse', householdId: household.id });
    const buildingId = state.residences[state.households[household.id].residenceId].buildingId;
    const occupation = state.personas[household.memberIds[0]].occupation;
    state = core.applyCommand(state, { type: 'SpecializeBuilding', buildingId, occupation });
    state = core.applyCommand(state, { type: 'UpgradeBuilding', buildingId });
    const canonical = core.serializeState(state), view = project(state);
    for (const id of ['permanent-home', 'specialize-home', 'upgrade-home'])
        assert.equal(goal(view, id).status, 'completed');
    assert.match(goal(view, 'upgrade-home').detail, /Materials\/year/);
    assert.equal(core.serializeState(state), canonical);
});

test('keep acknowledgment is presentation only; salvaged and absent ships never acquire sailing credit', () => {
    const state = newFjordScenario(32).readSnapshot(), progress = active();
    const before = core.serializeState(state);
    progress.journey.keptShipId = 'founding-longship';
    assert.equal(goal(project(state, progress), 'longship-choice').status, 'completed');
    assert.equal(core.serializeState(state), before);
    assert.equal(state.events.some(event => event.type === 'FoundingLongshipKept'), false);
    const salvaged = core.applyCommand(state, { type: 'SalvageLongship', longshipId: 'founding-longship' });
    const view = project(salvaged, progress);
    assert.equal(view.shipState, 'salvaged');
    assert.equal(goal(view, 'longship-choice').status, 'completed');
    assert.equal(goal(view, 'sea-travel').status, 'blocked');
    assert.match(goal(view, 'sea-travel').detail, /on-foot/);
    const absent = structuredClone(state);
    delete absent.landing.longships['founding-longship']; // Old-save absence projection, not a guide action.
    assert.equal(project(absent, progress).shipState, 'not present');
    assert.equal(goal(project(absent, progress), 'sea-travel').status, 'blocked');
});

test('legacy guidance and bounded chapter choices survive matching save/import; malformed metadata is atomic', () => {
    const owner = new SharedSettlement(newFjordScenario(32));
    const progress = active();
    progress.journey.chapter = 'discovery';
    progress.journey.later = ['wildlife-species'];
    progress.journey.skipped = ['sea-travel'];
    owner.fjord.firstSteps = progress;
    const canonical = owner.session.saveJSON();
    const restored = SharedSettlement.restore(owner.persist(), 'fjord');
    assert.deepEqual(restored.fjord.firstSteps, progress);
    assert.equal(restored.session.saveJSON(), canonical);
    const legacy = { ...newFirstSteps(), status: 'active', residentId: 'founder-1' };
    assert.equal(readFirstSteps(legacy, owner.session.readSnapshot()).residentId, 'founder-1');
    assert.ok(JSON.stringify(progress).length < 1200);
    const saved = JSON.parse(owner.fjord.exportJSON()), before = owner.persist();
    for (const invalid of [
        { ...progress.journey, chapter: 'hidden-rival' },
        { ...progress.journey, skipped: Array(1000).fill('pillage') },
        { ...progress.journey, later: ['pillage'], skipped: ['pillage'] },
        { ...progress.journey, resultEventId: 'event-999999999' },
    ]) {
        saved.firstSteps.journey = invalid;
        assert.throws(() => owner.importJSON(JSON.stringify(saved)), /journey|Journey/);
        assert.equal(owner.persist(), before);
    }
    restored.restart(true);
    assert.equal(restored.fjord.firstSteps, undefined);
});

const wildlifeWorld = worldFixture();
const wildlifeContext = { world: wildlifeWorld, wildlifeWorld, worldId: 'journey-wildlife-fixture' };
function wildlifeCampaign() {
    let state = core.createCampaign(32, { initialFood: 5000, cattleBirthChanceBps: 0 },
        { mortalityBands: [{ minAge: 0, chanceBps: 0 }], fertilityChanceBps: 0, partnershipChanceBps: 0 },
        { enabled: false }, {}, { enabled: false });
    state = core.initializePhysicalDiscovery(state, wildlifeWorld, wildlifeContext.worldId);
    state = core.initializeWildlifeSightings(state, wildlifeWorld, wildlifeContext.worldId);
    state = core.applyCommand(state, { type: 'CreateExpeditionGroup', name: 'Witnesses', memberIds: ['founder-1'] }, wildlifeContext);
    return core.applyCommand(state, { type: 'StartExpedition', groupId: 'group-1' }, wildlifeContext);
}

test('real paid departures and three witnessed species count across redirects and imported history', () => {
    let state = wildlifeCampaign();
    assert.notEqual(goal(project(state, active(), undefined, wildlifeContext), 'prepare-expedition').status, 'completed',
        'Packing alone is not departure');
    const index = new FoundingJourneyIndex();
    let groupId = 'group-1';
    for (const speciesId of ['great-black-backed-gull', 'red-fox', 'lynx', 'moose', 'reindeer']) {
        const animal = state.wildlife.actors.find(actor => actor.id.startsWith(speciesId + ':grounded')) ??
            state.wildlife.actors.find(actor => actor.id.startsWith(speciesId + ':'));
        if (!animal) continue;
        try {
            state = core.applyCommand(state, { type: 'ExploreArea', groupId, target: animal.position }, wildlifeContext);
            for (let i = 0; i < 12; i++) {
                state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 30 }, wildlifeContext);
                const mission = Object.values(state.world.spatial.missions).find(mission => mission.groupId === groupId);
                if (mission.status !== 'Traveling') break;
            }
        } catch { continue; } // A species may be beyond this group's currently feasible route.
        index.update(state);
        if (index.species.size >= 3) break;
        if (groupId === 'group-1') {
            state = core.applyCommand(state, { type: 'CreateExpeditionGroup', name: 'More witnesses',
                memberIds: ['founder-2'] }, wildlifeContext);
            groupId = 'group-2';
            state = core.applyCommand(state, { type: 'StartExpedition', groupId }, wildlifeContext);
        }
    }
    assert.ok(index.species.size >= 3, 'The real coastal fixture admits a three-species journey');
    assert.equal(goal(project(state, active(), index, wildlifeContext), 'wildlife-species').status, 'completed');
    assert.equal(goal(project(state, active(), index, wildlifeContext), 'prepare-expedition').status, 'completed');
    const restored = core.reconstructState(core.serializeState(state));
    assert.deepEqual([...project(restored, active(), undefined, wildlifeContext).species], [...index.species]);
    const canonical = core.serializeState(state);
    for (let i = 0; i < 100; i++) assert.equal(index.update(state), 0, 'Unchanged history is never rescanned');
    assert.equal(core.serializeState(state), canonical);
});

test('a camera-visible animal, livestock and foreign or repeated sightings cannot manufacture species progress', () => {
    const state = wildlifeCampaign(), index = new FoundingJourneyIndex();
    index.update(state);
    assert.equal(index.species.size, 0);
    const animal = state.wildlife.actors.find(actor => actor.id.startsWith('great-black-backed-gull:grounded'));
    let seen = core.applyCommand(state, { type: 'ExploreArea', groupId: 'group-1', target: animal.position }, wildlifeContext);
    seen = core.applyCommand(seen, { type: 'AdvanceTicks', ticks: 40 }, wildlifeContext);
    const event = seen.events.find(event => event.type === 'WildlifeSighted');
    assert.ok(event);
    const source = structuredClone(seen);
    for (const clanId of [state.clan.id, 'another-clan']) source.events.push({
        ...event, id: 'event-' + (source.events.length + 1), details: { ...event.details, clanId },
    });
    index.update(source);
    const species = new Set(seen.events.filter(event => event.type === 'WildlifeSighted').map(event => event.details.speciesId));
    assert.equal(index.species.size, species.size);
    assert.equal(index.species.has('cattle'), false);
});

const bounds = { minX: 0, maxX: 512, minZ: 0, maxZ: 256 };
const missionWorld = {
    waterLevel: -1,
    terrain: { bounds, spacing: 8, columns: 65, rows: 33, heights: Array(2145).fill(0) },
    navigation: { bounds, spacing: 8, columns: 65, rows: 33, cells: Array(2145).fill(true) },
    settlement: { center: { x: 64, z: 128 }, harbor: null },
    rivalSite: { version: 1, candidateId: 'rival-pocket-1', center: { x: 224, z: 128 },
        bounds: { minX: 192, maxX: 288, minZ: 64, maxZ: 192 }, foundations: [], buildableArea: 12288 },
};
const missionContext = { world: missionWorld, worldId: 'journey-mission-fixture' };
const command = (state, action) => core.applyCommand(state, action, missionContext);
function missionCampaign(success = 10000, casualty = 0) {
    let state = core.createCampaign(32, { initialFood: 500, initialMaterials: 100 },
        { mortalityBands: [{ minAge: 0, chanceBps: 0 }], fertilityChanceBps: 0, partnershipChanceBps: 0 },
        { enabled: false }, { successBps: { Recon: 10000, Surveillance: 10000, Pillage: success },
            casualtyBps: { Recon: 0, Surveillance: 0, Pillage: casualty } });
    state = core.initializeIslandClans(state, missionWorld, missionContext.worldId);
    return command(state, { type: 'CreateExpeditionGroup', name: 'Known people', memberIds: ['founder-1'] });
}
function knownRival(state) {
    state = command(state, { type: 'StartExpedition', groupId: 'group-1' });
    state = command(state, { type: 'ExploreArea', groupId: 'group-1', target: missionWorld.rivalSite.center });
    state = command(state, { type: 'AdvanceTicks', ticks: 80 });
    state = command(state, { type: 'RecallExpedition', groupId: 'group-1' });
    state = command(state, { type: 'AdvanceTicks', ticks: 80 });
    state = command(state, { type: 'DispatchIslandMission', groupId: 'group-1',
        target: { kind: 'site', siteId: 'rival-pocket-1' }, mission: 'Recon' });
    return command(state, { type: 'AdvanceTicks', ticks: 250 });
}

test('hidden rival state is not guidance knowledge; only legitimate sightings and returned Recon count', () => {
    const state = missionCampaign(), before = core.serializeState(state);
    const initial = project(state, active(), undefined, missionContext);
    assert.equal(initial.knownSite, undefined);
    assert.equal(goal(initial, 'find-neighbours').status, 'available');
    assert.equal(goal(initial, 'recon').status, 'blocked');
    assert.equal(JSON.stringify(initial.goals).includes('rival-pocket-1'), false);
    assert.equal(core.serializeState(state), before);
    const known = knownRival(state), view = project(known, active(), undefined, missionContext);
    assert.equal(goal(view, 'find-neighbours').status, 'completed');
    assert.equal(goal(view, 'recon').status, 'completed');
    assert.equal(view.knownSite.id, 'rival-pocket-1');
});

test('real supported gear counts only after actual ownership and per-person assignment, never from a target', () => {
    let state = missionCampaign();
    state = command(state, { type: 'AssignOccupation', personaId: 'founder-1', occupation: 'smith' });
    state = command(state, { type: 'SetSmitheryTarget', item: 'woodenSpear', target: 1 });
    assert.equal(goal(project(state), 'personal-gear').status, 'available');
    for (let i = 0; i < 10 && !state.smithery.stored.woodenSpear; i++)
        state = command(state, { type: 'AdvanceTicks', ticks: 100 });
    assert.equal(state.smithery.stored.woodenSpear, 1);
    assert.equal(goal(project(state), 'personal-gear').status, 'available', 'A stored spear is not yet a named equipped raider');
    state = command(state, { type: 'AssignEquipment', personaId: 'founder-1', slot: 'weapon', item: 'woodenSpear' });
    const view = project(state);
    assert.equal(goal(view, 'personal-gear').status, 'completed');
    assert.match(goal(view, 'personal-gear').detail, /1 named people equipped/);
});

test('failure, complete crew loss and successful empty loot retain the real mission ID and report across import', () => {
    for (const success of [0, 10000]) {
        let state = missionCampaign(success, success ? 0 : 10000);
        state = command(state, { type: 'AssignOccupation', personaId: 'founder-1', occupation: 'smith' });
        for (const item of ['woodenSpear', 'woodenShield'])
            state = command(state, { type: 'SetSmitheryTarget', item, target: 1 });
        for (let i = 0; i < 20 && !state.smithery.stored.woodenShield; i++)
            state = command(state, { type: 'AdvanceTicks', ticks: 100 });
        state = command(state, { type: 'AssignEquipment', personaId: 'founder-1', slot: 'weapon', item: 'woodenSpear' });
        state = command(state, { type: 'AssignEquipment', personaId: 'founder-1', slot: 'shield', item: 'woodenShield' });
        state = knownRival(state);
        // The target really slaughtered its livestock after the dated Recon. A successful
        // mission can recover nothing from that chosen category; the guide must not invent loot.
        const clanId = state.world.island.clanId;
        let target = state.world.targetClans[clanId];
        for (const animal of Object.values(target.landing.cattle).filter(animal => animal.deathWinter === null))
            target = core.applyCommand(target, { type: 'SlaughterCattle', cattleId: animal.id });
        state = structuredClone(state);
        state.world.targetClans[clanId] = target;
        state = command(state, { type: 'DispatchIslandMission', groupId: 'group-1',
            target: { kind: 'site', siteId: 'rival-pocket-1' }, mission: 'Pillage', priorities: ['Cattle'] });
        state = command(state, { type: 'AdvanceTicks', ticks: 500 });
        const canonical = core.serializeState(state), view = project(state);
        assert.equal(goal(view, 'pillage').status, 'completed');
        assert.equal(goal(view, 'mission-result').status, 'available');
        assert.equal(view.result.details.success, !!success);
        assert.equal(view.result.details.food, 0);
        assert.equal(view.result.details.materials, 0);
        assert.equal(view.result.details.casualtyIds.length, success ? 0 : 1);
        assert.equal(view.result.details.survivorIds.length, success ? 1 : 0);
        const html = renderMissionOutcome(state, view.result);
        assert.match(html, success ? /Succeeded/ : /Failed/);
        assert.match(html, /Recovered: 0 Food/);
        assert.match(html, /Wooden Spear/);
        assert.match(html, /Wooden Shield/);
        assert.match(html, /Returned crew:/);
        assert.match(html, /Casualties:/);
        assert.ok(html.includes('data-mission-report="' + view.result.details.missionId + '"'));
        assert.equal(view.result.details.equipment[success ? 'returned' : 'lost'].length, 1);
        const progress = active();
        progress.journey.resultEventId = view.result.id;
        const restored = core.reconstructState(canonical), reread = readFirstSteps(progress, restored);
        const projected = project(restored, reread);
        assert.equal(goal(projected, 'mission-result').status, 'completed');
        assert.equal(projected.result.id, view.result.id);
        assert.equal(projected.result.details.missionId, view.result.details.missionId);
        assert.equal(core.serializeState(state), canonical);
    }
});

test('a fresh two-person group exposes the actual unaffordable Explore offer instead of inventing supplies', () => {
    let state = newFjordScenario(32).readSnapshot();
    state = core.initializeIslandClans(state, missionWorld, missionContext.worldId);
    state = command(state, { type: 'CreateExpeditionGroup', name: 'Two scouts', memberIds: ['founder-1', 'founder-2'] });
    const before = core.serializeState(state), view = project(state, active(), undefined, missionContext);
    assert.equal(goal(view, 'prepare-expedition').status, 'blocked');
    assert.match(goal(view, 'prepare-expedition').detail, /16 Food \(15 available\)/);
    assert.equal(core.serializeState(state), before);
});

test('optional sailing requires an actual same-mission sea journey, not just boarding or choosing a destination', () => {
    const bounds = { minX: 0, maxX: 256, minZ: 0, maxZ: 256 };
    const heights = Array.from({ length: 1089 }, (_, i) => {
        const x = i % 33 * 8, z = Math.floor(i / 33) * 8;
        return x >= 80 && x <= 176 && z >= 80 && z <= 176 ? 2 : -4;
    });
    const world = { waterLevel: 0, terrain: { bounds, spacing: 8, columns: 33, rows: 33, heights },
        navigation: { bounds, spacing: 8, columns: 33, rows: 33, cells: heights.map(height => height > 0) },
        settlement: { center: { x: 128, z: 128 }, harbor: { x: 128, z: 72 } } };
    const context = { world, worldId: 'journey-boat-fixture',
        longshipOrigins: { 'founding-longship': { x: 128, z: 72, rotation: 0 } } };
    const apply = (state, action) => core.applyCommand(state, action, context);
    let state = core.initializePhysicalDiscovery(core.createCampaign(32, { initialFood: 500 },
        { mortalityBands: [{ minAge: 0, chanceBps: 0 }], fertilityChanceBps: 0 },
        { enabled: false }), world, context.worldId);
    state = apply(state, { type: 'CreateExpeditionGroup', name: 'Real sailors', memberIds: ['founder-1'] });
    state = apply(state, { type: 'StartExpedition', groupId: 'group-1' });
    state = apply(state, { type: 'BoardLongship', groupId: 'group-1', shipId: 'founding-longship' });
    const mission = state => Object.values(state.world.spatial.missions).at(-1);
    for (let i = 0; i < 60 && mission(state).transport.phase !== 'embarked'; i++)
        state = apply(state, { type: 'AdvanceTicks', ticks: 1 });
    assert.equal(project(state).shipState, 'away');
    assert.notEqual(goal(project(state), 'sea-travel').status, 'completed');
    state = apply(state, { type: 'ExploreArea', groupId: 'group-1', target: { x: 72, z: 128 } });
    const notTravelled = apply(state, { type: 'DisembarkLongship', groupId: 'group-1' });
    assert.notEqual(goal(project(notTravelled), 'sea-travel').status, 'completed',
        'Setting a destination and immediately landing at the same tick is not sailing');
    for (let i = 0; i < 80 && mission(state).status === 'Traveling'; i++)
        state = apply(state, { type: 'AdvanceTicks', ticks: 1 });
    state = apply(state, { type: 'DisembarkLongship', groupId: 'group-1' });
    const restored = core.reconstructState(core.serializeState(state));
    assert.equal(goal(project(restored), 'sea-travel').status, 'completed');
});

test('guidance redraws never ask the route planner to evaluate a Recon or Pillage offer', () => {
    const state = knownRival(missionCampaign());
    const index = new FoundingJourneyIndex(); index.update(state);
    const canonical = core.serializeState(state);
    const offers = {
        startExpeditionOffer: id => core.startExpeditionOffer(state, id, missionContext),
        islandMissionOffer() { assert.fail('Route search belongs to explicit mission review, not guidance redraw'); },
    };
    for (let i = 0; i < 20; i++) foundingJourney(state, active(), index,
        () => ({ allowed: false, reason: 'Review the existing control.' }), offers);
    assert.equal(core.serializeState(state), canonical);
});
