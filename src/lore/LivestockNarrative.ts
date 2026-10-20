import type { SimulationEvent } from '../simulation/SimulationCore';
import type { OpeningFacts } from './ClanBook';
import { livestockSpecies, type LivestockSpecies } from '../simulation/LivestockSpecies';

export function isLivestockEvent(type: string): boolean {
    return /^(Cattle|Livestock)(Born|Died|Slaughtered|Assigned)$/.test(type);
}

/** Use the identity frozen by the event, never today's owners or a partial ledger's order. */
export function recordedLivestock(event: SimulationEvent) {
    const details = event.details ?? {}, id = details.livestockId ?? details.cattleId;
    const facts = details.livestock as { version?: number; animals?: {
        id: string; name: string; species: LivestockSpecies; sex: 'female' | 'male';
        age: number; stage: string;
    }[] } | undefined;
    const record = facts?.version === 1 && Array.isArray(facts.animals) ?
        facts.animals.find(animal => animal?.id === id) : undefined;
    return record && Object.hasOwn(livestockSpecies, record.species) &&
        ['female', 'male'].includes(record.sex) && Number.isSafeInteger(record.age) && record.age >= 0 &&
        ['Young', 'Young Adult', 'Adult'].includes(record.stage) &&
        /^Livestock [1-9]\d*$/.test(record.name) ? record : undefined;
}

export function livestockDescription(event: SimulationEvent, facts: OpeningFacts): { singular: string; plural: string } {
    const details = event.details ?? {};
    const recorded = recordedLivestock(event);
    const animal = facts.livestock?.animals.find(record => record.id === (details.livestockId ?? details.cattleId));
    const species = recorded?.species ?? animal?.species ?? (event.type.startsWith('Cattle') ? 'cattle' : undefined);
    const recordedAge = Number.isSafeInteger(details.age) && Number(details.age) >= 0 ? Number(details.age) : undefined;
    const age = event.type.endsWith('Born') ? 0 : recorded?.age ?? recordedAge ??
        (animal && animal.birthWinter <= event.time.winter ? event.time.winter - animal.birthWinter : undefined);
    const sex = recorded?.sex ?? (details.sex === 'female' || details.sex === 'male' ? details.sex : animal?.sex);
    const rules = animal?.adultAge !== undefined && animal.youngAdultAge !== undefined ?
        { adultAge: animal.adultAge, youngAdultAge: animal.youngAdultAge } : facts.livestock;
    const stage = recorded?.stage ?? (rules && age !== undefined ? age < rules.youngAdultAge ? 'Young' :
        age < rules.adultAge ? 'Young Adult' : 'Adult' : undefined);
    if (species !== 'cattle') {
        if (!species) return { singular: 'animal', plural: 'animals' };
        const young = { chicken: ['chick', 'chicks'], pig: ['piglet', 'piglets'],
            sheep: ['lamb', 'lambs'], goat: ['kid', 'kids'], goose: ['gosling', 'goslings'] }[species];
        if (age === 0 || stage === 'Young') return { singular: young[0], plural: young[1] };
        const terms = { chicken: ['chicken', 'chickens'], pig: ['pig', 'pigs'],
            sheep: ['sheep', 'sheep'], goat: ['goat', 'goats'], goose: ['goose', 'geese'] }[species];
        if (stage === 'Adult' && sex) {
            const term = livestockSpecies[species][sex].toLowerCase();
            const plural = term === 'goose' ? 'geese' : term === 'doe' ? 'does' : term + 's';
            return { singular: 'adult ' + term, plural: 'adult ' + plural };
        }
        const prefix = stage === 'Young Adult' ? 'young ' : '';
        return { singular: prefix + terms[0], plural: prefix + terms[1] };
    }
    if (age === 0 || rules && age !== undefined && age < rules.youngAdultAge)
        return { singular: 'calf', plural: 'calves' };
    if (!rules || age === undefined) return { singular: 'head of cattle', plural: 'head of cattle' };
    if (age < rules.adultAge) {
        if (sex === 'female') return { singular: 'heifer', plural: 'heifers' };
        if (sex === 'male') return { singular: 'young bull', plural: 'young bulls' };
        return { singular: 'young head of cattle', plural: 'young head of cattle' };
    }
    if (sex === 'female') return { singular: 'adult cow', plural: 'adult cows' };
    if (sex === 'male') return { singular: 'adult bull', plural: 'adult bulls' };
    return { singular: 'adult head of cattle', plural: 'adult head of cattle' };
}

function distinctAnimals(events: readonly SimulationEvent[]): SimulationEvent[] {
    const identities = new Set<unknown>();
    return events.filter(event => {
        const identity = event.details?.livestockId ?? event.details?.cattleId ?? event.id;
        if (identities.has(identity)) return false;
        identities.add(identity);
        return true;
    });
}

export function livestockQuantity(events: readonly SimulationEvent[], facts: OpeningFacts): string {
    const groups = new Map<string, { singular: string; plural: string; count: number }>();
    for (const event of distinctAnimals(events)) {
        const label = livestockDescription(event, facts);
        const group = groups.get(label.singular) ?? { ...label, count: 0 };
        group.count++;
        groups.set(label.singular, group);
    }
    const words = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
    const items = [...groups.values()].map(group => (words[group.count] ?? String(group.count)) +
        ' ' + (group.count === 1 ? group.singular : group.plural));
    return items.length < 2 ? items.join('') : items.slice(0, -1).join(', ') + ' and ' + items.at(-1);
}

export function livestockGroups(events: readonly SimulationEvent[]): SimulationEvent[][] {
    const groups = new Map<string, SimulationEvent[]>();
    for (const event of events) {
        // Distinct destinations and years cannot imply a common herd, owner or moment.
        const key = JSON.stringify([event.type, event.time.winter, event.details?.farmyardId]);
        const group = groups.get(key) ?? [];
        group.push(event);
        groups.set(key, group);
    }
    return [...groups.values()];
}

export function livestockAction(events: readonly SimulationEvent[], facts: OpeningFacts): string {
    const event = events[0];
    const quantity = livestockQuantity(events, facts);
    const subject = quantity[0].toUpperCase() + quantity.slice(1);
    const verb = distinctAnimals(events).length === 1 ? 'was' : 'were';
    if (event.type.endsWith('Born')) return subject + ' ' + verb + ' born.';
    if (event.type.endsWith('Died')) return subject + ' died.';
    if (event.type.endsWith('Slaughtered')) return subject + ' ' + verb + ' slaughtered.';
    if (event.details?.farmyardId === null) return subject + ' ' + verb + ' unassigned from the Farmyard.';
    const names = event.details?.housingNames as { version?: number; building?: { id?: string; name?: string } } | undefined;
    const building = names?.building;
    const home = names?.version === 1 && building && building.id === event.details?.farmyardId &&
        typeof building.name === 'string' ? 'the Farmyard at ' + building.name : 'a Farmyard';
    return subject + ' ' + verb + ' assigned to ' + home + '.';
}
