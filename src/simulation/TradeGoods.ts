/** Versioned shipping space and prototype barter values are separate dimensions. */
export const tradeCatalogVersion = 1;
export const commercialHoldCapacity = 10;
export const tradeGoodIds = [
    'food', 'materials', 'hides', 'woodenSpear', 'woodenShield', 'leatherShield', 'horse',
] as const;
export type TradeGoodId = typeof tradeGoodIds[number];
export type TradeGood = {
    goodId: TradeGoodId;
    label: string;
    cargoUnitsPerUnit: number;
    tradeValue: number;
    inventory: 'core' | 'hides' | 'smithery' | null;
};
export type TradeManifest = { goodId: TradeGoodId; quantity: number }[];
export const tradeGoods: Readonly<Record<TradeGoodId, Readonly<TradeGood>>> = Object.freeze({
    food: Object.freeze({ goodId: 'food', label: 'Food', cargoUnitsPerUnit: 1, tradeValue: 2, inventory: 'core' }),
    materials: Object.freeze({ goodId: 'materials', label: 'Materials', cargoUnitsPerUnit: 1, tradeValue: 3, inventory: 'core' }),
    hides: Object.freeze({ goodId: 'hides', label: 'Hides', cargoUnitsPerUnit: 1, tradeValue: 4, inventory: 'hides' }),
    woodenSpear: Object.freeze({ goodId: 'woodenSpear', label: 'Wooden Spear', cargoUnitsPerUnit: 1, tradeValue: 8, inventory: 'smithery' }),
    woodenShield: Object.freeze({ goodId: 'woodenShield', label: 'Wooden Shield', cargoUnitsPerUnit: 2, tradeValue: 12, inventory: 'smithery' }),
    leatherShield: Object.freeze({ goodId: 'leatherShield', label: 'Leather-reinforced Shield', cargoUnitsPerUnit: 2, tradeValue: 18, inventory: 'smithery' }),
    horse: Object.freeze({ goodId: 'horse', label: 'Horse (future)', cargoUnitsPerUnit: 10, tradeValue: 0, inventory: null }),
});

/** Strict manifests are reusable by later voyages; unsupported goods cannot become tokens. */
export function cargoUsed(manifest: readonly { goodId: string; quantity: number }[],
    capacity = commercialHoldCapacity): number {
    if (!Number.isSafeInteger(capacity) || capacity < 1 || !Array.isArray(manifest) ||
        !manifest.length || manifest.length > tradeGoodIds.length)
        throw new Error('Choose a nonempty commercial cargo manifest and a whole capacity.');
    let used = 0;
    const seen = new Set<string>();
    for (const line of manifest) {
        if (!line || !Object.hasOwn(tradeGoods, line.goodId) || seen.has(line.goodId))
            throw new Error('Unknown or repeated trade good.');
        const good = tradeGoods[line.goodId as TradeGoodId];
        if (!good.inventory) throw new Error('This trade good has no supported inventory adapter.');
        if (!Number.isSafeInteger(line.quantity) || line.quantity < 1 || line.quantity > 1000000)
            throw new Error('Choose a positive whole cargo quantity up to 1,000,000.');
        seen.add(line.goodId);
        used += line.quantity * good.cargoUnitsPerUnit;
        if (!Number.isSafeInteger(used) || used > capacity)
            throw new Error('Commercial cargo exceeds its hold capacity.');
    }
    return used;
}
