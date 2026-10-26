import { personalChronicleEntry } from './Chronicle';
import { inspectCattle } from '../simulation/SimulationCore';
import type { GameTime, SimulationEvent, SimulationState } from '../simulation/SimulationCore';

export const attentionLimits = Object.freeze({ inbox: 200, chronicle: 100, page: 20, alerts: 19 });
export type AttentionCategory = 'life' | 'expedition' | 'settlement' | 'discovery';
export type AttentionSeverity = 'critical' | 'noteworthy' | 'ambient';
export type AttentionTarget =
    | { kind: 'persona' | 'household' | 'building' | 'livestock' | 'site'; id: string }
    | { kind: 'expedition'; id: string }
    | { kind: 'surface'; id: 'food' }
    | { kind: 'wildlife'; id: string };
export interface AttentionRecord {
    eventId: string;
    canonicalType: string;
    category: AttentionCategory;
    severity: AttentionSeverity;
    time: GameTime;
    actorIds: string[];
    headline: string;
    shortText?: string;
    target?: AttentionTarget;
}
export interface AttentionAlert {
    id: string;
    canonicalType: string;
    category: 'settlement' | 'expedition';
    severity: 'critical' | 'noteworthy';
    headline: string;
    target?: AttentionTarget;
}
export type AttentionAdapter = (event: SimulationEvent) => AttentionRecord | null;
const string = (value: unknown): string | undefined => typeof value === 'string' && value ? value : undefined;
const strings = (value: unknown) => Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : [];
export const eventOrdinal = (id: string) => /^event-[1-9][0-9]*$/.test(id) ? Number(id.slice(6)) : 0;
const noteworthy = new Map<string, AttentionCategory>([
    ['ChildBorn', 'life'], ['PersonaDied', 'life'], ['PartnershipFormed', 'life'],
    ['HouseBuilt', 'settlement'], ['BuildingCollapsed', 'settlement'],
    ['ExpeditionDeparted', 'expedition'], ['ExpeditionReturned', 'expedition'],
    ['ExploreAreaDeparted', 'expedition'], ['ExploreAreaReturned', 'expedition'],
    ['IslandSiteSighted', 'discovery'], ['IslandMissionVisited', 'discovery'],
    ['ExploreAreaReturnStarted', 'expedition'], ['ResidentQuarrelled', 'life'], ['ResidentsReconciled', 'life'],
]);

const formattedTypes = new Set([...noteworthy.keys(), 'FoundingPartyLanded', 'FoundingPartnershipPresent',
    'CulturalGatheringHeld', 'CultureWeatherSupportApplied', 'OccupationAssigned', 'OccupationReleased', 'CaregiverAssigned', 'ResourceProduced', 'CattleFoodProduced',
    'LivestockResourceProduced', 'FoodConsumed', 'CattleFoodConsumed', 'LivestockFoodConsumed',
    'ExploreAreaPrepared', 'ExploreAreaCancelled', 'ExploreAreaStranded', 'ExploreAreaReturnStarted',
    'ExploreAreaSuppliesConsumed', 'ExploreAreaSuppliesDiscarded', 'ExploreAreaSuppliesLost',
    'ExpeditionGroupCreated', 'ResidenceAssigned', 'BuildingSpecialized', 'BuildingUpgraded',
    'MediationAttempted', 'SocialIncidentEnded', 'MaintenanceDebtIncreased', 'BuildingSalvaged', 'CattleBorn', 'CattleDied', 'LivestockBorn',
    'LivestockDied', 'CattleSlaughtered', 'LivestockSlaughtered', 'FarmyardFunctionChanged']);

/** Only supported source facts are formatted. Unknown/future event types never gain a badge. */
export function attentionEvent(event: SimulationEvent): AttentionRecord | null {
    if (!formattedTypes.has(event.type)) return null;
    const d = event.details ?? {};
    let headline = personalChronicleEntry(event)?.text;
    if (event.type === 'IslandSiteSighted' && string(d.siteId)) headline = 'An expedition sighted a settlement site.';
    if (event.type === 'IslandMissionVisited' && string(d.missionId)) headline =
        (string(d.groupName) ?? 'An expedition') + ' reached its recorded mission destination.';
    if (['ResourceProduced', 'LivestockResourceProduced', 'CattleFoodProduced'].includes(event.type)) {
        const resource = event.type === 'CattleFoodProduced' ? 'food' : d.resource;
        headline = ['food', 'materials'].includes(String(resource)) && Number.isSafeInteger(d.units) && Number(d.units) >= 0 ?
            'Production recorded: ' + d.units + ' ' + (resource === 'food' ? 'Food' : 'Materials') + '.' : undefined;
    }
    if (!headline) return null;
    const category: AttentionCategory = noteworthy.get(event.type) ??
        (['CulturalGatheringHeld', 'CultureWeatherSupportApplied'].includes(event.type) ? 'life' : 'settlement');
    const severity = noteworthy.has(event.type) && !(event.type === 'ExploreAreaDeparted' && d.redirected) ?
        'noteworthy' : 'ambient';
    const actorIds = [...new Set([event.personaId, ...strings(d.participants), ...strings(d.parentIds)]
        .filter((id): id is string => typeof id === 'string'))];
    let target: AttentionTarget | undefined;
    if (category === 'life' && actorIds.length) target = { kind: 'persona', id: event.personaId ?? actorIds[0] };
    else if (['HouseBuilt', 'BuildingCollapsed'].includes(event.type) && string(d.buildingId))
        target = { kind: 'building', id: d.buildingId as string };
    else if (string(d.missionId)) target = { kind: 'expedition', id: d.missionId as string };
    else if (event.type === 'IslandSiteSighted' && string(d.siteId)) target = { kind: 'site', id: d.siteId as string };
    const groupName = string(d.groupName) ?? 'An expedition';
    const shortText = event.type === 'ExploreAreaReturnStarted' ? groupName + ' is heading home.' :
        ['ExpeditionReturned', 'ExploreAreaReturned'].includes(event.type) ? groupName + ' has returned home.' :
        ['ExpeditionDeparted', 'ExploreAreaDeparted'].includes(event.type) ? groupName + ' has set out.' :
        event.type === 'ResidentQuarrelled' ? headline.replace(/ quarrelled\.$/, ' had a disagreement.') : headline;
    return { eventId: event.id, canonicalType: event.type, category, severity,
        time: { ...event.time }, actorIds, headline, shortText, ...(target ? { target } : {}) };
}

/** Append-only ingestion with bounded retained projections, not a second event stream in UI saves. */
export class AttentionHistoryIndex {
    private indexed = 0;
    private records: AttentionRecord[] = [];
    private recent: AttentionRecord[] = [];
    private stranded = new Set<string>();
    constructor(private adapters: readonly AttentionAdapter[] = []) {}
    format(event: SimulationEvent) {
        for (const adapter of this.adapters) {
            const record = adapter(event);
            if (record) return record;
        }
        return attentionEvent(event);
    }
    append(events: readonly SimulationEvent[]) {
        for (; this.indexed < events.length; this.indexed++) {
            const event = events[this.indexed], missionId = string(event.details?.missionId);
            if (missionId && event.type === 'ExploreAreaStranded') this.stranded.add(missionId);
            if (missionId && event.type === 'ExploreAreaReturned') this.stranded.delete(missionId);
            const record = this.format(event);
            if (!record) continue;
            this.recent.push(record);
            if (this.recent.length > attentionLimits.chronicle) this.recent.shift();
            if (record.severity === 'ambient') continue;
            this.records.push(record);
            if (this.records.length > attentionLimits.inbox) this.records.shift();
        }
    }
    retained() { return structuredClone(this.records); }
    chronicle(offset = 0) {
        if (!Number.isSafeInteger(offset) || offset < 0) throw new Error('Invalid Chronicle page.');
        return structuredClone(this.recent.slice().reverse().slice(offset, offset + attentionLimits.page));
    }
    chroniclePage(events: readonly SimulationEvent[], before = events.length) {
        if (!Number.isSafeInteger(before) || before < 0 || before > events.length) throw new Error('Invalid Chronicle cursor.');
        const records: AttentionRecord[] = [];
        let cursor = before, examined = 0;
        while (cursor > 0 && examined++ < 200 && records.length < attentionLimits.page) {
            const record = this.format(events[--cursor]);
            if (record) records.push(record);
        }
        return { records, nextBefore: cursor };
    }
    strandedIds() { return [...this.stranded]; }
    inspect() { return { examined: this.indexed, retained: this.records.length, chronicle: this.recent.length }; }
}

/** Current actionable facts only; no health, threats, skill gains or enemy inventories are inferred. */
export function attentionAlerts(state: SimulationState, strandedIds: readonly string[]): AttentionAlert[] {
    const alerts: AttentionAlert[] = [];
    if (state.stocks.food <= 0) alerts.push({ id: 'food-empty', canonicalType: 'CurrentFoodStock',
        category: 'settlement', severity: 'critical', headline: 'Food stocks are empty.', target: { kind: 'surface', id: 'food' } });
    const homes = Object.values(state.households).filter(home => home.memberIds.some(id => state.personas[id]?.deathWinter === null) &&
        (!home.residenceId || state.residences[home.residenceId]?.kind === 'tent'));
    if (homes.length) alerts.push({ id: 'housing', canonicalType: 'CurrentHousing', category: 'settlement', severity: 'noteworthy',
        headline: homes.length + ' household' + (homes.length === 1 ? ' needs' : 's need') + ' a permanent home.',
        target: { kind: 'household', id: homes[0].id } });
    const animals = Object.values(state.landing?.cattle ?? {}).filter(animal => animal.deathWinter === null && !inspectCattle(state, animal.id).sheltered);
    if (animals.length) alerts.push({ id: 'livestock-shelter', canonicalType: 'CurrentLivestockShelter',
        category: 'settlement', severity: 'noteworthy', headline: animals.length + ' livestock without shelter.',
        target: { kind: 'livestock', id: animals[0].id } });
    for (const id of strandedIds) {
        const mission = state.world?.spatial?.missions[id];
        if (mission?.status !== 'Stranded' || !mission.memberIds.some(member => state.personas[member]?.deathWinter === null)) continue;
        alerts.push({ id: 'stranded:' + id, canonicalType: 'CurrentStrandedExpedition', category: 'expedition',
            severity: 'critical', headline: mission.groupName + ' is stranded. ' + (mission.outcome ?? ''),
            target: { kind: 'expedition', id } });
    }
    return alerts;
}
