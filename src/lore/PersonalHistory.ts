import { personalChronicleEntry } from './Chronicle';
import type { SimulationEvent, SimulationState, GameTime } from '../simulation/SimulationCore';
import type { BookChapter } from './ClanBook';
import { ordinal } from './NarrativeTime';
export type PersonalRecord = {
    sourceEventId: string;
    time: GameTime;
    date: string;
    text: string;
    kind: string;
    status: 'recent' | 'recorded';
    roles: string[];
    publications: {
        chapterIndex: number;
        paragraphIndex: number | null;
        excerpt?: string;
    }[];
};
export type PersonalHistory = {
    personaId: string;
    records: PersonalRecord[];
    totalRecords: number;
    partialAttribution: boolean;
};
function ids(value: unknown): string[] {
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : [];
}
const housingKinds = new Set(['HouseBuilt', 'ResidenceAssigned', 'BuildingUpgraded',
    'BuildingSpecialized', 'BuildingSalvaged', 'BuildingCollapsed', 'FarmyardFunctionChanged']);
function housingIds(event: SimulationEvent): string[] | null {
    const details = event.details ?? {};
    const snapshot = details.housingResidents as {
        version?: unknown;
        residentIds?: unknown;
        householdIds?: unknown;
        buildingId?: unknown;
        residenceId?: unknown;
    } | undefined;
    if (snapshot?.version !== 1 || !Array.isArray(snapshot.residentIds) ||
        !snapshot.residentIds.every(id => typeof id === 'string') ||
        !Array.isArray(snapshot.householdIds) || !snapshot.householdIds.every(id => typeof id === 'string'))
        return null;
    const buildingId = details.buildingId ?? details.farmyardId;
    if (typeof buildingId === 'string' && snapshot.buildingId !== buildingId)
        return null;
    if (typeof details.residenceId === 'string' && snapshot.residenceId !== details.residenceId)
        return null;
    if (typeof details.householdId === 'string' && !snapshot.householdIds.includes(details.householdId))
        return null;
    return snapshot.residentIds;
}
function rolesFor(event: SimulationEvent, personaId: string, byId: ReadonlyMap<string, SimulationEvent>): string[] {
    const details = event.details ?? {};
    if (event.type === 'CulturalGatheringHeld')
        return ids(details.participants).includes(personaId) ? ['gathering participant'] : [];
    if (event.type === 'CultureWeatherSupportApplied')
        return ids(details.participants).includes(personaId) ? ['weather support recipient'] : [];
    if (event.type === 'WildlifeSighted')
        return ids(details.witnessPersonaIds).includes(personaId) ? ['expedition witness'] : [];
    if (['ResidentQuarrelled', 'SocialIncidentEnded'].includes(event.type))
        return ids(details.participants).includes(personaId) ? ['disputant'] : [];
    if (event.type === 'MediationAttempted') {
        const participants = ids(details.participants);
        if (participants.length !== 3 || details.mediatorId !== participants[2] || typeof details.success !== 'boolean')
            return [];
        return personaId === details.mediatorId ? ['mediator'] : participants.slice(0, 2).includes(personaId) ? ['disputant'] : [];
    }
    if (event.type === 'ResidentsReconciled') {
        if (ids(details.participants).includes(personaId))
            return ['disputant'];
        const prior = byId.get(String(details.priorEventId));
        return details.method === 'mediated' && prior?.type === 'MediationAttempted' &&
            prior.details?.success === true && prior.details.incidentId === details.incidentId &&
            prior.details.mediatorId === personaId ? ['mediator'] : [];
    }
    if (['ExpeditionDeparted', 'ExpeditionReturned', 'ExploreAreaDeparted', 'ExploreAreaReturned'].includes(event.type))
        return ids(details.participants).includes(personaId) ? ['expedition participant'] : [];
    if (housingKinds.has(event.type))
        return housingIds(event)?.includes(personaId) ? ['household resident'] : [];
    if (['EquipmentCrafted', 'EquipmentAssigned', 'EquipmentLost', 'EquipmentRecovered'].includes(event.type))
        return event.personaId === personaId ? [event.type === 'EquipmentCrafted' ? 'craftsperson' : 'equipment owner'] : [];
    if (event.type === 'ChildBorn') {
        if (event.personaId === personaId)
            return ['child'];
        return ids(details.parentIds).includes(personaId) ? ['parent'] : [];
    }
    if (['FoundingPartnershipPresent', 'PartnershipFormed'].includes(event.type))
        return ids(details.participants).includes(personaId) ? ['partner'] : [];
    if (event.type === 'FoundingPartyLanded')
        return ids(details.founderIds).includes(personaId) ? ['founder'] : [];
    if (event.type === 'CaregiverAssigned') {
        if (event.personaId === personaId)
            return ['care recipient'];
        return details.caregiverId === personaId ? ['caregiver'] : [];
    }
    if (['OccupationAssigned', 'OccupationReleased', 'PersonaDied'].includes(event.type))
        return event.personaId === personaId ? ['resident'] : [];
    if (['PersonaTransferredIn', 'PersonaTransferredOut'].includes(event.type))
        return (event.personaId ?? details.personaId) === personaId ? ['resident'] : [];
    return [];
}
function date(time: GameTime, origin: {
    winter: number;
    arrival: boolean;
} | null): string {
    const seasons = ['Winter', 'Spring', 'Summer', 'Autumn'];
    const season = seasons[Math.floor(time.tick / 250)];
    if (!origin)
        return 'Date relative to arrival unavailable · ' + season;
    const gap = time.winter - origin.winter;
    if (gap === 0)
        return (origin.arrival ? 'Arrival year' : 'Campaign opening') + ' · ' + season;
    return 'The ' + ordinal(Math.abs(gap)) + ' year ' + (gap < 0 ? 'before' : 'after') + (origin.arrival ? ' arrival · ' : ' campaign opening · ') + season;
}
function publicationsFor(event: SimulationEvent, personaId: string, chapters: readonly BookChapter[], byId: ReadonlyMap<string, SimulationEvent>): PersonalRecord['publications'] {
    const references: PersonalRecord['publications'] = [];
    for (const chapter of chapters) {
        let linked = false;
        for (const [paragraphIndex, paragraph] of (chapter.paragraphs ?? []).entries()) {
            if (!paragraph.templateId.startsWith('clan-book.thread.') || !chapter.plan)
                continue;
            const theme = paragraph.templateId.split('.')[2];
            const threads = chapter.plan.threads.filter(thread => thread.theme === theme);
            const meaningful = [...new Set(threads.flatMap(thread => [...thread.sourceEventIds, ...thread.callbackEventIds]))]
                .filter(id => paragraph.sourceEventIds.includes(id));
            // A broad arrival callback dates another founder's story; it is not that founder's personal passage.
            if (event.type === 'FoundingPartyLanded' && !threads.some(thread => thread.sourceEventIds.includes(event.id)))
                continue;
            if (!meaningful.includes(event.id))
                continue;
            const relevant = meaningful.length > 0 && meaningful.every(id => {
                const source = byId.get(id);
                return !!source && rolesFor(source, personaId, byId).length > 0;
            });
            references.push({ chapterIndex: chapter.index, paragraphIndex, ...(relevant ? { excerpt: paragraph.text } : {}) });
            linked = true;
        }
        if (!linked && chapter.sourceEventIds.includes(event.id))
            references.push({ chapterIndex: chapter.index, paragraphIndex: null });
    }
    return references;
}
function candidates(event: SimulationEvent, byId: ReadonlyMap<string, SimulationEvent>): string[] {
    const details = event.details ?? {};
    const prior = event.type === 'ResidentsReconciled' ? byId.get(String(details.priorEventId)) : undefined;
    return [...new Set([event.personaId, details.personaId, details.caregiverId,
            ...ids(details.participants), ...ids(details.parentIds), ...ids(details.founderIds),
            ...(event.type === 'WildlifeSighted' ? ids(details.witnessPersonaIds) : []),
            ...(housingKinds.has(event.type) ? housingIds(event) ?? [] : []), prior?.details?.mediatorId]
            .filter((id): id is string => typeof id === 'string'))];
}
/** Rebuildable presentation index. Appended events are indexed once; campaign replacement creates a new index. */
export class PersonalHistoryIndex {
    private byId = new Map<string, SimulationEvent>();
    private byPersona = new Map<string, PersonalRecord[]>();
    private indexed = 0;
    private origin: {
        winter: number;
        arrival: boolean;
    } | null = null;
    private partial = false;
    private chapters: readonly BookChapter[] = [];
    private publicationEnd = 0;
    append(events: readonly SimulationEvent[]): void {
        if (this.indexed === 0) {
            const opening = events.find(event => ['FoundingPartyLanded', 'ClanInitialized'].includes(event.type));
            this.origin = opening ? { winter: opening.time.winter, arrival: opening.type === 'FoundingPartyLanded' } : null;
        }
        for (; this.indexed < events.length; this.indexed++) {
            const event = events[this.indexed];
            this.byId.set(event.id, event);
            if (housingKinds.has(event.type) && housingIds(event) === null)
                this.partial = true;
            const people = candidates(event, this.byId);
            const actual = people.flatMap(id => {
                const roles = rolesFor(event, id, this.byId);
                return roles.length ? [{ id, roles }] : [];
            });
            if (!actual.length)
                continue;
            const entry = personalChronicleEntry(event);
            if (!entry)
                continue;
            for (const person of actual) {
                const records = this.byPersona.get(person.id) ?? [];
                records.push({ sourceEventId: event.id, time: { ...event.time }, date: date(event.time, this.origin),
                    kind: event.type, text: entry.text, roles: person.roles, status: 'recent',
                    publications: publicationsFor(event, person.id, this.chapters, this.byId) });
                this.byPersona.set(person.id, records);
            }
        }
    }
    publish(chapters: readonly BookChapter[]): void {
        this.chapters = chapters;
        this.publicationEnd = chapters.at(-1)?.checkpoint.eventEnd ?? 0;
        const recorded = new Set([...this.byId.keys()].slice(0, this.publicationEnd));
        for (const [personaId, records] of this.byPersona)
            for (const record of records) {
                record.publications = publicationsFor(this.byId.get(record.sourceEventId)!, personaId, chapters, this.byId);
                record.status = recorded.has(record.sourceEventId) ? 'recorded' : 'recent';
            }
    }
    read(personaId: string, limit = 10, offset = 0): PersonalHistory {
        if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100 || !Number.isSafeInteger(offset) || offset < 0)
            throw new Error('Invalid Personal history page.');
        const records = this.byPersona.get(personaId) ?? [];
        const end = Math.max(0, records.length - offset), start = Math.max(0, end - limit);
        return { personaId, records: structuredClone(records.slice(start, end).reverse()),
            totalRecords: records.length, partialAttribution: this.partial };
    }
    hasReference(personaId: string, eventId: string, chapterIndex: number, paragraphIndex: number | null): boolean {
        return !!this.byPersona.get(personaId)?.find(record => record.sourceEventId === eventId)?.publications
            .some(reference => reference.chapterIndex === chapterIndex && reference.paragraphIndex === paragraphIndex);
    }
}
/** Stateless public projection for fixtures and other resident surfaces. */
export function projectPersonalHistory(state: SimulationState, personaId: string, chapters: readonly BookChapter[] = [], limit = 10, offset = 0): PersonalHistory {
    if (!state.personas[personaId] && !state.personaArchive?.[personaId])
        return { personaId, records: [], totalRecords: 0, partialAttribution: false };
    const index = new PersonalHistoryIndex();
    index.append(state.events);
    index.publish(chapters);
    return index.read(personaId, limit, offset);
}
