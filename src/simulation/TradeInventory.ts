import type { SimulationState } from './SimulationCore';
import { initializeSmithery, type EquipmentItem } from './Smithery';
import { tradeGoods, type TradeGoodId, type TradeManifest } from './TradeGoods';

export function tradeGoodSupported(state: SimulationState, goodId: TradeGoodId): boolean {
    return Object.hasOwn(tradeGoods, goodId) && tradeGoods[goodId].inventory !== null &&
        (goodId !== 'hides' && goodId !== 'leatherShield' || state.landing?.livestock?.version === 2);
}
/** Stored gear only: assigned property stays with its owner, even while away. */
export function tradeStock(state: SimulationState, goodId: TradeGoodId): number {
    if (!tradeGoodSupported(state, goodId)) return 0;
    if (goodId === 'food' || goodId === 'materials') return state.stocks[goodId];
    if (goodId === 'hides') return state.specialistStocks?.hides ?? 0;
    return state.smithery?.stored[goodId as EquipmentItem] ?? 0;
}
export function assertTradeInventory(state: SimulationState, give: TradeManifest, receive: TradeManifest) {
    for (const line of [...give, ...receive])
        if (!tradeGoodSupported(state, line.goodId)) throw new Error('This good is unavailable under the saved campaign rules.');
    for (const line of give)
        if (tradeStock(state, line.goodId) < line.quantity) throw new Error('Not enough stored ' + tradeGoods[line.goodId].label + '.');
    for (const line of receive)
        if (!Number.isSafeInteger(tradeStock(state, line.goodId) + line.quantity))
            throw new Error('The received stock would exceed the inventory limit.');
}
function change(state: SimulationState, goodId: TradeGoodId, delta: number) {
    if (goodId === 'food' || goodId === 'materials') state.stocks[goodId] += delta;
    else if (goodId === 'hides') {
        state.specialistStocks ??= { version: 1, hides: 0 };
        state.specialistStocks.hides += delta;
    } else {
        state.smithery ??= initializeSmithery();
        state.smithery.stored[goodId as EquipmentItem] += delta;
    }
}
/** Called only after the complete confirmed transaction has passed all checks. */
export function exchangeTradeInventory(state: SimulationState, give: TradeManifest, receive: TradeManifest) {
    for (const line of give) change(state, line.goodId, -line.quantity);
    for (const line of receive) change(state, line.goodId, line.quantity);
}
