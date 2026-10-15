import { parseCharacterDNA, traitKeys } from '../characters/CharacterDNA';
import { personaIdentity } from './Identity';
import { seededRandom } from '../characters/seededRandom';
import type { CharacterDNA, TraitKey } from '../characters/CharacterDNA';
import type { GameTime, SimulationState } from './SimulationCore';

export type BirthdayCalendarMode = 'individual-v1';
export type PendingBirth = {
    name: string;
    motherId: string;
    fatherId: string;
    selectedAt: GameTime;
    dueAt: GameTime;
    dna: CharacterDNA;
    dominantLegacy: Partial<Record<TraitKey, string>>;
};
export type BirthdayCalendar = { version: 1; birthPolicy?: 'annual'; pendingBirths: PendingBirth[] };

/** A legacy clan may carry an incoming pregnancy without adopting a new domestic policy. */
export function birthdayCalendarMode(state: SimulationState): BirthdayCalendarMode | undefined {
    return state.birthdayCalendar && state.birthdayCalendar.birthPolicy !== 'annual' ? 'individual-v1' : undefined;
}

/** Independent identity streams leave founder DNA, names and the domestic RNG untouched. */
export function initializeBirthdayCalendar(state: SimulationState, mode?: BirthdayCalendarMode): void {
    if (mode === undefined) return;
    if (mode !== 'individual-v1') throw new Error('Unsupported birthday calendar.');
    state.birthdayCalendar = { version: 1, pendingBirths: [] };
    for (const person of Object.values(state.personas)) {
        person.birthTick = Math.floor(seededRandom(state.seed, 'persona-birthday-v1:' + person.id)() * state.ticksPerWinter);
        person.birthWinter = state.time.winter - person.dna.age - (person.birthTick > state.time.tick ? 1 : 0);
    }
}

export function validateBirthdayCalendar(state: SimulationState): void {
    const calendar = state.birthdayCalendar;
    if (calendar !== undefined && (!calendar || calendar.version !== 1 || (calendar.birthPolicy !== undefined && calendar.birthPolicy !== 'annual') || !Array.isArray(calendar.pendingBirths)))
        throw new Error('Invalid birthday calendar.');
    const validTick = (tick: number) => Number.isSafeInteger(tick) && tick >= 0 && tick < state.ticksPerWinter;
    const now = state.time.winter * state.ticksPerWinter + state.time.tick;
    const mothers = new Set<string>();
    const validTime = (time: GameTime) => time && Number.isSafeInteger(time.winter) && time.winter >= 800 && validTick(time.tick);
    for (const birth of calendar?.pendingBirths ?? []) {
        const mother = state.personas[birth.motherId], father = personaIdentity(state, birth.fatherId);
        if (!mother || mother.deathWinter !== null || mother.dna.sex !== 'female' ||
            !father || father.dna.sex !== 'male' || mother.id === father.id || mothers.has(mother.id))
            throw new Error('Invalid scheduled parents.');
        mothers.add(mother.id);
        if (!validTime(birth.selectedAt) || !validTime(birth.dueAt) || birth.selectedAt.tick !== 0 ||
            birth.dueAt.tick === 0 || birth.dueAt.winter !== birth.selectedAt.winter ||
            birth.selectedAt.winter * state.ticksPerWinter > now)
            throw new Error('Invalid scheduled delivery date.');
        parseCharacterDNA(birth.dna);
        if (birth.dna.age !== 0 || typeof birth.name !== 'string' || !birth.name.trim() ||
            !birth.dominantLegacy || Object.entries(birth.dominantLegacy).some(([key, id]) =>
                !traitKeys.includes(key as TraitKey) || ![mother.id, father.id].includes(id)))
            throw new Error('Invalid scheduled child identity.');
    }
}

/** Called inside the existing identity-validation loops, without another population traversal. */
export function validatePersonaDates(state: SimulationState, person: import('./SimulationCore').Persona): void {
    if (person.birthTick === undefined && person.deathTick === undefined) return;
    const validTick = (tick: number) => Number.isSafeInteger(tick) && tick >= 0 && tick < state.ticksPerWinter;
    const now = state.time.winter * state.ticksPerWinter + state.time.tick;
    if (person.birthTick !== undefined && !validTick(person.birthTick)) throw new Error('Invalid birth tick.');
    const birth = person.birthWinter * state.ticksPerWinter + (person.birthTick ?? 0);
    if (!Number.isSafeInteger(birth) || birth < 0 || birth > now) throw new Error('Invalid birth date.');
    if (person.deathTick !== undefined && (person.deathWinter === null || !validTick(person.deathTick)))
        throw new Error('Invalid death tick.');
    if (person.deathWinter !== null) {
        const death = person.deathWinter * state.ticksPerWinter + (person.deathTick ?? 0);
        if (!Number.isSafeInteger(death) || death < birth || death > now) throw new Error('Invalid death date.');
    }
}
