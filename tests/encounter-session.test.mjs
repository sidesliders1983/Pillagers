import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { load } from './load-source.mjs';

const core = load('../src/simulation/SimulationCore.ts');
const { GameplaySession } = load('../src/gameplay-lab/GameplaySession.ts');
const { SharedSettlement } = load('../src/play/SharedSettlement.ts');
const { campaignIslandCatalog } = load('../src/fjord-play/BakedIslandCatalog.ts');
const { adoptCampaignIsland } = load('../src/fjord-play/CampaignIsland.ts');

function productionCattleCampaign({ breeding = false } = {}) {
    const entry = campaignIslandCatalog.entries.find(row => row.version === 'island-pool-v1' && row.seed === 7);
    const payload = JSON.parse(gunzipSync(readFileSync(new URL('../public' + entry.path, import.meta.url))));
    adoptCampaignIsland(7, payload.world, payload.plan);
    const initial = core.createCampaign(7, { initialFood: 10000, initialMaterials: 500,
        ...(breeding ? { cattleBirthChanceBps: 10000, cattleMortalityYoungBps: 0, cattleMortalityAdultBps: 0,
            cattleMortalityOlderBps: 0, cattleMortalityOldBps: 0 } : {}) },
        { mortalityBands: [{ minAge: 0, chanceBps: 0 }], fertilityChanceBps: 0, partnershipChanceBps: 0 },
        { enabled: false }, { successBps: { Recon: 10000, Surveillance: 10000, Pillage: 6000 },
            casualtyBps: { Recon: 0, Surveillance: 0, Pillage: 1000 } });
    const session = new GameplaySession();
    session.loadJSON(core.serializeState(initial));
    const shared = new SharedSettlement(session, undefined, true, 'island-pool-v1');
    shared.fjord.prepareMining();
    shared.fjord.enableDiscovery();
    session.initializeMining(shared.fjord.blueprint, session.readSnapshot().discovery.worldId);
    const latest = () => Object.values(session.readSnapshot().world.spatial?.missions ?? {}).at(-1);
    const target = { kind: 'site', siteId: shared.fjord.blueprint.rivalSite.candidateId };
    session.command({ type: 'CreateExpeditionGroup', name: 'Cattle patrol',
        memberIds: Object.keys(session.readSnapshot().personas).sort() });
    session.command({ type: 'StartExpedition', groupId: 'group-1' });
    session.command({ type: 'ExploreArea', groupId: 'group-1', target: shared.fjord.blueprint.rivalSite.center });
    const speed = session.readSnapshot().world.spatial.policy.metresPerTick;
    session.command({ type: 'AdvanceTicks', ticks: Math.ceil(latest().distance / speed) });
    session.command({ type: 'RecallExpedition', groupId: 'group-1' });
    session.command({ type: 'AdvanceTicks', ticks: Math.ceil(latest().returnFrom / speed) });
    assert.equal(latest().status, 'Returned');
    session.command({ type: 'DispatchIslandMission', groupId: 'group-1', target, mission: 'Recon' });
    session.command({ type: 'AdvanceTicks', ticks: 250 });
    assert.equal(core.inspectIslandMissions(session.readSnapshot()).sites[0].knowledge.opportunity, true,
        'The normal production island is genuinely explored and reported before Pillage is available');
    shared.fjord.enableTerritorialAwareness();
    if (breeding) session.command({ type: 'AdvanceTicks', ticks: 220 });
    return { text: shared.persist(), target };
}

test('a renderer-free Fjord campaign captures actual cattle with the same Core after extra projection reads and a Mining rebind', () => {
    const { text, target } = productionCattleCampaign();
    const plain = SharedSettlement.restore(text, 'fjord');
    const observed = SharedSettlement.restore(text, 'fjord');
    const before = plain.session.readSnapshot();
    const sourceId = before.world.island.clanId;
    const actualCattle = Object.keys(before.world.targetClans[sourceId].landing.cattle);
    for (const [index, shared] of [plain, observed].entries()) {
        const session = shared.session;
        session.initializeMining(shared.fjord.blueprint, session.readSnapshot().discovery.worldId);
        const read = () => {
            if (!index) return;
            const before = session.saveJSON();
            shared.fjord.project();
            shared.fjord.readProjection();
            shared.fjord.project();
            assert.equal(session.saveJSON(), before, 'Projection does not resolve cargo or consume Core entropy');
        };
        read();
        session.command({ type: 'DispatchIslandMission', groupId: 'group-1', target,
            mission: 'Pillage', priorities: ['Cattle'] });
        read();
        const mission = Object.values(session.readSnapshot().world.spatial.missions).at(-1);
        const now = session.readSnapshot().time.winter * session.readSnapshot().ticksPerWinter + session.readSnapshot().time.tick;
        session.command({ type: 'AdvanceTicks', ticks: Math.max(1, mission.task.operateUntil - now - 8) });
        let report = core.inspectSpatialExpeditions(session.readSnapshot()).missions.at(-1);
        for (let tick = 0; tick < 100 && !report.manifest; tick++) {
            read();
            session.command({ type: 'AdvanceTicks', ticks: 1 });
            report = core.inspectSpatialExpeditions(session.readSnapshot()).missions.at(-1);
        }
        assert.equal(report.manifest?.status, 'in-transit');
        assert.ok(report.manifest.cattleIds.length > 0,
            'Normal Fjord command binding supplies reachable actual livestock positions without a renderer');
        assert.ok(report.manifest.cattleIds.every(id => actualCattle.includes(id)));
        assert.ok(report.manifest.cattleIds.every(id => !session.readSnapshot().landing.cattle[id]),
            'The captured source animal is not credited to the destination before arrival');
    }
    assert.equal(observed.session.saveJSON(), plain.session.saveJSON(),
        'Extra presentation reads cannot change captured identities, routes, combat or RNG');
    for (const shared of [plain, observed]) {
        shared.session.command({ type: 'AdvanceTicks', ticks: 500 });
        const state = shared.session.readSnapshot();
        const mission = core.inspectSpatialExpeditions(state).missions.at(-1);
        assert.equal(mission.status, 'Returned');
        assert.equal(mission.manifest.status, 'delivered');
        for (const id of mission.manifest.cattleIds) {
            const receipt = state.events.find(event => event.type === 'LivestockTransferredIn' && event.details.livestockId === id);
            assert.ok(receipt?.details.arrivalPosition);
            assert.deepEqual(state.livestockPresence.animals[id].position, receipt.details.arrivalPosition,
                'The destination physical body starts exactly at the real custody handoff');
            assert.equal(state.world.targetClans[sourceId].livestockPresence.animals[id], undefined,
                'The original source body is removed when the actual identity transfers');
        }
        const restored = SharedSettlement.restore(shared.persist(), 'fjord');
        assert.equal(restored.session.saveJSON(), shared.session.saveJSON(),
            'Actual delivered bodies survive normal save/reattach without cosmetic placement');
    }
    assert.equal(observed.session.saveJSON(), plain.session.saveJSON());
});


test('real annual cattle births during a raid have the same saved bodies and manifest with batched or one-tick commands', () => {
    const { text, target } = productionCattleCampaign({ breeding: true });
    const batched = SharedSettlement.restore(text, 'fjord');
    const stepped = SharedSettlement.restore(text, 'fjord');
    for (const shared of [batched, stepped]) shared.session.command({ type: 'DispatchIslandMission',
        groupId: 'group-1', target, mission: 'Pillage', priorities: ['Cattle'] });
    const state = batched.session.readSnapshot();
    const mission = Object.values(state.world.spatial.missions).at(-1);
    const ticks = mission.task.operateUntil - (state.time.winter * state.ticksPerWinter + state.time.tick) - 8;
    batched.session.command({ type: 'AdvanceTicks', ticks });
    for (let tick = 0; tick < ticks; tick++) stepped.session.command({ type: 'AdvanceTicks', ticks: 1 });
    const final = stepped.session.readSnapshot();
    const source = final.world.targetClans[final.world.island.clanId];
    const births = source.events.filter(event => event.type === 'CattleBorn' && event.time.winter === 801);
    assert.equal(births.length, 2, 'Two real eligible cows give birth through the configured annual breeding rules');
    const singleManifest = core.inspectSpatialExpeditions(final).missions.at(-1).manifest;
    const batchManifest = core.inspectSpatialExpeditions(batched.session.readSnapshot()).missions.at(-1).manifest;
    assert.ok(births.some(event => singleManifest.cattleIds.includes(event.details.cattleId)),
        'A genuinely born reachable animal participates in the actual capture');
    assert.deepEqual(batchManifest, singleManifest,
        'A presentation callback or command size cannot change which actual animal can be captured');
    assert.equal(batched.session.saveJSON(), stepped.session.saveJSON(),
        'Annual births, positions, capture routes, ledger and RNG are cadence-independent');
});

test('a saved static animal keeps its real body on Farmyard assignment and rejects a different adopted site on reattachment', () => {
    const { text } = productionCattleCampaign();
    const shared = SharedSettlement.restore(text, 'fjord');
    const session = shared.session;
    const initial = session.readSnapshot();
    const animalId = Object.keys(initial.landing.cattle)[0];
    const body = structuredClone(initial.livestockPresence.animals[animalId]);
    const farmer = Object.values(initial.personas).find(person => person.occupation === 'farmer');
    const home = Object.values(initial.households).find(home => home.memberIds.includes(farmer.id));
    session.command({ type: 'BuildHouse', householdId: home.id });
    const state = session.readSnapshot();
    const farmyardId = state.residences[state.households[home.id].residenceId].buildingId;
    session.command({ type: 'AssignCattle', cattleId: animalId, farmyardId });
    assert.equal(session.readSnapshot().landing.cattle[animalId].farmyardId, farmyardId);
    assert.deepEqual(session.readSnapshot().livestockPresence.animals[animalId], body,
        'Shelter assignment does not teleport the actual physical animal to a cosmetic yard');
    const projected = shared.fjord.project().entities.find(entity => entity.kind === 'cattle' && entity.id === animalId);
    assert.deepEqual({ x: projected.transform.x, z: projected.transform.z }, body.position);
    assert.equal(projected.status.presence.moving, false);
    assert.equal(SharedSettlement.restore(shared.persist(), 'fjord').session.saveJSON(), session.saveJSON());
    const reattach = coreState => {
        const candidate = new GameplaySession();
        candidate.loadJSON(JSON.stringify(coreState));
        candidate.bindPhysicalWorld(shared.fjord.blueprint, session.readSnapshot().discovery.worldId);
    };
    const wrongSite = session.snapshot();
    const source = wrongSite.world.targetClans[wrongSite.world.island.clanId];
    source.livestockPresence.site.center.x += 1;
    assert.throws(() => reattach(wrongSite), /physical livestock/i);
    const offIsland = session.snapshot();
    const changed = offIsland.livestockPresence.animals[animalId];
    changed.position = changed.home = { x: shared.fjord.blueprint.navigation.bounds.maxX + 1, z: body.home.z };
    assert.throws(() => reattach(offIsland), /livestock bodies.*bound physical island/i);
});
