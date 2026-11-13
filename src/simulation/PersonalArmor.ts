import type { SimulationState } from './SimulationCore';

export const legacyPersonalArmorItems = ['leatherBodyArmor', 'ironHelmet'] as const;
export const personalArmorVariantItems = ['leatherHelmet', 'ironBodyArmor'] as const;
export const personalArmorItems = [...legacyPersonalArmorItems, ...personalArmorVariantItems] as const;
export const bodyArmorItems = ['leatherBodyArmor', 'ironBodyArmor'] as const;
export const headgearItems = ['leatherHelmet', 'ironHelmet'] as const;
export type PersonalArmorItem = typeof personalArmorItems[number];
export type BodyArmor = typeof bodyArmorItems[number] | null;
export type Headgear = typeof headgearItems[number] | null;
export interface PersonalArmorAdoption {
    version: 1;
    eventId: string;
    adoptedAt: number;
    openingHides: number;
}
export interface PersonalArmorVariantsAdoption {
    version: 2;
    eventId: string;
    adoptedAt: number;
}
export interface PersonalArmorRules {
    leatherBodyArmorProtectionBps?: number;
    ironHelmetProtectionBps?: number;
    leatherHelmetProtectionBps?: number;
    ironBodyArmorProtectionBps?: number;
    maximumPersonalProtectionBps?: number;
}
/** Original owner-approved playtest; earlier catalogues keep these exact saved rules. */
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
/** Owner-approved additional variants; only an explicit prospective target adopts them. */
export const prototypePersonalArmorVariantsConfig = Object.freeze({
    version: 2 as const,
    recipes: {
        leatherHelmet: { materials: 2, hides: 1, unitsPerWinter: 1 },
        ironBodyArmor: { materials: 3, hides: 2, ironOre: 2, unitsPerWinter: 1 },
    },
    leatherHelmetProtectionBps: 500,
    ironBodyArmorProtectionBps: 3000,
});

type ArmorSlots = { bodyArmor?: BodyArmor; headgear?: Headgear };
const isArmor = (item: unknown): item is PersonalArmorItem => personalArmorItems.includes(item as PersonalArmorItem);
export const personalArmorItemVersion = (item: PersonalArmorItem): 1 | 2 =>
    personalArmorVariantItems.includes(item as typeof personalArmorVariantItems[number]) ? 2 : 1;
export const wearingPersonalArmorVariants = (gear: ArmorSlots) =>
    gear.bodyArmor === 'ironBodyArmor' || gear.headgear === 'leatherHelmet';
export const wearingPersonalArmor = (gear: ArmorSlots) =>
    bodyArmorItems.includes(gear.bodyArmor as Exclude<BodyArmor, null>) ||
    headgearItems.includes(gear.headgear as Exclude<Headgear, null>);
const uint = (value: unknown, maximum = Number.MAX_SAFE_INTEGER): value is number =>
    Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) <= maximum;
const tick = (state: SimulationState, time: { winter: number; tick: number }) =>
    time.winter * state.ticksPerWinter + time.tick;
function fail(): never { throw new Error('Invalid saved personal armor provenance.'); }

/** Unsupported custom shield policies are rejected; an old shield-only loadout keeps its exact rules. */
export function assertPersonalArmorCombination(gear: ArmorSlots,
    shieldProtectionBps: number, rules: PersonalArmorRules): void {
    if (wearingPersonalArmor(gear) && shieldProtectionBps > rules.maximumPersonalProtectionBps!)
        throw new Error('Remove the shield first: its saved protection exceeds the personal armor limit.');
}

/** One product floor, with a conservative ceiling on the minimum risk allowed by the cap. */
export function protectedPersonalRisk(base: number, gear: ArmorSlots,
    shieldProtectionBps: number, rules: PersonalArmorRules): number {
    if (!wearingPersonalArmor(gear)) return Math.floor(base * (10000 - shieldProtectionBps) / 10000);
    assertPersonalArmorCombination(gear, shieldProtectionBps, rules);
    const body = gear.bodyArmor === 'leatherBodyArmor' ? rules.leatherBodyArmorProtectionBps! :
        gear.bodyArmor === 'ironBodyArmor' ? rules.ironBodyArmorProtectionBps! : 0;
    const helmet = gear.headgear === 'ironHelmet' ? rules.ironHelmetProtectionBps! :
        gear.headgear === 'leatherHelmet' ? rules.leatherHelmetProtectionBps! : 0;
    const remaining = BigInt(10000 - shieldProtectionBps) * BigInt(10000 - body) * BigInt(10000 - helmet);
    const combined = Number(BigInt(base) * remaining / 1000000000000n);
    return Math.max(combined, Math.ceil(base * (10000 - rules.maximumPersonalProtectionBps!) / 10000));
}
export function personalArmorOreSpent(state: SimulationState): number {
    if (!state.smithery || state.smithery.version < 3) return 0;
    return state.events.filter(event => event.type === 'EquipmentCrafted' &&
        ['ironHelmet', 'ironBodyArmor'].includes(String(event.details?.item)))
        .reduce((sum, event) => sum + Number(event.details!.ironOre), 0);
}

/** Preserve the opening stock and original receipts; new variants need a later factual adoption. */
export function validatePersonalArmorLedger(state: SimulationState): void {
    const smithery = state.smithery;
    if (!smithery || smithery.version < 3) return;
    const adoption = smithery.personalArmor;
    const index = adoption && state.events.findIndex(event => event.id === adoption.eventId);
    const adopted = index !== undefined && index >= 0 ? state.events[index] : undefined;
    if (!adoption || adoption.version !== 1 || !uint(adoption.adoptedAt) || !uint(adoption.openingHides) ||
        !adopted || adopted.type !== 'PersonalArmorAdopted' || adopted.details?.personalArmorVersion !== 1 ||
        adopted.details?.openingHides !== adoption.openingHides || adopted.details?.clanId !== state.clan.id ||
        tick(state, adopted.time) !== adoption.adoptedAt || adoption.adoptedAt > tick(state, state.time)) fail();
    const variants = smithery.personalArmorVariants;
    const variantIndex = variants ? state.events.findIndex(event => event.id === variants.eventId) : -1;
    if (smithery.version === 4) {
        const event = state.events[variantIndex];
        if (!variants || variants.version !== 2 || !uint(variants.adoptedAt) || variantIndex <= index! ||
            event?.type !== 'PersonalArmorVariantsAdopted' || event.details?.personalArmorVersion !== 2 ||
            event.details?.clanId !== state.clan.id || tick(state, event.time) !== variants.adoptedAt ||
            variants.adoptedAt > tick(state, state.time)) fail();
    } else if (variants) fail();
    const catalogue = smithery.version === 4 ? personalArmorItems : legacyPersonalArmorItems;
    const produced = new Map<PersonalArmorItem, number>(catalogue.map(item => [item, 0]));
    const lost = new Map<PersonalArmorItem, number>(catalogue.map(item => [item, 0]));
    let hides = adoption.openingHides;
    for (const [eventIndex, event] of state.events.entries()) {
        const details = event.details;
        if (event.type === 'EquipmentCrafted' && isArmor(details?.item)) {
            const item = details!.item as PersonalArmorItem;
            const version = personalArmorItemVersion(item), earliest = version === 2 ? variantIndex : index!;
            const creator = event.personaId && (state.personas[event.personaId] ?? state.personaArchive?.[event.personaId]);
            const recipe = details!.recipe as { materials: number; hides: number; ironOre?: number; unitsPerWinter: number };
            const leather = item === 'leatherBodyArmor' || item === 'leatherHelmet';
            const needsHides = item !== 'ironHelmet';
            const role = leather ? 'leatherAndJewelleryMaker' : 'smith';
            const at = tick(state, event.time);
            if (!produced.has(item) || earliest < 0 || eventIndex <= earliest || !creator ||
                details!.creatorId !== event.personaId || details!.creatorName !== creator.name ||
                details!.occupation !== role || details!.clanId !== state.clan.id ||
                details!.personalArmorVersion !== version || details!.units !== 1 ||
                !recipe || !uint(recipe.materials, 100) || !recipe.materials ||
                !uint(recipe.hides, 100) || needsHides !== (recipe.hides > 0) ||
                !uint(recipe.unitsPerWinter, 1000) || !recipe.unitsPerWinter ||
                details!.materials !== recipe.materials || details!.hides !== recipe.hides ||
                details!.ironOre !== recipe.ironOre || at < adoption.adoptedAt || at > tick(state, state.time) ||
                (version === 2 && at < variants!.adoptedAt) ||
                (leather ? recipe.ironOre !== undefined : !uint(recipe.ironOre, 100) || !recipe.ironOre) ||
                !creator.occupationHistory.some(history => history.occupation === role &&
                    tick(state, history.startedAt) <= at && (history.endedAt === null || tick(state, history.endedAt) >= at))) fail();
            produced.set(item, produced.get(item)! + 1);
        }
        if (event.type === 'EquipmentLost' && Array.isArray(details?.items)) for (const item of details.items) {
            if (!isArmor(item)) continue;
            const earliest = personalArmorItemVersion(item) === 2 ? variantIndex : index!;
            if (!lost.has(item) || earliest < 0 || !event.personaId || details.reason !== 'death' ||
                typeof details.missionId !== 'string' || details.clanId !== state.clan.id || eventIndex <= earliest) fail();
            lost.set(item, lost.get(item)! + 1);
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
    for (const item of catalogue) {
        const owned = Number(smithery.stored[item]) + Object.values(smithery.assignments)
            .filter(gear => gear.bodyArmor === item || gear.headgear === item).length;
        if (produced.get(item) !== owned + lost.get(item)!) fail();
    }
    const spent = personalArmorOreSpent(state);
    if (!uint(spent) || spent && !state.mining) fail();
}
