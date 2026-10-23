import type { SimulationEvent } from '../simulation/SimulationCore';
export type Resource = 'food' | 'materials';
export type LedgerRow = {
    opening: number; closing: number; production: number; residentProduction: number;
    cattleProduction: number; otherReceipts: number; consumption: number; otherSpending: number; spending: number; losses: number;
    unmetNeed: number | null; residual: number; complete: boolean;
};
export type BookTransaction = { eventId: string; resource: Resource; category: string; purpose: string; units: number };
export function bookLedger(events: readonly SimulationEvent[], opening: Record<Resource, number>, closing: Record<Resource, number>) {
    const rows = Object.fromEntries((['food', 'materials'] as const).map(resource => [resource, {
        opening: opening[resource], closing: closing[resource], production: 0, residentProduction: 0,
        cattleProduction: 0, otherReceipts: 0, consumption: 0, otherSpending: 0, spending: 0, losses: 0, unmetNeed: 0, residual: 0, complete: true
    }])) as Record<Resource, LedgerRow>;
    const transactions: BookTransaction[] = [];
    const add = (e: SimulationEvent, resource: Resource, category: 'production' | 'otherReceipts' | 'spending' | 'losses', field: string, actor?: 'resident' | 'cattle') => {
        const units = e.details?.[field];
        if (!Number.isSafeInteger(units) || (units as number) < 0) { rows[resource].complete = false; return; }
        rows[resource][category] += units as number;
        if (category === 'spending') {
            const consumed = e.type === 'FoodConsumed' || e.type === 'CattleFoodConsumed' ||
                e.type === 'LivestockFoodConsumed';
            rows[resource][consumed ? 'consumption' : 'otherSpending'] += units as number;
        }
        if (actor) rows[resource][actor === 'resident' ? 'residentProduction' : 'cattleProduction'] += units as number;
        transactions.push({ eventId: e.id, resource, category, purpose: e.type, units: units as number });
    };
    for (const e of events) {
        switch (e.type) {
            case 'ResourceProduced':
                if (e.details?.resource === 'food' || e.details?.resource === 'materials')
                    add(e, e.details.resource, 'production', 'units', 'resident');
                else rows.food.complete = rows.materials.complete = false;
                break;
            case 'CattleFoodProduced': add(e, 'food', 'production', 'units', 'cattle'); break;
            case 'LivestockResourceProduced':
                if (e.details?.resource === 'food' || e.details?.resource === 'materials')
                    add(e, e.details.resource, 'production', 'units', 'cattle');
                else rows.food.complete = rows.materials.complete = false;
                break;
            case 'FoodConsumed': case 'CattleFoodConsumed': case 'LivestockFoodConsumed':
                add(e, 'food', 'spending', 'units');
                if (Number.isSafeInteger(e.details?.shortfall) && (e.details!.shortfall as number) >= 0)
                    rows.food.unmetNeed = (rows.food.unmetNeed ?? 0) + (e.details!.shortfall as number);
                else rows.food.complete = false;
                break;
            case 'EquipmentCrafted': add(e, 'materials', 'spending', 'materials'); break;
            case 'HouseBuilt': case 'BuildingUpgraded': add(e, 'materials', 'spending', 'cost'); break;
            case 'CampfireFuelConsumed': case 'BuildingMaintained': add(e, 'materials', 'spending', 'units'); break;
            case 'BuildingSalvaged': case 'BuildingCollapsed': add(e, 'materials', 'otherReceipts', 'salvage'); break;
            case 'FoundingLongshipSalvaged': add(e, 'materials', 'otherReceipts', 'materials'); break;
            case 'CattleSlaughtered': case 'LivestockSlaughtered':
                add(e, 'food', 'otherReceipts', 'food'); break;
            case 'LongshipFoodLoaded': case 'ExploreAreaPrepared': case 'ExploreAreaDeparted': case 'ExpeditionDeparted': add(e, 'food', 'spending', 'foodCost'); break;
            case 'ExpeditionReturned':
                add(e, 'food', 'otherReceipts', 'food'); add(e, 'materials', 'otherReceipts', 'materials'); break;
            case 'SettlementPillaged':
                add(e, 'food', 'losses', 'food'); add(e, 'materials', 'losses', 'materials'); break;
            case 'MaintenanceDebtIncreased':
                if (e.details?.reason === 'unpaid') rows.materials.unmetNeed = null;
                break;
            case 'FoodSpoiled': add(e, 'food', 'losses', 'units'); break;
        }
    }
    for (const row of Object.values(rows)) {
        row.residual = row.closing - (row.opening + row.production + row.otherReceipts - row.spending - row.losses);
        row.complete = row.complete && row.residual === 0;
    }
    const supplyEvents = events.filter(e => ['LongshipFoodLoaded', 'ExploreAreaPrepared', 'ExploreAreaSuppliesConsumed',
        'ExploreAreaSuppliesDiscarded', 'ExploreAreaSuppliesLost'].includes(e.type));
    const supplyTotal = (type: string, field = 'units') => supplyEvents.filter(e => e.type === type)
        .reduce((sum, e) => sum + (Number.isSafeInteger(e.details?.[field]) ? Number(e.details![field]) : 0), 0);
    return { ...rows, transactions, ...(supplyEvents.length ? { provisions: {
        reserved: supplyTotal('ExploreAreaPrepared', 'foodCost') + supplyTotal('LongshipFoodLoaded', 'foodCost'), consumed: supplyTotal('ExploreAreaSuppliesConsumed'),
        discarded: supplyTotal('ExploreAreaSuppliesDiscarded'), lost: supplyTotal('ExploreAreaSuppliesLost'),
        sources: supplyEvents.map(e => e.id)
    } } : {}) };
}
