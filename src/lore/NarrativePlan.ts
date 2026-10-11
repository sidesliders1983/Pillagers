import { projectChronicle } from './Chronicle';
import type { ChronicleEntry } from './Chronicle';
import type { SimulationEvent } from '../simulation/SimulationCore';

export type NarrativeTheme = 'family' | 'homes' | 'work' | 'herd' | 'expeditions';
export type NarrativeThread = {
    theme: NarrativeTheme;
    subjectIds: string[];
    sourceEventIds: string[];
    callbackEventIds: string[];
};
export type NarrativePlan = {
    version: 1;
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
        ...['buildingId', 'cattleId', 'missionId', 'longshipId'].flatMap(key =>
            typeof details[key] === 'string' ? [details[key] as string] : []),
    ])];
}

/** Rebuilt from the complete supported event history, never from previously written prose. */
function historyIndex(events: readonly SimulationEvent[]): IndexedFact[] {
    const byId = new Map(events.map(event => [event.id, event]));
    return projectChronicle(events).reverse().flatMap(group => group.entries).flatMap(entry => {
        const event = byId.get(entry.sourceEventIds[0]);
        const theme = event && themes[event.type];
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
    if (current.type === 'CattleBorn') {
        const motherId = strings(details.parentIds)[0];
        const assignment = [...earlier].reverse().find(fact => fact.event.type === 'CattleAssigned' &&
            fact.event.details?.cattleId === motherId);
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
export function planNarrative(events: readonly SimulationEvent[], intervalStart: number): NarrativePlan {
    const currentIds = new Set(events.slice(intervalStart).map(event => event.id));
    const index = historyIndex(events);
    const older = index.filter(fact => !currentIds.has(fact.event.id));
    const current = index.filter(fact => currentIds.has(fact.event.id));
    const priority: NarrativeTheme[] = ['family', 'homes', 'work', 'expeditions', 'herd'];
    const focus = priority.filter(theme => current.some(fact => fact.theme === theme)).slice(0, 3);
    const threads = focus.flatMap(theme => current.filter(fact => fact.theme === theme).slice(0, 4).map(fact => {
        const previous = relevantOlder(fact.event, older);
        return { theme, subjectIds: subjects(fact.event), sourceEventIds: fact.entry.sourceEventIds,
            callbackEventIds: previous?.entry.sourceEventIds ?? [] };
    }));
    return { version: 1, focus, threads,
        sourceEventIds: [...new Set(threads.flatMap(thread => thread.sourceEventIds))],
        callbackEventIds: [...new Set(threads.flatMap(thread => thread.callbackEventIds))] };
}
