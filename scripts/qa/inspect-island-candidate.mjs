import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { resolve } from 'node:path';
import { BufferGeometry, Float32BufferAttribute, Group, Matrix4, Mesh, Vector3, Box3 } from 'three';
import { terrainIO } from '../terrain-io.mjs';
import { loadTypeScript } from '../load-typescript.mjs';

const seed = Number(process.argv[2]);
const sweep = resolve(process.argv[3] ?? 'scratch/island-seed-expansion/run-1');
const output = resolve(process.argv[4] ?? 'scratch/island-seed-expansion/inspections');
const load = path => loadTypeScript(new URL('../../src/' + path + '.ts', import.meta.url));
const { generateWorld } = load('world-generation/GenerateWorld');
const { prepareCampaignIsland, campaignIslandPlan } = load('fjord-play/CampaignIsland');
const { newFjordScenario } = load('fjord-play/FjordScenario');
const core = load('simulation/SimulationCore');
const { createFjordLayout, projectFjordSettlement, geographyIdentity } = load('fjord-play/FjordProjection');
const { projectRivalSettlement, inspectRivalSettlement } = load('fjord-play/RivalSettlement');
const { planRoute, prototypeExplorePolicy } = load('simulation/SpatialExpeditions');
const { expeditionEligible } = load('simulation/WorldExpeditions');
const { planCampaignDock } = load('world/WorldAttachments');
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const previous = JSON.parse(await readFile(sweep + '/results/' + seed + '.json', 'utf8'));
if (!previous.preparationPassed) throw new Error('Inspect prepared candidates only.');
const source = generateWorld({ seed, preset: 'island', generatorVersion: 'fjordside-island-v0.3e-r3',
    conifers: 'ez-tree', environment: { version: 1 } });
const world = prepareCampaignIsland(source, 'island-pool-v2');
const plan = campaignIslandPlan(world), worldId = geographyIdentity(world);
const report = { seed, sweepProtocolSha256: previous.protocolSha256,
    inspectionRunnerSha256: createHash('sha256').update(await readFile(new URL(import.meta.url))).digest('hex'),
    repeatedBlueprintIdentical: hash(world) === previous.blueprintSha256,
    repeatedPlanIdentical: hash(plan) === previous.planSha256, checks: {}, findings: [], cohorts: [] };

// Decode the actual published pier. The production dock planner measures this same
// grounded vertex geometry; no replacement box or altered asset dimensions are used.
const jettyBytes = await readFile('public/terrain/jetty-pier.glb');
const jettyDocument = await (await terrainIO()).readBinary(jettyBytes);
const jettyRoot = new Group();
function addPrimitiveGeometry(node) {
    const matrix = new Matrix4().fromArray(node.getWorldMatrix());
    for (const primitive of node.getMesh()?.listPrimitives() ?? []) {
        const sourcePositions = primitive.getAttribute('POSITION').getArray();
        const positions = new Float32Array(sourcePositions.length);
        for (let i = 0; i < sourcePositions.length; i += 3) {
            const point = new Vector3(sourcePositions[i], sourcePositions[i + 1], sourcePositions[i + 2]).applyMatrix4(matrix);
            positions.set(point.toArray(), i);
        }
        const geometry = new BufferGeometry();
        geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
        jettyRoot.add(new Mesh(geometry));
    }
    for (const child of node.listChildren()) addPrimitiveGeometry(child);
}
for (const node of jettyDocument.getRoot().listScenes()[0].listChildren()) addPrimitiveGeometry(node);
const jettyBounds = new Box3().setFromObject(jettyRoot), jettyCenter = jettyBounds.getCenter(new Vector3());
jettyRoot.position.set(-jettyCenter.x, -jettyBounds.min.y, -jettyCenter.z);
report.checks.jettySourceSha256 = createHash('sha256').update(jettyBytes).digest('hex');
let dock;
try {
    dock = planCampaignDock({ get: key => {
        if (key !== 'jetty') throw new Error('Unexpected dock asset: ' + key);
        return jettyRoot.clone();
    } }, world);
    report.checks.authoredPier = { supported: true, attachments: dock };
} catch (error) { report.findings.push('Authored pier: ' + error.message); }
jettyRoot.traverse(node => { if (node instanceof Mesh) { node.geometry.dispose(); node.material.dispose(); } });

// This construction fixture funds Materials only, explicitly separate from the travel probe.
let builtState = core.createCampaign(seed, { foundingCoupleCap: 0, initialMaterials: 10000 },
    {}, { enabled: false }, {}, {}, {}, 'summer-800-v1');
// The same explicit occupation commands on every seed avoid requesting unsupported
// upgraded Farmyard art merely because a random founder happened to be a farmer.
for (const personaId of Object.keys(builtState.personas))
    builtState = core.applyCommand(builtState, { type: 'AssignOccupation', personaId, occupation: 'woodworker' });
let view = projectFjordSettlement(builtState, world, createFjordLayout(world, undefined, seed));
report.checks.independentFoundingHouseholds = view.entities.filter(entity => entity.kind === 'household' && entity.transform).length;
const homeIds = Object.keys(builtState.households);
for (const householdId of homeIds) builtState = core.applyCommand(builtState, { type: 'BuildHouse', householdId });
builtState = core.applyCommand(builtState, { type: 'AssignOccupation', personaId: 'founder-1', occupation: 'farmer' });
builtState = core.applyCommand(builtState, { type: 'AssignCattle', cattleId: 'cattle-1', farmyardId: 'house-1' });
builtState = core.applyCommand(builtState, { type: 'SpecializeBuilding', buildingId: 'house-2', occupation: 'woodworker' });
for (let upgrade = 0; upgrade < 2; upgrade++)
    builtState = core.applyCommand(builtState, { type: 'UpgradeBuilding', buildingId: 'house-2' });
view = projectFjordSettlement(builtState, world, view.layout);
report.checks.convertedHouses = view.entities.filter(entity => entity.kind === 'building' && entity.transform).length;
report.checks.groundPaths = view.ground.paths.length;
report.checks.farmyard = view.entities.find(entity => entity.id === 'house-1')?.status.farmyard === true;
report.checks.longhouse = view.entities.find(entity => entity.id === 'house-2')?.asset === 'longhouse';
report.checks.allEntitiesPlaced = view.entities.every(entity => entity.transform || entity.status.indoorReason);
report.checks.diagnostics = view.diagnostics;
const houseManifest = JSON.parse(await readFile('public/game-assets/houses/manifest.json', 'utf8'));
report.checks.authoredFootprints = view.entities.filter(entity => entity.kind === 'building').map(entity => {
    const bounds = houseManifest.assets[entity.asset]?.bounds;
    const plot = entity.plot;
    if (!bounds || !plot) return { id: entity.id, fits: false, reason: 'Missing source bounds or plot.' };
    const sin = Math.sin(plot.rotation), cos = Math.cos(plot.rotation);
    const height = bounds.max[1] - bounds.min[1];
    const homestead = houseManifest.assets.homestead.bounds;
    const scale = entity.asset === 'longhouse' ? (homestead.max[1] - homestead.min[1]) / height : 1;
    const corners = [bounds.min[0], bounds.max[0]].flatMap(x =>
        [bounds.min[2], bounds.max[2]].map(z => ({ x: (x * cos + z * sin) * scale,
            z: (z * cos - x * sin) * scale })));
    return { id: entity.id, asset: entity.asset, fits: corners.every(point =>
        Math.abs(point.x) <= plot.halfWidth && Math.abs(point.z) <= plot.halfDepth) };
});

const box = plot => ({ minX: plot.x - plot.halfWidth, maxX: plot.x + plot.halfWidth,
    minZ: plot.z - plot.halfDepth, maxZ: plot.z + plot.halfDepth });
let sceneEntities;
for (const campaignSeed of [seed, (seed + 10000) >>> 0, (seed + 20000) >>> 0]) {
    const initial = newFjordScenario(campaignSeed).snapshot();
    const state = core.initializeIslandClans(initial, world, worldId);
    const target = state.world.targetClans[state.world.island.clanId];
    const rival = projectRivalSettlement(target, world);
    const player = projectFjordSettlement(state, world, createFjordLayout(world, undefined, campaignSeed));
    const hidden = inspectRivalSettlement(state, world, rival);
    const cohort = { campaignSeed, playerSpecies: Object.values(state.landing.cattle)[0].species,
        rivalSpecies: Object.values(target.landing.cattle)[0].species,
        rivalHouseholds: Object.keys(target.households).length,
        allRivalEntitiesPlaced: rival.entities.every(entity => entity.transform || entity.status.indoorReason),
        rivalInitiallyHidden: hidden.entities.length === 0 && !hidden.known,
        originalHumanFoundersUnchanged: hash(state.personas) === hash(initial.personas) };
    report.cohorts.push(cohort);
    if (sceneEntities) continue;
    sceneEntities = { player: player.entities, built: view.entities, rival: rival.entities,
        campfire: player.campfire, rivalCampfire: rival.campfire };
    const exclusions = [...plan.plots, ...Object.values(player.layout.plots), ...Object.values(rival.layout.plots)].map(box);
    for (const fire of [player.campfire, rival.campfire]) exclusions.push({
        minX: fire.transform.x - 5, maxX: fire.transform.x + 5,
        minZ: fire.transform.z - 5, maxZ: fire.transform.z + 5 });
    const context = { world, worldId, exclusions };
    try {
        const outbound = planRoute(context, world.rivalSite.center, undefined, true);
        const inbound = planRoute(context, world.settlement.center, outbound.target, true);
        const length = route => route.slice(1).reduce((sum, point, index) =>
            sum + Math.hypot(point.x - route[index].x, point.z - route[index].z), 0);
        report.checks.physicalRoutes = { outboundMetres: length(outbound.route),
            inboundMetres: length(inbound.route), adjustedRivalTarget: outbound.adjusted };
        let travel = core.applyCommand(state, { type: 'CreateExplorationGroup' }, context);
        const groupId = Object.keys(travel.world.groups)[0];
        const eligible = Object.keys(travel.personas).filter(id => expeditionEligible(travel, id));
        // One person can afford the current eight-Food pack from the real 15-Food start.
        if (!eligible.length) throw new Error('No eligible founder for the reachability probe.');
        travel = core.applyCommand(travel, { type: 'SetExplorationMember', groupId, personaId: eligible[0], included: true }, context);
        travel = core.applyCommand(travel, { type: 'StartExpedition', groupId }, context);
        const afterPayment = travel.stocks.food;
        travel = core.applyCommand(travel, { type: 'ExploreArea', groupId, target: world.rivalSite.center }, context);
        const outboundTicks = Math.ceil(length(outbound.route) / prototypeExplorePolicy.metresPerTick) + 5;
        travel = core.applyCommand(travel, { type: 'AdvanceTicks', ticks: outboundTicks }, context);
        const serialized = core.serializeState(travel);
        const restored = core.reconstructState(serialized);
        report.checks.travelSaveRoundTrip = core.serializeState(restored) === serialized;
        const missionAtTarget = Object.values(travel.world.spatial.missions).at(-1);
        travel = core.applyCommand(restored, { type: 'RecallExpedition', groupId }, context);
        travel = core.applyCommand(travel, { type: 'AdvanceTicks', ticks:
            Math.ceil(length(inbound.route) / prototypeExplorePolicy.metresPerTick) + 30 }, context);
        const completed = Object.values(travel.world.spatial.missions).at(-1);
        report.checks.travel = { groupId, members: 1, initialFood: state.stocks.food,
            foodCharged: state.stocks.food - afterPayment, outboundTicks,
            stateAtTarget: missionAtTarget.status, finalStatus: completed.status,
            currentFoodPerMember: completed.provisions?.foodPerMember,
            testCapacityOverride: false, returned: completed.status === 'Returned' };
    } catch (error) { report.findings.push('Physical reachability probe: ' + error.message); }
}

await mkdir(output, { recursive: true });
await writeFile(output + '/' + seed + '.json', JSON.stringify(report, null, 2));
// Full canonical surface, shared terrain builder and genuine projected assets for developer views.
// Derived render inputs stay in ignored scratch; only compact review captures are published.
await writeFile(output + '/' + seed + '-render.json.gz', gzipSync(JSON.stringify({ qaOnly: true,
    world: { config: world.config, terrain: world.terrain, environment: world.environment, waterLevel: world.waterLevel },
    plan, dock, shore: world.settlement.harbor, rival: world.rivalSite,
    placementPlan: world.placementPlan, entities: sceneEntities })));
console.log(JSON.stringify(report));
