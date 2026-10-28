import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {loadTypeScript} from '../load-typescript.mjs';
import {campaignIslandInputs} from '../campaign-island-inputs.mjs';
const load = file => loadTypeScript(new URL('../../src/' + file + '.ts', import.meta.url));
const {campaignIslandCatalog} = load('fjord-play/BakedIslandCatalog');
const {planMiningSites, prototypeOreSiteRules} = load('world-generation/OreSites');
const {prototypeMiningPolicy} = load('simulation/Mining');
const {planRoute} = load('world-generation/LandRoutes');
const {routeLength} = load('simulation/SpatialExpeditions');
const {adoptCampaignIsland, islandRecipe, prepareMiningIsland, campaignIslandPlan} = load('fjord-play/CampaignIsland');
const {createFjordLayout, projectFjordSettlement, geographyIdentity} = load('fjord-play/FjordProjection');
const {projectRivalSettlement} = load('fjord-play/RivalSettlement');
const core = load('simulation/SimulationCore');
const sha256 = data => createHash('sha256').update(data).digest('hex');
const output = process.argv[2] ?? 'docs/qa/mining-223/existing-islands-v2.json';
const rows = [];
for (const entry of campaignIslandCatalog.entries.filter(e => e.version === 'island-pool-v3')) {
    const bytes = readFileSync('public' + entry.path);
    if (sha256(bytes) !== entry.sha256) throw new Error('Island transport hash mismatch: ' + entry.seed);
    const payload = JSON.parse(gunzipSync(bytes)), world = payload.world;
    let campaignSeed = 0;
    while (islandRecipe(campaignSeed).seed !== entry.seed) campaignSeed++;
    adoptCampaignIsland(campaignSeed, world, payload.plan);
    const miningWorld = prepareMiningIsland(world), worldId = geographyIdentity(miningWorld);
    const state = core.initializeIslandClans(core.createCampaign(campaignSeed, {}, {}, {enabled: false}, {}, {}, {}, 'summer-800-v1'), miningWorld, worldId);
    const player = projectFjordSettlement(state, miningWorld, createFjordLayout(miningWorld, undefined, campaignSeed));
    const rival = projectRivalSettlement(state.world.targetClans[state.world.island.clanId], miningWorld);
    const box = p => ({minX: p.x-p.halfWidth, maxX: p.x+p.halfWidth, minZ: p.z-p.halfDepth, maxZ: p.z+p.halfDepth});
    const exclusions = [...campaignIslandPlan(miningWorld).plots, ...Object.values(player.layout.plots),
        ...Object.values(rival.layout.plots)].map(box);
    for (const fire of [player.campfire, rival.campfire]) exclusions.push({minX: fire.transform.x-5,
        maxX: fire.transform.x+5, minZ: fire.transform.z-5, maxZ: fire.transform.z+5});
    const started = performance.now(), plan = miningWorld.oreSites;
    const sites = plan.sites.map(site => {
        const row = {...site, playerRouteMetres: routeLength(planRoute({world}, site.approach, undefined, true).route)};
        try {row.foundingRouteMetres = routeLength(planRoute({world, exclusions}, site.approach, world.settlement.center, true).route);}
        catch (error) {row.foundingRouteFailure = error.message;}
        return row;
    });
    rows.push({seed: entry.seed, campaignSeed, historical: true,
        accessibleAroundFoundingPlots: sites.filter(s => s.foundingRouteMetres !== undefined).length, transportSha256: entry.sha256,
        canonicalSha256: entry.canonicalSha256, status: sites.some(s => s.foundingRouteMetres !== undefined) ? 'mining-suitable' : 'no-accessible-ore',
        wetPatches: plan.wetLowlands?.patches.length ?? 0,
        rockAccessible: sites.filter(s => s.appearance === 'rock-outcrop' && s.foundingRouteMetres !== undefined).length,
        bogAccessible: sites.filter(s => s.appearance === 'bog-iron' && s.foundingRouteMetres !== undefined).length,
        sites, totalUnits: sites.reduce((n, s) => n + s.initialUnits, 0),
        inspected: plan.inspected, candidates: plan.candidates, routeChecks: plan.routeChecks,
        inaccessible: plan.inaccessible, reasons: plan.reasons, elapsedMs: performance.now() - started});
}
const report = {version: 2, qaOnly: true, rules: prototypeOreSiteRules, mining: prototypeMiningPolicy,
    generatorInputs: campaignIslandInputs(), runnerSha256: sha256(readFileSync(new URL(import.meta.url))),
    note: 'All existing current-pool islands were measured; this does not append candidates or activate mining defaults.', rows};
mkdirSync(new URL('../../docs/qa/mining-223/', import.meta.url), {recursive: true});
writeFileSync(output, JSON.stringify(report, null, 2));
console.log(JSON.stringify(rows.map(r => ({seed: r.seed, status: r.status, sites: r.sites.length,
    totalUnits: r.totalUnits, accessibleAroundFoundingPlots: r.accessibleAroundFoundingPlots, nearestMetres: Math.round(Math.min(...r.sites.map(s => s.playerRouteMetres)))}))));
