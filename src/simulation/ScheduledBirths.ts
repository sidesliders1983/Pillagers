import { seededRandom } from '../characters/seededRandom';
import { generateCharacterDNA } from '../characters/generateCharacterDNA';
import { characterName, fullName } from '../characters/naming/generateName';
import { heritageKeys, normalizeHeritage, traitKeys } from '../characters/CharacterDNA';
import type { CoreTraits, HeritageMix } from '../characters/CharacterDNA';
import { newPersonaMechanics } from './Mechanics';
import { personaAway } from './WorldExpeditions';
import { assignCaregiver, type EventWriter } from './FamilyMechanics';
import type { PendingBirth } from './BirthdayCalendar';
import type { SimulationState } from './SimulationCore';

export const compareBirths = (a: PendingBirth, b: PendingBirth): number =>
    a.dueAt.winter - b.dueAt.winter || a.dueAt.tick - b.dueAt.tick || a.motherId.localeCompare(b.motherId);

/** Sample the same annual fertility decision once; delivery never rerolls it. */
export function scheduleBirth(state: SimulationState, motherId: string, fatherId: string,
    roll: (bps: number) => boolean, random: () => number, emit: EventWriter): void {
    const mother = state.personas[motherId], father = state.personas[fatherId];
    const dna = generateCharacterDNA(random());
    dna.age = 0;
    dna.sex = roll(5000) ? 'female' : 'male';
    dna.traits = Object.fromEntries(traitKeys.map(key =>
        [key, (mother.dna.traits[key] + father.dna.traits[key]) / 2])) as CoreTraits;
    dna.heritage = normalizeHeritage(Object.fromEntries(heritageKeys.map(key =>
        [key, (mother.dna.heritage[key] + father.dna.heritage[key]) / 2])) as HeritageMix);
    const name = fullName(characterName(dna));
    const dominantLegacy: PendingBirth['dominantLegacy'] = {};
    for (const key of traitKeys) if (roll(state.mechanics!.config.dominantLegacyChanceBps)) {
        const parent = roll(5000) ? mother : father;
        dna.traits[key] = parent.dna.traits[key];
        dominantLegacy[key] = parent.id;
    }
    const tick = 1 + Math.floor(seededRandom(state.seed,
        'delivery-v1:' + motherId + ':' + state.time.winter)() * (state.ticksPerWinter - 1));
    const dueAt = { winter: state.time.winter, tick };
    state.birthdayCalendar!.pendingBirths.push({ motherId, fatherId, name, dna, dominantLegacy,
        selectedAt: { ...state.time }, dueAt });
    state.birthdayCalendar!.pendingBirths.sort(compareBirths);
    emit('BirthScheduled', motherId, { participants: [motherId, fatherId], dueAt: { ...dueAt } });
}

/** Called after domestic annual rules and world returns, including headless CPU progression. */
export function resolveScheduledBirths(state: SimulationState, emit: EventWriter): boolean {
    const calendar = state.birthdayCalendar;
    if (!calendar?.pendingBirths.length) return false;
    const now = state.time.winter * state.ticksPerWinter + state.time.tick;
    let delivered = false;
    calendar.pendingBirths = calendar.pendingBirths.filter(birth => {
        const mother = state.personas[birth.motherId];
        if (!mother || mother.deathWinter !== null) {
            emit('BirthPlanCancelled', birth.motherId, { reason: 'mother-deceased-or-departed',
                participants: [birth.motherId, birth.fatherId], dueAt: { ...birth.dueAt } });
            return false;
        }
        if (now < birth.dueAt.winter * state.ticksPerWinter + birth.dueAt.tick || personaAway(state, mother.id))
            return true;
        const home = Object.values(state.households).find(h => h.memberIds.includes(mother.id));
        if (!home) throw new Error('Scheduled delivery requires a maternal household.');
        let index = 1;
        while (state.personas[(state.entityPrefix ?? '') + 'persona-' + index] ||
            state.personaArchive?.[(state.entityPrefix ?? '') + 'persona-' + index]) index++;
        const id = (state.entityPrefix ?? '') + 'persona-' + index;
        const dna = structuredClone(birth.dna);
        state.personas[id] = { id, name: birth.name, birthWinter: state.time.winter,
            birthTick: state.time.tick, deathWinter: null, originClanId: state.clan.id, dna,
            parentIds: [birth.fatherId, mother.id], partnerId: null, occupation: null,
            occupationHistory: [], workProgress: 0 };
        state.mechanics!.people[id] = { ...newPersonaMechanics(), dominantLegacy: { ...birth.dominantLegacy } };
        home.memberIds.push(id);
        for (const family of Object.values(state.families))
            if (family.memberIds.includes(mother.id) || family.memberIds.includes(birth.fatherId))
                family.memberIds.push(id);
        const info = state.mechanics!.people[mother.id];
        for (const [otherId, otherCare] of Object.entries(state.mechanics!.people))
            if (otherCare.caregiverId === mother.id) assignCaregiver(state, otherId, null, false, emit);
        info.lastBirthWinter = state.time.winter;
        info.childcareUntilWinter = state.time.winter + state.mechanics!.config.childcareWinters;
        info.childcareUntilTick = state.time.tick;
        emit('ChildBorn', id, { participants: [birth.fatherId, mother.id, id],
            parentIds: [birth.fatherId, mother.id], name: birth.name, dna: structuredClone(dna) });
        delivered = true;
        return false;
    });
    return delivered;
}
