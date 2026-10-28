import { inspectWork, type JobPrototype } from './Mechanics';
import { isProvidingCare } from './FamilyMechanics';
import { personaAge } from './PersonaAge';
import { personaAway } from './WorldExpeditions';
import { routeLength, splitRoute, type PhysicalExpeditionContext } from './SpatialExpeditions';
import { planRoute } from '../world-generation/LandRoutes';
import { createBlueprintSurface } from '../world-generation/TerrainQueries';
import type { Point2 } from '../world-generation/WorldBlueprint';
import type { SimulationState } from './SimulationCore';
import type { WorldBlueprint } from '../world-generation/WorldBlueprint';
import type { OreSite, OreSiteRules } from '../world-generation/OreSites';
import { assertOreSitePlan } from '../world-generation/OreSites';
import { discoveryAt, inspectClanDiscovery } from './ClanDiscovery';

export interface MiningSite extends OreSite {
    remainingUnits: number;
    assessed: boolean;
    mine?: {version: 1; builtAt: number; costMaterials: number; eventId: string};
}
export interface MiningWorker {
    personaId: string;
    siteId: string;
    route: Point2[];
    distance: number;
    travelled: number;
    phase: 'Traveling' | 'Working' | 'Returning';
    blockedReason: string | null;
}
export interface MiningPolicy {
    version: 2;
    metresPerTick: number;
    unitsPerYear: number;
    mineCostMaterials: number;
    outcropProductivityBps: number;
}
/** QA candidate; never added to historical campaigns or shipping defaults. */
export const prototypeMiningPolicy: Readonly<MiningPolicy> = Object.freeze({
    version: 2, metresPerTick: 2, unitsPerYear: 8, mineCostMaterials: 20, outcropProductivityBps: 5000,
});
export type MiningCommand = {type: 'AssignMiner'; personaId: string; siteId: string} |
    {type: 'RecallMiner'; personaId: string} | {type: 'BuildMine'; siteId: string};
export interface MiningState {
    version: 1;
    worldId: string;
    siteRules: OreSiteRules;
    sites: MiningSite[];
    policy: MiningPolicy;
    workers: Record<string, MiningWorker>;
}
export const prototypeMinerJob: Readonly<JobPrototype> = Object.freeze({
    resource: null, unitsPerWinter: 0, weights: [.4, .25, .2, .05, .1], preferences: [.85, .7, .75, .3, .5],
});
const identity = (site: OreSite) => [site.id, site.ore, site.position.x, site.position.y, site.position.z,
    site.approach.x, site.approach.z, site.appearance, site.initialUnits, site.rockExposure, site.wetLowlandId];

export function bindMining(state: SimulationState, world: WorldBlueprint, worldId: string): void {
    if (state.mining) { assertMiningWorld(state, world, worldId); return; }
    if (!state.discovery || state.discovery.worldId !== worldId || !world.oreSites)
        throw new Error('Mining requires versioned ore sites and the matching physical discovery world.');
    assertOreSitePlan(world, world.oreSites);
    const plan = world.oreSites;
    if (state.specialistStocks?.ironOre) throw new Error('Mining cannot introduce an unexplained Iron Ore stock.');
    state.mining = { version: 1, worldId, siteRules: structuredClone(plan.rules), policy: {...prototypeMiningPolicy}, workers: {},
        sites: plan.sites.map(site => ({ ...structuredClone(site), remainingUnits: site.initialUnits, assessed: false })) };
    if (!state.mechanics) throw new Error('Mining requires the canonical work system.');
    state.mechanics.config.occupations.miner = structuredClone(prototypeMinerJob);
    state.specialistStocks ??= { version: 1, hides: 0 };
    state.specialistStocks.ironOre = 0;
}

export function assertMiningWorld(state: SimulationState, world: Pick<WorldBlueprint, 'oreSites'>, worldId: string): void {
    const mining = state.mining;
    if (!mining) return;
    if (mining.worldId !== worldId || !world.oreSites ||
        JSON.stringify(mining.siteRules) !== JSON.stringify(world.oreSites.rules) ||
        JSON.stringify(mining.sites.map(identity)) !== JSON.stringify(world.oreSites.sites.map(identity)))
        throw new Error('Saved mining sites belong to another physical world.');
}

export function inspectMining(state: SimulationState) {
    const mining = state.mining;
    const discovery = state.discovery && inspectClanDiscovery(state.discovery, state.clan.id);
    return { enabled: !!mining, mineCostMaterials: mining?.policy.mineCostMaterials ?? 20, ironOre: state.specialistStocks?.ironOre ?? 0,
        sites: !mining || !discovery ? [] : mining.sites.filter(site =>
            discoveryAt(discovery, site.position.x, site.position.z) !== 'unknown').map(site => ({
                id: site.id, developed: !!site.mine, ore: site.ore, appearance: site.appearance, position: { ...site.position },
                status: !site.assessed ? 'unassessed' : site.remainingUnits ? 'available' : 'exhausted',
                ...(site.assessed ? {remainingUnits: site.remainingUnits, initialUnits: site.initialUnits} : {}),
                workers: Object.values(mining.workers).filter(w => w.siteId === site.id).map(w => ({
                    personaId: w.personaId, phase: w.phase, reason: w.blockedReason, ...miningWorkerPosition(w),
                })),
            })) };
}

export function validateMining(state: SimulationState): void {
    const mining = state.mining;
    if (mining === undefined) return;
    const fail = () => { throw new Error('Invalid physical mining state.'); };
    if (!mining || mining.version !== 1 || !mining.worldId || mining.worldId !== state.discovery?.worldId ||
        !Array.isArray(mining.sites) || mining.sites.length > 8 || mining.siteRules?.version !== 1) fail();
    const ids = new Set<string>();
    let extracted = 0;
    for (const site of mining.sites) {
        if (!site.id || ids.has(site.id) || site.ore !== 'iron' || !['rock-outcrop', 'bog-iron'].includes(site.appearance) ||
            site.appearance === 'bog-iron' && (typeof site.wetLowlandId !== 'string' || !site.wetLowlandId) ||
            ![site.position?.x, site.position?.y, site.position?.z, site.approach?.x, site.approach?.z,
                site.rockExposure].every(Number.isFinite) || site.rockExposure < 0 || site.rockExposure > 1 ||
            !Number.isSafeInteger(site.initialUnits) || site.initialUnits < 1 || site.initialUnits > 10000 ||
            !Number.isSafeInteger(site.remainingUnits) || site.remainingUnits < 0 ||
            site.remainingUnits > site.initialUnits || typeof site.assessed !== 'boolean') fail();
        if (site.mine !== undefined) {
            if (site.appearance === 'bog-iron') fail();
            const mine = site.mine, event = state.events.find(e => e.id === mine.eventId);
            if (!mine || mine.version !== 1 || !Number.isSafeInteger(mine.builtAt) || mine.builtAt < 0 ||
                mine.builtAt > state.time.winter * state.ticksPerWinter + state.time.tick ||
                !Number.isSafeInteger(mine.costMaterials) || mine.costMaterials < 1 ||
                event?.type !== 'MineBuilt' || mine.builtAt !== event.time.winter * state.ticksPerWinter + event.time.tick || event.details?.siteId !== site.id ||
                event.details?.materials !== mine.costMaterials || event.details?.clanId !== state.clan.id) fail();
        }
        ids.add(site.id);
        extracted += site.initialUnits - site.remainingUnits;
    }
    if (state.specialistStocks?.ironOre !== extracted) fail();
    if (!mining.policy || mining.policy.version !== 2 || !Number.isFinite(mining.policy.metresPerTick) ||
        mining.policy.metresPerTick <= 0 || mining.policy.metresPerTick > 10 ||
        !Number.isSafeInteger(mining.policy.unitsPerYear) || mining.policy.unitsPerYear < 1 ||
        mining.policy.unitsPerYear > 100 || !Number.isSafeInteger(mining.policy.mineCostMaterials) ||
        mining.policy.mineCostMaterials < 1 || mining.policy.mineCostMaterials > 10000 ||
        !Number.isSafeInteger(mining.policy.outcropProductivityBps) || mining.policy.outcropProductivityBps < 1 ||
        mining.policy.outcropProductivityBps > 10000 || !mining.workers || Array.isArray(mining.workers)) fail();
    for (const [id, worker] of Object.entries(mining.workers)) {
        if (id !== worker.personaId || !state.personas[id] || !ids.has(worker.siteId) ||
            !['Traveling', 'Working', 'Returning'].includes(worker.phase) ||
            worker.blockedReason !== null && !['route-blocked'].includes(worker.blockedReason) ||
            !Array.isArray(worker.route) || worker.route.length < 2 || worker.route.length > 40002 ||
            worker.route.some(p => !p || !Number.isFinite(p.x) || !Number.isFinite(p.z)) ||
            !Number.isFinite(worker.distance) || Math.abs(routeLength(worker.route) - worker.distance) > 1e-6 ||
            !Number.isFinite(worker.travelled) || worker.travelled < 0 || worker.travelled > worker.distance ||
            worker.phase === 'Working' && worker.travelled !== worker.distance) fail();
        const site = mining.sites.find(s => s.id === worker.siteId)!;
        if (Math.hypot(worker.route.at(-1)!.x - site.approach.x, worker.route.at(-1)!.z - site.approach.z) > 1e-6) fail();
    }
}


export function miningBusy(state: SimulationState, id: string): boolean {
    return !!state.mining?.workers[id];
}
export function miningWorkReason(state: SimulationState, id: string): string | null {
    const worker = state.mining?.workers[id];
    return !worker ? 'site-unassigned' : worker.blockedReason ??
        (worker.phase === 'Traveling' ? 'traveling-to-mine' : worker.phase === 'Returning' ? 'returning-from-mine' : null);
}
export function miningWorkerPosition(worker: MiningWorker): Point2 {
    return {...splitRoute(worker.route, worker.travelled).prefix.at(-1)!};
}
function record(state: SimulationState, type: string, personaId: string | undefined, details: Record<string, unknown>) {
    state.events.push({id: `event-${state.events.length + 1}`, time: {...state.time}, type, ...(personaId ? {personaId} : {}),
        details: {clanId: state.clan.id, ...details}});
}
function requireContext(state: SimulationState, context?: PhysicalExpeditionContext) {
    if (!context || !state.mining) throw new Error('Mining requires its bound physical world.');
    assertMiningWorld(state, context.world, context.worldId);
    return context;
}
export function applyMiningCommand(state: SimulationState, command: MiningCommand, context?: PhysicalExpeditionContext): void {
    const bound = requireContext(state, context), mining = state.mining!;
    if (command.type === 'RecallMiner') {
        const worker = mining.workers[command.personaId];
        if (!worker) throw new Error('Resident has no mining assignment.');
        if (worker.phase !== 'Returning') {
            worker.phase = 'Returning';
            record(state, 'MinerRecalled', command.personaId, {siteId: worker.siteId});
        }
        return;
    }
    const site = mining.sites.find(s => s.id === command.siteId);
    if (!site || !inspectMining(state).sites.some(s => s.id === site.id))
        throw new Error('Discover this ore site before assigning a Miner.');
    if (command.type === 'BuildMine') {
        if (site.appearance === 'bog-iron') throw new Error('Bog Iron is collected from the natural deposit; a rock mine cannot be built here.');
        if (site.mine) throw new Error('This outcrop already has a mine.');
        if (!site.remainingUnits) throw new Error('This outcrop is exhausted.');
        const materials = mining.policy.mineCostMaterials;
        if (state.stocks.materials < materials) throw new Error(`Building a mine needs ${materials} Materials.`);
        planRoute(bound, site.approach, bound.world.settlement.center, true);
        const eventId = `event-${state.events.length + 1}`;
        state.stocks.materials -= materials;
        site.mine = {version: 1, builtAt: state.time.winter * state.ticksPerWinter + state.time.tick, costMaterials: materials, eventId};
        record(state, 'MineBuilt', undefined, {siteId: site.id, materials});
        return;
    }
    const person = state.personas[command.personaId];
    if (!person || person.deathWinter !== null || person.occupation !== 'miner' ||
        personaAge(state, person.id) < state.mechanics!.config.workAge || isProvidingCare(state, person.id) ||
        personaAway(state, person.id) || miningBusy(state, person.id))
        throw new Error('Choose an available adult Miner at home.');
    if (!site.remainingUnits) throw new Error('This ore site is exhausted.');
    const plan = planRoute(bound, site.approach, bound.world.settlement.center, true);
    if (plan.adjusted) throw new Error('The mining approach is blocked.');
    const distance = routeLength(plan.route);
    mining.workers[person.id] = {personaId: person.id, siteId: site.id, route: plan.route,
        distance, travelled: 0, phase: 'Traveling', blockedReason: null};
    record(state, 'MinerAssigned', person.id, {siteId: site.id});
}

/** Check saved paths against the live canonical grid once per command, never search per tick. */
export function requireMiningAdvance(state: SimulationState, context?: PhysicalExpeditionContext): void {
    if (!state.mining || !Object.keys(state.mining.workers).length) return;
    const bound = requireContext(state, context), nav = bound.world.navigation;
    const surface = createBlueprintSurface(bound.world);
    for (const worker of Object.values(state.mining.workers)) {
        const home = bound.world.settlement.center;
        if (Math.hypot(worker.route[0].x - home.x, worker.route[0].z - home.z) > 1e-6)
            throw new Error('Saved mining route has an invalid home origin.');
        // Preserve a valid homeward trail too: phase changes within a batched command
        // must see the same blockers as individual tick commands.
        const route = worker.route;
        const exits = bound.exclusions?.filter(b => route[0].x >= b.minX - .4 && route[0].x <= b.maxX + .4 &&
            route[0].z >= b.minZ - .4 && route[0].z <= b.maxZ + .4) ?? [];
        let blocked = false;
        for (let i = 0; i < route.length; i++) {
            const a = route[Math.max(0, i - 1)], b = route[i];
            const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z)));
            let previous = surface.surfaceHeightAt(a.x, a.z);
            let previousCol = Math.round((a.x - nav.bounds.minX) / nav.spacing);
            let previousRow = Math.round((a.z - nav.bounds.minZ) / nav.spacing);
            for (let j = 0; j <= steps; j++) {
                const p = {x: a.x + (b.x - a.x) * j / steps, z: a.z + (b.z - a.z) * j / steps};
                const col = Math.round((p.x - nav.bounds.minX) / nav.spacing);
                const row = Math.round((p.z - nav.bounds.minZ) / nav.spacing);
                const height = surface.surfaceHeightAt(p.x, p.z);
                if (col < 0 || row < 0 || col >= nav.columns || row >= nav.rows || i > 1 && (!nav.cells[row * nav.columns + col] ||
                        col !== previousCol && row !== previousRow &&
                        (!nav.cells[previousRow * nav.columns + col] || !nav.cells[row * nav.columns + previousCol])) ||
                    height <= bound.world.waterLevel + .25 || Math.abs(height - previous) > .65 * Math.hypot(b.x-a.x, b.z-a.z) / steps + 1e-6 ||
                    bound.exclusions?.some(b => !(i <= 1 && exits.includes(b)) && p.x >= b.minX - .4 && p.x <= b.maxX + .4 &&
                        p.z >= b.minZ - .4 && p.z <= b.maxZ + .4)) blocked = true;
                previous = height; previousCol = col; previousRow = row;
            }
        }
        worker.blockedReason = blocked ? 'route-blocked' : null;
    }
}

/** Called after the canonical tick, including mortality. No renderer or private production clock. */
export function stepMining(state: SimulationState): void {
    const mining = state.mining;
    if (!mining) return;
    for (const id of Object.keys(mining.workers).sort()) {
        const worker = mining.workers[id], person = state.personas[id];
        const site = mining.sites.find(s => s.id === worker.siteId)!;
        if (!person || person.deathWinter !== null) {
            delete mining.workers[id];
            record(state, 'MiningStopped', id, {siteId: site.id, reason: 'deceased'});
            continue;
        }
        if (person.occupation !== 'miner' || isProvidingCare(state, id) || !site.remainingUnits) {
            if (worker.phase !== 'Returning') {
                worker.phase = 'Returning';
                record(state, 'MiningStopped', id, {siteId: site.id, reason: !site.remainingUnits ? 'exhausted' : 'unavailable'});
            }
        }
        if (worker.blockedReason) continue;
        if (worker.phase === 'Returning') {
            worker.travelled = Math.max(0, worker.travelled - mining.policy.metresPerTick);
            if (!worker.travelled) {
                delete mining.workers[id];
                record(state, 'MinerReturned', id, {siteId: site.id});
            }
            continue;
        }
        if (worker.phase === 'Traveling') {
            worker.travelled = Math.min(worker.distance, worker.travelled + mining.policy.metresPerTick);
            if (worker.travelled === worker.distance) {
                worker.phase = 'Working';
                site.assessed = true;
                record(state, 'OreSiteAssessed', id, {siteId: site.id, remainingUnits: site.remainingUnits});
            }
            continue;
        }
        const efficiency = inspectWork(state, id).productivityBps;
        person.workProgress += mining.policy.unitsPerYear * efficiency;
        const units = Math.min(site.remainingUnits, Math.floor(person.workProgress / state.mechanics!.config.workPerUnit));
        if (units) {
            person.workProgress %= state.mechanics!.config.workPerUnit;
            site.remainingUnits -= units;
            state.specialistStocks!.ironOre! += units;
            record(state, 'IronOreExtracted', id, {siteId: site.id, source: site.appearance === 'bog-iron' ? 'bog-iron' : 'rock-iron', units, remainingUnits: site.remainingUnits});
        }
        state.mechanics!.people[id].progress.miner = person.workProgress;
    }
}


/** Only previous, unpublished Mining QA settings adopt this owner-approved trial revision. */
export function migrateMining(state: SimulationState): void {
    const policy = state.mining?.policy as MiningPolicy | {version: 1; metresPerTick: number; unitsPerYear: number} | undefined;
    if (policy?.version === 1) state.mining!.policy = {...policy, version: 2,
        mineCostMaterials: 20, outcropProductivityBps: 5000};
}
export function miningProductionBps(state: SimulationState, id: string): number {
    const mining = state.mining, worker = mining?.workers[id];
    const site = worker && mining?.sites.find(site => site.id === worker.siteId);
    return site?.mine ? 10000 : mining?.policy.outcropProductivityBps ?? 5000;
}
