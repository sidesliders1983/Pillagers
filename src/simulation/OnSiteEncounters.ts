import { releaseLongship } from './LongshipTransport';
import { reconcileTerritorialAwareness } from './TerritorialAwareness';
import type { SimulationState } from './SimulationCore';
import type { PhysicalExpeditionContext, SpatialMission } from './SpatialExpeditions';
import {
    spatialMemberPosition, spatialMissionPosition, beginRedirectedReturn, modeReturnTrail, settleProvisions,
} from './SpatialExpeditions';
import type { Point2 } from '../world-generation/WorldBlueprint';
import type { TransitManifest } from './TransitCargo';
import {
    captureTransitCargo, reconcileTransitCargo, deliverTransitCargo, transitReadyForDeparture,
    transitReadyForDelivery, validateTransitManifest, validateTransitWorld, stepCustody,
} from './TransitCargo';
import { weatherProfile } from './Weather';
import { eventFacts } from './EventFacts';
import { equipmentResult, equipmentFor, defaultSmitheryConfig, equipmentSpearBonus, equipmentCasualtyRisk,
    type PersonalEquipment } from './Smithery';
import { wearingPersonalArmor } from './PersonalArmor';
import { eligibleTerritorialObserver, freezePresence } from './ResidentPresence';
import { commitPersonaDeaths } from './Mortality';
import { farmyards, reconcileFarmyards } from './Farmyards';
import { randomUint } from './Random';
import { createBlueprintSurface } from '../world-generation/TerrainQueries';
import { traceTerrainSightline } from '../world-generation/SettlementVisibility';

export interface EncounterPolicy {
    version: 1;
    contactDistance: number;
    contactWaitTicks: number;
    exchangeTicks: number;
    maximumExchanges: number;
    actionLethalityBps: number;
    retreatLossBps: number;
    disengageTicks: number;
}
/** Provisional parameters for the matched-actor comparison, not approved balance. */
export const encounterPolicy: Readonly<EncounterPolicy> = Object.freeze({
    version: 1, contactDistance: 3, contactWaitTicks: 25, exchangeTicks: 5,
    maximumExchanges: 4, actionLethalityBps: 250, retreatLossBps: 5000, disengageTicks: 5,
});
export type EncounterPhase = 'approach' | 'contact' | 'engaging' | 'resolved' | 'withdrawing' |
    'returning' | 'lost' | 'stranded' | 'completed';
export interface ClanEventRef { clanId: string; eventId: string }
export interface CombatEquipment extends PersonalEquipment {
    metalworking?: { version: 1; ironSpearBonusBps: number; ironShieldProtectionBps: number };
    personalArmor?: { version: 1; leatherBodyArmorProtectionBps: number; ironHelmetProtectionBps: number;
        maximumPersonalProtectionBps: number };
    personaId: string;
    spearBonusBps: number;
    woodenShieldProtectionBps: number;
    leatherShieldProtectionBps: number;
}
export interface EncounterAction {
    actorClanId: string;
    actorId: string;
    targetClanId: string;
    targetId: string;
    actorPosition: Point2;
    targetPosition: Point2;
    probabilityBps: number;
    roll: number;
    outcome: 'death' | 'blocked' | 'survived';
}
export interface PhysicalEncounterRules {
    attackerEquipment: Record<string, CombatEquipment>;
    version: 1;
    policy: EncounterPolicy;
    phase: EncounterPhase;
    encounterId: string | null;
    travelRiskBps: number;
    travelResolvedAt: number | null;
    travelSourceEventIds: string[];
    operationResolvedAt: number | null;
    operationSuccess: boolean | null;
    withdrawalRequestedAt: number | null;
    manifest?: TransitManifest;
}
export interface EncounterRecord {
    version: 1;
    id: string;
    missionId: string;
    incidentId: string | null;
    siteId: string;
    attackingClanId: string;
    defendingClanId: string;
    phase: 'contact' | 'engaging' | 'withdrawing' | 'resolved';
    withdrawingSide: 'attacker' | 'defender' | null;
    position: Point2;
    startedAt: number;
    updatedAt: number;
    nextExchangeAt: number;
    exchangeIndex: number;
    attackerIds: string[];
    defenderIds: string[];
    outcome: 'won' | 'withdrew' | 'lost' | 'undefended' | null;
    sourceEvents: ClanEventRef[];
    resolvedAt: number | null;
    equipment: Record<string, CombatEquipment>;
    exchanges: { tick: number; actions: EncounterAction[] }[];
}
export interface EncounterState { version: 1; records: Record<string, EncounterRecord> }
export function encounterRulesFor(mission: SpatialMission) {
    return mission.encounterRules ?? mission.task?.encounterRules;
}
const now = (state: SimulationState) => state.time.winter * state.ticksPerWinter + state.time.tick;
function record(state: SimulationState, type: string, mission: SpatialMission, details: Record<string, unknown> = {}) {
    const id = 'event-' + (state.events.length + 1);
    state.events.push({ id, type, time: { ...state.time }, details: eventFacts(state, {
        missionId: mission.id, mission: mission.task?.type ?? 'Explore', groupName: mission.groupName,
        onSiteVersion: 1, encounterId: encounterRulesFor(mission)?.encounterId ?? null,
        destination: mission.task?.target.kind === 'area' ? 'a mapped area' : mission.task ? 'a settlement site' : 'the reached landscape',
        participants: [...mission.memberIds], ...details,
    }) });
    return id;
}
export function onSiteOffer(state: SimulationState, context: PhysicalExpeditionContext) {
    if (!state.world?.territory) return undefined;
    const policy = { ...encounterPolicy, ...context.encounterPolicy };
    validatePolicy(policy);
    return { version: 1 as const, travelRiskBps: weatherProfile(state).travelRiskBps,
        contactDistance: policy.contactDistance, contactWaitTicks: policy.contactWaitTicks,
        exchangeTicks: policy.exchangeTicks, maximumExchanges: policy.maximumExchanges, provisional: true as const };
}
export function createEncounterRules(state: SimulationState, context: PhysicalExpeditionContext, members: readonly string[]): PhysicalEncounterRules {
    const policy = { ...encounterPolicy, ...context.encounterPolicy };
    validatePolicy(policy);
    return { version: 1, policy, phase: 'approach', encounterId: null,
        attackerEquipment: Object.fromEntries(members.map(id => [id, snapshotEquipment(state, id)])),
        travelRiskBps: weatherProfile(state).travelRiskBps, travelResolvedAt: null,
        travelSourceEventIds: [], operationResolvedAt: null, operationSuccess: null,
        withdrawalRequestedAt: null };
}
function ensureRecord(state: SimulationState, mission: SpatialMission) {
    const rules = encounterRulesFor(mission)!;
    if (rules.encounterId) return state.world!.encounters!.records[rules.encounterId];
    const registry = state.world!.encounters ??= { version: 1, records: {} };
    const id = 'encounter-' + mission.id;
    const position = spatialMemberPosition(mission, mission.memberIds.find(id => state.personas[id]?.deathWinter === null)!);
    const entry: EncounterRecord = { version: 1, id, missionId: mission.id,
        incidentId: Object.values(state.world!.territory!.incidents).find(incident =>
            incident.missionId === mission.id && incident.phase === 'Hostile')?.id ?? null, siteId: state.world!.island!.siteId, attackingClanId: state.clan.id,
        defendingClanId: state.world!.island!.clanId, phase: 'contact', withdrawingSide: null, position: { x: position.x, z: position.z },
        startedAt: now(state), updatedAt: now(state), nextExchangeAt: now(state) + rules.policy.contactWaitTicks,
        exchangeIndex: 0, attackerIds: mission.memberIds.filter(id => state.personas[id]?.deathWinter === null),
        defenderIds: [], outcome: null, sourceEvents: [], resolvedAt: null,
        equipment: {}, exchanges: [] };
    const eventId = record(state, 'EncounterContact', mission, { encounterId: id, position: entry.position });
    entry.sourceEvents.push({ clanId: state.clan.id, eventId });
    registry.records[id] = entry;
    rules.encounterId = id;
    rules.phase = 'contact';
    return entry;
}
function snapshotEquipment(state: SimulationState, id: string): CombatEquipment {
    const config = state.smithery?.config ?? defaultSmitheryConfig;
    const gear = equipmentFor(state, id);
    const hasIron = gear.weapon === 'ironSpear' || gear.shield === 'ironShield';
    return { personaId: id, ...gear, spearBonusBps: config.spearBonusBps,
        woodenShieldProtectionBps: config.woodenShieldProtectionBps,
        leatherShieldProtectionBps: config.leatherShieldProtectionBps,
        ...(hasIron ? { metalworking: { version: 1 as const,
            ironSpearBonusBps: config.ironSpearBonusBps!,
            ironShieldProtectionBps: config.ironShieldProtectionBps! } } : {}),
        ...(wearingPersonalArmor(gear) ? { personalArmor: { version: 1 as const,
            leatherBodyArmorProtectionBps: config.leatherBodyArmorProtectionBps!,
            ironHelmetProtectionBps: config.ironHelmetProtectionBps!,
            maximumPersonalProtectionBps: config.maximumPersonalProtectionBps! } } : {}) };
}
function combatEquipmentRules(gear: CombatEquipment) {
    return { ...gear, ...gear.metalworking, ...gear.personalArmor };
}
function sees(context: PhysicalExpeditionContext, first: Point2, second: Point2) {
    const surface = createBlueprintSurface(context.world);
    return traceTerrainSightline(context.world,
        { ...first, y: surface.surfaceHeightAt(first.x, first.z) + 1.7 },
        { ...second, y: surface.surfaceHeightAt(second.x, second.z) + 1.7 }).visible;
}
function presentDefenders(state: SimulationState, mission: SpatialMission, context: PhysicalExpeditionContext) {
    const defender = state.world!.targetClans[state.world!.island!.clanId];
    const rules = encounterRulesFor(mission)!;
    const incident = Object.values(state.world!.territory!.incidents).find(value =>
        value.missionId === mission.id && value.phase === 'Hostile');
    if (!incident) return [];
    const attackers = mission.memberIds.filter(id => state.personas[id]?.deathWinter === null)
        .map(id => spatialMemberPosition(mission, id));
    return incident.responderIds.filter(id => {
        const actor = defender.residentPresence?.residents[id];
        if (!actor || !eligibleTerritorialObserver(defender, id) || actor.incidentId !== incident.id) return false;
        const reserved = Object.values(state.world!.encounters?.records ?? {}).some(other =>
            other.missionId !== mission.id && ['engaging', 'withdrawing'].includes(other.phase) &&
            other.defendingClanId === defender.clan.id && other.defenderIds.includes(id));
        return !reserved && attackers.some(point => Math.hypot(point.x - actor.position.x,
            point.z - actor.position.z) <= rules.policy.contactDistance && sees(context, point, actor.position));
    }).sort();
}
function commitContact(state: SimulationState, mission: SpatialMission, entry: EncounterRecord, defenders: string[]) {
    const rules = encounterRulesFor(mission)!, target = state.world!.targetClans[entry.defendingClanId];
    entry.phase = 'engaging';
    entry.defenderIds = [...defenders];
    entry.attackerIds = mission.memberIds.filter(id => state.personas[id]?.deathWinter === null);
    entry.equipment = { ...Object.fromEntries(entry.attackerIds.map(id =>
        [id, structuredClone(rules.attackerEquipment[id])])),
        ...Object.fromEntries(defenders.map(id => [id, snapshotEquipment(target, id)])) };
    entry.nextExchangeAt = now(state) + rules.policy.exchangeTicks;
    entry.updatedAt = now(state);
    rules.phase = 'engaging';
    for (const id of defenders) {
        const actor = target.residentPresence!.residents[id];
        freezePresence(actor);
        actor.facing = { ...entry.position };
    }
    const eventId = record(state, 'EncounterCommitted', mission, { encounterId: entry.id,
        incidentId: entry.incidentId, position: entry.position, observedDefenderCount: defenders.length,
        attackerIds: [...entry.attackerIds], defenderIds: [...entry.defenderIds],
        equipment: structuredClone(entry.equipment) });
    entry.sourceEvents.push({ clanId: state.clan.id, eventId });
    if (mission.task?.type !== 'Pillage') beginWithdrawal(state, mission, entry);
}
function resolveEncounter(state: SimulationState, mission: SpatialMission, entry: EncounterRecord,
    outcome: NonNullable<EncounterRecord['outcome']>, disengaged = false) {
    if (outcome === 'withdrew' && !disengaged) {
        beginWithdrawal(state, mission, entry);
        return;
    }
    entry.phase = 'resolved';
    entry.outcome = outcome;
    entry.resolvedAt = now(state);
    entry.updatedAt = now(state);
    const eventId = record(state, 'EncounterResolved', mission, { encounterId: entry.id,
        incidentId: entry.incidentId, outcome, observedDefenderCount: entry.defenderIds.length,
        position: entry.position,
        casualtyIds: entry.attackerIds.filter(id => state.personas[id]?.deathWinter !== null) });
    entry.sourceEvents.push({ clanId: state.clan.id, eventId });
    const rules = encounterRulesFor(mission)!;
    rules.phase = 'resolved';
    if (outcome === 'withdrew' || outcome === 'lost') {
        rules.operationResolvedAt ??= now(state);
        rules.operationSuccess = false;
        if (outcome === 'withdrew') {
            beginRedirectedReturn(mission, Object.fromEntries(mission.memberIds.map(id => [id, modeReturnTrail(mission, id)])));
            mission.outcome = 'Cancelled';
            rules.phase = 'returning';
            // Availability changes at this tick, not at an outer AdvanceTicks boundary.
            reconcileTerritorialAwareness(state);
        }
    }
}
/** Recall during contact shares the same bounded exchange budget as autonomous withdrawal. */
function beginWithdrawal(state: SimulationState, mission: SpatialMission, entry: EncounterRecord,
    side: 'attacker' | 'defender' = 'attacker') {
    const rules = encounterRulesFor(mission)!;
    if (rules.withdrawalRequestedAt !== null) return;
    rules.withdrawalRequestedAt = now(state);
    entry.withdrawingSide = side;
    rules.phase = 'withdrawing';
    entry.phase = 'withdrawing';
    entry.updatedAt = now(state);
    const eventId = record(state, 'EncounterWithdrawalRequested', mission, {
        encounterId: entry.id, position: entry.position, withdrawingSide: side,
        disengageAt: now(state) + rules.policy.disengageTicks,
    });
    entry.sourceEvents.push({ clanId: state.clan.id, eventId });
}
export function requestOnSiteWithdrawal(state: SimulationState, mission: SpatialMission) {
    const rules = encounterRulesFor(mission);
    const entry = rules?.encounterId ? state.world?.encounters?.records[rules.encounterId] : undefined;
    if (!entry || !['engaging', 'withdrawing'].includes(entry.phase)) return false;
    const defenderWasWithdrawing = entry.withdrawingSide === 'defender';
    beginWithdrawal(state, mission, entry);
    if (defenderWasWithdrawing) {
        const eventId = record(state, 'EncounterWithdrawalRequested', mission, {
            encounterId: entry.id, position: entry.position, withdrawingSide: 'attacker',
            disengageAt: rules!.withdrawalRequestedAt! + rules!.policy.disengageTicks,
        });
        entry.sourceEvents.push({ clanId: state.clan.id, eventId });
    }
    entry.withdrawingSide = 'attacker';
    return true;
}
function exchange(state: SimulationState, mission: SpatialMission, entry: EncounterRecord,
    context: PhysicalExpeditionContext) {
    const rules = encounterRulesFor(mission)!, defender = state.world!.targetClans[entry.defendingClanId];
    const attackers = entry.attackerIds.filter(id => state.personas[id]?.deathWinter === null).sort();
    const defenders = entry.defenderIds.filter(id => defender.personas[id]?.deathWinter === null).sort();
    const actions: EncounterAction[] = [];
    const position = (clan: SimulationState, id: string): Point2 => clan === state ?
        spatialMemberPosition(mission, id) : clan.residentPresence!.residents[id].position;
    const sides = [{ clan: state, ids: attackers, opponent: defender, others: defenders },
        { clan: defender, ids: defenders, opponent: state, others: attackers }];
    for (const side of sides) for (const [index, id] of side.ids.entries()) {
        const first = position(side.clan, id);
        const reachable = side.others.filter(other => {
            const second = position(side.opponent, other);
            return Math.hypot(first.x - second.x, first.z - second.z) <= rules.policy.contactDistance &&
                sees(context, first, second);
        });
        if (!reachable.length) continue;
        const targetId = reachable[(index + entry.exchangeIndex) % reachable.length];
        const gear = entry.equipment[id], targetGear = entry.equipment[targetId];
        const base = Math.min(10000, Math.floor(rules.policy.actionLethalityBps *
            (10000 + equipmentSpearBonus(gear.weapon, combatEquipmentRules(gear))) / 10000));
        const probabilityBps = equipmentCasualtyRisk(base, targetGear, combatEquipmentRules(targetGear));
        const roll = randomUint(side.clan);
        const fatal = roll < Math.floor(probabilityBps * 4294967296 / 10000);
        actions.push({ actorClanId: side.clan.clan.id, actorId: id,
            targetClanId: side.opponent.clan.id, targetId, actorPosition: { x: first.x, z: first.z },
            targetPosition: { ...position(side.opponent, targetId) }, probabilityBps, roll,
            outcome: fatal ? 'death' : probabilityBps < base && roll < Math.floor(base * 4294967296 / 10000) ? 'blocked' : 'survived' });
    }
    const actionEventId = record(state, 'EncounterExchange', mission, { encounterId: entry.id,
        incidentId: entry.incidentId, exchangeIndex: entry.exchangeIndex, actions: structuredClone(actions) });
    entry.sourceEvents.push({ clanId: state.clan.id, eventId: actionEventId });
    const consequenceEvents: ClanEventRef[] = [];
    // Every action is selected before either clan's deaths are committed.
    for (const clan of [state, defender]) {
        const casualties = [...new Set(actions.filter(action => action.targetClanId === clan.clan.id &&
            action.outcome === 'death').map(action => action.targetId))];
        const oldYards = farmyards(clan).map(yard => yard.id), beforeEvents = clan.events.length;
        commitPersonaDeaths(clan, casualties, (type, id, details) => {
            clan.events.push({ id: 'event-' + (clan.events.length + 1), type, personaId: id,
                time: { ...clan.time }, details: eventFacts(clan, { ...details, cause: 'Combat',
                    missionId: mission.id, encounterId: entry.id, position: { ...position(clan, id!) } }, id) });
        }, { missionId: mission.id, exactTick: true });
        reconcileFarmyards(clan, oldYards);
        consequenceEvents.push(...clan.events.slice(beforeEvents).map(event => ({ clanId: clan.clan.id, eventId: event.id })));
    }
    entry.sourceEvents.push(...consequenceEvents);
    eventAt(state, actionEventId)!.details!.consequenceEvents = structuredClone(consequenceEvents);
    entry.exchanges.push({ tick: now(state), actions });
    entry.exchangeIndex++;
    entry.updatedAt = now(state);
    entry.nextExchangeAt = now(state) + rules.policy.exchangeTicks;
    const liveA = attackers.filter(id => state.personas[id]?.deathWinter === null);
    const liveD = defenders.filter(id => defender.personas[id]?.deathWinter === null);
    if (!liveA.length) {
        resolveEncounter(state, mission, entry, 'lost');
        markOnSiteLost(state, mission, context);
    }
    else if (!liveD.length) {
        if (entry.phase !== 'withdrawing') resolveEncounter(state, mission, entry, 'won');
    }
    else if (entry.phase === 'withdrawing') { /* Keep the original bounded disengagement deadline. */ }
    else if ((entry.attackerIds.length - liveA.length) * 10000 >= entry.attackerIds.length * rules.policy.retreatLossBps)
        resolveEncounter(state, mission, entry, 'withdrew');
    else if ((entry.defenderIds.length - liveD.length) * 10000 >= entry.defenderIds.length * rules.policy.retreatLossBps)
        beginWithdrawal(state, mission, entry, 'defender');
    else if (entry.exchangeIndex >= rules.policy.maximumExchanges)
        beginWithdrawal(state, mission, entry, liveA.length > liveD.length ? 'defender' : 'attacker');
    reconcileTerritorialAwareness(state);
}
/** One weather-only exposure at the first reached departure step; return never rolls it again. */
function resolveTravelHazard(state: SimulationState, mission: SpatialMission, context: PhysicalExpeditionContext) {
    const rules = encounterRulesFor(mission)!;
    if (rules.travelResolvedAt !== null || mission.travelled <= 0 ||
        !['Traveling', 'Exploring'].includes(mission.status)) return;
    rules.travelResolvedAt = now(state);
    const rolls = mission.memberIds.filter(id => state.personas[id]?.deathWinter === null).sort()
        .map(personaId => ({ personaId, roll: rules.travelRiskBps > 0 ? randomUint(state) : null }));
    const casualties = rolls.filter(value => value.roll !== null &&
        value.roll < Math.floor(rules.travelRiskBps * 4294967296 / 10000)).map(value => value.personaId);
    const hazardEventId = record(state, 'ExpeditionTravelHazard', mission, {
        riskBps: rules.travelRiskBps, rolls, casualtyIds: casualties,
    });
    rules.travelSourceEventIds.push(hazardEventId);
    const oldYards = farmyards(state).map(yard => yard.id), before = state.events.length;
    commitPersonaDeaths(state, casualties, (type, id, details) => {
        const position = spatialMemberPosition(mission, id!);
        state.events.push({ id: 'event-' + (state.events.length + 1), type, personaId: id,
            time: { ...state.time }, details: eventFacts(state, { ...details,
                cause: 'TravelWeather', missionId: mission.id,
                position: { x: position.x, z: position.z }, riskBps: rules.travelRiskBps,
            }, id) });
    }, { missionId: mission.id, exactTick: true });
    reconcileFarmyards(state, oldYards);
    const consequenceEventIds = state.events.slice(before).map(event => event.id);
    rules.travelSourceEventIds.push(...consequenceEventIds);
    eventAt(state, hazardEventId)!.details!.consequenceEventIds = consequenceEventIds;
    reconcileTerritorialAwareness(state);
    if (!mission.memberIds.some(id => state.personas[id]?.deathWinter === null)) markOnSiteLost(state, mission, context);
}
export function stepOnSiteEncounters(state: SimulationState, context?: PhysicalExpeditionContext) {
    if (!context) return;
    for (const mission of Object.values(state.world?.spatial?.missions ?? {})) {
        const rules = encounterRulesFor(mission);
        if (!rules) continue;
        resolveTravelHazard(state, mission, context);
        if (rules.manifest) reconcileTransitCargo(state, mission, rules.manifest, context,
            { forfeit: mission.status === 'Stranded' });
        if (mission.status === 'Returned' || mission.status === 'Lost') continue;
        if (mission.status === 'Returning') {
            rules.phase = 'returning';
            continue;
        }
        if (mission.status === 'Stranded') {
            rules.phase = 'stranded';
            continue;
        }
        if (!['Exploring', 'Traveling'].includes(mission.status)) continue;
        let entry = rules.encounterId ? state.world!.encounters!.records[rules.encounterId] : undefined;
        const reachedDefenders = presentDefenders(state, mission, context);
        if (!entry && (reachedDefenders.length || mission.status === 'Exploring' && mission.task?.type === 'Pillage'))
            entry = ensureRecord(state, mission);
        if (entry?.phase === 'contact' && reachedDefenders.length) commitContact(state, mission, entry, reachedDefenders);
        if (!entry) continue;
        if (entry.phase === 'contact' && now(state) >= entry.nextExchangeAt) {
            const defenders = presentDefenders(state, mission, context);
            if (defenders.length) commitContact(state, mission, entry, defenders);
            else if (now(state) >= (mission.task?.operateUntil ?? entry.nextExchangeAt) - 8)
                resolveEncounter(state, mission, entry, 'undefended');
        }
        if (['engaging', 'withdrawing'].includes(entry.phase) &&
            entry.exchangeIndex < rules.policy.maximumExchanges && now(state) >= entry.nextExchangeAt)
            exchange(state, mission, entry, context);
        if (entry.phase === 'withdrawing' && rules.withdrawalRequestedAt !== null &&
            now(state) >= rules.withdrawalRequestedAt + rules.policy.disengageTicks) {
            if (entry.withdrawingSide === 'attacker' && rules.manifest)
                reconcileTransitCargo(state, mission, rules.manifest, context, { forfeit: true });
            resolveEncounter(state, mission, entry, entry.withdrawingSide === 'defender' ? 'won' : 'withdrew', true);
        }
        if (mission.task?.type === 'Pillage' && entry.phase === 'resolved' && ['won', 'undefended'].includes(entry.outcome!) && rules.operationResolvedAt === null &&
            now(state) >= mission.task!.operateUntil - 8) {
            rules.manifest = captureTransitCargo(state, mission, context, entry.id);
            rules.operationResolvedAt = now(state);
            rules.operationSuccess = true;
        }
    }
    stepCustody(state, context);
}
export function onSiteReturnReady(state: SimulationState, mission: SpatialMission) {
    const rules = encounterRulesFor(mission);
    if (rules && ['contact', 'engaging', 'withdrawing'].includes(rules.phase)) return false;
    return !rules?.manifest || transitReadyForDeparture(state, mission, rules.manifest);
}
export function onSiteDeliveryReady(state: SimulationState, mission: SpatialMission) {
    const rules = encounterRulesFor(mission);
    return !rules?.manifest || transitReadyForDelivery(state, mission, rules.manifest);
}
export function markOnSiteLost(state: SimulationState, mission: SpatialMission, context: PhysicalExpeditionContext) {
    const rules = encounterRulesFor(mission)!;
    if (mission.status === 'Lost') return;
    const entry = rules.encounterId ? state.world?.encounters?.records[rules.encounterId] : undefined;
    if (entry && entry.phase !== 'resolved') resolveEncounter(state, mission, entry, 'lost');
    if (rules.manifest) reconcileTransitCargo(state, mission, rules.manifest, context, { forfeit: true });
    const seaPosition = mission.transport?.phase === 'embarked' ? spatialMissionPosition(mission) : null;
    const lostAtSea = seaPosition ? { version: 1, shipId: mission.transport!.shipId,
        position: { x: seaPosition.x, z: seaPosition.z } } : undefined;
    if (mission.transport?.phase === 'embarked')
        mission.returnRoutes = structuredClone(mission.transport.homeLandRoutes);
    releaseLongship(state, mission);
    mission.status = 'Lost';
    mission.outcome = 'Lost';
    mission.endedAt = now(state);
    mission.returnedAt = null;
    mission.updatedAt = now(state);
    rules.phase = 'lost';
    settleProvisions(state, mission, false);
    if (mission.task) completeOnSiteMission(state, mission, false);
    else record(state, 'ExploreAreaLost', mission, {
        outcome: 'Lost', survivorIds: [], casualtyIds: [...mission.memberIds],
        ...(lostAtSea ? { lostAtSea } : {}),
    });
}
export function completeOnSiteMission(state: SimulationState, mission: SpatialMission, homecoming = true) {
    const task = mission.task!, rules = task.encounterRules!;
    if (task.result) return;
    const live = mission.memberIds.filter(id => state.personas[id]?.deathWinter === null);
    const loot = homecoming && rules.manifest ? deliverTransitCargo(state, mission, rules.manifest) :
        { food: 0, materials: 0, cattleIds: [] as string[], personaIds: [] as string[] };
    const success = homecoming && mission.outcome === 'Completed' && live.length > 0 &&
        (task.type === 'Pillage' ? rules.operationSuccess === true : !!task.visitEventId);
    const discovery = success && task.type !== 'Pillage' ? structuredClone(task.observation) : null;
    rules.operationResolvedAt ??= now(state);
    rules.operationSuccess ??= success;
    rules.phase = homecoming ? 'completed' : 'lost';
    task.result = { success, discovery, survivorIds: live,
        casualtyIds: mission.memberIds.filter(id => !live.includes(id)), ...loot,
        ...(task.equipment ? { equipment: equipmentResult(task.equipment, live) } : {}),
        summary: success ? task.type === 'Pillage' ?
            loot.food || loot.materials || loot.cattleIds.length || loot.personaIds.length ?
                'On-site operation completed; carried assets arrived home.' : 'No available assets were recovered.' :
            discovery?.settlementName ? 'Settlement observed.' : 'No settlement observed in this area.' :
            mission.outcome === 'Cancelled' ? 'Mission withdrawn; recorded on-site consequences are retained.' : 'Mission ended.' };
    const reportId = record(state, homecoming ? 'ExpeditionReturned' : 'ExpeditionLost', mission, { visitEventId: task.visitEventId, ...task.result });
    if (discovery && task.observedSiteId) {
        const site = state.world!.islandIntel?.sites[task.observedSiteId];
        if (site) {
            site.knowledge = structuredClone(discovery);
            site.reportEventId = reportId;
        }
    }
}
export function inspectOnSiteMission(state: SimulationState, mission: SpatialMission) {
    const rules = encounterRulesFor(mission);
    if (!rules) return { encounter: undefined, manifest: undefined };
    const entry = rules.encounterId ? state.world?.encounters?.records[rules.encounterId] : undefined;
    const manifest = rules.manifest;
    return { encounter: { version: 1 as const, id: rules.encounterId, phase: rules.phase,
        activeMemberIds: mission.memberIds.filter(id => state.personas[id]?.deathWinter === null),
        casualtyIds: mission.memberIds.filter(id => state.personas[id]?.deathWinter !== null),
        observedDefenderCount: entry?.outcome === 'undefended' ? 0 :
            entry && entry.phase !== 'contact' ? entry.defenderIds.length : null,
        outcome: entry?.outcome ?? null, withdrawingSide: entry?.withdrawingSide ?? null,
        sourceEventIds: entry?.sourceEvents.filter(ref => ref.clanId === state.clan.id).map(ref => ref.eventId) ?? [] },
        ...(manifest ? { manifest: { status: manifest.slots.length === 0 ? 'empty' as const :
            manifest.deliveredAt !== null ? 'delivered' as const :
            manifest.slots.some(slot => slot.status === 'held') ? 'in-transit' as const :
            manifest.slots.some(slot => slot.status === 'released') ? 'released' as const : 'lost' as const,
            food: manifest.slots.filter(slot => slot.kind === 'Food' && ['held', 'delivered'].includes(slot.status))
                .reduce((n, slot) => n + slot.units, 0),
            materials: manifest.slots.filter(slot => slot.kind === 'Materials' && ['held', 'delivered'].includes(slot.status))
                .reduce((n, slot) => n + slot.units, 0),
            personaIds: manifest.slots.filter(slot => slot.kind === 'People' && ['held', 'delivered'].includes(slot.status)).map(slot => slot.entityId!),
            cattleIds: manifest.slots.filter(slot => slot.kind === 'Cattle' && ['held', 'delivered'].includes(slot.status)).map(slot => slot.entityId!),
        } } : {}) };
}
function validatePolicy(policy: EncounterPolicy) {
    if (!policy || policy.version !== 1 || !Number.isFinite(policy.contactDistance) || policy.contactDistance < 1 || policy.contactDistance > 8 ||
        !Number.isSafeInteger(policy.contactWaitTicks) || policy.contactWaitTicks < 1 || policy.contactWaitTicks > 100 ||
        !Number.isSafeInteger(policy.exchangeTicks) || policy.exchangeTicks < 1 || policy.exchangeTicks > 25 ||
        !Number.isSafeInteger(policy.maximumExchanges) || policy.maximumExchanges < 1 || policy.maximumExchanges > 8 ||
        !Number.isSafeInteger(policy.actionLethalityBps) || policy.actionLethalityBps < 0 || policy.actionLethalityBps > 10000 ||
        !Number.isSafeInteger(policy.retreatLossBps) || policy.retreatLossBps < 1 || policy.retreatLossBps > 10000 ||
        !Number.isSafeInteger(policy.disengageTicks) || policy.disengageTicks < 1 || policy.disengageTicks > 25)
        throw new Error('Invalid encounter policy.');
}
const same = (first: unknown, second: unknown) => JSON.stringify(first) === JSON.stringify(second);
const equipmentSlots = (gear: PersonalEquipment) => [gear.weapon, gear.shield, gear.bodyArmor ?? null, gear.headgear ?? null];
function encounterClan(root: SimulationState, id: string) {
    return id === root.clan.id ? root : root.world?.targetClans[id];
}
function eventAt(clan: SimulationState, id: string) {
    return clan.events.find(event => event.id === id);
}
function validGear(value: CombatEquipment, id: string) {
    const uint = (number: unknown, maximum: number) => Number.isSafeInteger(number) && Number(number) >= 0 && Number(number) <= maximum;
    if (!value || value.personaId !== id || ![null, 'woodenSpear', 'ironSpear'].includes(value.weapon) ||
        ![null, 'woodenShield', 'leatherShield', 'ironShield'].includes(value.shield) ||
        ![value.spearBonusBps, value.woodenShieldProtectionBps, value.leatherShieldProtectionBps]
            .every(number => uint(number, 10000))) return false;
    const hasIron = value.weapon === 'ironSpear' || value.shield === 'ironShield';
    const iron = value.metalworking;
    if (hasIron ? iron?.version !== 1 || !uint(iron.ironSpearBonusBps, 2500) ||
        !uint(iron.ironShieldProtectionBps, 7500) : iron !== undefined) return false;
    const hasArmor = wearingPersonalArmor(value), armor = value.personalArmor;
    if (!hasArmor) return armor === undefined && value.bodyArmor === undefined && value.headgear === undefined;
    return [null, 'leatherBodyArmor'].includes(value.bodyArmor!) && [null, 'ironHelmet'].includes(value.headgear!) &&
        armor?.version === 1 && [armor.leatherBodyArmorProtectionBps, armor.ironHelmetProtectionBps,
            armor.maximumPersonalProtectionBps].every(number => uint(number, 6000));
}
export function validateOnSiteEncounters(state: SimulationState) {
    const registry = state.world?.encounters;
    function fail(): never { throw new Error('Invalid saved on-site encounter.'); }
    const bounds = state.discovery?.grid.bounds;
    const point = (value: Point2) => value && Number.isFinite(value.x) && Number.isFinite(value.z) &&
        (!bounds || value.x >= bounds.minX && value.x <= bounds.maxX && value.z >= bounds.minZ && value.z <= bounds.maxZ);
    const tick = (value: unknown, earliest: number) => Number.isSafeInteger(value) &&
        Number(value) >= earliest && Number(value) <= now(state);
    const ids = (value: string[]) => Array.isArray(value) && new Set(value).size === value.length &&
        value.every(id => typeof id === 'string');
    if (registry && (registry.version !== 1 || !registry.records || Array.isArray(registry.records))) fail();
    for (const mission of Object.values(state.world?.spatial?.missions ?? {})) {
        const rules = encounterRulesFor(mission);
        if (rules === undefined) continue;
        if (!rules || rules.version !== 1 || mission.encounterRules && mission.task ||
            mission.territoryVersion !== 1 || !state.world?.territory ||
            !['approach', 'contact', 'engaging', 'resolved', 'withdrawing', 'returning', 'lost', 'stranded', 'completed'].includes(rules.phase) ||
            !Number.isSafeInteger(rules.travelRiskBps) || rules.travelRiskBps < 0 || rules.travelRiskBps > 10000 ||
            rules.operationSuccess !== null && typeof rules.operationSuccess !== 'boolean') fail();
        validatePolicy(rules.policy);
        for (const value of [rules.travelResolvedAt, rules.operationResolvedAt, rules.withdrawalRequestedAt])
            if (value !== null && !tick(value, mission.departedAt)) fail();
        if (!rules.attackerEquipment || !same(Object.keys(rules.attackerEquipment).sort(), [...mission.memberIds].sort()) ||
            Object.entries(rules.attackerEquipment).some(([id, gear]) => !validGear(gear, id))) fail();
        if (!['Prepared', 'Returned', 'Lost'].includes(mission.status)) for (const [id, gear] of Object.entries(rules.attackerEquipment)) {
            if (state.personas[id]?.deathWinter === null && !same(equipmentSlots(equipmentFor(state, id)), equipmentSlots(gear))) fail();
        }
        const departure = state.events.find(event => ['ExpeditionDeparted', 'ExploreAreaDeparted'].includes(event.type) &&
            event.details?.missionId === mission.id && event.details?.onSiteVersion === 1);
        if (!departure || !same(departure.details?.encounterPolicy, rules.policy) ||
            !same(departure.details?.attackerEquipment, rules.attackerEquipment) ||
            departure.details?.travelRiskBps !== rules.travelRiskBps) fail();
        if (!ids(rules.travelSourceEventIds) || rules.travelSourceEventIds.some(id => {
            const event = eventAt(state, id);
            const hazard = state.events.find(event => event.type === 'ExpeditionTravelHazard' && event.details?.missionId === mission.id);
            return !event || event.details?.missionId !== mission.id &&
                !(hazard?.details?.consequenceEventIds as string[] | undefined)?.includes(id) ||
                event.time.winter * state.ticksPerWinter + event.time.tick !== rules.travelResolvedAt;
        }) || (rules.travelResolvedAt === null) !== (rules.travelSourceEventIds.length === 0)) fail();
        if (rules.encounterId !== null && (!registry?.records[rules.encounterId] ||
            registry.records[rules.encounterId].missionId !== mission.id)) fail();
        const terminal = mission.status === 'Returned' ? 'completed' : mission.status === 'Lost' ? 'lost' :
            mission.status === 'Returning' ? 'returning' : mission.status === 'Stranded' ? 'stranded' : null;
        if (terminal && rules.phase !== terminal) fail();
        if (rules.manifest) validateTransitManifest(state, mission, rules.manifest);
    }
    const reserved = new Set<string>();
    for (const [id, entry] of Object.entries(registry?.records ?? {})) {
        const mission = state.world?.spatial?.missions[entry.missionId];
        const rules = mission && encounterRulesFor(mission);
        const attacker = encounterClan(state, entry.attackingClanId), defender = encounterClan(state, entry.defendingClanId);
        if (!entry || entry.version !== 1 || entry.id !== id || id !== 'encounter-' + entry.missionId ||
            !mission || !rules || rules.encounterId !== id || !attacker || !defender || attacker === defender ||
            attacker !== state || entry.siteId !== state.world?.island?.siteId || !point(entry.position) ||
            !['contact', 'engaging', 'withdrawing', 'resolved'].includes(entry.phase) ||
            ![null, 'attacker', 'defender'].includes(entry.withdrawingSide) ||
            entry.phase === 'withdrawing' && (entry.withdrawingSide === null || rules.withdrawalRequestedAt === null) ||
            !tick(entry.startedAt, mission.departedAt) || !tick(entry.updatedAt, entry.startedAt) ||
            !Number.isSafeInteger(entry.nextExchangeAt) || entry.nextExchangeAt < entry.startedAt ||
            !Number.isSafeInteger(entry.exchangeIndex) || entry.exchangeIndex < 0 ||
            entry.exchangeIndex > rules.policy.maximumExchanges || !Array.isArray(entry.exchanges) ||
            entry.exchangeIndex !== entry.exchanges.length || !ids(entry.attackerIds) || !ids(entry.defenderIds) ||
            entry.attackerIds.some(id => !mission.memberIds.includes(id)) ||
            entry.defenderIds.some(id => !defender.personas[id] && !defender.personaArchive?.[id]) ||
            entry.defenderIds.length > state.world!.territory!.policy.maxResponders ||
            ![null, 'won', 'withdrew', 'lost', 'undefended'].includes(entry.outcome) ||
            (entry.phase === 'resolved') !== (entry.outcome !== null) ||
            (entry.resolvedAt === null) !== (entry.outcome === null) ||
            entry.resolvedAt !== null && !tick(entry.resolvedAt, entry.startedAt) ||
            !Array.isArray(entry.sourceEvents) || !entry.sourceEvents.length) fail();
        const incident = entry.incidentId ? state.world!.territory!.incidents[entry.incidentId] : null;
        if (entry.incidentId !== null && (!incident || incident.missionId !== mission.id ||
            incident.defendingClanId !== defender.clan.id)) fail();
        const refs = entry.sourceEvents.map(ref => ref.clanId + ':' + ref.eventId);
        if (new Set(refs).size !== refs.length || entry.sourceEvents.some(ref => {
            const clan = encounterClan(state, ref.clanId), event = clan && eventAt(clan, ref.eventId);
            if (!event || !tick(event.time.winter * state.ticksPerWinter + event.time.tick, entry.startedAt)) return true;
            if (event.details?.encounterId === id) return false;
            const applied = entry.sourceEvents.some(source => {
                if (source.clanId !== state.clan.id) return false;
                const exchange = eventAt(state, source.eventId);
                return exchange?.type === 'EncounterExchange' && same(exchange.time, event.time) &&
                    (exchange.details?.consequenceEvents as ClanEventRef[] | undefined)?.some(value =>
                        value.clanId === ref.clanId && value.eventId === ref.eventId);
            });
            if (applied) return false;
            // The existing equipment owner emits its own receipt before the canonical death.
            return event.type !== 'EquipmentLost' || event.details?.missionId !== mission.id ||
                !entry.sourceEvents.some(deathRef => {
                    if (deathRef.clanId !== ref.clanId) return false;
                    const death = eventAt(clan!, deathRef.eventId);
                    return death?.type === 'PersonaDied' && death.personaId === event.personaId &&
                        death.details?.encounterId === id && same(death.time, event.time);
                });
        })) fail();
        const events = entry.sourceEvents.filter(ref => ref.clanId === state.clan.id).map(ref => eventAt(state, ref.eventId)!);
        const contact = events.find(event => event.type === 'EncounterContact');
        if (!contact || contact.time.winter * state.ticksPerWinter + contact.time.tick !== entry.startedAt ||
            !same(contact.details?.position, entry.position)) fail();
        const commitment = events.find(event => event.type === 'EncounterCommitted');
        if (entry.defenderIds.length) {
            if (!commitment || !same(commitment.details?.attackerIds, entry.attackerIds) ||
                !same(commitment.details?.defenderIds, entry.defenderIds) ||
                !same(commitment.details?.equipment, entry.equipment)) fail();
            if (!same(Object.keys(entry.equipment).sort(), [...entry.attackerIds, ...entry.defenderIds].sort()) ||
                Object.entries(entry.equipment).some(([id, gear]) => !validGear(gear, id)) ||
                entry.attackerIds.some(id => !same(entry.equipment[id], rules.attackerEquipment[id]))) fail();
        } else if (entry.exchangeIndex || Object.keys(entry.equipment).length || commitment) fail();
        if (['engaging', 'withdrawing'].includes(entry.phase)) for (const person of entry.defenderIds) {
            const key = defender.clan.id + ':' + person;
            if (reserved.has(key)) fail();
            if (defender.personas[person]?.deathWinter === null &&
                !same(equipmentSlots(equipmentFor(defender, person)), equipmentSlots(entry.equipment[person]))) fail();
            reserved.add(key);
        }
        const withdrawal = events.filter(event => event.type === 'EncounterWithdrawalRequested').at(-1);
        if (entry.withdrawingSide !== null && (!withdrawal ||
            withdrawal.details?.withdrawingSide !== entry.withdrawingSide ||
            withdrawal.details?.disengageAt !== rules.withdrawalRequestedAt! + rules.policy.disengageTicks)) fail();
        let previous = entry.startedAt;
        for (const [index, exchange] of entry.exchanges.entries()) {
            const receipt = events.find(event => event.type === 'EncounterExchange' && event.details?.exchangeIndex === index);
            if (!tick(exchange.tick, previous) || exchange.tick - previous < rules.policy.exchangeTicks ||
                !Array.isArray(exchange.actions) || !receipt || !same(receipt.details?.actions, exchange.actions) ||
                receipt.time.winter * state.ticksPerWinter + receipt.time.tick !== exchange.tick) fail();
            previous = exchange.tick;
            const acted = new Set<string>();
            for (const action of exchange.actions) {
                const own = action.actorClanId === attacker.clan.id ? entry.attackerIds :
                    action.actorClanId === defender.clan.id ? entry.defenderIds : [];
                const other = action.targetClanId === attacker.clan.id ? entry.attackerIds :
                    action.targetClanId === defender.clan.id ? entry.defenderIds : [];
                const actorGear = entry.equipment[action.actorId], targetGear = entry.equipment[action.targetId];
                if (!own.includes(action.actorId) || !other.includes(action.targetId) ||
                    action.actorClanId === action.targetClanId || acted.has(action.actorId) ||
                    !point(action.actorPosition) || !point(action.targetPosition) ||
                    Math.hypot(action.actorPosition.x - action.targetPosition.x,
                        action.actorPosition.z - action.targetPosition.z) > rules.policy.contactDistance + 1e-6 ||
                    !Number.isSafeInteger(action.roll) || action.roll < 0 || action.roll > 4294967295 ||
                    !actorGear || !targetGear) fail();
                acted.add(action.actorId);
                const base = Math.min(10000, Math.floor(rules.policy.actionLethalityBps *
                    (10000 + equipmentSpearBonus(actorGear.weapon, combatEquipmentRules(actorGear))) / 10000));
                const probability = equipmentCasualtyRisk(base, targetGear, combatEquipmentRules(targetGear));
                const outcome = action.roll < Math.floor(probability * 4294967296 / 10000) ? 'death' :
                    probability < base && action.roll < Math.floor(base * 4294967296 / 10000) ? 'blocked' : 'survived';
                if (action.probabilityBps !== probability || action.outcome !== outcome) fail();
                const actorClan = encounterClan(state, action.actorClanId)!;
                const targetClan = encounterClan(state, action.targetClanId)!;
                const actor = actorClan.personas[action.actorId] ?? actorClan.personaArchive?.[action.actorId];
                const target = targetClan.personas[action.targetId] ?? targetClan.personaArchive?.[action.targetId];
                const diedAt = (person: typeof actor) => person?.deathWinter === null ? Infinity :
                    person ? person.deathWinter! * state.ticksPerWinter + (person.deathTick ?? 0) : -1;
                if (!actor || !target || diedAt(actor) < exchange.tick || diedAt(target) < exchange.tick) fail();
                if (outcome === 'death') {
                    const death = entry.sourceEvents.filter(ref => ref.clanId === targetClan.clan.id)
                        .map(ref => eventAt(targetClan, ref.eventId)).find(event => event?.type === 'PersonaDied' &&
                            event.personaId === action.targetId && event.details?.encounterId === entry.id &&
                            event.time.winter * state.ticksPerWinter + event.time.tick === exchange.tick);
                    if (!death || death.details?.cause !== 'Combat' || diedAt(target) !== exchange.tick ||
                        !same(death.details?.position, action.targetPosition)) fail();
                }
            }
        }
        const resolution = events.find(event => event.type === 'EncounterResolved');
        if (entry.phase === 'resolved' && (!resolution || resolution.details?.outcome !== entry.outcome ||
            resolution.time.winter * state.ticksPerWinter + resolution.time.tick !== entry.resolvedAt)) fail();
    }
    validateTransitWorld(state);
}
