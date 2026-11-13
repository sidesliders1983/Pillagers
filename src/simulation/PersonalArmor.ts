import type { SimulationState } from './SimulationCore';

export const personalArmorItems = ['leatherBodyArmor', 'ironHelmet'] as const;
export type PersonalArmorItem = typeof personalArmorItems[number];
export type BodyArmor = 'leatherBodyArmor' | null;
export type Headgear = 'ironHelmet' | null;
export interface PersonalArmorAdoption {
    version: 1;
    eventId: string;
    adoptedAt: number;
    openingHides: number;
}
export interface PersonalArmorRules {
    leatherBodyArmorProtectionBps?: number;
    ironHelmetProtectionBps?: number;
    maximumPersonalProtectionBps?: number;
}
/** Owner-approved playtest, 13 November 2026; no load-time catalogue adoption or item grants. */
export const prototypePersonalArmorConfig = Object.freeze({
    version: 1 as const,
    recipes: {
        leatherBodyArmor: { materials: 3, hides: 2, unitsPerWinter: 1 },
        ironHelmet: { materials: 3, hides: 0, ironOre: 2, unitsPerWinter: 1 },
    },
    leatherBodyArmorProtectionBps: 2000,
    ironHelmetProtectionBps: 1000,
    maximumPersonalProtectionBps: 6000,
});

const isArmor = (item: unknown): item is PersonalArmorItem => personalArmorItems.includes(item as PersonalArmorItem);
const uint = (value: unknown, maximum = Number.MAX_SAFE_INTEGER): value is number =>
    Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) <= maximum;
const tick = (state: SimulationState, time: { winter: number; tick: number }) =>
    time.winter * state.ticksPerWinter + time.tick;
function fail(): never { throw new Error('Invalid saved personal armor provenance.'); }
export const wearingPersonalArmor = (gear: { bodyArmor?: BodyArmor; headgear?: Headgear }) =>
    gear.bodyArmor === 'leatherBodyArmor' || gear.headgear === 'ironHelmet';

/** Unsupported custom shield policies are rejected; an old shield-only loadout keeps its exact rules. */
export function assertPersonalArmorCombination(gear: { bodyArmor?: BodyArmor; headgear?: Headgear },
    shieldProtectionBps: number, rules: PersonalArmorRules): void {
    if (wearingPersonalArmor(gear) && shieldProtectionBps > rules.maximumPersonalProtectionBps!)
        throw new Error('Remove the shield first: its saved protection exceeds the personal armor limit.');
}

/** One product floor, with a conservative ceiling on the minimum risk allowed by the cap. */
export function protectedPersonalRisk(base: number, gear: { bodyArmor?: BodyArmor; headgear?: Headgear },
    shieldProtectionBps: number, rules: PersonalArmorRules): number {
    if (!wearingPersonalArmor(gear)) return Math.floor(base * (10000 - shieldProtectionBps) / 10000);
    assertPersonalArmorCombination(gear, shieldProtectionBps, rules);
    const body = gear.bodyArmor === 'leatherBodyArmor' ? rules.leatherBodyArmorProtectionBps! : 0;
    const helmet = gear.headgear === 'ironHelmet' ? rules.ironHelmetProtectionBps! : 0;
    const remaining = BigInt(10000 - shieldProtectionBps) * BigInt(10000 - body) * BigInt(10000 - helmet);
    const combined = Number(BigInt(base) * remaining / 1000000000000n);
    return Math.max(combined, Math.ceil(base * (10000 - rules.maximumPersonalProtectionBps!) / 10000));
}
export function personalArmorOreSpent(state: SimulationState): number {
    if (state.smithery?.version !== 3) return 0;
    return state.events.filter(event => event.type === 'EquipmentCrafted' && event.details?.item === 'ironHelmet')
        .reduce((sum, event) => sum + Number(event.details!.ironOre), 0);
}

/** Preserve the opening specialist stock, then reconcile only prospective paid receipts. */
export function validatePersonalArmorLedger(state: SimulationState): void {
    const smithery = state.smithery;
    if (smithery?.version !== 3) return;
    const adoption = smithery.personalArmor;
    const index = adoption && state.events.findIndex(event => event.id === adoption.eventId);
    const adopted = index !== undefined && index >= 0 ? state.events[index] : undefined;
    if (!adoption || adoption.version !== 1 || !uint(adoption.adoptedAt) || !uint(adoption.openingHides) ||
        !adopted || adopted.type !== 'PersonalArmorAdopted' || adopted.details?.personalArmorVersion !== 1 ||
        adopted.details?.openingHides !== adoption.openingHides || adopted.details?.clanId !== state.clan.id ||
        tick(state, adopted.time) !== adoption.adoptedAt || adoption.adoptedAt > tick(state, state.time)) fail();
    const produced = { leatherBodyArmor: 0, ironHelmet: 0 }, lost = { leatherBodyArmor: 0, ironHelmet: 0 };
    let hides = adoption.openingHides;
    for (const [eventIndex, event] of state.events.entries()) {
        const details = event.details;
        if (event.type === 'EquipmentCrafted' && isArmor(details?.item)) {
            const item = details!.item as PersonalArmorItem;
            const creator = event.personaId && (state.personas[event.personaId] ?? state.personaArchive?.[event.personaId]);
            const recipe = details!.recipe as { materials: number; hides: number; ironOre?: number; unitsPerWinter: number };
            const role = item === 'leatherBodyArmor' ? 'leatherAndJewelleryMaker' : 'smith';
            const at = tick(state, event.time);
            if (eventIndex <= index! || !creator || details!.creatorId !== event.personaId ||
                details!.creatorName !== creator.name || details!.occupation !== role ||
                details!.clanId !== state.clan.id || details!.personalArmorVersion !== 1 || details!.units !== 1 ||
                !recipe || !uint(recipe.materials, 100) || !recipe.materials ||
                !uint(recipe.hides, 100) || !uint(recipe.unitsPerWinter, 1000) || !recipe.unitsPerWinter ||
                details!.materials !== recipe.materials || details!.hides !== recipe.hides ||
                details!.ironOre !== recipe.ironOre || at < adoption.adoptedAt || at > tick(state, state.time) ||
                (item === 'leatherBodyArmor' ? !recipe.hides || recipe.ironOre !== undefined :
                    recipe.hides !== 0 || !uint(recipe.ironOre, 100) || !recipe.ironOre) ||
                !creator.occupationHistory.some(history => history.occupation === role &&
                    tick(state, history.startedAt) <= at && (history.endedAt === null || tick(state, history.endedAt) >= at))) fail();
            produced[item]++;
        }
        if (event.type === 'EquipmentLost' && Array.isArray(details?.items)) for (const item of details.items) {
            if (!isArmor(item)) continue;
            if (!event.personaId || details.reason !== 'death' || typeof details.missionId !== 'string' ||
                details.clanId !== state.clan.id || eventIndex <= index!) fail();
            lost[item]++;
        }
        if (eventIndex <= index!) continue;
        if (['CattleSlaughtered', 'LivestockSlaughtered'].includes(event.type) && details?.hides !== undefined) {
            if (!uint(details.hides)) fail();
            hides += details.hides;
        }
        if (event.type === 'EquipmentCrafted' && details?.hides !== undefined) {
            if (!uint(details.hides)) fail();
            hides -= details.hides;
        }
        if (event.type === 'MerchantBartered') for (const [field, direction] of [['give', -1], ['receive', 1]] as const) {
            const lines = details?.[field];
            if (!Array.isArray(lines)) fail();
            for (const line of lines) if (line.goodId === 'hides') {
                if (!uint(line.quantity)) fail();
                hides += line.quantity * direction;
            }
        }
        if (!uint(hides)) fail();
    }
    if (hides !== (state.specialistStocks?.hides ?? 0)) fail();
    for (const item of personalArmorItems) {
        const owned = Number(smithery.stored[item]) + Object.values(smithery.assignments)
            .filter(gear => gear.bodyArmor === item || gear.headgear === item).length;
        if (produced[item] !== owned + lost[item]) fail();
    }
    const spent = personalArmorOreSpent(state);
    if (!uint(spent) || spent && !state.mining) fail();
}
