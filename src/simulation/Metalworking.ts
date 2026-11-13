import type { SimulationState } from './SimulationCore';

export const metalworkingItems = ['ironSpear', 'ironShield'] as const;
export type MetalworkingItem = typeof metalworkingItems[number];
export type MetalworkingRecipe = { materials: number; hides: number; ironOre: number; unitsPerWinter: number };
export interface MetalworkingConfig {
    version: 1;
    recipes: Record<MetalworkingItem, MetalworkingRecipe>;
    ironSpearBonusBps: number;
    ironShieldProtectionBps: number;
}
export interface MetalworkingAdoption {
    version: 1;
    eventId: string;
    adoptedAt: number;
}

/** Owner-approved playtest, 13 November 2026; only a prospective iron target adopts these rules. */
export const prototypeMetalworkingConfig: Readonly<MetalworkingConfig> = Object.freeze({
    version: 1,
    recipes: {
        ironSpear: { materials: 2, hides: 0, ironOre: 1, unitsPerWinter: 2 },
        ironShield: { materials: 4, hides: 0, ironOre: 2, unitsPerWinter: 1 },
    },
    ironSpearBonusBps: 1500,
    ironShieldProtectionBps: 5000,
});

const isIron = (item: unknown): item is MetalworkingItem =>
    metalworkingItems.includes(item as MetalworkingItem);
const integer = (value: unknown, maximum = Number.MAX_SAFE_INTEGER): value is number =>
    Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) <= maximum;
const tick = (state: SimulationState, time: { winter: number; tick: number }) =>
    time.winter * state.ticksPerWinter + time.tick;
function fail(): never { throw new Error('Invalid saved Metalworking provenance.'); }

/** Factual paid consumption, not another resource stock or a reconstruction of old work. */
export function metalworkingOreSpent(state: SimulationState): number {
    if (state.smithery?.version !== 2) return 0;
    return state.events.filter(event => event.type === 'EquipmentCrafted' && isIron(event.details?.item))
        .reduce((sum, event) => sum + Number(event.details!.ironOre), 0);
}

/** New iron items must be explained by actual crafting receipts and real carried losses. */
export function validateMetalworkingLedger(state: SimulationState): void {
    const smithery = state.smithery;
    if (!smithery || smithery.version !== 2) return;
    const adoption = smithery.metalworking;
    const event = adoption && state.events.find(value => value.id === adoption.eventId);
    if (!adoption || adoption.version !== 1 || !integer(adoption.adoptedAt) ||
        adoption.adoptedAt > tick(state, state.time) || event?.type !== 'MetalworkingAdopted' ||
        event.details?.metalworkingVersion !== 1 || event.details?.clanId !== state.clan.id ||
        tick(state, event.time) !== adoption.adoptedAt) fail();
    const produced = { ironSpear: 0, ironShield: 0 };
    const lost = { ironSpear: 0, ironShield: 0 };
    for (const receipt of state.events) {
        const details = receipt.details;
        if (receipt.type === 'EquipmentCrafted' && isIron(details?.item)) {
            const item = details!.item as MetalworkingItem;
            const creator = receipt.personaId &&
                (state.personas[receipt.personaId] ?? state.personaArchive?.[receipt.personaId]);
            const recipe = details!.recipe as MetalworkingRecipe | undefined;
            const at = tick(state, receipt.time);
            if (!creator || details!.creatorId !== receipt.personaId || details!.creatorName !== creator.name ||
                details!.occupation !== 'smith' || details!.clanId !== state.clan.id ||
                details!.metalworkingVersion !== 1 || details!.units !== 1 || at < adoption.adoptedAt ||
                at > tick(state, state.time) || !recipe || !integer(recipe.materials, 100) ||
                !recipe.materials || !integer(recipe.ironOre, 100) || !recipe.ironOre || recipe.hides !== 0 ||
                !integer(recipe.unitsPerWinter, 1000) || !recipe.unitsPerWinter ||
                details!.materials !== recipe.materials || details!.ironOre !== recipe.ironOre ||
                details!.hides !== recipe.hides || !creator.occupationHistory.some(history =>
                    history.occupation === 'smith' && tick(state, history.startedAt) <= at &&
                    (history.endedAt === null || tick(state, history.endedAt) >= at))) fail();
            produced[item]++;
        }
        if (receipt.type === 'EquipmentLost') {
            const items = details?.items;
            if (!Array.isArray(items)) continue;
            for (const item of items) if (isIron(item)) {
                if (!receipt.personaId || typeof details?.missionId !== 'string' ||
                    details.reason !== 'death' || details.clanId !== state.clan.id ||
                    tick(state, receipt.time) < adoption.adoptedAt) fail();
                lost[item]++;
            }
        }
    }
    for (const item of metalworkingItems) {
        const owned = Number(smithery.stored[item]) + Object.values(smithery.assignments)
            .filter(gear => gear.weapon === item || gear.shield === item).length;
        if (!integer(produced[item]) || !integer(lost[item]) || produced[item] !== owned + lost[item]) fail();
    }
    const spent = metalworkingOreSpent(state);
    if (!integer(spent) || !state.mining && (spent || state.specialistStocks?.ironOre)) fail();
}
