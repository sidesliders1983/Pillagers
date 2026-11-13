import type { Occupation, SimulationState } from './SimulationCore';
import { personaAway } from './WorldExpeditions';
import { personaAge } from './PersonaAge';
import { eventFacts } from './EventFacts';
import { territorialDuty } from './ResidentPresence';
import { miningBusy } from './Mining';
import { metalworkingItems, prototypeMetalworkingConfig, validateMetalworkingLedger,
    type MetalworkingAdoption } from './Metalworking';
export { prototypeMetalworkingConfig } from './Metalworking';
import { personalArmorItems, prototypePersonalArmorConfig, wearingPersonalArmor,
    assertPersonalArmorCombination, protectedPersonalRisk, validatePersonalArmorLedger,
    type BodyArmor, type Headgear, type PersonalArmorAdoption, type PersonalArmorRules } from './PersonalArmor';
export { prototypePersonalArmorConfig } from './PersonalArmor';
export type { BodyArmor, Headgear } from './PersonalArmor';

export const legacyEquipmentItems = ['woodenSpear', 'woodenShield', 'leatherShield'] as const;
export const metalworkingEquipmentItems = [...legacyEquipmentItems, ...metalworkingItems] as const;
export const equipmentItems = [...metalworkingEquipmentItems, ...personalArmorItems] as const;
type LegacyEquipmentItem = typeof legacyEquipmentItems[number];
export type EquipmentCounts = Record<LegacyEquipmentItem, number> & Partial<Record<EquipmentItem, number>>;
export type EquipmentItem = typeof equipmentItems[number];
export type Weapon = 'woodenSpear' | 'ironSpear' | null;
export type Shield = 'woodenShield' | 'leatherShield' | 'ironShield' | null;
export type PersonalEquipment = { weapon: Weapon; shield: Shield; bodyArmor?: BodyArmor; headgear?: Headgear };
export const equipmentLabels: Record<EquipmentItem, string> = {
    woodenSpear: 'Wooden Spear', woodenShield: 'Wooden Shield',
    leatherShield: 'Leather-reinforced Shield',
    ironSpear: 'Iron-tipped Spear', ironShield: 'Iron-reinforced Shield',
    leatherBodyArmor: 'Leather Body Armor', ironHelmet: 'Iron Helmet',
};
export type Recipe = { materials: number; hides: number; unitsPerWinter: number; ironOre?: number };
export type SmitheryConfig = PersonalArmorRules & {
    recipes: Record<LegacyEquipmentItem, Recipe> & Partial<Record<EquipmentItem, Recipe>>;
    maximumTarget: number;
    spearBonusBps: number;
    woodenShieldProtectionBps: number;
    leatherShieldProtectionBps: number;
    ironSpearBonusBps?: number;
    ironShieldProtectionBps?: number;
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
    version: 1 | 2 | 3;
    metalworking?: MetalworkingAdoption;
    personalArmor?: PersonalArmorAdoption;
    config: SmitheryConfig;
    stored: EquipmentCounts;
    targets: EquipmentCounts;
    assignments: Record<string, PersonalEquipment>;
}
export interface PillageEquipment extends PersonalArmorRules {
    version: 1 | 2 | 3;
    baseSuccessBps: number;
    baseCasualtyBps: number;
    spearBonusBps: number;
    woodenShieldProtectionBps: number;
    leatherShieldProtectionBps: number;
    ironSpearBonusBps?: number;
    ironShieldProtectionBps?: number;
    successBps: number;
    members: (PersonalEquipment & { personaId: string; name: string; casualtyBps: number })[];
}
export type EquipmentResult = {
    returned: PillageEquipment['members']; lost: PillageEquipment['members'];
};
export type SmitheryCommand =
    { type: 'SetSmitheryTarget'; item: EquipmentItem; target: number } |
    { type: 'AssignEquipment'; personaId: string; slot: 'weapon'; item: Weapon } |
    { type: 'AssignEquipment'; personaId: string; slot: 'shield'; item: Shield } |
    { type: 'AssignEquipment'; personaId: string; slot: 'bodyArmor'; item: BodyArmor } |
    { type: 'AssignEquipment'; personaId: string; slot: 'headgear'; item: Headgear };

const emptyCounts = (): EquipmentCounts =>
    ({ woodenSpear: 0, woodenShield: 0, leatherShield: 0 });
export function initializeSmithery(): SmitheryState {
    return { version: 1, config: structuredClone(defaultSmitheryConfig),
        stored: emptyCounts(), targets: emptyCounts(), assignments: {} };
}
/** Saved versions select their actual catalogue; loading never fabricates an adoption. */
export function equipmentItemsFor(state: Pick<SimulationState, 'smithery'>): readonly EquipmentItem[] {
    return state.smithery?.version === 3 ? equipmentItems :
        state.smithery?.version === 2 ? metalworkingEquipmentItems : legacyEquipmentItems;
}
export function equipmentRecipe(state: Pick<SimulationState, 'smithery'>, item: EquipmentItem): Recipe {
    const recipe = state.smithery?.config.recipes[item] ?? defaultSmitheryConfig.recipes[item] ??
        prototypeMetalworkingConfig.recipes[item as keyof typeof prototypeMetalworkingConfig.recipes] ??
        prototypePersonalArmorConfig.recipes[item as keyof typeof prototypePersonalArmorConfig.recipes];
    if (!recipe) throw new Error('Unknown equipment recipe.');
    return recipe;
}
function adoptMetalworking(state: SimulationState): SmitheryState {
    const smithery = state.smithery ??= initializeSmithery();
    if (smithery.version >= 2) return smithery;
    smithery.version = 2;
    Object.assign(smithery.config.recipes, structuredClone(prototypeMetalworkingConfig.recipes));
    smithery.config.ironSpearBonusBps = prototypeMetalworkingConfig.ironSpearBonusBps;
    smithery.config.ironShieldProtectionBps = prototypeMetalworkingConfig.ironShieldProtectionBps;
    for (const item of metalworkingItems) { smithery.stored[item] = 0; smithery.targets[item] = 0; }
    record(state, 'MetalworkingAdopted', { metalworkingVersion: 1, clanId: state.clan.id });
    smithery.metalworking = { version: 1, eventId: state.events.at(-1)!.id,
        adoptedAt: state.time.winter * state.ticksPerWinter + state.time.tick };
    return smithery;
}
function adoptPersonalArmor(state: SimulationState): SmitheryState {
    const smithery = adoptMetalworking(state);
    if (smithery.version === 3) return smithery;
    smithery.version = 3;
    Object.assign(smithery.config.recipes, structuredClone(prototypePersonalArmorConfig.recipes));
    smithery.config.leatherBodyArmorProtectionBps = prototypePersonalArmorConfig.leatherBodyArmorProtectionBps;
    smithery.config.ironHelmetProtectionBps = prototypePersonalArmorConfig.ironHelmetProtectionBps;
    smithery.config.maximumPersonalProtectionBps = prototypePersonalArmorConfig.maximumPersonalProtectionBps;
    for (const item of personalArmorItems) { smithery.stored[item] = 0; smithery.targets[item] = 0; }
    const openingHides = state.specialistStocks?.hides ?? 0;
    record(state, 'PersonalArmorAdopted', { personalArmorVersion: 1, clanId: state.clan.id, openingHides });
    smithery.personalArmor = { version: 1, eventId: state.events.at(-1)!.id, openingHides,
        adoptedAt: state.time.winter * state.ticksPerWinter + state.time.tick };
    return smithery;
}
export function craftingOccupation(role: Occupation | null): boolean {
    return role === 'smith' || role === 'leatherAndJewelleryMaker';
}
export function equipmentFor(state: SimulationState, personaId: string): PersonalEquipment {
    return { ...(state.smithery?.assignments[personaId] ?? { weapon: null, shield: null }) };
}
export function equipmentOwned(state: SimulationState, item: EquipmentItem): number {
    return (state.smithery?.stored[item] ?? 0) + Object.values(state.smithery?.assignments ?? {})
        .filter(gear => [gear.weapon, gear.shield, gear.bodyArmor, gear.headgear].includes(item)).length;
}
function record(state: SimulationState, type: string, details: Record<string, unknown>, personaId?: string) {
    state.events.push({ id: `event-${state.events.length + 1}`, time: { ...state.time }, type,
        ...(personaId ? { personaId } : {}), details: eventFacts(state, details, personaId) });
}
function affordable(state: SimulationState, item: EquipmentItem): string | null {
    const recipe = state.smithery!.config.recipes[item]!;
    if (state.stocks.materials < recipe.materials) return 'missing-materials';
    if ((state.specialistStocks?.hides ?? 0) < recipe.hides) return 'missing-hides';
    if ((state.specialistStocks?.ironOre ?? 0) < (recipe.ironOre ?? 0)) return 'missing-iron-ore';
    return null;
}
/** Targets count all clan-owned items, including those worn or carried away. */
export function craftingOffer(state: SimulationState, role: Occupation | null) {
    if (!state.smithery || !craftingOccupation(role))
        return { item: null, unitsPerWinter: 0, reason: 'inactive-role' } as const;
    const items = equipmentItemsFor(state).filter(item =>
        (item === 'leatherShield' || item === 'leatherBodyArmor') === (role === 'leatherAndJewelleryMaker'));
    const needed = items.filter(item => equipmentOwned(state, item) < (state.smithery!.targets[item] ?? 0));
    const item = needed.find(item => !affordable(state, item));
    return item ? { item, unitsPerWinter: state.smithery.config.recipes[item]!.unitsPerWinter, reason: null } :
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
        const recipe = smithery.config.recipes[next.item]!;
        state.stocks.materials -= recipe.materials;
        if (recipe.hides) state.specialistStocks!.hides -= recipe.hides;
        if (recipe.ironOre) state.specialistStocks!.ironOre! -= recipe.ironOre;
        smithery.stored[next.item] = (smithery.stored[next.item] ?? 0) + 1;
        person.workProgress -= workPerUnit;
        produced.push({ item: next.item, itemName: equipmentLabels[next.item], units: 1,
            materials: recipe.materials, hides: recipe.hides, creatorId: personaId,
            creatorName: person.name, occupation: person.occupation,
            ...(metalworkingItems.includes(next.item as typeof metalworkingItems[number]) ? {
                metalworkingVersion: 1, clanId: state.clan.id, ironOre: recipe.ironOre, recipe: structuredClone(recipe),
            } : {}),
            ...(personalArmorItems.includes(next.item as typeof personalArmorItems[number]) ? {
                personalArmorVersion: 1, clanId: state.clan.id, recipe: structuredClone(recipe),
                ...(recipe.ironOre ? { ironOre: recipe.ironOre } : {}),
            } : {}) });
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
        const smithery = personalArmorItems.includes(command.item as typeof personalArmorItems[number]) ?
            adoptPersonalArmor(state) : metalworkingItems.includes(command.item as typeof metalworkingItems[number]) ?
                adoptMetalworking(state) : state.smithery ??= initializeSmithery();
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
    if (miningBusy(state, person.id))
        throw new Error('Equipment can only be changed after the resident returns from mining.');
    if (territorialDuty(state, person.id))
        throw new Error('Equipment cannot be changed while the resident is on territorial duty.');
    if (!['weapon', 'shield', 'bodyArmor', 'headgear'].includes(command.slot) ||
        command.slot === 'weapon' && command.item !== null && !['woodenSpear', 'ironSpear'].includes(command.item) ||
        command.slot === 'shield' && command.item !== null && !['woodenShield', 'leatherShield', 'ironShield'].includes(command.item) ||
        command.slot === 'bodyArmor' && command.item !== null && command.item !== 'leatherBodyArmor' ||
        command.slot === 'headgear' && command.item !== null && command.item !== 'ironHelmet')
        throw new Error('Choose equipment for the matching Weapon, Shield, Body Armor or Headgear slot.');
    const gear = equipmentFor(state, person.id), previous = gear[command.slot] ?? null;
    if (previous === command.item) return;
    if (command.item && (state.smithery?.stored[command.item] ?? 0) < 1)
        throw new Error(`No stored ${equipmentLabels[command.item]} is available. Craft one or unequip it at home.`);
    const smithery = state.smithery ??= initializeSmithery();
    const nextGear: PersonalEquipment = { ...gear, [command.slot]: command.item };
    if (wearingPersonalArmor(nextGear)) {
        nextGear.bodyArmor ??= null; nextGear.headgear ??= null;
    } else { delete nextGear.bodyArmor; delete nextGear.headgear; }
    assertPersonalArmorCombination(nextGear, equipmentProtection(nextGear.shield, smithery.config), smithery.config);
    if (previous) smithery.stored[previous] = (smithery.stored[previous] ?? 0) + 1;
    if (command.item) smithery.stored[command.item] = smithery.stored[command.item]! - 1;
    smithery.assignments[person.id] = nextGear;
    if (![nextGear.weapon, nextGear.shield, nextGear.bodyArmor, nextGear.headgear].some(Boolean))
        delete smithery.assignments[person.id];
    record(state, 'EquipmentAssigned', { name: person.name, slot: command.slot,
        item: command.item, itemName: command.item ? equipmentLabels[command.item] : 'None',
        previousItem: previous }, person.id);
}
/** Clan property stays home on transfer; mission casualties permanently lose their carried gear. */
export function releaseEquipment(
    state: SimulationState,
    personaId: string,
    reason: 'death' | 'transfer',
    expeditionMissionId?: string,
) {
    const gear = state.smithery?.assignments[personaId];
    if (!gear) return;
    // Legacy physical missions are already Returned at resolution.
    // An explicit mission ID also identifies on-site losses.
    const lost = reason === 'death' && (expeditionMissionId !== undefined || personaAway(state, personaId));
    const mission = Object.values(state.world?.missions ?? {}).find(m =>
        m.status === 'Away' && m.memberIds.includes(personaId)) ??
        Object.values(state.world?.spatial?.missions ?? {}).find(m =>
            m.status !== 'Prepared' && m.status !== 'Returned' && m.memberIds.includes(personaId));
    const items = [gear.weapon, gear.shield, gear.bodyArmor, gear.headgear]
        .filter((item): item is EquipmentItem => item !== null && item !== undefined);
    if (!lost) for (const item of items)
        state.smithery!.stored[item] = (state.smithery!.stored[item] ?? 0) + 1;
    delete state.smithery!.assignments[personaId];
    record(state, lost ? 'EquipmentLost' : 'EquipmentRecovered', {
        name: state.personas[personaId].name, items, itemNames: items.map(item => equipmentLabels[item]),
        reason, missionId: expeditionMissionId ?? mission?.id ?? null,
        ...(items.some(item => item === 'ironSpear' || item === 'ironShield') ?
            { metalworkingVersion: 1, clanId: state.clan.id } : {}),
        ...(items.some(item => item === 'leatherBodyArmor' || item === 'ironHelmet') ?
            { personalArmorVersion: 1, clanId: state.clan.id } : {}),
    }, personaId);
}
export function equipmentSpearBonus(weapon: Weapon, rules: Pick<SmitheryConfig,
    'spearBonusBps' | 'ironSpearBonusBps'>): number {
    return weapon === 'woodenSpear' ? rules.spearBonusBps :
        weapon === 'ironSpear' ? rules.ironSpearBonusBps ?? 0 : 0;
}
export function equipmentProtection(shield: Shield, rules: Pick<SmitheryConfig,
    'woodenShieldProtectionBps' | 'leatherShieldProtectionBps' | 'ironShieldProtectionBps'>): number {
    return shield === 'woodenShield' ? rules.woodenShieldProtectionBps :
        shield === 'leatherShield' ? rules.leatherShieldProtectionBps :
            shield === 'ironShield' ? rules.ironShieldProtectionBps ?? 0 : 0;
}
export function equipmentCasualtyRisk(base: number, gear: PersonalEquipment, rules: Pick<SmitheryConfig,
    'woodenShieldProtectionBps' | 'leatherShieldProtectionBps' | 'ironShieldProtectionBps'> & PersonalArmorRules) {
    return protectedPersonalRisk(base, gear, equipmentProtection(gear.shield, rules), rules);
}
export function pillageEquipment(state: SimulationState, members: readonly string[],
    baseSuccessBps: number, baseCasualtyBps: number): PillageEquipment | undefined {
    if (!state.smithery) return undefined;
    const rules = state.smithery.config;
    const crew = members.map(personaId => {
        const gear = equipmentFor(state, personaId);
        return { personaId, name: state.personas[personaId].name, ...gear,
            casualtyBps: equipmentCasualtyRisk(baseCasualtyBps, gear, rules) };
    });
    const hasIron = crew.some(member => member.weapon === 'ironSpear' || member.shield === 'ironShield');
    const hasArmor = crew.some(wearingPersonalArmor);
    return { version: hasArmor ? 3 : hasIron ? 2 : 1, baseSuccessBps, baseCasualtyBps, spearBonusBps: rules.spearBonusBps,
        woodenShieldProtectionBps: rules.woodenShieldProtectionBps,
        leatherShieldProtectionBps: rules.leatherShieldProtectionBps,
        ...(hasIron || hasArmor ? { ironSpearBonusBps: rules.ironSpearBonusBps,
            ironShieldProtectionBps: rules.ironShieldProtectionBps } : {}),
        ...(hasArmor ? { leatherBodyArmorProtectionBps: rules.leatherBodyArmorProtectionBps,
            ironHelmetProtectionBps: rules.ironHelmetProtectionBps,
            maximumPersonalProtectionBps: rules.maximumPersonalProtectionBps } : {}),
        successBps: Math.min(10000, baseSuccessBps + Math.floor(crew.reduce((sum, member) =>
            sum + equipmentSpearBonus(member.weapon, rules), 0) / Math.max(1, crew.length))),
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
function validateSlots(gear: PersonalEquipment, allowIron = false, allowArmor = false) {
    if (!gear || gear.weapon !== null && gear.weapon !== 'woodenSpear' &&
        !(allowIron && gear.weapon === 'ironSpear') || gear.shield !== null &&
        gear.shield !== 'woodenShield' && gear.shield !== 'leatherShield' &&
        !(allowIron && gear.shield === 'ironShield'))
        throw new Error('Invalid personal equipment slots.');
    if (!allowArmor && (gear.bodyArmor !== undefined || gear.headgear !== undefined) ||
        allowArmor && (gear.bodyArmor !== undefined && gear.bodyArmor !== null && gear.bodyArmor !== 'leatherBodyArmor' ||
            gear.headgear !== undefined && gear.headgear !== null && gear.headgear !== 'ironHelmet') ||
        wearingPersonalArmor(gear) && (gear.bodyArmor === undefined || gear.headgear === undefined))
        throw new Error('Invalid personal armor slots.');
}
export function validatePillageEquipment(snapshot: PillageEquipment | undefined,
    memberIds: readonly string[], successBps: number, casualtyBps: number): void {
    if (snapshot === undefined) return;
    if (!snapshot || ![1, 2, 3].includes(snapshot.version) || !Array.isArray(snapshot.members) ||
        snapshot.members.length !== memberIds.length) throw new Error('Invalid Pillage equipment snapshot.');
    for (const value of [snapshot.baseSuccessBps, snapshot.baseCasualtyBps, snapshot.spearBonusBps,
        snapshot.woodenShieldProtectionBps, snapshot.leatherShieldProtectionBps, snapshot.successBps]) uint(value, 10000);
    if (snapshot.version >= 2) {
        uint(snapshot.ironSpearBonusBps, 2500); uint(snapshot.ironShieldProtectionBps, 7500);
        if (snapshot.version === 2 && !snapshot.members.some(member => member.weapon === 'ironSpear' || member.shield === 'ironShield'))
            throw new Error('An iron snapshot requires actual dispatched iron equipment.');
    } else if (snapshot.ironSpearBonusBps !== undefined || snapshot.ironShieldProtectionBps !== undefined)
        throw new Error('Historical equipment cannot acquire iron coefficients.');
    if (snapshot.version === 3) {
        uint(snapshot.leatherBodyArmorProtectionBps, 6000); uint(snapshot.ironHelmetProtectionBps, 6000);
        uint(snapshot.maximumPersonalProtectionBps, 6000);
        if (!snapshot.members.some(wearingPersonalArmor)) throw new Error('An armor snapshot requires actual personal armor.');
    } else if (snapshot.leatherBodyArmorProtectionBps !== undefined || snapshot.ironHelmetProtectionBps !== undefined ||
        snapshot.maximumPersonalProtectionBps !== undefined) throw new Error('Historical snapshots cannot acquire armor rules.');
    snapshot.members.forEach((member, index) => {
        validateSlots(member, snapshot.version >= 2, snapshot.version === 3);
        if (member.personaId !== memberIds[index] || typeof member.name !== 'string' || !member.name.trim() ||
            member.casualtyBps !== equipmentCasualtyRisk(snapshot.baseCasualtyBps, member, snapshot))
            throw new Error('Invalid Pillage member snapshot.');
    });
    const expected = Math.min(10000, snapshot.baseSuccessBps + Math.floor(snapshot.members.reduce((sum, member) =>
        sum + equipmentSpearBonus(member.weapon, snapshot), 0) / Math.max(1, memberIds.length)));
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
    if (!smithery || ![1, 2, 3].includes(smithery.version) || !state.mechanics || !smithery.config ||
        !smithery.stored || !smithery.targets || !smithery.assignments)
        throw new Error('Invalid Smithery state.');
    const rules = smithery.config, catalogue = equipmentItemsFor(state);
    for (const values of [smithery.stored, smithery.targets, rules.recipes]) {
        if (!values || Object.keys(values).sort().join(',') !== [...catalogue].sort().join(','))
            throw new Error('Invalid Smithery item catalogue.');
    }
    uint(rules.maximumTarget, 100); uint(rules.spearBonusBps, 2500);
    uint(rules.woodenShieldProtectionBps, 7500); uint(rules.leatherShieldProtectionBps, 7500);
    if (!rules.maximumTarget || rules.leatherShieldProtectionBps < rules.woodenShieldProtectionBps)
        throw new Error('Invalid Smithery limits.');
    if (smithery.version >= 2) {
        uint(rules.ironSpearBonusBps, 2500); uint(rules.ironShieldProtectionBps, 7500);
        // Preserve custom saved wooden/leather coefficients; adoption cannot silently rewrite them.
    } else if (smithery.metalworking || rules.ironSpearBonusBps !== undefined ||
        rules.ironShieldProtectionBps !== undefined) throw new Error('Historical Smithery cannot acquire iron rules.');
    if (smithery.version === 3) {
        uint(rules.leatherBodyArmorProtectionBps, 6000); uint(rules.ironHelmetProtectionBps, 6000);
        uint(rules.maximumPersonalProtectionBps, 6000);
    } else if (smithery.personalArmor || rules.leatherBodyArmorProtectionBps !== undefined ||
        rules.ironHelmetProtectionBps !== undefined || rules.maximumPersonalProtectionBps !== undefined)
        throw new Error('Historical Smithery cannot acquire personal armor rules.');
    for (const item of catalogue) {
        const recipe = rules.recipes?.[item];
        if (!recipe) throw new Error('Missing Smithery recipe.');
        uint(recipe.materials, 100); uint(recipe.hides, 100); uint(recipe.unitsPerWinter, 1000);
        if (!recipe.materials || !recipe.unitsPerWinter ||
            (item === 'leatherShield' || item === 'leatherBodyArmor') !== (recipe.hides > 0) ||
            (metalworkingItems.includes(item as typeof metalworkingItems[number]) || item === 'ironHelmet' ?
                !Number.isSafeInteger(recipe.ironOre) || recipe.ironOre! < 1 || recipe.ironOre! > 100 :
                recipe.ironOre !== undefined)) throw new Error('Invalid Smithery recipe.');
        uint(smithery.stored[item]); uint(smithery.targets[item], rules.maximumTarget);
        uint(equipmentOwned(state, item));
    }
    for (const [id, gear] of Object.entries(smithery.assignments)) {
        validateSlots(gear, smithery.version >= 2, smithery.version === 3);
        assertPersonalArmorCombination(gear, equipmentProtection(gear.shield, rules), rules);
        if (!state.personas[id] || state.personas[id].deathWinter !== null ||
            personaAge(state, id) < state.mechanics.config.workAge ||
            !gear.weapon && !gear.shield && !wearingPersonalArmor(gear) ||
            Object.keys(gear).length !== (wearingPersonalArmor(gear) ? 4 : 2))
            throw new Error('Equipment requires a living current owner.');
    }
    validateMetalworkingLedger(state);
    validatePersonalArmorLedger(state);
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
                if (current.weapon !== member.weapon || current.shield !== member.shield ||
                    (current.bodyArmor ?? null) !== (member.bodyArmor ?? null) ||
                    (current.headgear ?? null) !== (member.headgear ?? null))
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
        [member.personaId, member.name, member.weapon, member.shield, member.bodyArmor ?? null,
            member.headgear ?? null, member.casualtyBps])));
}
