import type { SimulationState } from './SimulationCore';
import type { PhysicalExpeditionContext, SpatialMission } from './SpatialExpeditions';
import { spatialMemberPosition, routeLength, splitRoute, joinRoutes } from './SpatialExpeditions';
import { planRoute, segmentIntersectsBounds } from '../world-generation/LandRoutes';
import { transferCattle, transferPersona, releasePersonaCare } from './WorldExpeditions';
import { releaseEquipment } from './Smithery';
import { residentAtHome, presenceIndoors, territorialDuty, releasePresence, syncCustodyPresence } from './ResidentPresence';
import { personaAge } from './PersonaAge';
import type { Cargo } from './WorldExpeditions';
import type { Point2 } from '../world-generation/WorldBlueprint';
import { createBlueprintSurface } from '../world-generation/TerrainQueries';
import { traceTerrainSightline } from '../world-generation/SettlementVisibility';
import { eventFacts } from './EventFacts';

export interface CustodyRecord {
    missionId: string;
    encounterId: string;
    holderClanId: string;
    carrierId: string;
    phase: 'held' | 'returning' | 'stranded';
    capturedAt: number;
    updatedAt: number;
    position: Point2;
    previousPosition: Point2;
    reachedRoute: Point2[];
    home: Point2;
    route: Point2[];
    distance: number;
    travelled: number;
    speed: number;
    sourceEventIds: string[];
}
export interface CustodyState {
    version: 1;
    people: Record<string, CustodyRecord>;
    livestock: Record<string, CustodyRecord>;
}
export interface TransitSlot {
    carrierId: string;
    kind: Cargo;
    units: number;
    entityId: string | null;
    status: 'held' | 'delivered' | 'lost' | 'released';
    position: Point2;
    sourceEventIds: string[];
}
export interface TransitManifest {
    version: 1;
    missionId: string;
    encounterId: string;
    originClanId: string;
    capturedAt: number;
    captureEventId: string;
    deliveredAt: number | null;
    slots: TransitSlot[];
}
export interface TransitReconciliation {
    forfeit?: boolean;
    carrierPositions?: Record<string, Point2>;
}
export interface DeliveredCargo {
    food: number;
    materials: number;
    cattleIds: string[];
    personaIds: string[];
}
const now = (state: SimulationState) => state.time.winter * state.ticksPerWinter + state.time.tick;
const point = (value: Point2) => value && Number.isFinite(value.x) && Number.isFinite(value.z);
const emptyCargo = (): DeliveredCargo => ({ food: 0, materials: 0, cattleIds: [], personaIds: [] });

function record(state: SimulationState, type: string, details: Record<string, unknown>, personaId?: string) {
    const id = 'event-' + (state.events.length + 1);
    state.events.push({ id, type, time: { ...state.time }, ...(personaId ? { personaId } : {}),
        details: eventFacts(state, details, personaId) });
    return id;
}
function sees(context: PhysicalExpeditionContext, from: Point2, to: Point2) {
    if (Math.hypot(from.x - to.x, from.z - to.z) > 8) return false;
    const surface = createBlueprintSurface(context.world);
    return traceTerrainSightline(context.world,
        { ...from, y: surface.surfaceHeightAt(from.x, from.z) + 1.7 },
        { ...to, y: surface.surfaceHeightAt(to.x, to.z) + .05 }).visible;
}
function deliveredTotals(manifest: TransitManifest) {
    const total = emptyCargo();
    for (const slot of manifest.slots.filter(slot => slot.status === 'delivered')) {
        if (slot.kind === 'Food') total.food += slot.units;
        else if (slot.kind === 'Materials') total.materials += slot.units;
        else if (slot.kind === 'Cattle' && slot.entityId) total.cattleIds.push(slot.entityId);
        else if (slot.kind === 'People' && slot.entityId) total.personaIds.push(slot.entityId);
    }
    return total;
}


function custodyFor(state: SimulationState) {
    return state.custody ??= { version: 1, people: {}, livestock: {} };
}
function routeSupported(context: PhysicalExpeditionContext, route: readonly Point2[]) {
    const surface = createBlueprintSurface(context.world), nav = context.world.navigation;
    for (let edge = 1; edge < route.length; edge++) {
        const from = route[edge - 1], to = route[edge];
        if (context.exclusions?.some(bounds => segmentIntersectsBounds(from, to, bounds, .4))) return false;
        const distance = Math.hypot(to.x - from.x, to.z - from.z);
        const steps = Math.max(1, Math.ceil(distance * 2));
        let previous = surface.surfaceHeightAt(from.x, from.z);
        for (let step = 0; step <= steps; step++) {
            const x = from.x + (to.x - from.x) * step / steps;
            const z = from.z + (to.z - from.z) * step / steps;
            const column = Math.round((x - nav.bounds.minX) / nav.spacing);
            const row = Math.round((z - nav.bounds.minZ) / nav.spacing);
            const height = surface.surfaceHeightAt(x, z);
            if (x < nav.bounds.minX || x >= nav.bounds.maxX || z < nav.bounds.minZ || z >= nav.bounds.maxZ ||
                column < 0 || column >= nav.columns || row < 0 || row >= nav.rows ||
                !nav.cells[row * nav.columns + column] || height <= context.world.waterLevel + .25 ||
                step > 0 && distance > 0 && Math.abs(height - previous) > .65 * distance / steps) return false;
            previous = height;
        }
    }
    return true;
}
/** Preserve both actual off-grid endpoints through the existing route planner. */
function exactRoute(context: PhysicalExpeditionContext, origin: Point2, destination: Point2) {
    if (Math.hypot(origin.x - destination.x, origin.z - destination.z) < 1e-8)
        return [{ ...origin }, { ...origin }];
    const nav = context.world.navigation;
    const target = { x: nav.bounds.minX + Math.round((destination.x - nav.bounds.minX) / nav.spacing) * nav.spacing,
        z: nav.bounds.minZ + Math.round((destination.z - nav.bounds.minZ) / nav.spacing) * nav.spacing };
    const options = { strictNavigation: true, strictExclusions: true, allowTargetAdjustment: false };
    const outward = planRoute(context, target, origin, true, options).route;
    const connector = planRoute(context, target, destination, true, options).route.reverse();
    const route = joinRoutes(outward, connector);
    if (!routeSupported(context, route)) throw new Error('No safe physical escort route.');
    return route;
}
function routeDistanceAt(route: readonly Point2[], position: Point2) {
    let distance = 0;
    for (let index = 1; index < route.length; index++) {
        const a = route[index - 1], b = route[index];
        const length = Math.hypot(b.x - a.x, b.z - a.z);
        const fraction = length ? ((position.x - a.x) * (b.x - a.x) +
            (position.z - a.z) * (b.z - a.z)) / (length * length) : 0;
        if (fraction >= -1e-6 && fraction <= 1 + 1e-6 && Math.hypot(
            position.x - a.x - (b.x - a.x) * fraction,
            position.z - a.z - (b.z - a.z) * fraction) < 1e-6) return distance + Math.max(0, Math.min(1, fraction)) * length;
        distance += length;
    }
    return null;
}
function reachedCarrierTrail(context: PhysicalExpeditionContext, mission: SpatialMission,
    carrierId: string, from: Point2, to: Point2) {
    if (Math.hypot(from.x - to.x, from.z - to.z) < 1e-8) return [{ ...from }, { ...from }];
    const route = mission.memberRoutes?.[carrierId] ?? mission.route;
    const start = routeDistanceAt(route, from), end = routeDistanceAt(route, to);
    if (start !== null && end !== null && end >= start - 1e-6)
        return splitRoute(splitRoute(route, start).suffix, Math.max(0, end - start)).prefix;
    return exactRoute(context, from, to);
}
function advanceRecord(state: SimulationState, held: CustodyRecord, context: PhysicalExpeditionContext,
    standOff: number) {
    if (held.updatedAt === now(state)) return true;
    const target = Math.min(held.distance, held.travelled + Math.min(held.speed,
        Math.max(0, held.distance - held.travelled - standOff)));
    const crossed = splitRoute(splitRoute(held.route, held.travelled).suffix, target - held.travelled).prefix;
    held.updatedAt = now(state);
    held.previousPosition = { ...held.position };
    held.reachedRoute = [{ ...held.position }, { ...held.position }];
    if (!routeSupported(context, crossed)) return false;
    held.position = { ...splitRoute(held.route, target).suffix[0] };
    held.reachedRoute = joinRoutes([], crossed);
    held.route = splitRoute(held.route, target).suffix;
    held.distance = routeLength(held.route);
    held.travelled = 0;
    return true;
}
function releaseHeld(source: SimulationState, id: string, held: CustodyRecord,
    context: PhysicalExpeditionContext, kind: 'People' | 'Cattle') {
    try {
        held.route = exactRoute(context, held.position, held.home);
        held.distance = routeLength(held.route); held.travelled = 0; held.phase = 'returning';
    } catch {
        held.route = [{ ...held.position }, { ...held.position }];
        held.distance = 0; held.travelled = 0; held.phase = 'stranded';
    }
    held.previousPosition = { ...held.position };
    held.reachedRoute = [{ ...held.position }, { ...held.position }];
    held.speed = .6;
    held.updatedAt = now(source);
    held.sourceEventIds.push(record(source, held.phase === 'stranded' ? 'CustodyStranded' : 'CustodyReleased', {
        missionId: held.missionId, encounterId: held.encounterId, entityId: id, kind,
        position: { ...held.position }, home: { ...held.home } }));
}

/** Capture removes real donor stock; it never credits the settlement before arrival. */
export function captureTransitCargo(root: SimulationState, mission: SpatialMission,
    context: PhysicalExpeditionContext, encounterId: string): TransitManifest {
    const existing = mission.task?.encounterRules?.manifest;
    if (existing) return existing;
    const link = root.world?.island, source = link && root.world?.targetClans[link.clanId];
    if (!source || mission.task?.type !== 'Pillage' || !context.world.rivalSite || !encounterId)
        throw new Error('Cargo capture requires the actual physical Pillage site.');
    const committedPeople = new Set(Object.values(root.world!.encounters?.records ?? {})
        .filter(entry => entry.defendingClanId === source.clan.id &&
            ['engaging', 'withdrawing'].includes(entry.phase))
        .flatMap(entry => entry.defenderIds));
    const slots: TransitSlot[] = [];
    for (const carrierId of mission.memberIds.filter(id => root.personas[id]?.deathWinter === null)) {
        const position = spatialMemberPosition(mission, carrierId);
        if (!sees(context, position, context.world.rivalSite.center)) continue;
        const priorities: Cargo[] = mission.task.priorities;
        for (const kind of priorities) {
            if (kind === 'People') {
                for (const person of Object.values(source.personas).filter(person =>
                    residentAtHome(source, person.id) && !presenceIndoors(source, person.id) &&
                    !territorialDuty(source, person.id) && !committedPeople.has(person.id) && personaAge(source, person.id) >= 5)
                    .sort((a, b) => a.id.localeCompare(b.id))) {
                    const actor = source.residentPresence?.residents[person.id];
                    if (!actor || !sees(context, position, actor.position)) continue;
                    const actual = { ...actor.position };
                    let route: Point2[];
                    try { route = exactRoute(context, actual, position); } catch { continue; }
                    if (Math.ceil(Math.max(0, routeLength(route) - 2) / mission.task!.speed) > 8) continue;
                    releaseEquipment(source, person.id, 'transfer');
                    releasePersonaCare(source, person.id);
                    releasePresence(actor);
                    actor.ceremonyUntil = null;
                    const sourceEventId = record(source, 'PersonaTakenIntoCustody', {
                        missionId: mission.id, encounterId, personaId: person.id, carrierId,
                        holderClanId: root.clan.id, position: { ...actual } }, person.id);
                    custodyFor(source).people[person.id] = { missionId: mission.id, encounterId,
                        holderClanId: root.clan.id, carrierId, phase: 'held', capturedAt: now(root), updatedAt: now(root),
                        position: { ...actual }, previousPosition: { ...actual }, reachedRoute: [{ ...actual }, { ...actual }],
                        home: { ...actor.home }, route, distance: routeLength(route), travelled: 0,
                        speed: mission.task!.speed, sourceEventIds: [sourceEventId] };
                    slots.push({ carrierId, kind, units: 1, entityId: person.id, status: 'held',
                        position: { x: position.x, z: position.z }, sourceEventIds: [] });
                    break;
                }
                if (slots.at(-1)?.carrierId === carrierId) break;
                continue;
            }
            if (kind === 'Cattle') {
                const positions = source.livestockPresence ? Object.fromEntries(
                    Object.entries(source.livestockPresence.animals).map(([id, body]) => [id, body.position])) :
                    context.livestockPositionsByClan?.[source.clan.id] ?? {};
                for (const animal of Object.values(source.landing!.cattle).filter(animal =>
                    animal.deathWinter === null && !livestockInCustody(source, animal.id))
                    .sort((a, b) => a.id.localeCompare(b.id))) {
                    const actual = positions[animal.id];
                    if (!actual || !sees(context, position, actual)) continue;
                    let route: Point2[];
                    try { route = exactRoute(context, actual, position); } catch { continue; }
                    if (Math.ceil(Math.max(0, routeLength(route) - 2) / mission.task!.speed) > 8) continue;
                    const sourceEventId = record(source, 'LivestockTakenIntoCustody', {
                        missionId: mission.id, encounterId, livestockId: animal.id, carrierId,
                        holderClanId: root.clan.id, position: { ...actual } });
                    custodyFor(source).livestock[animal.id] = { missionId: mission.id, encounterId,
                        holderClanId: root.clan.id, carrierId, phase: 'held', capturedAt: now(root), updatedAt: now(root),
                        position: { ...actual }, previousPosition: { ...actual }, reachedRoute: [{ ...actual }, { ...actual }],
                        home: { ...actual }, route, distance: routeLength(route), travelled: 0,
                        speed: mission.task!.speed, sourceEventIds: [sourceEventId] };
                    slots.push({ carrierId, kind, units: 1, entityId: animal.id, status: 'held',
                        position: { x: position.x, z: position.z }, sourceEventIds: [] });
                    break;
                }
                if (slots.at(-1)?.carrierId === carrierId) break;
                continue;
            }
            if (kind !== 'Food' && kind !== 'Materials') continue;
            const resource = kind === 'Food' ? 'food' : 'materials';
            const capacity = kind === 'Food' ? root.world!.config.foodCapacity : root.world!.config.materialsCapacity;
            const units = Math.min(capacity, source.stocks[resource]);
            if (!units) continue;
            source.stocks[resource] -= units;
            slots.push({ carrierId, kind, units, entityId: null, status: 'held',
                position: { x: position.x, z: position.z }, sourceEventIds: [] });
            break;
        }
    }
    const capturedAt = now(root);
    const captureEventId = record(root, 'MissionCargoCaptured', { missionId: mission.id, encounterId,
        originClanId: source.clan.id, capturedAt, slots: structuredClone(slots) });
    for (const slot of slots) slot.sourceEventIds.push(captureEventId);
    record(source, 'SettlementPillaged', { missionId: mission.id, encounterId,
        raiderClanId: root.clan.id, food: slots.filter(slot => slot.kind === 'Food').reduce((n, slot) => n + slot.units, 0),
        materials: slots.filter(slot => slot.kind === 'Materials').reduce((n, slot) => n + slot.units, 0),
        cattleIds: slots.filter(slot => slot.kind === 'Cattle').map(slot => slot.entityId!), personaIds: slots.filter(slot => slot.kind === 'People').map(slot => slot.entityId!), capturedAt });
    return { version: 1, missionId: mission.id, encounterId, originClanId: source.clan.id,
        capturedAt, captureEventId, deliveredAt: null, slots };
}

/** Carrier loss consumes its existing slot once; another survivor cannot duplicate its cargo. */
export function reconcileTransitCargo(root: SimulationState, mission: SpatialMission,
    manifest: TransitManifest, context: PhysicalExpeditionContext, options: TransitReconciliation = {}): void {
    const source = root.world!.targetClans[manifest.originClanId];
    for (const slot of manifest.slots) {
        if (slot.status !== 'held') continue;
        const alive = root.personas[slot.carrierId]?.deathWinter === null;
        const held = slot.entityId ? source.custody?.[slot.kind === 'People' ? 'people' : 'livestock'][slot.entityId] : undefined;
        const entity = slot.entityId ? slot.kind === 'People' ? source.personas[slot.entityId] :
            source.landing?.cattle[slot.entityId] : undefined;
        if (slot.entityId && (!held || entity?.deathWinter !== null)) {
            slot.status = 'lost';
            if (held) delete source.custody![slot.kind === 'People' ? 'people' : 'livestock'][slot.entityId];
        } else if (!alive || options.forfeit) {
            if (held && slot.entityId) {
                releaseHeld(source, slot.entityId, held, context, slot.kind as 'People' | 'Cattle');
                slot.status = 'released';
            } else slot.status = 'lost';
        } else {
            const position = options.carrierPositions?.[slot.carrierId] ?? spatialMemberPosition(mission, slot.carrierId);
            if (held) {
                try {
                    const trail = reachedCarrierTrail(context, mission, slot.carrierId, slot.position, position);
                    held.route = joinRoutes(held.route, trail);
                    held.distance = routeLength(held.route);
                    if (!advanceRecord(source, held, context, 2)) throw new Error('Escort route blocked.');
                } catch {
                    releaseHeld(source, slot.entityId!, held, context, slot.kind as 'People' | 'Cattle');
                    slot.status = 'released';
                }
            }
            slot.position = { x: position.x, z: position.z };
        }
        if (held && slot.kind === 'People' && slot.entityId && source.personas[slot.entityId]?.deathWinter === null)
            syncCustodyPresence(source, slot.entityId, held);
        if (slot.status !== 'held') slot.sourceEventIds.push(record(root, 'MissionCargoLost', {
            missionId: mission.id, encounterId: manifest.encounterId, carrierId: slot.carrierId,
            kind: slot.kind, units: slot.units, entityId: slot.entityId, released: slot.status === 'released',
            position: held ? { ...held.position } : { ...slot.position } }));
    }
}
export function transitReadyForDeparture(root: SimulationState, _mission: SpatialMission,
    manifest: TransitManifest): boolean {
    const source = root.world!.targetClans[manifest.originClanId];
    return manifest.slots.filter(slot => slot.status === 'held' && slot.entityId).every(slot => {
        const held = source.custody?.[slot.kind === 'People' ? 'people' : 'livestock'][slot.entityId!];
        return !!held && Math.hypot(held.position.x - slot.position.x, held.position.z - slot.position.z) <= 2 + 1e-6;
    });
}
export function transitReadyForDelivery(root: SimulationState, mission: SpatialMission,
    manifest: TransitManifest): boolean {
    const source = root.world!.targetClans[manifest.originClanId];
    return manifest.slots.filter(slot => slot.status === 'held').every(slot => {
        const home = mission.homeOrigins?.[slot.carrierId], position = spatialMemberPosition(mission, slot.carrierId);
        const held = slot.entityId ? source.custody?.[slot.kind === 'People' ? 'people' : 'livestock'][slot.entityId] : undefined;
        return root.personas[slot.carrierId]?.deathWinter === null && !!home &&
            Math.hypot(position.x - home.x, position.z - home.z) <= 2 + 1e-6 &&
            (!slot.entityId || !!held && Math.hypot(held.position.x - home.x, held.position.z - home.z) <= 2 + 1e-6);
    });
}

/** Called at genuine homecoming; repeated completion reads the stored delivery only. */
export function deliverTransitCargo(root: SimulationState, mission: SpatialMission,
    manifest: TransitManifest): DeliveredCargo {
    if (manifest.deliveredAt !== null) return deliveredTotals(manifest);
    if (!transitReadyForDelivery(root, mission, manifest)) throw new Error('Carried cargo has not reached home.');
    for (const slot of manifest.slots) {
        if (slot.status !== 'held') continue;
        if (slot.kind === 'Food') root.stocks.food += slot.units;
        else if (slot.kind === 'Materials') root.stocks.materials += slot.units;
        else if (slot.kind === 'People' && slot.entityId) {
            const source = root.world!.targetClans[manifest.originClanId];
            const held = source.custody!.people[slot.entityId];
            const arrivalPosition = { ...held.position };
            delete source.custody!.people[slot.entityId];
            transferPersona(source, root, slot.entityId, mission.id, arrivalPosition);
        } else if (slot.kind === 'Cattle' && slot.entityId) {
            const source = root.world!.targetClans[manifest.originClanId];
            const held = source.custody!.livestock[slot.entityId];
            const arrivalPosition = { ...held.position };
            record(source, 'LivestockTransferredOut', { missionId: mission.id, encounterId: manifest.encounterId,
                livestockId: slot.entityId, destinationClanId: root.clan.id, arrivalPosition });
            delete source.custody!.livestock[slot.entityId];
            transferCattle(source, root, slot.entityId);
            record(root, 'LivestockTransferredIn', { missionId: mission.id, encounterId: manifest.encounterId,
                livestockId: slot.entityId, originClanId: source.clan.id, arrivalPosition });
        } else continue;
        slot.status = 'delivered';
    }
    manifest.deliveredAt = now(root);
    const total = deliveredTotals(manifest);
    record(root, 'MissionCargoDelivered', { missionId: mission.id, encounterId: manifest.encounterId,
        capturedAt: manifest.capturedAt, captureEventId: manifest.captureEventId, ...total });
    return total;
}
export function personaInCustody(state: SimulationState, id: string): boolean {
    return !!state.custody?.people[id];
}
export function livestockInCustody(state: SimulationState, id: string): boolean {
    return !!state.custody?.livestock[id];
}
export function stepCustody(root: SimulationState, context: PhysicalExpeditionContext): void {
    for (const source of [root, ...Object.values(root.world?.targetClans ?? {})]) {
        for (const [kind, records] of [['people', source.custody?.people], ['livestock', source.custody?.livestock]] as const) {
            for (const [id, held] of Object.entries(records ?? {})) {
                const entity = kind === 'people' ? source.personas[id] : source.landing?.cattle[id];
                if (!entity || entity.deathWinter !== null) { delete records![id]; continue; }
                if (held.phase !== 'returning') continue;
                const advanced = advanceRecord(source, held, context, 0);
                if (kind === 'people') syncCustodyPresence(source, id, held);
                if (!advanced) {
                    held.phase = 'stranded';
                    held.sourceEventIds.push(record(source, 'CustodyStranded', { missionId: held.missionId,
                        encounterId: held.encounterId, entityId: id, position: { ...held.position } }));
                } else if (Math.hypot(held.position.x - held.home.x, held.position.z - held.home.z) < 1e-6) {
                    record(source, 'CustodyReturned', { missionId: held.missionId, encounterId: held.encounterId,
                        entityId: id, position: { ...held.position } });
                    delete records![id];
                }
            }
        }
    }
}
export function validateCustody(state: SimulationState): void {
    const custody = state.custody;
    if (custody === undefined) return;
    if (!custody || custody.version !== 1 || !custody.people || !custody.livestock ||
        Object.keys(custody).sort().join() !== 'livestock,people,version' ||
        typeof custody.people !== 'object' || typeof custody.livestock !== 'object' ||
        Array.isArray(custody.people) || Array.isArray(custody.livestock)) throw new Error('Invalid custody state.');
    const keys = ['missionId', 'encounterId', 'holderClanId', 'carrierId', 'phase', 'capturedAt', 'updatedAt',
        'position', 'previousPosition', 'reachedRoute', 'home', 'route', 'distance', 'travelled', 'speed', 'sourceEventIds'].sort().join();
    for (const [kind, records] of [['people', custody.people], ['livestock', custody.livestock]] as const) {
        for (const [id, held] of Object.entries(records)) {
            const entity = kind === 'people' ? state.personas[id] : state.landing?.cattle[id];
            if (!entity || entity.deathWinter !== null || !held || Object.keys(held).sort().join() !== keys ||
                [held.missionId, held.encounterId, held.holderClanId, held.carrierId].some(value =>
                    typeof value !== 'string' || !value || value.length > 256) ||
                held.holderClanId === state.clan.id || !['held', 'returning', 'stranded'].includes(held.phase) ||
                !Number.isSafeInteger(held.capturedAt) || held.capturedAt < 800000 || held.capturedAt > now(state) ||
                !Number.isSafeInteger(held.updatedAt) || held.updatedAt < held.capturedAt || held.updatedAt > now(state) ||
                !point(held.position) || !point(held.previousPosition) || !point(held.home) || !Array.isArray(held.route) ||
                !Array.isArray(held.reachedRoute) || held.reachedRoute.length < 2 || held.reachedRoute.length > 40002 ||
                !held.reachedRoute.every(point) || routeLength(held.reachedRoute) > held.speed + 1e-6 ||
                held.route.length < 2 || held.route.length > 40002 || !held.route.every(point) ||
                !Number.isFinite(held.distance) || held.distance < 0 || !Number.isFinite(held.travelled) ||
                held.travelled < 0 || held.travelled > held.distance || !Number.isFinite(held.speed) || held.speed <= 0 || held.speed > 8 ||
                Math.abs(routeLength(held.route) - held.distance) > 1e-6 ||
                !Array.isArray(held.sourceEventIds) || !held.sourceEventIds.length ||
                new Set(held.sourceEventIds).size !== held.sourceEventIds.length ||
                held.sourceEventIds.some(id => !state.events.some(event => event.id === id)))
                throw new Error('Invalid custody record.');
            if (Math.hypot(held.reachedRoute[0].x - held.previousPosition.x,
                held.reachedRoute[0].z - held.previousPosition.z) > 1e-6 ||
                Math.hypot(held.reachedRoute.at(-1)!.x - held.position.x,
                    held.reachedRoute.at(-1)!.z - held.position.z) > 1e-6)
                throw new Error('Custody motion requires its actual reached endpoints.');
            const reached = splitRoute(held.route, held.travelled).suffix[0];
            if (Math.hypot(reached.x - held.position.x, reached.z - held.position.z) > 1e-6)
                throw new Error('Custody position does not match its reached route.');
        }
    }
}
export function validateTransitManifest(root: SimulationState, mission: SpatialMission, manifest: TransitManifest): void {
    const fail = () => { throw new Error('Invalid in-transit cargo.'); };
    if (!manifest || typeof manifest !== 'object') fail();
    const capture = root.events.find(event => event.id === manifest.captureEventId);
    const originals = capture?.details?.slots;
    if (manifest.version !== 1 || manifest.missionId !== mission.id || typeof manifest.encounterId !== 'string' ||
        !manifest.encounterId || manifest.originClanId !== root.world?.island?.clanId ||
        !Number.isSafeInteger(manifest.capturedAt) || manifest.capturedAt < mission.departedAt || manifest.capturedAt > now(root) ||
        !capture || capture.type !== 'MissionCargoCaptured' || capture.details?.missionId !== mission.id ||
        capture.details?.encounterId !== manifest.encounterId || capture.details?.originClanId !== manifest.originClanId ||
        capture.details?.capturedAt !== manifest.capturedAt || !Array.isArray(originals) ||
        manifest.deliveredAt !== null && (!Number.isSafeInteger(manifest.deliveredAt) ||
            manifest.deliveredAt < manifest.capturedAt || manifest.deliveredAt > now(root)) ||
        !Array.isArray(manifest.slots) || manifest.slots.length > mission.memberIds.length ||
        manifest.slots.length !== (originals as unknown[]).length) fail();
    const carriers = new Set<string>();
    for (let index = 0; index < manifest.slots.length; index++) {
        const slot = manifest.slots[index], original = (originals as Partial<TransitSlot>[])[index];
        if (!slot || !original || !mission.memberIds.includes(slot.carrierId) || carriers.has(slot.carrierId) ||
            !['Food', 'Materials', 'Cattle', 'People'].includes(slot.kind) ||
            !['held', 'delivered', 'lost', 'released'].includes(slot.status) || !point(slot.position) ||
            !Number.isSafeInteger(slot.units) || slot.units < 1 ||
            slot.units > (slot.kind === 'Food' ? root.world!.config.foodCapacity :
                slot.kind === 'Materials' ? root.world!.config.materialsCapacity : 1) ||
            (slot.kind === 'Food' || slot.kind === 'Materials' ? slot.entityId !== null : typeof slot.entityId !== 'string') ||
            original.carrierId !== slot.carrierId || original.kind !== slot.kind ||
            original.units !== slot.units || original.entityId !== slot.entityId ||
            slot.status === 'held' && manifest.deliveredAt !== null ||
            slot.status === 'delivered' && manifest.deliveredAt === null ||
            !Array.isArray(slot.sourceEventIds) || !slot.sourceEventIds.includes(manifest.captureEventId) ||
            new Set(slot.sourceEventIds).size !== slot.sourceEventIds.length ||
            slot.sourceEventIds.some(id => !root.events.some(event => event.id === id))) fail();
        if ((slot.status === 'lost' || slot.status === 'released') && !slot.sourceEventIds.some(id => {
            const event = root.events.find(value => value.id === id);
            return event?.type === 'MissionCargoLost' && event.details?.missionId === mission.id &&
                event.details?.carrierId === slot.carrierId && event.details?.kind === slot.kind &&
                event.details?.units === slot.units && event.details?.entityId === slot.entityId &&
                !!event.details?.released === (slot.status === 'released');
        })) fail();
        if (slot.status === 'held' && slot.entityId) {
            const owner = root.world!.targetClans[manifest.originClanId];
            const held = owner.custody?.[slot.kind === 'People' ? 'people' : 'livestock'][slot.entityId];
            const entity = slot.kind === 'People' ? owner.personas[slot.entityId] : owner.landing?.cattle[slot.entityId];
            if (!entity || entity.deathWinter !== null || !held || held.phase !== 'held' ||
                held.missionId !== mission.id || held.encounterId !== manifest.encounterId ||
                held.carrierId !== slot.carrierId || held.holderClanId !== root.clan.id ||
                held.capturedAt !== manifest.capturedAt ||
                (slot.kind === 'People' ? !!root.personas[slot.entityId] : !!root.landing?.cattle[slot.entityId])) fail();
        }
        carriers.add(slot.carrierId);
    }
    if (manifest.deliveredAt !== null) {
        const delivered = root.events.find(event => event.type === 'MissionCargoDelivered' &&
            event.details?.missionId === mission.id && event.details?.captureEventId === manifest.captureEventId);
        const totals = deliveredTotals(manifest);
        if (!delivered || delivered.time.winter * root.ticksPerWinter + delivered.time.tick !== manifest.deliveredAt ||
            delivered.details?.food !== totals.food || delivered.details?.materials !== totals.materials ||
            JSON.stringify(delivered.details?.cattleIds) !== JSON.stringify(totals.cattleIds) ||
            JSON.stringify(delivered.details?.personaIds) !== JSON.stringify(totals.personaIds)) fail();
    }
}

/** Parent validation closes the cross-clan ownership link; nested clans validate their own records. */
export function validateTransitWorld(root: SimulationState): void {
    if (!root.world) return;
    if (!root.world.encounters) {
        if ([root, ...Object.values(root.world.targetClans)].some(clan =>
            Object.keys(clan.custody?.people ?? {}).length || Object.keys(clan.custody?.livestock ?? {}).length))
            throw new Error('Custody requires its shared encounter registry.');
        return;
    }
    const bounds = root.discovery!.grid.bounds;
    for (const owner of [root, ...Object.values(root.world.targetClans)]) {
        for (const [kind, records] of [['People', owner.custody?.people], ['Cattle', owner.custody?.livestock]] as const) {
            for (const [id, held] of Object.entries(records ?? {})) {
                if ([held.home, held.position, held.previousPosition, ...held.route, ...held.reachedRoute].some(point =>
                    point.x < bounds.minX || point.x >= bounds.maxX || point.z < bounds.minZ || point.z >= bounds.maxZ))
                    throw new Error('Custody route lies outside its saved world.');
                const mission = root.world.spatial?.missions[held.missionId];
                const manifest = mission?.task?.encounterRules?.manifest;
                const slot = manifest?.slots.find(slot => slot.kind === kind && slot.entityId === id);
                if (!manifest || manifest.originClanId !== owner.clan.id || !slot ||
                    slot.carrierId !== held.carrierId || held.holderClanId !== root.clan.id ||
                    held.encounterId !== manifest.encounterId ||
                    (held.phase === 'held' ? slot.status !== 'held' : slot.status !== 'released'))
                    throw new Error('Custody requires its unique saved carrier manifest.');
            }
        }
    }
}
