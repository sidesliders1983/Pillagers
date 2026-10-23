import type { Occupation, SimulationState } from './SimulationCore';
import { personaAway } from './WorldExpeditions';
import { personaAge } from './PersonaAge';
import { eventFacts } from './EventFacts';

export const equipmentItems = ['woodenSpear', 'woodenShield', 'leatherShield'] as const;
export type EquipmentItem = typeof equipmentItems[number];
export type Weapon = 'woodenSpear' | null;
export type Shield = 'woodenShield' | 'leatherShield' | null;
export type PersonalEquipment = { weapon: Weapon; shield: Shield };
export const equipmentLabels: Record<EquipmentItem, string> = {
    woodenSpear: 'Wooden Spear', woodenShield: 'Wooden Shield',
    leatherShield: 'Leather-reinforced Shield',
};
export type Recipe = { materials: number; hides: number; unitsPerWinter: number };
export type SmitheryConfig = {
    recipes: Record<EquipmentItem, Recipe>;
    maximumTarget: number;
    spearBonusBps: number;
    woodenShieldProtectionBps: number;
    leatherShieldProtectionBps: number;
};
/** #221 coefficients approved after matched-seed review; saved campaigns retain their own rules. */
export const defaultSmitheryConfig: SmitheryConfig = {
    recipes: {
        woodenSpear: { materials: 2, hides: 0, unitsPerWinter: 4 },
        woodenShield: { materials: 3, hides: 0, unitsPerWinter: 4 },
        leatherShield: { materials: 3, hides: 1, unitsPerWinter: 2 },
    },
    maximumTarget: 20, spearBonusBps: 1000,
    woodenShieldProtectionBps: 2500, leatherShieldProtectionBps: 4000,
};
export interface SmitheryState {
    version: 1;
    config: SmitheryConfig;
    stored: Record<EquipmentItem, number>;
    targets: Record<EquipmentItem, number>;
    assignments: Record<string, PersonalEquipment>;
}
export interface PillageEquipment {
    version: 1;
    baseSuccessBps: number;
    baseCasualtyBps: number;
    spearBonusBps: number;
    woodenShieldProtectionBps: number;
    leatherShieldProtectionBps: number;
    successBps: number;
    members: (PersonalEquipment & { personaId: string; name: string; casualtyBps: number })[];
}
export type EquipmentResult = {
    returned: PillageEquipment['members']; lost: PillageEquipment['members'];
};
export type SmitheryCommand =
    { type: 'SetSmitheryTarget'; item: EquipmentItem; target: number } |
    { type: 'AssignEquipment'; personaId: string; slot: 'weapon'; item: Weapon } |
    { type: 'AssignEquipment'; personaId: string; slot: 'shield'; item: Shield };

const emptyCounts = (): Record<EquipmentItem, number> =>
    ({ woodenSpear: 0, woodenShield: 0, leatherShield: 0 });
export function initializeSmithery(): SmitheryState {
    return { version: 1, config: structuredClone(defaultSmitheryConfig),
        stored: emptyCounts(), targets: emptyCounts(), assignments: {} };
}
export function craftingOccupation(role: Occupation | null): boolean {
    return role === 'smith' || role === 'leatherAndJewelleryMaker';
}
export function equipmentFor(state: SimulationState, personaId: string): PersonalEquipment {
    return { ...(state.smithery?.assignments[personaId] ?? { weapon: null, shield: null }) };
}
export function equipmentOwned(state: SimulationState, item: EquipmentItem): number {
    return (state.smithery?.stored[item] ?? 0) + Object.values(state.smithery?.assignments ?? {})
        .filter(gear => gear.weapon === item || gear.shield === item).length;
}
function record(state: SimulationState, type: string, details: Record<string, unknown>, personaId?: string) {
    state.events.push({ id: `event-${state.events.length + 1}`, time: { ...state.time }, type,
        ...(personaId ? { personaId } : {}), details: eventFacts(state, details, personaId) });
}
function affordable(state: SimulationState, item: EquipmentItem): string | null {
    const recipe = state.smithery!.config.recipes[item];
    if (state.stocks.materials < recipe.materials) return 'missing-materials';
    if ((state.specialistStocks?.hides ?? 0) < recipe.hides) return 'missing-hides';
    return null;
}
/** Targets count all clan-owned items, including those worn or carried away. */
export function craftingOffer(state: SimulationState, role: Occupation | null) {
    if (!state.smithery || !craftingOccupation(role))
        return { item: null, unitsPerWinter: 0, reason: 'inactive-role' } as const;
    const items = equipmentItems.filter(item =>
        (item === 'leatherShield') === (role === 'leatherAndJewelleryMaker'));
    const needed = items.filter(item => equipmentOwned(state, item) < state.smithery!.targets[item]);
    const item = needed.find(item => !affordable(state, item));
    return item ? { item, unitsPerWinter: state.smithery.config.recipes[item].unitsPerWinter, reason: null } :
        { item: null, unitsPerWinter: 0, reason: needed.length ? affordable(state, needed[0]) : 'target-reached' };
}
/** Called by the ordinary work loop, using its aptitude, care, age and building modifiers. */
export function stepSmitheryWork(state: SimulationState, personaId: string, productivityBps: number) {
    const person = state.personas[personaId], smithery = state.smithery!;
    const offer = craftingOffer(state, person.occupation), produced: Record<string, unknown>[] = [];
    if (!offer.item || productivityBps === 0) return produced;
    const workPerUnit = state.mechanics!.config.workPerUnit;
    person.workProgress += offer.unitsPerWinter * productivityBps;
    while (person.workProgress >= workPerUnit) {
        const next = craftingOffer(state, person.occupation);
        if (!next.item) break;
        const recipe = smithery.config.recipes[next.item];
        state.stocks.materials -= recipe.materials;
        if (recipe.hides) state.specialistStocks!.hides -= recipe.hides;
        smithery.stored[next.item]++;
        person.workProgress -= workPerUnit;
        produced.push({ item: next.item, itemName: equipmentLabels[next.item], units: 1,
            materials: recipe.materials, hides: recipe.hides, creatorId: personaId,
            creatorName: person.name, occupation: person.occupation });
    }
    // Completed work cannot be banked as unpaid whole items after a target or input runs out.
    person.workProgress %= workPerUnit;
    state.mechanics!.people[personaId].progress[person.occupation!] = person.workProgress;
    return produced;
}
export function applySmitheryCommand(state: SimulationState, command: SmitheryCommand): void {
    if (!state.mechanics) throw new Error('Smithery requires a gameplay campaign.');
    if (command.type === 'SetSmitheryTarget') {
        const config = state.smithery?.config ?? defaultSmitheryConfig;
        if (!equipmentItems.includes(command.item) || !Number.isSafeInteger(command.target) ||
            command.target < 0 || command.target > config.maximumTarget)
            throw new Error(`Choose a whole stock target from 0 to ${config.maximumTarget}.`);
        const smithery = state.smithery ??= initializeSmithery();
        if (smithery.targets[command.item] === command.target) return;
        smithery.targets[command.item] = command.target;
        record(state, 'EquipmentTargetSet', { item: command.item,
            itemName: equipmentLabels[command.item], target: command.target });
        return;
    }
    const person = state.personas[command.personaId];
    if (!person || person.deathWinter !== null ||
        personaAge(state, person.id) < state.mechanics.config.workAge)
        throw new Error('Choose a living resident of expedition age.');
    if (personaAway(state, person.id)) throw new Error('Equipment can only be changed while the resident is home.');
    if (command.slot !== 'weapon' && command.slot !== 'shield' ||
        command.slot === 'weapon' && command.item !== null && command.item !== 'woodenSpear' ||
        command.slot === 'shield' && command.item !== null &&
            command.item !== 'woodenShield' && command.item !== 'leatherShield')
        throw new Error('Choose equipment for the matching Weapon or Shield slot.');
    const gear = equipmentFor(state, person.id), previous = gear[command.slot];
    if (previous === command.item) return;
    if (command.item && (state.smithery?.stored[command.item] ?? 0) < 1)
        throw new Error(`No stored ${equipmentLabels[command.item]} is available. Craft one or unequip it at home.`);
    const smithery = state.smithery ??= initializeSmithery();
    if (previous) smithery.stored[previous]++;
    if (command.item) smithery.stored[command.item]--;
    smithery.assignments[person.id] = { ...gear, [command.slot]: command.item };
    if (!smithery.assignments[person.id].weapon && !smithery.assignments[person.id].shield)
        delete smithery.assignments[person.id];
    record(state, 'EquipmentAssigned', { name: person.name, slot: command.slot,
        item: command.item, itemName: command.item ? equipmentLabels[command.item] : 'None',
        previousItem: previous }, person.id);
}
/** Clan property stays at home on transfer; an expedition death permanently loses carried gear. */
export function releaseEquipment(
    state: SimulationState,
    personaId: string,
    reason: 'death' | 'transfer',
    expeditionMissionId?: string,
) {
    const gear = state.smithery?.assignments[personaId];
    if (!gear) return;
    // Physical missions are already Returned when their casualties are resolved.
    const lost = reason === 'death' && (expeditionMissionId !== undefined || personaAway(state, personaId));
    const mission = Object.values(state.world?.missions ?? {}).find(m =>
        m.status === 'Away' && m.memberIds.includes(personaId)) ??
        Object.values(state.world?.spatial?.missions ?? {}).find(m =>
            m.status !== 'Prepared' && m.status !== 'Returned' && m.memberIds.includes(personaId));
    const items = [gear.weapon, gear.shield].filter((item): item is EquipmentItem => item !== null);
    if (!lost) for (const item of items) state.smithery!.stored[item]++;
    delete state.smithery!.assignments[personaId];
    record(state, lost ? 'EquipmentLost' : 'EquipmentRecovered', {
        name: state.personas[personaId].name, items, itemNames: items.map(item => equipmentLabels[item]),
        reason, missionId: expeditionMissionId ?? mission?.id ?? null,
    }, personaId);
}
function protectedRisk(base: number, shield: Shield, rules: Pick<SmitheryConfig,
    'woodenShieldProtectionBps' | 'leatherShieldProtectionBps'>) {
    const protection = shield === 'woodenShield' ? rules.woodenShieldProtectionBps :
        shield === 'leatherShield' ? rules.leatherShieldProtectionBps : 0;
    return Math.floor(base * (10000 - protection) / 10000);
}
export function pillageEquipment(state: SimulationState, members: readonly string[],
    baseSuccessBps: number, baseCasualtyBps: number): PillageEquipment | undefined {
    if (!state.smithery) return undefined;
    const rules = state.smithery.config;
    const crew = members.map(personaId => {
        const gear = equipmentFor(state, personaId);
        return { personaId, name: state.personas[personaId].name, ...gear,
            casualtyBps: protectedRisk(baseCasualtyBps, gear.shield, rules) };
    });
    return { version: 1, baseSuccessBps, baseCasualtyBps, spearBonusBps: rules.spearBonusBps,
        woodenShieldProtectionBps: rules.woodenShieldProtectionBps,
        leatherShieldProtectionBps: rules.leatherShieldProtectionBps,
        successBps: Math.min(10000, baseSuccessBps + Math.floor(rules.spearBonusBps *
            crew.filter(member => member.weapon === 'woodenSpear').length / Math.max(1, crew.length))),
        members: crew };
}
export function equipmentResult(snapshot: PillageEquipment | undefined, survivors: readonly string[]) {
    return snapshot ? { returned: structuredClone(snapshot.members.filter(m => survivors.includes(m.personaId))),
        lost: structuredClone(snapshot.members.filter(m => !survivors.includes(m.personaId))) } : undefined;
}
function uint(value: unknown, maximum = Number.MAX_SAFE_INTEGER): asserts value is number {
    if (!Number.isSafeInteger(value) || (value as number) < 0 || (value as number) > maximum)
        throw new Error('Invalid Smithery integer.');
}
function validateSlots(gear: PersonalEquipment) {
    if (!gear || gear.weapon !== null && gear.weapon !== 'woodenSpear' ||
        gear.shield !== null && gear.shield !== 'woodenShield' && gear.shield !== 'leatherShield')
        throw new Error('Invalid personal equipment slots.');
}
export function validatePillageEquipment(snapshot: PillageEquipment | undefined,
    memberIds: readonly string[], successBps: number, casualtyBps: number): void {
    if (snapshot === undefined) return;
    if (!snapshot || snapshot.version !== 1 || !Array.isArray(snapshot.members) ||
        snapshot.members.length !== memberIds.length) throw new Error('Invalid Pillage equipment snapshot.');
    for (const value of [snapshot.baseSuccessBps, snapshot.baseCasualtyBps, snapshot.spearBonusBps,
        snapshot.woodenShieldProtectionBps, snapshot.leatherShieldProtectionBps, snapshot.successBps]) uint(value, 10000);
    snapshot.members.forEach((member, index) => {
        validateSlots(member);
        if (member.personaId !== memberIds[index] || typeof member.name !== 'string' || !member.name.trim() ||
            member.casualtyBps !== protectedRisk(snapshot.baseCasualtyBps, member.shield, snapshot))
            throw new Error('Invalid Pillage member snapshot.');
    });
    const expected = Math.min(10000, snapshot.baseSuccessBps + Math.floor(snapshot.spearBonusBps *
        snapshot.members.filter(m => m.weapon === 'woodenSpear').length / Math.max(1, memberIds.length)));
    if (snapshot.successBps !== expected || successBps !== expected || casualtyBps !== snapshot.baseCasualtyBps)
        throw new Error('Pillage probabilities do not match the dispatched equipment.');
}
export function validateSmithery(state: SimulationState): void {
    const smithery = state.smithery;
    if (smithery === undefined) {
        if (Object.values(state.world?.missions ?? {}).some(mission => mission.equipment) ||
            Object.values(state.world?.spatial?.missions ?? {}).some(mission => mission.task?.equipment))
            throw new Error('Pillage equipment requires its saved Smithery inventory.');
        return;
    }
    if (!smithery || smithery.version !== 1 || !state.mechanics || !smithery.config ||
        !smithery.stored || !smithery.targets || !smithery.assignments)
        throw new Error('Invalid Smithery state.');
    const rules = smithery.config;
    for (const values of [smithery.stored, smithery.targets, rules.recipes]) {
        if (!values || Object.keys(values).sort().join(',') !== [...equipmentItems].sort().join(','))
            throw new Error('Invalid Smithery item catalogue.');
    }
    uint(rules.maximumTarget, 100); uint(rules.spearBonusBps, 2500);
    uint(rules.woodenShieldProtectionBps, 7500); uint(rules.leatherShieldProtectionBps, 7500);
    if (!rules.maximumTarget || rules.leatherShieldProtectionBps < rules.woodenShieldProtectionBps)
        throw new Error('Invalid Smithery limits.');
    for (const item of equipmentItems) {
        const recipe = rules.recipes?.[item];
        if (!recipe) throw new Error('Missing Smithery recipe.');
        uint(recipe.materials, 100); uint(recipe.hides, 100); uint(recipe.unitsPerWinter, 1000);
        if (!recipe.materials || !recipe.unitsPerWinter ||
            (item === 'leatherShield') !== (recipe.hides > 0)) throw new Error('Invalid Smithery recipe.');
        uint(smithery.stored[item]); uint(smithery.targets[item], rules.maximumTarget);
        uint(equipmentOwned(state, item));
    }
    for (const [id, gear] of Object.entries(smithery.assignments)) {
        validateSlots(gear);
        if (!state.personas[id] || state.personas[id].deathWinter !== null ||
            personaAge(state, id) < state.mechanics.config.workAge ||
            !gear.weapon && !gear.shield || Object.keys(gear).length !== 2)
            throw new Error('Equipment requires a living current owner.');
    }
    const missions = [
        ...Object.values(state.world?.missions ?? {}).map(mission => ({
            snapshot: mission.equipment, status: mission.status, result: mission.result,
            memberIds: mission.memberIds, successBps: mission.successBps, casualtyBps: mission.casualtyBps,
        })),
        ...Object.values(state.world?.spatial?.missions ?? {}).flatMap(mission => mission.task ? [{
            snapshot: mission.task.equipment, status: mission.status, result: mission.task.result,
            memberIds: mission.memberIds, successBps: mission.task.successBps, casualtyBps: mission.task.casualtyBps,
        }] : []),
    ];
    for (const mission of missions) {
        if (!mission.snapshot) continue;
        validatePillageEquipment(mission.snapshot, mission.memberIds, mission.successBps, mission.casualtyBps);
        if (mission.status !== 'Returned') {
            for (const member of mission.snapshot.members) {
                if (state.personas[member.personaId]?.deathWinter !== null) continue;
                const current = equipmentFor(state, member.personaId);
                if (current.weapon !== member.weapon || current.shield !== member.shield)
                    throw new Error('Away equipment does not match the dispatched owner.');
            }
        } else if (!mission.result || !mission.result.equipment ||
            outcomeKey(mission.result.equipment) !== outcomeKey(equipmentResult(mission.snapshot, mission.result.survivorIds)!))
            throw new Error('Returned equipment does not match the dispatched snapshot.');
    }
}

function outcomeKey(result: EquipmentResult): string {
    if (!Array.isArray(result.returned) || !Array.isArray(result.lost))
        throw new Error('Invalid equipment result.');
    return JSON.stringify([result.returned, result.lost].map(members => members.map(member =>
        [member.personaId, member.name, member.weapon, member.shield, member.casualtyBps])));
}
