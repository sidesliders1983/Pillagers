import type { SimulationState, SimulationEvent } from './SimulationCore';
import type { PhysicalExpeditionContext } from './SpatialExpeditions';
import type { Bounds2, Point2 } from '../world-generation/WorldBlueprint';
import { assertIslandClanWorld } from './IslandClans';
import { spatialMemberPosition } from './SpatialExpeditions';
import { createBlueprintSurface } from '../world-generation/TerrainQueries';
import { traceTerrainSightline } from '../world-generation/SettlementVisibility';
import { personaAge } from './PersonaAge';
import { isProvidingCare } from './FamilyMechanics';
import { bindResidentPresence, assertPresenceSite, assertResidentRoutes, validateResidentPresence,
    inspectResidentPresence, territorialDuty, advanceResidentPresence, reconcileResidentPresence,
    eligibleTerritorialObserver, residentAtHome, freezePresence, releasePresence, setPresenceRoute, type PresenceSite } from './ResidentPresence';
export { inspectResidentPresence, territorialDuty } from './ResidentPresence';

export interface TerritorialPolicy {
    sampleTicks: number;
    sightRadius: number;
    eyeHeight: number;
    warningTicks: number;
    lostContactTicks: number;
    reentryTicks: number;
    maxPursuit: number;
    maxResponders: number;
    residentSpeed: number;
    ambientInterval: number;
    ambientRadius: number;
}
export const territorialPolicy: Readonly<TerritorialPolicy> = Object.freeze({
    sampleTicks: 5, sightRadius: 32, eyeHeight: 1.7, warningTicks: 25,
    lostContactTicks: 50, reentryTicks: 100, maxPursuit: 48, maxResponders: 2,
    residentSpeed: .6, ambientInterval: 25, ambientRadius: 4,
});
export type TerritoryPhase = 'Suspicious' | 'Alerted' | 'Hostile' | 'Closed';
export type TerritoryReason = 'perimeter-sighting' | 'settlement-intrusion' | 'warning-ignored' |
    'observed-pillage' | 'lost-contact' | 'party-returned' | 'party-unavailable' | 'observers-unavailable';
export interface TerritoryObservation {
    tick: number;
    observerId: string;
    intruderId: string;
    observerPosition: Point2;
    intruderPosition: Point2;
}
export interface TerritorialIncident {
    id: string;
    defendingClanId: string;
    intrudingClanId: string;
    missionId: string;
    groupId: string;
    groupName: string;
    phase: TerritoryPhase;
    reason: TerritoryReason;
    openedAt: number;
    changedAt: number;
    lastSeenAt: number;
    warnedAt: number | null;
    closedAt: number | null;
    position: Point2;
    observation: TerritoryObservation;
    responderIds: string[];
    sourceEventIds: string[];
    observedByPlayer: boolean;
    engagement: null | { version: 1; requestedAt: number; position: Point2;
        defenderIds: string[]; intruderIds: string[]; sourceEventId: string };
}
export interface TerritorialState {
    version: 1;
    worldId: string;
    adoptedAt: number;
    adoptionEventId: string;
    updatedAt: number;
    nextSequence: number;
    policy: TerritorialPolicy;
    incidents: Record<string, TerritorialIncident>;
}
const now = (state: SimulationState) => state.time.winter * state.ticksPerWinter + state.time.tick;
function clans(state: SimulationState) {
    return [state, ...Object.values(state.world?.targetClans ?? {})];
}
export function bindTerritorialAwareness(state: SimulationState, context?: PhysicalExpeditionContext,
    overrides: Partial<TerritorialPolicy> = {}) {
    if (!context || state.world?.version !== 2 || !state.discovery)
        throw new Error('Territorial awareness requires the bound physical island.');
    assertIslandClanWorld(state, context.world, context.worldId);
    if (state.world.territory) { assertTerritorialWorld(state, context); return; }
    const policy = { ...territorialPolicy, ...overrides };
    if (!validPolicy(policy)) throw new Error('Invalid territorial awareness policy.');
    const sites = context.presenceSites;
    if (!sites || sites.length !== 2) throw new Error('Both living clans need canonical resident sites.');
    for (const clan of clans(state)) {
        const site = sites.find(candidate => candidate.clanId === clan.clan.id);
        if (!site) throw new Error('Missing canonical clan presence site.');
        assertPresenceSite(clan, context, site);
    }
    for (const clan of clans(state)) bindResidentPresence(clan, context,
        sites.find(candidate => candidate.clanId === clan.clan.id)!);
    const adoptionEventId = 'event-' + (state.events.length + 1);
    state.events.push({ id: adoptionEventId, type: 'TerritorialAwarenessEnabled', time: { ...state.time },
        details: { version: 1, worldId: context.worldId, clanIds: clans(state).map(clan => clan.clan.id),
            policy: { ...policy } } });
    state.world.territory = { version: 1, worldId: context.worldId, adoptedAt: now(state), adoptionEventId,
        updatedAt: now(state), nextSequence: 1, policy, incidents: {} };
}
export function assertTerritorialWorld(state: SimulationState, context?: PhysicalExpeditionContext) {
    const territory = state.world?.territory;
    if (!territory) return;
    if (!context || territory.worldId !== context.worldId)
        throw new Error('Territorial awareness belongs to a different physical island.');
    assertIslandClanWorld(state, context.world, context.worldId);
    for (const clan of clans(state)) {
        const presence = clan.residentPresence;
        if (!presence || presence.worldId !== territory.worldId)
            throw new Error('Missing saved canonical clan presence.');
        const site: PresenceSite = { clanId: clan.clan.id, ...presence.site,
            homes: Object.fromEntries(Object.entries(presence.residents).map(([id, actor]) => [id, actor.home])) };
        assertPresenceSite(clan, context, site);
        assertResidentRoutes(clan, context);
    }
}
function validPolicy(policy: TerritorialPolicy) {
    const bounds: Record<keyof TerritorialPolicy, [number, number]> = {
        sampleTicks: [1, 20], sightRadius: [1, 64], eyeHeight: [.5, 3], warningTicks: [1, 250],
        lostContactTicks: [1, 250], reentryTicks: [1, 1000], maxPursuit: [1, 96],
        maxResponders: [1, 8], residentSpeed: [.1, 2], ambientInterval: [5, 100], ambientRadius: [0, 8],
    };
    if (!policy || Object.keys(policy).sort().join() !== Object.keys(bounds).sort().join()) return false;
    return Object.entries(bounds).every(([key, [low, high]]) => {
        const value = policy[key as keyof TerritorialPolicy];
        return Number.isFinite(value) && value >= low && value <= high &&
            (['eyeHeight', 'residentSpeed', 'ambientRadius', 'sightRadius', 'maxPursuit'].includes(key) ||
                Number.isSafeInteger(value));
    });
}
const validPoint = (point: Point2) => point && [point.x, point.z].every(value =>
    Number.isFinite(value) && Math.abs(value) <= 100000);
const incidentPhases = ['Suspicious', 'Alerted', 'Hostile', 'Closed'];
const incidentReasons = ['perimeter-sighting', 'settlement-intrusion', 'warning-ignored', 'observed-pillage',
    'lost-contact', 'party-returned', 'party-unavailable', 'observers-unavailable'];
export function validateTerritorialAwareness(state: SimulationState) {
    validateResidentPresence(state);
    const saved = state.world?.territory;
    if (!saved) {
        if (!state.entityPrefix && (state.residentPresence ||
            Object.values(state.world?.targetClans ?? {}).some(clan => !!clan.residentPresence)))
            throw new Error('Resident presence requires world adoption.');
        return;
    }
    const fail = () => { throw new Error('Invalid territorial incident, observation or responder ownership.'); };
    const uint = (value: number) => Number.isSafeInteger(value) && value >= saved.adoptedAt && value <= now(state);
    if (saved.version !== 1 || saved.worldId !== state.world?.island?.worldId ||
        !Number.isSafeInteger(saved.adoptedAt) || saved.adoptedAt < 800000 ||
        !uint(saved.updatedAt) || saved.updatedAt !== now(state) || !Number.isSafeInteger(saved.nextSequence) || saved.nextSequence < 1 ||
        !validPolicy(saved.policy) || !saved.incidents || Array.isArray(saved.incidents) ||
        Object.keys(saved.incidents).length > 4096) fail();
    const adoption = state.events[Number(saved.adoptionEventId?.slice(6)) - 1];
    if (!adoption || adoption.id !== saved.adoptionEventId || adoption.type !== 'TerritorialAwarenessEnabled' ||
        adoption.time.winter * state.ticksPerWinter + adoption.time.tick !== saved.adoptedAt ||
        adoption.details?.version !== 1 || adoption.details.worldId !== saved.worldId ||
        JSON.stringify(adoption.details.clanIds) !== JSON.stringify(clans(state).map(clan => clan.clan.id)) ||
        !adoption.details.policy || Object.keys(territorialPolicy).some(key =>
            (adoption.details!.policy as TerritorialPolicy)[key as keyof TerritorialPolicy] !== saved.policy[key as keyof TerritorialPolicy])) fail();
    for (const clan of clans(state)) if (clan.residentPresence?.adoptedAt !== saved.adoptedAt) fail();
    const reservations = new Set<string>();
    for (const [id, incident] of Object.entries(saved.incidents)) {
        const number = Number(id.slice('incident-'.length));
        const defender = clanById(state, incident.defendingClanId);
        const intruder = clanById(state, incident.intrudingClanId);
        const mission = intruder?.world?.spatial?.missions[incident.missionId];
        if (!incident || id !== incident.id || !/^incident-[1-9][0-9]*$/.test(id) ||
            !Number.isSafeInteger(number) || number >= saved.nextSequence ||
            !defender || !intruder || defender === intruder || !mission || mission.territoryVersion !== 1 ||
            mission.groupId !== incident.groupId || mission.groupName !== incident.groupName ||
            !incidentPhases.includes(incident.phase) || !incidentReasons.includes(incident.reason) ||
            !uint(incident.openedAt) || !uint(incident.changedAt) || !uint(incident.lastSeenAt) ||
            incident.changedAt < incident.openedAt || incident.lastSeenAt < incident.openedAt ||
            incident.warnedAt !== null && (!uint(incident.warnedAt) || incident.warnedAt < incident.openedAt) ||
            incident.closedAt !== null && (!uint(incident.closedAt) || incident.closedAt !== incident.changedAt) ||
            (incident.phase === 'Closed') !== (incident.closedAt !== null) ||
            !validPoint(incident.position) || typeof incident.observedByPlayer !== 'boolean' ||
            !Array.isArray(incident.responderIds) || new Set(incident.responderIds).size !== incident.responderIds.length ||
            incident.responderIds.length > saved.policy.maxResponders ||
            !Array.isArray(incident.sourceEventIds) || !incident.sourceEventIds.length ||
            new Set(incident.sourceEventIds).size !== incident.sourceEventIds.length) fail();
        const observation = incident.observation;
        if (!observation || !uint(observation.tick) || observation.tick !== incident.lastSeenAt ||
            !defender!.personas[observation.observerId] && !defender!.personaArchive?.[observation.observerId] ||
            !mission!.memberIds.includes(observation.intruderId) ||
            !validPoint(observation.observerPosition) || !validPoint(observation.intruderPosition)) fail();
        let priorTick = -1;
        let finalEvent: SimulationEvent | undefined;
        for (const [index, sourceId] of incident.sourceEventIds.entries()) {
            const event = state.events[Number(sourceId.slice(6)) - 1], details = event?.details;
            const eventTick = event ? event.time.winter * state.ticksPerWinter + event.time.tick : NaN;
            const source = details?.observation as TerritoryObservation | undefined;
            if (!event || event.id !== sourceId || !details || details.version !== 1 ||
                event.type !== (index === 0 ? 'TerritoryIncidentOpened' : details.phase === 'Closed'
                    ? 'TerritoryIncidentClosed' : 'TerritoryIncidentChanged') ||
                details.incidentId !== id || details.defendingClanId !== defender!.clan.id ||
                details.intrudingClanId !== intruder!.clan.id || details.missionId !== mission!.id ||
                details.groupId !== mission!.groupId || details.groupName !== mission!.groupName ||
                !incidentPhases.includes(String(details.phase)) || !incidentReasons.includes(String(details.reason)) ||
                !uint(eventTick) || eventTick < priorTick || index === 0 && eventTick !== incident.openedAt ||
                !source || !uint(source.tick) || source.tick > eventTick ||
                event.type !== 'TerritoryIncidentClosed' && source.tick !== eventTick || source.observerId !== details.observerId ||
                source.intruderId !== details.intruderId || !mission!.memberIds.includes(source.intruderId) ||
                !defender!.personas[source.observerId] && !defender!.personaArchive?.[source.observerId] ||
                !validPoint(source.observerPosition) || !validPoint(source.intruderPosition) ||
                !validPoint(details.position as Point2) || typeof details.observedByPlayer !== 'boolean' ||
                !Array.isArray(details.responderIds) || details.responderIds.some(actor =>
                    typeof actor !== 'string' || !defender!.personas[actor] && !defender!.personaArchive?.[actor]) ||
                !Array.isArray(details.participants) || details.participants.some(actor =>
                    typeof actor !== 'string' || !state.personas[actor] && !state.personaArchive?.[actor])) fail();
            priorTick = eventTick;
            finalEvent = event;
        }
        if (finalEvent?.details?.phase !== incident.phase || priorTick !== incident.changedAt) fail();
        for (const responder of incident.responderIds) {
            const key = defender!.clan.id + ':' + responder;
            const actor = defender!.residentPresence?.residents[responder];
            if (incident.phase === 'Closed' || reservations.has(key) || !actor ||
                actor.incidentId !== id || !['watch', 'warn', 'mobilise'].includes(actor.mode) ||
                !eligibleTerritorialObserver(defender!, responder)) fail();
            reservations.add(key);
        }
        if (incident.engagement) {
            const request = incident.engagement, event = state.events[Number(request.sourceEventId.slice(6)) - 1];
            if (request.version !== 1 || !uint(request.requestedAt) || !validPoint(request.position) ||
                !incident.sourceEventIds.includes(request.sourceEventId) || event?.details?.phase !== 'Hostile' ||
                event.time.winter * state.ticksPerWinter + event.time.tick !== request.requestedAt ||
                !Array.isArray(request.defenderIds) || !Array.isArray(request.intruderIds) ||
                request.defenderIds.some(actor => !defender!.personas[actor] && !defender!.personaArchive?.[actor]) ||
                request.intruderIds.some(actor => !mission!.memberIds.includes(actor))) fail();
        } else if (incident.phase === 'Hostile') fail();
    }
    for (const clan of clans(state)) {
        if (!clan.residentPresence || clan.residentPresence.worldId !== saved.worldId) fail();
        for (const [actorId, actor] of Object.entries(clan.residentPresence!.residents)) {
            if (!actor.incidentId) continue;
            const incident = saved.incidents[actor.incidentId];
            if (!incident || incident.phase === 'Closed' || incident.defendingClanId !== clan.clan.id ||
                actor.mode !== 'withdraw' && !incident.responderIds.includes(actorId))
                fail();
        }
    }
}

export function inspectTerritory(state: SimulationState, observingClanId = state.clan.id) {
    const saved = state.world?.territory;
    return { enabled: !!saved, version: saved?.version ?? null,
        incidents: Object.values(saved?.incidents ?? {})
            .filter(incident => observingClanId === state.clan.id ? incident.observedByPlayer :
                incident.defendingClanId === observingClanId)
            .map(incident => ({ id: incident.id, phase: incident.phase, reason: incident.reason,
                missionId: incident.missionId, groupId: incident.groupId, groupName: incident.intrudingClanId === observingClanId ? incident.groupName : 'Visiting party',
                defendingClanId: incident.defendingClanId, intrudingClanId: incident.intrudingClanId,
                position: { ...incident.position }, changedAt: incident.changedAt, openedAt: incident.openedAt,
                closedAt: incident.closedAt, sourceEventIds: [...incident.sourceEventIds],
                engagementRequested: !!incident.engagement,
                ...(incident.defendingClanId === observingClanId ? { responderCount: incident.responderIds.length } : {}) })) };
}
function clanById(root: SimulationState, id: string) {
    return root.clan.id === id ? root : root.world?.targetClans[id];
}
function activeVisitors(root: SimulationState) {
    return clans(root).flatMap(clan => Object.values(clan.world?.spatial?.missions ?? {})
        .filter(mission => mission.territoryVersion === 1 &&
            !['Prepared', 'Returned'].includes(mission.status) && mission.transport?.phase !== 'embarked')
        .map(mission => ({ clan, mission, people: mission.memberIds
            .filter(id => clan.personas[id]?.deathWinter === null)
            .map(id => ({ id, position: spatialMemberPosition(mission, id) })) })));
}
function inSettlement(position: Point2, bounds: Bounds2, margin = 0) {
    return position.x >= bounds.minX - margin && position.x <= bounds.maxX + margin &&
        position.z >= bounds.minZ - margin && position.z <= bounds.maxZ + margin;
}
function sees(context: PhysicalExpeditionContext, policy: TerritorialPolicy, from: Point2, to: Point2) {
    if (Math.hypot(from.x - to.x, from.z - to.z) > policy.sightRadius) return false;
    const surface = createBlueprintSurface(context.world);
    return traceTerrainSightline(context.world,
        { ...from, y: surface.surfaceHeightAt(from.x, from.z) + policy.eyeHeight },
        { ...to, y: surface.surfaceHeightAt(to.x, to.z) + policy.eyeHeight }).visible;
}
/** Resolve both sides from saved canonical presence, never caller-supplied positions. */
export function territorialContact(root: SimulationState, context: PhysicalExpeditionContext,
    defendingClanId: string, intrudingClanId: string, intruderId: string): TerritoryObservation | undefined {
    const saved = root.world?.territory;
    const defender = clanById(root, defendingClanId), intruder = clanById(root, intrudingClanId);
    if (!saved || saved.worldId !== context.worldId || !defender || !intruder || defender === intruder ||
        intruder.personas[intruderId]?.deathWinter !== null) return;
    const mission = Object.values(intruder.world?.spatial?.missions ?? {}).find(candidate =>
        candidate.territoryVersion === 1 && !['Prepared', 'Returned'].includes(candidate.status) &&
        candidate.transport?.phase !== 'embarked' && candidate.memberIds.includes(intruderId));
    const position = mission ? spatialMemberPosition(mission, intruderId) :
        residentAtHome(intruder, intruderId) ? intruder.residentPresence?.residents[intruderId]?.position : undefined;
    if (!position) return;
    const residents = defender.residentPresence?.residents ?? {};
    for (const id of Object.keys(residents).sort()) {
        if (eligibleTerritorialObserver(defender, id) && sees(context, saved.policy, residents[id].position, position))
            return { tick: now(root), observerId: id, intruderId,
                observerPosition: { ...residents[id].position }, intruderPosition: { x: position.x, z: position.z } };
    }
    return undefined;
}

function observeVisitor(root: SimulationState, defender: SimulationState,
    visitor: ReturnType<typeof activeVisitors>[number], context: PhysicalExpeditionContext) {
    for (const intruder of visitor.people) {
        const observation = territorialContact(root, context, defender.clan.id, visitor.clan.clan.id, intruder.id);
        if (observation) return observation;
    }
    return undefined;
}
function recordIncident(root: SimulationState, incident: TerritorialIncident,
    type: 'TerritoryIncidentOpened' | 'TerritoryIncidentChanged' | 'TerritoryIncidentClosed') {
    const intruder = clanById(root, incident.intrudingClanId);
    const mission = intruder?.world?.spatial?.missions[incident.missionId];
    const participants = incident.intrudingClanId === root.clan.id
        ? mission?.memberIds.filter(id => root.personas[id]?.deathWinter === null) ?? []
        : incident.responderIds.filter(id => !!root.personas[id]);
    const event: SimulationEvent = { id: 'event-' + (root.events.length + 1),
        type, time: { ...root.time }, details: { version: 1, incidentId: incident.id,
            defendingClanId: incident.defendingClanId, intrudingClanId: incident.intrudingClanId,
            missionId: incident.missionId, groupId: incident.groupId, groupName: incident.groupName,
            phase: incident.phase, reason: incident.reason, position: { ...incident.position },
            observedByPlayer: incident.observedByPlayer, observerId: incident.observation.observerId,
            intruderId: incident.observation.intruderId, responderIds: [...incident.responderIds],
            participants, observation: structuredClone(incident.observation) } };
    root.events.push(event);
    incident.sourceEventIds.push(event.id);
    return event.id;
}
function releaseIncident(root: SimulationState, incident: TerritorialIncident) {
    const defender = clanById(root, incident.defendingClanId);
    for (const actor of Object.values(defender?.residentPresence?.residents ?? {}))
        if (actor.incidentId === incident.id) releasePresence(actor);
    incident.responderIds = [];
}
function closeIncident(root: SimulationState, incident: TerritorialIncident, reason: TerritoryReason) {
    if (incident.phase === 'Closed') return;
    releaseIncident(root, incident);
    incident.phase = 'Closed';
    incident.reason = reason;
    incident.changedAt = now(root);
    incident.closedAt = now(root);
    recordIncident(root, incident, 'TerritoryIncidentClosed');
}
function assignResponders(root: SimulationState, incident: TerritorialIncident, context: PhysicalExpeditionContext) {
    const defender = clanById(root, incident.defendingClanId)!;
    const residents = defender.residentPresence!.residents, policy = root.world!.territory!.policy;
    const role = incident.phase === 'Suspicious' ? 'watch' : incident.phase === 'Hostile' ? 'mobilise' : 'warn';
    const ids = Object.keys(residents).filter(id => eligibleTerritorialObserver(defender, id) &&
        (!residents[id].incidentId || residents[id].incidentId === incident.id))
        .sort((a, b) => Math.hypot(residents[a].position.x - incident.position.x,
            residents[a].position.z - incident.position.z) - Math.hypot(
            residents[b].position.x - incident.position.x, residents[b].position.z - incident.position.z) ||
            a.localeCompare(b)).slice(0, policy.maxResponders);
    for (const oldId of incident.responderIds) if (!ids.includes(oldId) && residents[oldId]?.incidentId === incident.id)
        releasePresence(residents[oldId]);
    incident.responderIds = ids;
    for (const [index, id] of ids.entries()) {
        const actor = residents[id], changed = actor.incidentId !== incident.id || actor.mode !== role;
        actor.incidentId = incident.id;
        actor.mode = role;
        actor.facing = { ...incident.position };
        if (role === 'watch') {
            if (changed) freezePresence(actor);
            continue;
        }
        const center = defender.residentPresence!.site.center;
        const dx = center.x - incident.position.x, dz = center.z - incident.position.z;
        const length = Math.hypot(dx, dz) || 1;
        const target = { x: incident.position.x + dx / length * 7 - dz / length * index * 2,
            z: incident.position.z + dz / length * 7 + dx / length * index * 2 };
        const end = actor.route.at(-1)!;
        if (Math.hypot(target.x - actor.home.x, target.z - actor.home.z) <= policy.maxPursuit &&
            (changed || Math.hypot(target.x - end.x, target.z - end.z) > 6))
            setPresenceRoute(actor, target, context);
    }
    if (incident.phase !== 'Suspicious') {
        for (const [id, actor] of Object.entries(residents)) {
            if (!residentAtHome(defender, id) || isProvidingCare(defender, id) ||
                actor.ceremonyUntil !== null && actor.ceremonyUntil > now(defender) ||
                eligibleTerritorialObserver(defender, id) ||
                personaAge(defender, id) < 5 || actor.incidentId && actor.incidentId !== incident.id ||
                Math.hypot(actor.position.x - incident.position.x, actor.position.z - incident.position.z) > policy.sightRadius)
                continue;
            actor.incidentId = incident.id;
            actor.mode = 'withdraw';
            actor.facing = null;
            setPresenceRoute(actor, actor.home, context);
        }
    }
}
function changeIncident(root: SimulationState, incident: TerritorialIncident, phase: TerritoryPhase,
    reason: TerritoryReason, context: PhysicalExpeditionContext) {
    if (phase === incident.phase) return;
    incident.phase = phase;
    incident.reason = reason;
    incident.changedAt = now(root);
    if (phase === 'Alerted') incident.warnedAt = now(root);
    assignResponders(root, incident, context);
    const source = recordIncident(root, incident, 'TerritoryIncidentChanged');
    if (phase === 'Hostile') {
        const intruder = clanById(root, incident.intrudingClanId)!;
        const mission = intruder.world?.spatial?.missions[incident.missionId];
        incident.engagement = { version: 1, requestedAt: now(root), position: { ...incident.position },
            defenderIds: [...incident.responderIds],
            intruderIds: mission?.memberIds.filter(id => intruder.personas[id]?.deathWinter === null) ?? [],
            sourceEventId: source };
    }
}
export function reconcileTerritorialAwareness(root: SimulationState) {
    const saved = root.world?.territory;
    if (!saved) { reconcileResidentPresence(root); return; }
    for (const clan of clans(root)) reconcileResidentPresence(clan);
    for (const incident of Object.values(saved.incidents)) {
        if (incident.phase === 'Closed') continue;
        const intruder = clanById(root, incident.intrudingClanId);
        const mission = intruder?.world?.spatial?.missions[incident.missionId];
        if (!mission || !mission.memberIds.some(id => intruder!.personas[id]?.deathWinter === null))
            closeIncident(root, incident, 'party-unavailable');
        else if (mission.status === 'Returned') closeIncident(root, incident, 'party-returned');
        else {
            const defender = clanById(root, incident.defendingClanId);
            incident.responderIds = incident.responderIds.filter(id =>
                eligibleTerritorialObserver(defender!, id) &&
                defender?.residentPresence?.residents[id]?.incidentId === incident.id);
            if (mission.status === 'Returning') releaseIncident(root, incident);
        }
    }
}
/** Keep active/re-entry state bounded; the immutable event chain retains older incidents. */
function compactClosedIncidents(saved: TerritorialState, tick: number) {
    const incidents = Object.values(saved.incidents);
    let excess = incidents.length - 2048;
    if (excess <= 0) return;
    const expired = incidents.filter(incident => incident.phase === 'Closed' &&
        tick - incident.closedAt! >= saved.policy.reentryTicks)
        .sort((first, second) => first.closedAt! - second.closedAt! || first.id.localeCompare(second.id));
    for (const incident of expired) {
        if (excess-- <= 0) break;
        delete saved.incidents[incident.id];
    }
}
export function stepTerritorialAwareness(root: SimulationState, context?: PhysicalExpeditionContext) {
    const saved = root.world?.territory;
    if (!saved) return;
    if (!context || context.worldId !== saved.worldId)
        throw new Error('Territorial awareness requires its bound physical island.');
    if (now(root) !== saved.updatedAt + 1) throw new Error('Territorial presence advances one canonical tick at a time.');
    reconcileTerritorialAwareness(root);
    const confirmedVisitors = activeVisitors(root).flatMap(visitor => visitor.people.map(person => person.position));
    for (const clan of clans(root)) advanceResidentPresence(clan, context, saved.policy, confirmedVisitors);
    saved.updatedAt = now(root);
    if ((now(root) - saved.adoptedAt) % saved.policy.sampleTicks !== 0) return;
    const visitors = activeVisitors(root);
    for (const defender of clans(root)) {
        const site = defender.residentPresence!.site;
        for (const visitor of visitors) {
            if (visitor.clan.clan.id === defender.clan.id || !visitor.people.length) continue;
            let incident = Object.values(saved.incidents).find(item => item.phase !== 'Closed' &&
                item.defendingClanId === defender.clan.id && item.intrudingClanId === visitor.clan.clan.id &&
                item.missionId === visitor.mission.id);
            const observation = observeVisitor(root, defender, visitor, context);
            const nearby = visitor.people.some(person => inSettlement(person.position, site.bounds, saved.policy.sightRadius));
            if (!observation || !nearby) {
                if (incident && now(root) - incident.lastSeenAt >= saved.policy.lostContactTicks)
                    closeIncident(root, incident, 'lost-contact');
                continue;
            }
            if (visitor.mission.status === 'Returning') {
                if (incident && now(root) - incident.lastSeenAt >= saved.policy.lostContactTicks)
                    closeIncident(root, incident, 'lost-contact');
                continue;
            }
            const inside = inSettlement(observation.intruderPosition, site.bounds, -2);
            const hostileAct = visitor.mission.task?.type === 'Pillage' && visitor.mission.status === 'Exploring';
            if (!incident) {
                const recent = Object.values(saved.incidents).some(item => item.phase === 'Closed' &&
                    item.defendingClanId === defender.clan.id && item.intrudingClanId === visitor.clan.clan.id &&
                    item.missionId === visitor.mission.id && now(root) - item.closedAt! < saved.policy.reentryTicks);
                if (recent) continue;
                const phase = inside ? 'Alerted' : 'Suspicious';
                incident = { id: 'incident-' + saved.nextSequence++, defendingClanId: defender.clan.id,
                    intrudingClanId: visitor.clan.clan.id, missionId: visitor.mission.id,
                    groupId: visitor.mission.groupId, groupName: visitor.mission.groupName,
                    phase, reason: inside ? 'settlement-intrusion' : 'perimeter-sighting',
                    openedAt: now(root), changedAt: now(root), lastSeenAt: now(root),
                    warnedAt: inside ? now(root) : null, closedAt: null, position: { ...observation.intruderPosition },
                    observation, responderIds: [], sourceEventIds: [], observedByPlayer: true, engagement: null };
                saved.incidents[incident.id] = incident;
                assignResponders(root, incident, context);
                recordIncident(root, incident, 'TerritoryIncidentOpened');
            } else {
                incident.observation = observation;
                incident.position = { ...observation.intruderPosition };
                incident.lastSeenAt = now(root);
                if (inside && incident.phase === 'Suspicious')
                    changeIncident(root, incident, 'Alerted', 'settlement-intrusion', context);
            }
            if (hostileAct || inside && incident.phase === 'Alerted' &&
                now(root) - incident.warnedAt! >= saved.policy.warningTicks)
                changeIncident(root, incident, 'Hostile', hostileAct ? 'observed-pillage' : 'warning-ignored', context);
            if (incident.phase !== 'Hostile' && !inside && incident.phase === 'Alerted' &&
                now(root) - incident.changedAt >= saved.policy.lostContactTicks)
                closeIncident(root, incident, 'lost-contact');
            else assignResponders(root, incident, context);
        }
    }
    compactClosedIncidents(saved, now(root));
}

export function suspendPresenceForGathering(state: SimulationState, event: SimulationEvent) {
    if (!state.residentPresence || event.type !== 'CulturalGatheringHeld' || !Array.isArray(event.details?.participants)) return;
    for (const id of event.details.participants) {
        if (typeof id !== 'string') continue;
        const actor = state.residentPresence.residents[id];
        if (actor && !territorialDuty(state, id)) actor.ceremonyUntil = now(state) + 250;
    }
}
