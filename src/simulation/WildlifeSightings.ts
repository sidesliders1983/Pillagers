import { WildlifePopulation } from '../wildlife/WildlifePopulation';
import { captureWildlife, restoreWildlife, type WildlifeMotion } from '../wildlife/WildlifeSnapshot';
import { wildlifeSpecies } from '../wildlife/WildlifeSpecies';
import type { WildlifeActor } from '../wildlife/WildlifePopulation';
import type { HabitatTag } from '../wildlife/WildlifeSpecies';
import type { Point2, WorldBlueprint } from '../world-generation/WorldBlueprint';
import { createBlueprintSurface } from '../world-generation/TerrainQueries';
import { traceTerrainSightline } from '../world-generation/SettlementVisibility';
import { discoveryAt, inspectClanDiscovery, assertDiscoveryWorld, type DiscoveryView } from './ClanDiscovery';
import { spatialMemberPosition, type PhysicalExpeditionContext, type SpatialMission } from './SpatialExpeditions';
import { eventFacts } from './EventFacts';
import type { SimulationEvent, SimulationState } from './SimulationCore';

export const wildlifeSightingPolicy = Object.freeze({
    secondsPerTick: .2, sampleTicks: 5, radius: 32, absenceTicks: 50, cooldownTicks: 250,
});
interface Contact {
    groupId: string;
    speciesId: string;
    lastSeenAt: number;
    recordedAt: number;
}
export interface WildlifeState {
    version: 1;
    worldId: string;
    startedAt: number;
    advancedAt: number;
    actors: WildlifeMotion[];
    nextEncounter: number;
    contacts: Contact[];
    firstDiscoveries: Record<string, string>;
}
export interface WildlifeSighting {
    version: 1;
    sightingId: string;
    clanId: string;
    worldId: string;
    speciesId: string;
    wildlifeInstanceId: string;
    expeditionGroupId: string;
    groupName: string;
    missionId: string;
    witnessPersonaIds: string[];
    position: { x: number; y: number; z: number };
    habitat: HabitatTag;
    occurredAtTick: number;
    encounterKey: string;
    firstForClan: boolean;
}
export interface WildlifeProbeStats {
    animalsIndexed: number;
    observersIndexed: number;
    candidateChecks: number;
    sightlines: number;
    eventsRecorded: number;
}
const engines = new WeakMap<WorldBlueprint, WildlifePopulation>();
const now = (state: SimulationState) => state.time.winter * state.ticksPerWinter + state.time.tick;
const finitePoint = (point: Point2 | null | undefined) => !!point &&
    Number.isFinite(point.x) && Number.isFinite(point.z);
function engine(world: WorldBlueprint) {
    let population = engines.get(world);
    if (!population) { population = new WildlifePopulation(world); engines.set(world, population); }
    return population;
}
function requireWorld(state: SimulationState, context?: PhysicalExpeditionContext) {
    const candidate = context?.world as WorldBlueprint | undefined;
    const world = context?.wildlifeWorld ?? (candidate?.config && candidate.coast &&
        candidate.biomes && candidate.placementPlan ? candidate : undefined);
    if (!world || !state.discovery || !context || context.world !== world ||
        state.wildlife?.worldId !== context.worldId) throw new Error('Wildlife requires its bound physical island.');
    assertDiscoveryWorld(state.discovery, world, context.worldId);
    return world;
}

/** Explicit feature adoption; legacy saves gain no invented earlier sightings. */
export function initializeWildlifeSightings(input: SimulationState, world: WorldBlueprint, worldId: string) {
    if (!input.discovery) throw new Error('Wildlife sightings require physical discovery.');
    assertDiscoveryWorld(input.discovery, world, worldId);
    const state = structuredClone(input);
    if (state.wildlife) {
        assertWildlifeWorld(state, { world, worldId, wildlifeWorld: world });
        return state;
    }
    // A cached engine may have advanced another replay branch. Generate the seeded opening once anew.
    const population = new WildlifePopulation(world);
    engines.set(world, population);
    state.wildlife = { version: 1, worldId, startedAt: now(state), advancedAt: now(state),
        actors: captureWildlife(population), nextEncounter: 1, contacts: [], firstDiscoveries: {} };
    return state;
}
export function assertWildlifeWorld(state: SimulationState, context?: PhysicalExpeditionContext) {
    if (!state.wildlife) return;
    const world = requireWorld(state, context), population = engine(world);
    const bounds = world.terrain.bounds;
    if (state.wildlife.actors.some(actor => actor.position.x < bounds.minX || actor.position.x > bounds.maxX ||
        actor.position.z < bounds.minZ || actor.position.z > bounds.maxZ || Math.abs(actor.position.y) > 1000))
        throw new Error('Saved wildlife lies outside its physical island.');
    if (population.actors.length !== state.wildlife.actors.length ||
        population.actors.some((actor, i) => actor.id !== state.wildlife!.actors[i]?.id))
        throw new Error('Saved wildlife does not belong to this island population.');
}

/** Physical eligibility is independent of camera visibility and model load completion. */
export function canSightWildlife(world: WorldBlueprint, view: DiscoveryView, observer: Point2,
    animal: { x: number; y: number; z: number }, eyeHeight: number) {
    if (Math.hypot(observer.x - animal.x, observer.z - animal.z) > wildlifeSightingPolicy.radius ||
        discoveryAt(view, animal.x, animal.z) === 'unknown') return false;
    const surface = createBlueprintSurface(world);
    return traceTerrainSightline(world,
        { ...observer, y: Math.max(world.waterLevel, surface.surfaceHeightAt(observer.x, observer.z)) + eyeHeight },
        { ...animal, y: animal.y + .3 }).visible;
}

/** Called only from canonical tick advancement, never from model loading or render frames. */
export function stepWildlifeSightings(state: SimulationState, context?: PhysicalExpeditionContext, confirmedMissions?: readonly SpatialMission[]): WildlifeProbeStats | undefined {
    const saved = state.wildlife;
    if (!saved) return;
    const world = requireWorld(state, context), population = engine(world), tick = now(state);
    if (tick !== saved.advancedAt + 1) throw new Error('Wildlife must advance one canonical tick at a time.');
    restoreWildlife(population, saved.actors, (saved.advancedAt - saved.startedAt) * wildlifeSightingPolicy.secondsPerTick);
    const missions = (confirmedMissions ?? Object.values(state.world?.spatial?.missions ?? {}))
        .filter(mission => !['Prepared', 'Returned'].includes(mission.status));
    const groups = missions.map(mission => ({ mission,
        witnesses: mission.memberIds.filter(id => state.personas[id]?.deathWinter === null) }));
    const observers = groups.flatMap(group => group.witnesses.map(id => ({ group,
        position: spatialMemberPosition(group.mission, id) })));
    population.setHumans(observers.map(observer => observer.position));
    population.habitats.setObstacles([...world.settlement.buildings,
        ...(context?.exclusions ?? []).map(b => ({ x: (b.minX + b.maxX) / 2, z: (b.minZ + b.maxZ) / 2,
            halfWidth: (b.maxX - b.minX) / 2, halfDepth: (b.maxZ - b.minZ) / 2, rotation: 0 }))]);
    population.advance(wildlifeSightingPolicy.secondsPerTick, true);
    saved.actors = captureWildlife(population);
    saved.advancedAt = tick;
    if ((tick - saved.startedAt) % wildlifeSightingPolicy.sampleTicks) return;
    const stats = { animalsIndexed: 0, observersIndexed: observers.length,
        candidateChecks: 0, sightlines: 0, eventsRecorded: 0 };
    const activeGroups = new Set(groups.filter(group => group.witnesses.length).map(group => group.mission.groupId));
    saved.contacts = saved.contacts.filter(contact => activeGroups.has(contact.groupId));
    if (!observers.length) return stats;
    const radius = wildlifeSightingPolicy.radius, buckets = new Map<string, WildlifeActor[]>();
    const bucket = (x: number, z: number) => Math.floor(x / radius) + ':' + Math.floor(z / radius);
    for (const actor of population.actors) {
        if (actor.variant.movement !== 'air' && !population.habitats.valid(actor.position, actor.variant)) continue;
        const key = bucket(actor.position.x, actor.position.z), entries = buckets.get(key) ?? [];
        entries.push(actor); buckets.set(key, entries); stats.animalsIndexed++;
    }
    const view = inspectClanDiscovery(state.discovery!, state.clan.id);
    const matches = new Map<string, { group: typeof groups[number]; actor: WildlifeActor }>();
    for (const observer of observers) {
        const { x, z } = observer.position, bx = Math.floor(x / radius), bz = Math.floor(z / radius);
        for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
            for (const actor of buckets.get((bx + dx) + ':' + (bz + dz)) ?? []) {
                stats.candidateChecks++;
                const key = observer.group.mission.groupId + ':' + actor.species;
                if (matches.has(key) || Math.hypot(x - actor.position.x, z - actor.position.z) > radius ||
                    discoveryAt(view, actor.position.x, actor.position.z) === 'unknown') continue;
                stats.sightlines++;
                if (!canSightWildlife(world, view, observer.position, actor.position, state.discovery!.policy.eyeHeight)) continue;
                matches.set(key, { group: observer.group, actor });
            }
        }
    }
    for (const { group, actor } of matches.values()) {
        const contact = saved.contacts.find(item => item.groupId === group.mission.groupId && item.speciesId === actor.species);
        const eligible = !contact || tick - contact.lastSeenAt >= wildlifeSightingPolicy.absenceTicks &&
            tick - contact.recordedAt >= wildlifeSightingPolicy.cooldownTicks;
        if (contact) contact.lastSeenAt = tick;
        if (!eligible) continue;
        if (contact) contact.recordedAt = tick;
        else saved.contacts.push({ groupId: group.mission.groupId, speciesId: actor.species,
            lastSeenAt: tick, recordedAt: tick });
        const id = 'event-' + (state.events.length + 1), encounterKey = 'wildlife-' + saved.nextEncounter++;
        const firstForClan = !Object.hasOwn(saved.firstDiscoveries, actor.species);
        if (firstForClan) saved.firstDiscoveries[actor.species] = id;
        const details: WildlifeSighting = { version: 1, sightingId: encounterKey, clanId: state.clan.id,
            worldId: saved.worldId, speciesId: actor.species, wildlifeInstanceId: actor.id,
            expeditionGroupId: group.mission.groupId, groupName: group.mission.groupName,
            missionId: group.mission.id, witnessPersonaIds: [...group.witnesses],
            position: { ...actor.position }, habitat: actor.habitat, occurredAtTick: tick,
            encounterKey, firstForClan };
        state.events.push({ id, type: 'WildlifeSighted', time: { ...state.time },
            details: eventFacts(state, { ...details }) });
        stats.eventsRecorded++;
    }
    return stats;
}

export function wildlifeSighting(event: SimulationEvent): WildlifeSighting | undefined {
    if (event.type !== 'WildlifeSighted' || event.details?.version !== 1) return;
    const value = event.details as unknown as WildlifeSighting;
    if (!wildlifeSpecies.some(species => species.id === value.speciesId) ||
        !Array.isArray(value.witnessPersonaIds) || !value.witnessPersonaIds.every(id => typeof id === 'string') ||
        !finitePoint(value.position) || !Number.isFinite(value.position.y)) return;
    return value;
}
export function validateWildlifeSighting(event: SimulationEvent, state: SimulationState) {
    if (event.type !== 'WildlifeSighted') return;
    const d = wildlifeSighting(event), fail = () => { throw new Error('Invalid wildlife sighting.'); };
    if (!d || !state.wildlife || d.worldId !== state.wildlife.worldId || event.personaId !== undefined) return fail();
    const species = wildlifeSpecies.find(item => item.id === d.speciesId)!;
    if (!species.variants.some(v => Array.from({ length: v.count }, (_, i) => species.id + ':' + v.id + ':' + i).includes(d.wildlifeInstanceId) &&
        v.habitats.includes(d.habitat)) || d.clanId !== state.clan.id || !d.worldId ||
        ![d.worldId, d.groupName, d.expeditionGroupId, d.missionId, d.wildlifeInstanceId].every(value =>
            typeof value === 'string' && value.length > 0 && value.length <= 200) ||
        !/^wildlife-[1-9][0-9]*$/.test(d.encounterKey) || d.sightingId !== d.encounterKey ||
        typeof d.firstForClan !== 'boolean' || d.occurredAtTick !== event.time.winter * state.ticksPerWinter + event.time.tick ||
        new Set(d.witnessPersonaIds).size !== d.witnessPersonaIds.length ||
        d.witnessPersonaIds.length > 62 || d.witnessPersonaIds.some(id => !state.personas[id] && !state.personaArchive?.[id])) fail();
}
export function validateWildlife(state: SimulationState) {
    const saved = state.wildlife;
    if (!saved) return;
    const fail = () => { throw new Error('Invalid saved wildlife state.'); };
    if (saved.version !== 1 || !state.discovery || saved.worldId !== state.discovery.worldId ||
        !Number.isSafeInteger(saved.startedAt) || saved.startedAt < 800000 || saved.startedAt > now(state) ||
        saved.advancedAt !== now(state) || !Number.isSafeInteger(saved.nextEncounter) || saved.nextEncounter < 1 ||
        !Array.isArray(saved.actors) || saved.actors.length > 128 || !Array.isArray(saved.contacts) || saved.contacts.length > 176 ||
        !saved.firstDiscoveries || typeof saved.firstDiscoveries !== 'object') return fail();
    const possibleIds = new Set(wildlifeSpecies.flatMap(species => species.variants.flatMap(variant =>
        Array.from({ length: variant.count }, (_, index) => species.id + ':' + variant.id + ':' + index))));
    if (new Set(saved.actors.map(actor => actor.id)).size !== saved.actors.length) fail();
    for (const actor of saved.actors) {
        if (!possibleIds.has(actor.id) || !finitePoint(actor.position) || !Number.isFinite(actor.position.y) ||
            actor.target !== null && !finitePoint(actor.target) || !Number.isSafeInteger(actor.decisions) || actor.decisions < 0 ||
            !['idle', 'roam', 'glide', 'swim', 'rest', 'flee', 'alert'].includes(actor.state) ||
            !['heading', 'bank', 'wait', 'fleeUntil', 'escapeWait', 'climbRate', 'flapEffort'].every(key =>
                Number.isFinite((actor as unknown as Record<string, number>)[key]))) fail();
        const hop = actor.hop;
        if (hop && (!finitePoint(hop.from) || !finitePoint(hop.to) || typeof hop.active !== 'boolean' ||
            ![hop.phase, hop.duration, hop.amplitude, hop.lift, hop.startHeading].every(Number.isFinite) ||
            hop.phase < 0 || hop.phase > 1 || hop.duration <= 0 || hop.lift < 0)) fail();
    }
    const contacts = new Set<string>();
    for (const contact of saved.contacts) {
        const key = contact.groupId + ':' + contact.speciesId;
        if (!contact.groupId || !wildlifeSpecies.some(s => s.id === contact.speciesId) || contacts.has(key) ||
            !Number.isSafeInteger(contact.lastSeenAt) || !Number.isSafeInteger(contact.recordedAt) ||
            contact.recordedAt < saved.startedAt || contact.recordedAt > contact.lastSeenAt || contact.lastSeenAt > now(state)) fail();
        contacts.add(key);
    }
    for (const [speciesId, id] of Object.entries(saved.firstDiscoveries)) {
        const event = state.events[Number(id.slice(6)) - 1], sighting = event && wildlifeSighting(event);
        if (!sighting || sighting.speciesId !== speciesId || !sighting.firstForClan || sighting.worldId !== saved.worldId) fail();
    }
}
