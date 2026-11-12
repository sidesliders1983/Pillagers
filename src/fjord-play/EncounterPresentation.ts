import { projectResidentAppearance } from '../characters/ResidentAppearance';
import { parseFacialShape } from '../characters/FacialIdentity';
import { createBlueprintSurface } from '../world-generation/TerrainQueries';
import type { FjordEntity } from './FjordProjection';
import { spatialMemberPosition } from '../simulation/SpatialExpeditions';
import { discoveryAt, inspectClanDiscovery } from '../simulation/ClanDiscovery';
import { encounterRulesFor, type EncounterRecord } from '../simulation/OnSiteEncounters';
import type { SimulationState } from '../simulation/SimulationCore';
import type { PersonalEquipment } from '../simulation/Smithery';
import type { Point2, WorldBlueprint } from '../world-generation/WorldBlueprint';

export interface FjordEncounterAction {
    key: string;
    tick: number;
    facing: Point2 | null;
    outcome: 'death' | 'blocked' | 'survived';
}

export interface FjordEncounterWindow {
    tick: number;
    outgoing?: FjordEncounterAction;
    incoming?: FjordEncounterAction;
}

/** Per-person facts only. Random rolls, hidden participants and future exchanges stay in Core. */
export interface FjordEncounterCue {
    version: 1;
    id: string;
    phase: EncounterRecord['phase'];
    active: boolean;
    snapshotTick: number;
    startedAt: number;
    exchangeTicks: number;
    withdrawing: boolean;
    withdrawalStartedAt: number | null;
    withdrawalTicks: number;
    facing: Point2 | null;
    outgoing?: FjordEncounterAction;
    incoming?: FjordEncounterAction;
    windows?: readonly FjordEncounterWindow[];
}

export interface FjordCombatDeath {
    version: 1;
    key: string;
    encounterId: string;
    tick: number;
    durationTicks: number;
    expiresAt: number;
    equipment: PersonalEquipment;
}

const absoluteTick = (state: SimulationState) =>
    state.time.winter * state.ticksPerWinter + state.time.tick;

/** The root owns both sides' exchange receipts; the nested rival state does not. */
export function projectEncounterCue(owner: SimulationState, clanId: string, personaId: string,
    position: Point2): FjordEncounterCue | undefined {
    const tick = absoluteTick(owner);
    const entry = Object.values(owner.world?.encounters?.records ?? {})
        .filter(record => record.attackingClanId === clanId && record.attackerIds.includes(personaId) ||
            record.defendingClanId === clanId && record.defenderIds.includes(personaId))
        .sort((first, second) => second.startedAt - first.startedAt)[0];
    if (!entry) return;
    const mission = owner.world?.spatial?.missions[entry.missionId];
    const rules = mission && encounterRulesFor(mission);
    if (!rules) return;
    const knowledge = owner.discovery && inspectClanDiscovery(owner.discovery, owner.clan.id);
    const observable = (point: Point2) => !!knowledge &&
        discoveryAt(knowledge, point.x, point.z) === 'visible';
    const exchange = entry.exchanges.at(-1);
    const recent = exchange && tick >= exchange.tick && tick < exchange.tick + rules.policy.exchangeTicks;
    const retainedTail = exchange && tick >= exchange.tick &&
        tick < exchange.tick + 2 * rules.policy.exchangeTicks;
    const active = entry.phase === 'engaging' || entry.phase === 'withdrawing';
    if (!active && entry.phase !== 'contact' && !retainedTail) return;
    const firstExchangeIndex = Math.max(0, entry.exchanges.length - 2);
    // A newly known exchange may arrive while interpolation is still inside its predecessor.
    // Keep only those two recorded windows, retaining their original source indices and keys.
    const windows: FjordEncounterWindow[] = entry.exchanges.slice(-2).map((recorded, offset) => {
        const actions = recorded.actions;
        const summarize = (index: number, target: boolean): FjordEncounterAction | undefined => {
            if (index < 0) return;
            const action = actions[index];
            const point = target ? action.actorPosition : action.targetPosition;
            return { key: entry.id + ':' + (firstExchangeIndex + offset) + ':' + index,
                tick: recorded.tick, facing: observable(point) ? { x: point.x, z: point.z } : null,
                outcome: action.outcome };
        };
        const outgoing = summarize(actions.findIndex(action => action.actorClanId === clanId &&
            action.actorId === personaId), false);
        const incoming = summarize(actions.findIndex(action => action.targetClanId === clanId &&
            action.targetId === personaId), true);
        return { tick: recorded.tick, ...(outgoing ? { outgoing } : {}), ...(incoming ? { incoming } : {}) };
    });
    const latest = recent ? windows.at(-1) : undefined;
    const outgoing = latest?.outgoing, incoming = latest?.incoming;
    const phaseEventType = entry.phase === 'contact' ? 'EncounterContact' :
        entry.phase === 'engaging' ? 'EncounterCommitted' :
        entry.phase === 'withdrawing' ? 'EncounterWithdrawalRequested' : 'EncounterResolved';
    const receipt = entry.sourceEvents.filter(ref => ref.clanId === owner.clan.id)
        .map(ref => owner.events.find(event => event.id === ref.eventId))
        .filter(event => event?.type === phaseEventType && event.details?.encounterId === entry.id).at(-1);
    const startedAt = receipt ? receipt.time.winter * owner.ticksPerWinter + receipt.time.tick : entry.startedAt;
    const opponents = clanId === entry.attackingClanId ?
        owner.world!.targetClans[entry.defendingClanId] : owner;
    const opponentIds = clanId === entry.attackingClanId ? entry.defenderIds : entry.attackerIds;
    const points = opponentIds.filter(id => opponents.personas[id]?.deathWinter === null).flatMap(id => {
        const point = opponents === owner && mission ? spatialMemberPosition(mission, id) :
            opponents.residentPresence?.residents[id]?.position;
        return point && observable(point) ? [point] : [];
    });
    points.sort((first, second) => Math.hypot(first.x - position.x, first.z - position.z) -
        Math.hypot(second.x - position.x, second.z - position.z));
    const facing = outgoing?.facing ?? incoming?.facing ?? points[0];
    return { version: 1, id: entry.id, phase: entry.phase, active, snapshotTick: tick, startedAt,
        exchangeTicks: rules.policy.exchangeTicks, windows,
        withdrawing: entry.withdrawingSide === (clanId === entry.attackingClanId ? 'attacker' : 'defender'),
        withdrawalStartedAt: rules.withdrawalRequestedAt, withdrawalTicks: rules.policy.disengageTicks,
        facing: facing ? { x: facing.x, z: facing.z } : null, ...(outgoing ? { outgoing } : {}), ...(incoming ? { incoming } : {}) };
}

/** A recorded casualty falls for five ticks, remains briefly, then releases its existing model. */
export function projectCombatDeaths(owner: SimulationState, clan: SimulationState,
    world: WorldBlueprint): FjordEntity[] {
    const tick = absoluteTick(owner);
    const surface = createBlueprintSurface(world);
    const entities = new Map<string, FjordEntity>();
    for (const entry of Object.values(owner.world?.encounters?.records ?? {})) {
        if (tick >= entry.updatedAt + 15) continue;
        for (const ref of entry.sourceEvents) {
            if (ref.clanId !== clan.clan.id) continue;
            const event = clan.events.find(event => event.id === ref.eventId);
            if (event?.type !== 'PersonaDied' || event.details?.cause !== 'Combat' ||
                event.details.encounterId !== entry.id || !event.personaId) continue;
            const diedAt = event.time.winter * owner.ticksPerWinter + event.time.tick;
            if (tick < diedAt || tick >= diedAt + 15) continue;
            const position = event.details.position as Point2 | undefined;
            const gear = entry.equipment[event.personaId];
            const appearance = projectResidentAppearance(clan, event.personaId);
            const person = clan.personas[event.personaId] ?? clan.personaArchive?.[event.personaId];
            if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.z) ||
                !gear || !appearance || !person || person.deathWinter === null) continue;
            const fatal = entry.exchanges.filter(exchange => exchange.tick === diedAt)
                .flatMap(exchange => exchange.actions).find(action => action.targetClanId === clan.clan.id &&
                    action.targetId === person.id && action.outcome === 'death');
            if (!fatal) continue;
            const combatDeath: FjordCombatDeath = { version: 1, key: clan.clan.id + ':' + event.id,
                encounterId: entry.id, tick: diedAt, durationTicks: 5, expiresAt: diedAt + 15,
                equipment: { weapon: gear.weapon, shield: gear.shield } };
            entities.set(person.id, { kind: 'persona', id: person.id, selectionKey: 'persona:' + person.id,
                label: person.name, asset: 'human', dna: appearance.dna,
                facialIdentity: parseFacialShape(appearance.face),
                transform: { x: position.x, z: position.z,
                    y: surface.surfaceHeightAt(position.x, position.z),
                    rotation: Math.atan2(fatal.actorPosition.x - position.x, fatal.actorPosition.z - position.z),
                    scale: .4 + .6 * Math.min(16, Math.max(0, appearance.dna.age)) / 16 },
                status: { living: false, workEligible: false, occupation: null, combatDeath,
                    sex: appearance.dna.sex, age: appearance.dna.age } });
        }
    }
    return [...entities.values()];
}
