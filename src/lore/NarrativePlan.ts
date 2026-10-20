import { livestockGroups } from './LivestockNarrative';
import { projectChronicle } from './Chronicle';
import type { ChronicleEntry } from './Chronicle';
import type { SimulationEvent } from '../simulation/SimulationCore';

export type NarrativeTheme = 'family' | 'homes' | 'work' | 'herd' | 'expeditions' | 'social';
export type NarrativeThread = {
    theme: NarrativeTheme;
    subjectIds: string[];
    sourceEventIds: string[];
    callbackEventIds: string[];
};
export type NarrativePlan = {
    version: 1 | 2 | 3;
    focus: NarrativeTheme[];
    threads: NarrativeThread[];
    sourceEventIds: string[];
    callbackEventIds: string[];
};

type IndexedFact = { entry: ChronicleEntry; event: SimulationEvent; theme: NarrativeTheme };
const themes: Record<string, NarrativeTheme> = {
    ChildBorn: 'family', PersonaDied: 'family', PartnershipFormed: 'family',
    FoundingPartyLanded: 'family', FoundingPartnershipPresent: 'family', PersonaTransferredIn: 'family', PersonaTransferredOut: 'family',
    HouseBuilt: 'homes', ResidenceAssigned: 'homes', BuildingUpgraded: 'homes',
    BuildingSalvaged: 'homes', BuildingCollapsed: 'homes', FarmyardFunctionChanged: 'homes',
    BuildingSpecialized: 'homes', MaintenanceDebtIncreased: 'homes',
    OccupationAssigned: 'work', OccupationReleased: 'work',
    CattleBorn: 'herd', CattleDied: 'herd', CattleSlaughtered: 'herd', CattleAssigned: 'herd',
    LivestockBorn: 'herd', LivestockDied: 'herd', LivestockSlaughtered: 'herd', LivestockAssigned: 'herd',
    FoundingLongshipKept: 'expeditions', FoundingLongshipSalvaged: 'expeditions',
    ExpeditionDeparted: 'expeditions', ExpeditionReturned: 'expeditions',
};
function strings(value: unknown): string[] {
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : [];
}
function subjects(event: SimulationEvent): string[] {
    const details = event.details ?? {};
    return [...new Set([
        ...(event.personaId ? [event.personaId] : []),
        ...strings(details.participants), ...strings(details.parentIds),
        ...['buildingId', 'cattleId', 'livestockId', 'missionId', 'longshipId'].flatMap(key =>
            typeof details[key] === 'string' ? [details[key] as string] : []),
    ])];
}

/** Rebuilt from the complete supported event history, never from previously written prose. */
function historyIndex(events: readonly SimulationEvent[], version: number): IndexedFact[] {
    const byId = new Map(events.map(event => [event.id, event]));
    return projectChronicle(events).reverse().flatMap(group => group.entries).flatMap(entry => {
        const event = byId.get(entry.sourceEventIds[0]);
        const social = event && ['ResidentQuarrelled', 'MediationAttempted', 'ResidentsReconciled', 'SocialIncidentEnded'].includes(event.type);
        const theme: NarrativeTheme | undefined = event && (version >= 3 && social ? 'social' : themes[event.type]);
        return event && theme ? [{ entry, event, theme }] : [];
    });
}
function relevantOlder(current: SimulationEvent, earlier: readonly IndexedFact[]): IndexedFact | undefined {
    const details = current.details ?? {};
    if (['BuildingUpgraded', 'BuildingSalvaged', 'BuildingCollapsed'].includes(current.type))
        return earlier.find(fact => fact.event.type === 'HouseBuilt' &&
            fact.event.details?.buildingId === details.buildingId);
    if (['OccupationAssigned', 'PersonaDied'].includes(current.type) && current.personaId)
        return earlier.find(fact => fact.event.type === 'ChildBorn' && fact.event.personaId === current.personaId) ??
            (current.type === 'PersonaDied' ? earlier.find(fact => fact.event.type === 'FoundingPartyLanded' &&
                strings(fact.event.details?.founderIds).includes(current.personaId!)) : undefined);
    if (current.type === 'CattleBorn' || current.type === 'LivestockBorn') {
        const motherId = strings(details.parentIds)[0];
        const assignment = [...earlier].reverse().find(fact => ['CattleAssigned', 'LivestockAssigned'].includes(fact.event.type) &&
            (fact.event.details?.livestockId ?? fact.event.details?.cattleId) === motherId);
        return details.farmyardId && assignment?.event.details?.farmyardId === details.farmyardId ? assignment : undefined;
    }
    if (current.type === 'ExpeditionReturned' && typeof details.missionId === 'string')
        return earlier.find(fact => fact.event.type === 'ExpeditionDeparted' &&
            fact.event.details?.missionId === details.missionId);
    if (current.type === 'ChildBorn') {
        const parents = strings(details.parentIds);
        if (parents.length !== 2) return undefined;
        return earlier.find(fact => fact.event.type === 'FoundingPartnershipPresent' &&
            strings(fact.event.details?.participants).length === 2 &&
            parents.every(id => strings(fact.event.details?.participants).includes(id)));
    }
    if (current.type === 'ResidenceAssigned')
        return earlier.find(fact => fact.event.type === 'ResidenceAssigned' &&
            fact.event.details?.householdId === details.householdId);
    return undefined;
}
export function planNarrative(events: readonly SimulationEvent[], intervalStart: number, version: 1 | 2 | 3 = 2): NarrativePlan {
    const currentIds = new Set(events.slice(intervalStart).map(event => event.id));
    const index = historyIndex(events, version);
    const older = index.filter(fact => !currentIds.has(fact.event.id));
    const current = index.filter(fact => currentIds.has(fact.event.id));
    const priority: NarrativeTheme[] = [...(version >= 3 ? ['social' as const] : []), 'family', 'homes', 'work', 'expeditions', 'herd'];
    const focus = priority.filter(theme => current.some(fact => fact.theme === theme)).slice(0, 3);
    const threads = focus.flatMap(theme => {
        const selected = current.filter(fact => fact.theme === theme);
        const groups = theme === 'social' ? [...new Set(selected.map(fact => fact.event.details?.incidentId))].map(id =>
            selected.filter(fact => fact.event.details?.incidentId === id)) :
            theme === 'herd' && version >= 2 ?
            livestockGroups(selected.map(fact => fact.event)).map(group =>
                group.map(event => selected.find(fact => fact.event.id === event.id)!)) :
            selected.map(fact => [fact]);
        return groups.slice(0, 4).map(group => {
            const callbacks = theme === 'social' ? group.flatMap(fact =>
                older.filter(previous => previous.event.details?.incidentId === fact.event.details?.incidentId)
                    .flatMap(previous => previous.entry.sourceEventIds)) :
                group.flatMap(fact => relevantOlder(fact.event, older)?.entry.sourceEventIds ?? []);
            return {
                theme,
                subjectIds: [...new Set(group.flatMap(fact => subjects(fact.event)))],
                sourceEventIds: group.flatMap(fact => fact.entry.sourceEventIds),
                callbackEventIds: [...new Set(callbacks)]
            };
        });
    });
    return { version, focus, threads,
        sourceEventIds: [...new Set(threads.flatMap(thread => thread.sourceEventIds))],
        callbackEventIds: [...new Set(threads.flatMap(thread => thread.callbackEventIds))] };
}
