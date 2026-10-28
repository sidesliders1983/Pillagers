import {probeRivalAccess} from './mining-route-probe.mjs';
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {BufferGeometry, Float32BufferAttribute, Group, Matrix4, Mesh, Vector3, Box3} from 'three';
import {terrainIO} from '../terrain-io.mjs';
import {loadTypeScript} from '../load-typescript.mjs';
const seed = Number(process.argv[2]), output = process.argv[3];
const load = file => loadTypeScript(new URL('../../src/' + file + '.ts', import.meta.url));
const {generateWorld} = load('world-generation/GenerateWorld');
const {prepareCampaignIsland, prepareMiningIsland, campaignIslandPlan} = load('fjord-play/CampaignIsland');
const {planRoute} = load('world-generation/LandRoutes');
const {routeLength} = load('simulation/SpatialExpeditions');
const {planCampaignDock} = load('world/WorldAttachments');
const {createFjordLayout, projectFjordSettlement, geographyIdentity} = load('fjord-play/FjordProjection');
const {projectRivalSettlement} = load('fjord-play/RivalSettlement');
const core = load('simulation/SimulationCore');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const started = performance.now(), result = {seed, status: 'technical-failure', reasons: []};
try {
    const source = generateWorld({seed, preset: 'island', generatorVersion: 'fjordside-island-v0.3e-r3',
        conifers: 'ez-tree', environment: {version: 1}}, undefined, {retainNaturalIslandTerrain: true});
    result.sourceValidation = source.validation;
    if (!source.validation.accepted) {result.status = 'invalid-geography'; throw new Error(source.validation.reasons.join('; '));}
    let world;
    try {world = prepareMiningIsland(prepareCampaignIsland(source, 'island-pool-v3'));}
    catch (error) {result.status = 'preparation-failure'; throw error;}
    const plan = campaignIslandPlan(world), worldId = geographyIdentity(world);
    result.wetLowlands = {patches: world.oreSites.wetLowlands?.patches.length ?? 0, eligibleCells: world.oreSites.wetLowlands?.eligibleCells ?? 0, bogSites: world.oreSites.sites.filter(s => s.appearance === 'bog-iron').length, reasons: world.oreSites.reasons};
    result.plan = {plots: plan.plots.length, maximumAdjustment: plan.maximumAdjustment, access: plan.access};
    if (!world.oreSites.sites.length) {result.status = 'no-accessible-ore'; throw new Error(world.oreSites.reasons.join('; '));}
    // Decode the actual runtime pier, with the same grounded geometry as production.
    const bytes = await readFile('public/terrain/jetty-pier.glb');
    const document = await (await terrainIO()).readBinary(bytes), root = new Group();
    function geometry(node) {
        const matrix = new Matrix4().fromArray(node.getWorldMatrix());
        for (const primitive of node.getMesh()?.listPrimitives() ?? []) {
            const source = primitive.getAttribute('POSITION').getArray(), positions = new Float32Array(source.length);
            for (let i = 0; i < source.length; i += 3)
                positions.set(new Vector3(source[i], source[i+1], source[i+2]).applyMatrix4(matrix).toArray(), i);
            const mesh = new BufferGeometry(); mesh.setAttribute('position', new Float32BufferAttribute(positions, 3));
            root.add(new Mesh(mesh));
        }
        for (const child of node.listChildren()) geometry(child);
    }
    for (const node of document.getRoot().listScenes()[0].listChildren()) geometry(node);
    const bounds = new Box3().setFromObject(root), center = bounds.getCenter(new Vector3());
    root.position.set(-center.x, -bounds.min.y, -center.z);
    try {result.dock = planCampaignDock({get: () => root.clone()}, world);}
    catch (error) {result.status = 'pier-failure'; throw error;}
    finally {root.traverse(mesh => {mesh.geometry?.dispose(); mesh.material?.dispose();});}
    result.pierSha256 = sha256(bytes);
    let state = core.initializeIslandClans(core.createCampaign(seed, {}, {}, {enabled: false}, {}, {}, {}, 'summer-800-v1'), world, worldId);
    state = core.initializePhysicalMining(state, world, worldId);
    const player = projectFjordSettlement(state, world, createFjordLayout(world, undefined, seed));
    const rival = projectRivalSettlement(state.world.targetClans[state.world.island.clanId], world);
    if ([...player.entities, ...rival.entities].some(e => !e.transform && !e.status.indoorReason))
        throw new Error('A founding entity cannot occupy its real plot.');
    const box = p => ({minX: p.x-p.halfWidth, maxX: p.x+p.halfWidth, minZ: p.z-p.halfDepth, maxZ: p.z+p.halfDepth});
    const exclusions = [...plan.plots, ...Object.values(player.layout.plots), ...Object.values(rival.layout.plots)].map(box);
    for (const fire of [player.campfire, rival.campfire]) exclusions.push({minX: fire.transform.x-5,
        maxX: fire.transform.x+5, minZ: fire.transform.z-5, maxZ: fire.transform.z+5});
    const context = {world, worldId, exclusions};
    try {result.rivalAccess = probeRivalAccess(state, context);}
    catch (error) {result.status = 'rival-route-failure'; throw error;}
    result.sites = world.oreSites.sites.map(site => {
        try {return {...site, routeMetres: routeLength(planRoute(context, site.approach, world.settlement.center, true).route)};}
        catch (error) {return {...site, routeFailure: error.message};}
    });
    const site = result.sites.find(s => s.appearance === 'bog-iron' && s.routeMetres !== undefined) ??
        result.sites.find(s => s.routeMetres !== undefined);
    if (!site) {result.status = 'mining-route-failure'; throw new Error('No site has a route around the actual founding plots.');}
    const residents = Object.keys(state.personas).sort().filter(id => core.personaAge(state, id) >= 18);
    const scout = residents[0], miner = residents[1];
    state = core.applyCommand(state, {type: 'CreateExplorationGroup'}, context);
    state = core.applyCommand(state, {type: 'SetExplorationMember', groupId: 'group-1', personaId: scout, included: true}, context);
    const initialFood = state.stocks.food;
    state = core.applyCommand(state, {type: 'StartExpedition', groupId: 'group-1'}, context);
    const expeditionFoodCharged = initialFood - state.stocks.food;
    state = core.applyCommand(state, {type: 'ExploreArea', groupId: 'group-1', target: site.approach}, context);
    state = core.applyCommand(state, {type: 'AdvanceTicks', ticks: Math.ceil(site.routeMetres/2)+5}, context);
    state = core.applyCommand(state, {type: 'AssignOccupation', personaId: miner, occupation: 'miner'});
    state = core.applyCommand(state, {type: 'AssignMiner', personaId: miner, siteId: site.id}, context);
    state = core.applyCommand(state, {type: 'AdvanceTicks', ticks: Math.ceil(site.routeMetres/2)+1600}, context);
    const restored = core.reconstructState(core.serializeState(state));
    if (!state.specialistStocks.ironOre) {result.status='mining-production-unconfirmed'; throw new Error('No ore during the bounded undeveloped-production proof.');}
    if (JSON.stringify(restored) !== JSON.stringify(state)) throw new Error('The real mining/save proof failed round-trip.');
    result.proof = {scout, miner, siteId: site.id, source: site.appearance, initialFood, expeditionFoodCharged,
        ironOre: state.specialistStocks.ironOre, time: state.time,
        events: state.events.filter(e => ['MinerAssigned','OreSiteAssessed','IronOreExtracted','MinerReturned'].includes(e.type)),
        saveSha256: sha256(core.serializeState(state))};
    const json = Buffer.from(JSON.stringify({format: 'fjordside-mining-island-candidate-v1', qaOnly: true, world, plan}));
    const compressed = gzipSync(json, {level: 9});
    await mkdir(output + '/candidates', {recursive: true});
    const filename = `island-${seed}-${sha256(compressed).slice(0,12)}.json.bin`;
    await writeFile(output + '/candidates/' + filename, compressed);
    result.export = {filename, bytes: compressed.length, jsonBytes: json.length,
        sha256: sha256(compressed), canonicalSha256: sha256(json)};
    result.status = 'qualified-export';
} catch (error) {
    result.reasons.push(error.message);
    if (result.status === 'technical-failure') result.stack = error.stack;
}
result.elapsedMs = performance.now()-started;
result.maxRssKiB = process.resourceUsage().maxRSS;
console.log(JSON.stringify(result));
