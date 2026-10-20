import { wildlifeSighting, type WildlifeSighting } from '../simulation/WildlifeSightings';
import { wildlifeSpecies } from '../wildlife/WildlifeSpecies';
import type { GameTime, SimulationEvent } from '../simulation/SimulationCore';

export interface WildlifeRecord {
    eventId: string;
    time: GameTime;
    sighting: WildlifeSighting;
    people: { id: string; name: string }[];
}
export const wildlifeLabel = (speciesId: string) =>
    wildlifeSpecies.find(species => species.id === speciesId)?.label ?? 'Recorded wildlife';
export function wildlifeSightingText(event: SimulationEvent, personal = false) {
    const d = wildlifeSighting(event);
    if (!d) return null;
    const label = wildlifeLabel(d.speciesId).toLowerCase();
    return personal ? 'Participated in ' + d.groupName + ' when the expedition sighted a ' + label + '.' :
        d.groupName + ' sighted a ' + label + (d.firstForClan ? ', the clan’s first recorded encounter with this species.' : '.');
}

/** Rebuildable projection: each canonical event is examined once, with no UI history copy in saves. */
export class WildlifeHistoryIndex {
    private indexed = 0;
    private byId = new Map<string, WildlifeRecord>();
    private bySpecies = new Map<string, WildlifeRecord[]>();
    private byGroup = new Map<string, WildlifeRecord[]>();
    private examined = 0;
    private speciesPositions = new Map<string, number>();
    append(events: readonly SimulationEvent[], clanId: string) {
        for (; this.indexed < events.length; this.indexed++) {
            const event = events[this.indexed]; this.examined++;
            const sighting = wildlifeSighting(event);
            if (!sighting || sighting.clanId !== clanId) continue;
            const people = Array.isArray(event.details?.people) ? event.details.people as { id: string; name: string }[] : [];
            const record = { eventId: event.id, time: event.time, sighting,
                people: people.filter(person => sighting.witnessPersonaIds.includes(person.id)) };
            this.byId.set(event.id, record);
            for (const [map, id] of [[this.bySpecies, sighting.speciesId],
                [this.byGroup, sighting.expeditionGroupId]] as const) {
                const records = map.get(id) ?? [];
                if (map === this.bySpecies) this.speciesPositions.set(event.id, records.length);
                records.push(record); map.set(id, records);
            }
        }
    }
    summaries() {
        return [...this.bySpecies].map(([speciesId, records]) => ({ speciesId,
            label: wildlifeLabel(speciesId), count: records.length, first: structuredClone(records[0]) }));
    }
    species(speciesId: string, offset = 0, limit = 20) {
        const records = this.bySpecies.get(speciesId);
        if (!records) return null;
        if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 20)
            throw new Error('Invalid wildlife history page.');
        const end = Math.max(0, records.length - offset);
        return { speciesId, label: wildlifeLabel(speciesId), count: records.length,
            first: structuredClone(records[0]), offset,
            encounters: structuredClone(records.slice(Math.max(0, end - limit), end).reverse()) };
    }
    group(groupId: string) { return structuredClone((this.byGroup.get(groupId) ?? []).slice(-5).reverse()); }
    pageFor(eventId: string) {
        const record = this.byId.get(eventId);
        if (!record) return 0;
        const records = this.bySpecies.get(record.sighting.speciesId)!;
        return Math.floor((records.length - 1 - this.speciesPositions.get(eventId)!) / 20) * 20;
    }
    encounter(eventId: string) {
        const record = this.byId.get(eventId);
        return record ? structuredClone(record) : null;
    }
    unread(readIds: readonly string[]) {
        const read = new Set(readIds);
        return this.summaries().filter(summary => !read.has(summary.first.eventId));
    }
    inspect() { return { examined: this.examined, sightings: this.byId.size, species: this.bySpecies.size }; }
}
