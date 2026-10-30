import fs from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { loadTypeScript } from '../load-typescript.mjs';

const load = file => loadTypeScript(new URL(`../../src/${file}.ts`, import.meta.url));
const { SharedSettlement } = load('play/SharedSettlement');
const { campaignIslandCatalog } = load('fjord-play/BakedIslandCatalog');
const { islandRecipe, adoptCampaignIsland } = load('fjord-play/CampaignIsland');
const { useSeasonalFjordProduction, useFjordCulturalOccasions } = load('fjord-play/FjordScenario');
const { inspectSpatialExpeditions, personaAge } = load('simulation/SimulationCore');
const directory = 'docs/qa/three-r187-323/fixtures';
fs.mkdirSync(directory, { recursive: true });

// Reuse the existing controlled rich-household performance fixture. These are
// benchmark stocks, not a balance experiment or a changed founding default.
const source = 'docs/qa/fjord-runtime-performance/fixtures/developed-810.json';
const sourceText = fs.readFileSync(source, 'utf8');
const original = SharedSettlement.restore(sourceText, 'fjord');
const session = original.session;
useSeasonalFjordProduction(session);
useFjordCulturalOccasions(session);
const recipe = islandRecipe(session.readSnapshot().seed, 'island-pool-v3');
const entry = campaignIslandCatalog.entries.find(item => item.version === recipe.version && item.seed === recipe.seed);
const payload = JSON.parse(gunzipSync(fs.readFileSync('public' + entry.path)));
adoptCampaignIsland(session.readSnapshot().seed, payload.world, payload.plan);
const shared = new SharedSettlement(session, undefined, true, 'island-pool-v3');
shared.fjord.enableDiscovery();
shared.command({ type: 'CreateExplorationGroup' });
const state = session.readSnapshot();
const group = Object.values(state.world.groups).at(-1);
const members = Object.values(state.personas).filter(person => person.deathWinter === null && personaAge(state, person.id) >= 18);
for (const person of members.slice(0, 2)) {
    shared.command({ type: 'SetExplorationMember', groupId: group.id, personaId: person.id, included: true });
}
shared.command({ type: 'StartExpedition', groupId: group.id });
const prepared = inspectSpatialExpeditions(session.readSnapshot()).missions.find(mission => mission.groupId === group.id);
let destination;
const rejectedDestinations = [];
for (const [dx, dz] of [[36,0], [0,36], [-36,0], [0,-36], [24,24], [-24,24], [24,-24], [-24,-24]]) {
    const target = { x: prepared.position.x + dx, z: prepared.position.z + dz };
    const command = { type: 'ExploreArea', groupId: group.id, target };
    try {
        session.exploreOffer(group.id, target);
        shared.command(command);
        destination = target;
        break;
    } catch (error) {
        rejectedDestinations.push({ target, reason: error.message });
    }
}
if (!destination) throw new Error('No legal nearby exploration destination.');
session.setRunning(false);
session.setMinutesPerWinter(3);
const fire = shared.fjord.readProjection().entities.find(entity => entity.kind === 'campfire');
if (!fire?.transform) throw new Error('Missing settlement viewpoint.');
const target = [fire.transform.x, fire.transform.y + 2, fire.transform.z];
shared.setPresentation({ quality: 'low', effects: 'low', hdr: false,
    camera: { target, position: [target[0] + 65, target[1] + 78, target[2] + 95] } });
const fixtureText = shared.persist();
SharedSettlement.restore(fixtureText, 'fjord');
fs.writeFileSync(`${directory}/settlement-expedition.json`, fixtureText);
for (const [name, input] of [['winter', 'winter-mine-campaign'], ['marsh', 'bog-campaign']]) {
    const fixture = SharedSettlement.restore(fs.readFileSync(`docs/qa/mining-223/${input}.json`, 'utf8'), 'fjord');
    fixture.session.setRunning(false);
    fs.writeFileSync(`${directory}/${name}.json`, fixture.persist());
}
const digest = text => createHash('sha256').update(text).digest('hex');
const manifest = { source, sourceSHA256: digest(sourceText), note: 'Existing rich QA stocks; legal current physical exploration commands; no rendering/rule changes.',
    campaignSeed: state.seed, recipe, geographySHA256: entry.canonicalSha256,
    residents: Object.values(state.personas).filter(person => person.deathWinter === null).length, adultMembers: members.length, buildings: Object.keys(state.buildings).length,
    group: group.id, members: members.slice(0,2).map(person => person.id), destination, rejectedDestinations,
    fixtures: Object.fromEntries(fs.readdirSync(directory).map(file => [file, digest(fs.readFileSync(`${directory}/${file}`))])) };
fs.writeFileSync('docs/qa/three-r187-323/fixture-manifest.json', JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify(manifest));
