import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { loadTypeScript } from '../load-typescript.mjs';

const load = file => loadTypeScript(new URL('../../src/' + file + '.ts', import.meta.url));
const core = load('simulation/SimulationCore');
const { campaignIslandCatalog } = load('fjord-play/BakedIslandCatalog');
const { adoptCampaignIsland, islandRecipe } = load('fjord-play/CampaignIsland');
const { geographyIdentity } = load('fjord-play/FjordProjection');
const { GameplaySession } = load('gameplay-lab/GameplaySession');
const { SharedSettlement } = load('play/SharedSettlement');
const { fjordLivestockRules } = load('config/FjordLivestock');
const { planRoute } = load('world-generation/LandRoutes');

const seed = 25;
assert.equal(islandRecipe(seed).seed, 7);
const entry = campaignIslandCatalog.entries.find(value =>
    value.version === 'island-pool-v3' && value.seed === 7);
const payload = JSON.parse(gunzipSync(readFileSync('public' + entry.path)));
adoptCampaignIsland(seed, payload.world, payload.plan);
const campaign = core.createCampaign(seed,
    { initialFood: 10000, initialMaterials: 500 },
    { mortalityBands: [{ minAge: 0, chanceBps: 0 }], fertilityChanceBps: 0,
        partnershipChanceBps: 0, switchTicks: 0, workPerUnit: 100000 },
    { enabled: false }, {}, {}, {}, 'summer-800-v1', undefined,
    { player: fjordLivestockRules });
const session = new GameplaySession();
session.loadJSON(core.serializeState(campaign));
const shared = new SharedSettlement(session, undefined, true, 'island-pool-v3');
shared.fjord.prepareMining();
shared.fjord.enableDiscovery();
shared.session.initializeMining(shared.fjord.blueprint, geographyIdentity(shared.fjord.blueprint));
const command = value => shared.command(value);
const state = () => shared.session.readSnapshot();
const advance = ticks => command({ type: 'AdvanceTicks', ticks });
const waitUntil = (predicate, limit, label) => {
    for (let elapsed = 0; !predicate() && elapsed < limit; elapsed += 25) advance(25);
    assert.ok(predicate(), label);
};
for (const id of Object.keys(state().personas))
    command({ type: 'AssignOccupation', personaId: id, occupation: null });
const world = shared.fjord.blueprint;
const site = [...state().mining.sites].filter(value => value.initialUnits >= 12)
    .sort((a, b) => Math.hypot(a.approach.x - world.settlement.center.x,
        a.approach.z - world.settlement.center.z) -
        Math.hypot(b.approach.x - world.settlement.center.x,
            b.approach.z - world.settlement.center.z))
    .find(value => {
        try { return planRoute({ world }, value.approach, undefined, true).route.length > 0; }
        catch { return false; }
    });
assert.ok(site, 'The shipping island must have a reachable actual deposit.');
command({ type: 'CreateExpeditionGroup', name: 'Ore survey', memberIds: ['founder-2'] });
command({ type: 'StartExpedition', groupId: 'group-1' });
command({ type: 'ExploreArea', groupId: 'group-1', target: site.approach });
waitUntil(() => core.inspectMining(state()).sites.some(value => value.id === site.id),
    2000, 'The paid scout must actually sight the deposit.');
command({ type: 'AssignOccupation', personaId: 'founder-1', occupation: 'miner' });
command({ type: 'AssignMiner', personaId: 'founder-1', siteId: site.id });
waitUntil(() => state().specialistStocks.ironOre >= 12, 3000,
    'A real Miner must extract the complete ore supply.');
command({ type: 'RecallMiner', personaId: 'founder-1' });
waitUntil(() => !state().mining.workers['founder-1'], 3000, 'The Miner must return home.');
command({ type: 'AssignOccupation', personaId: 'founder-1', occupation: null });
command({ type: 'RecallExpedition', groupId: 'group-1' });
waitUntil(() => !core.personaAway(state(), 'founder-2'), 3000, 'The scout must return home.');

const matureAnimals = () => Object.values(state().landing.cattle).filter(animal =>
    animal.deathWinter === null && state().landing.livestock.hides[animal.species] > 0 &&
    state().time.winter - animal.birthWinter >= 2);
waitUntil(() => matureAnimals().length >= 3, 4000, 'Three actual hide-bearing animals must mature.');
for (const animal of matureAnimals().slice(0, 3))
    command({ type: 'SlaughterLivestock', livestockId: animal.id });
assert.equal(state().specialistStocks.hides, 3);

command({ type: 'AssignOccupation', personaId: 'founder-1', occupation: 'smith' });
command({ type: 'AssignOccupation', personaId: 'founder-3', occupation: 'leatherAndJewelleryMaker' });
const products = ['woodenSpear', 'woodenShield', 'leatherShield', 'ironSpear',
    'ironShield', 'leatherBodyArmor', 'ironHelmet'];
for (const item of products) command({ type: 'SetSmitheryTarget', item, target: 1 });
waitUntil(() => products.every(item => state().smithery.stored[item] === 1), 3000,
    'Ordinary paid work must complete all seven stock targets.');
assert.equal(state().specialistStocks.hides, 0);


// Pay for real reconnaissance on the shipping island before offering a combat-ready save.
const { discoveryAt, inspectClanDiscovery } = load('simulation/ClanDiscovery');
command({ type: 'StartExpedition', groupId: 'group-1' });
command({ type: 'ExploreArea', groupId: 'group-1', target: world.rivalSite.center });
waitUntil(() => discoveryAt(inspectClanDiscovery(state().discovery, state().clan.id),
    world.rivalSite.center.x, world.rivalSite.center.z) !== 'unknown', 3000,
    'The scout must actually map the rival area.');
command({ type: 'RecallExpedition', groupId: 'group-1' });
waitUntil(() => !core.personaAway(state(), 'founder-2'), 3000, 'The scout must return before Recon.');
let reconAttempts = 0;
while (!core.inspectIslandMissions(state()).sites.some(value => value.knowledge?.opportunity) &&
    reconAttempts < 8) {
    command({ type: 'DispatchIslandMission', groupId: 'group-1',
        target: { kind: 'area', position: world.rivalSite.center }, mission: 'Recon' });
    waitUntil(() => !core.personaAway(state(), 'founder-2'), 3000,
        'The paid reconnaissance mission must return.');
    reconAttempts++;
}
const pillageSite = core.inspectIslandMissions(state()).sites.find(value => value.knowledge?.opportunity);
assert.ok(pillageSite,
    'A real Recon outcome must establish a viable opportunity; no knowledge is injected.');
// Use the same prospective public adoption as the shipping FjordSide browser.
const beforeTerritory = state();
shared.fjord.enableTerritorialAwareness();
assert.equal(state().world.territory?.version, 1, 'The review campaign must enable real territorial awareness.');
assert.deepEqual(state().time, beforeTerritory.time);
assert.equal(state().rngState, beforeTerritory.rngState);
assert.deepEqual(state().stocks, beforeTerritory.stocks);
assert.deepEqual(state().events.slice(0, beforeTerritory.events.length), beforeTerritory.events,
    'Territorial adoption must preserve every earlier factual receipt.');
command({ type: 'CreateExpeditionGroup', name: 'Armor QA', memberIds: ['founder-1', 'founder-3'] });
for (const [slot, item] of [['weapon', 'ironSpear'], ['shield', 'ironShield'],
    ['bodyArmor', 'leatherBodyArmor'], ['headgear', 'ironHelmet']])
    command({ type: 'AssignEquipment', personaId: 'founder-1', slot, item });
command({ type: 'AssignEquipment', personaId: 'founder-3', slot: 'weapon', item: 'woodenSpear' });
command({ type: 'AssignEquipment', personaId: 'founder-3', slot: 'shield', item: 'woodenShield' });
const pillageOffer = shared.session.islandMissionOffer('group-2',
    { kind: 'site', siteId: pillageSite.id }, 'Pillage', ['Food']);
assert.equal(pillageOffer.encounter?.version, 1,
    'The actual available Pillage offer must use on-site combat, not legacy return risk.');
assert.equal(pillageOffer.equipment?.version, 3,
    'The offer must freeze the actual four-slot personal loadout.');
shared.session.setRunning(false);

const directory = 'scratch/personal-armor-review-333';
mkdirSync(directory, { recursive: true });
writeFileSync(directory + '/review.html', readFileSync('scripts/qa/personal-armor-review.html'));
writeFileSync(directory + '/fjord-theme.css', readFileSync('src/ui/fjord-theme.css'));
// Match the ordinary player download format, accepted by start-menu and in-game import.
const validatePlayerFile = text => {
    const restored = SharedSettlement.restore(text, 'fjord');
    assert.equal(restored.session.running, false, 'Opening the review save must remain paused.');
    const canonical = restored.session.saveJSON();
    restored.importJSON(text);
    assert.equal(restored.session.running, false, 'In-game reimport must remain paused.');
    assert.equal(restored.session.saveJSON(), canonical,
        'The ordinary in-game importer must preserve every canonical fact.');
};
const homeText = shared.fjord.exportJSON();
validatePlayerFile(homeText);
writeFileSync(directory + '/home-campaign.json', homeText);
command({ type: 'StartExpedition', groupId: 'group-2' });
command({ type: 'ExploreArea', groupId: 'group-2', target: site.approach });
const fieldMission = Object.values(state().world.spatial.missions).find(mission =>
    mission.groupId === 'group-2' && mission.status === 'Traveling');
assert.equal(fieldMission?.encounterRules?.version, 1,
    'The field save must retain on-site encounter rules for the new journey.');
shared.session.setRunning(false);
const fieldText = shared.fjord.exportJSON();
validatePlayerFile(fieldText);
writeFileSync(directory + '/field-campaign.json', fieldText);
const context = {
    seed, islandSeed: 7, worldId: geographyIdentity(world), siteId: site.id,
    raiderId: 'founder-1', name: state().personas['founder-1'].name, groupId: 'group-2',
    reconAttempts, materials: state().stocks.materials, ironOre: state().specialistStocks.ironOre,
    onSiteCombat: true, territoryVersion: state().world.territory.version,
    pillageSiteId: pillageSite.id, pillageEncounterVersion: pillageOffer.encounter.version,
    fieldEncounterVersion: fieldMission.encounterRules.version, time: state().time,
    saveFormat: { kind: 'FjordCampaign', bridgeVersion: JSON.parse(homeText).bridgeVersion,
        sharedWrapper: false, pausedOnRestore: true, inGameImportValidated: true },
    note: 'Actual shipping island and recipe. Ore is mined, Hides are slaughtered, and all gear is paid work. Only initial QA supplies, demographic stability and the saved labour threshold are explicit test settings.',
    labour: { workPerUnit: state().mechanics.config.workPerUnit },
    homeBytes: Buffer.byteLength(homeText), fieldBytes: Buffer.byteLength(fieldText),
};
writeFileSync(directory + '/context.json', JSON.stringify(context, null, 2) + '\n');
console.log(JSON.stringify(context));
