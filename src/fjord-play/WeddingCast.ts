import { availableCulturalParticipants, type SimulationEvent, type SimulationState } from '../simulation/SimulationCore';

export type WeddingInstrument = 'wedding-lyre' | 'wedding-flute' | 'wedding-frame-drum';
export type WeddingRole = { id: string; role: 'couple' | 'officiant' | 'musician' | 'clapper';
    instrument?: WeddingInstrument; crown?: boolean };
export const weddingInstrumentOrder: readonly WeddingInstrument[] = [
    'wedding-lyre', 'wedding-flute', 'wedding-frame-drum',
];

/** A presentation cast of recorded attendance, never another attendance or marriage decision. */
export function weddingCast(state: Readonly<SimulationState>, event: SimulationEvent, stagedIds?: readonly string[]): WeddingRole[] {
    if (event.type !== 'CulturalGatheringHeld' || event.details?.occasion !== 'wedding' ||
        !state.events.some(source => source.id === event.id)) return [];
    const d = event.details;
    if (!Array.isArray(d.spouseIds) || d.spouseIds.length !== 2 || !Array.isArray(d.participants)) return [];
    const available = new Set(availableCulturalParticipants(state).map(person => person.id)
        .filter(id => !stagedIds || stagedIds.includes(id)));
    const recorded = [...new Set(d.participants.filter((id): id is string => typeof id === 'string'))];
    const spouses = d.spouseIds.filter((id): id is string => typeof id === 'string');
    if (new Set(spouses).size !== 2 || spouses.some(id => !available.has(id) || !recorded.includes(id))) return [];
    const people = Array.isArray(d.people) ? d.people as { id: string; age: number }[] : [];
    const guests = recorded.filter(id => available.has(id) && !spouses.includes(id));
    guests.sort((a, b) => {
        const age = (people.find(person => person.id === b)?.age ?? 0) -
            (people.find(person => person.id === a)?.age ?? 0);
        const first = state.personas[a], second = state.personas[b];
        return age || first.birthWinter - second.birthWinter ||
            (first.birthTick ?? 0) - (second.birthTick ?? 0) || a.localeCompare(b);
    });
    const cast: WeddingRole[] = spouses.map(id => ({ id, role: 'couple',
        ...(state.personas[id].dna.sex === 'female' ? { crown: true } : {}) }));
    const officiant = guests.shift();
    if (officiant) cast.push({ id: officiant, role: 'officiant' });
    guests.sort();
    for (const [index, id] of guests.entries()) {
        const instrument = weddingInstrumentOrder[index];
        cast.push(instrument ? { id, role: 'musician', instrument } : { id, role: 'clapper' });
    }
    return cast;
}

/** Preferred intimate slots still pass the existing terrain, clearance and route authorities. */
export function weddingSlots(cast: readonly WeddingRole[], center: { x: number; z: number }, rotation = 0) {
    const offsets = [[-.52, -8], [.52, -8], [0, -6.5], [-3.8, -7.5], [3.8, -7.5],
        [-5.8, -4.5], [5.8, -4.5], [7.4, -1.2]];
    const slots: Record<string, { target: { x: number; z: number }; facing: { x: number; z: number }; partner?: boolean }> = {};
    for (const [index, person] of cast.slice(0, 8).entries()) {
        const [x, z] = offsets[index];
        const rotate = (x: number, z: number) => ({ x: center.x + x * Math.cos(rotation) + z * Math.sin(rotation),
            z: center.z + z * Math.cos(rotation) - x * Math.sin(rotation) });
        const target = rotate(x, z);
        const facing = rotate(person.role === 'couple' ? (index === 0 ? .52 : -.52) : 0, -8);
        slots['persona:' + person.id] = { target, facing, ...(person.role === 'couple' ? { partner: true } : {}) };
    }
    return slots;
}
