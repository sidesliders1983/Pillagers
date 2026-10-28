import type { SimulationEvent } from '../simulation/SimulationCore';
import { tradeGoods, type TradeGoodId } from '../simulation/TradeGoods';

function manifestText(value: unknown): string | null {
    if (!Array.isArray(value) || !value.length || value.length > 6) return null;
    const labels: string[] = [];
    for (const line of value) {
        if (!line || !Object.hasOwn(tradeGoods, line.goodId) || !tradeGoods[line.goodId as TradeGoodId].inventory ||
            !Number.isSafeInteger(line.quantity) || line.quantity < 1) return null;
        labels.push(line.quantity + ' ' + tradeGoods[line.goodId as TradeGoodId].label);
    }
    return labels.join(' + ');
}
export function merchantHistoryText(event: SimulationEvent): string | null {
    const facts = event.details;
    if (!facts || typeof facts.visitId !== 'string') return null;
    const profile = facts.profile === 'supply' ? 'Supply merchant' : facts.profile === 'craft' ? 'Craft merchant' : null;
    if (event.type === 'MerchantArrived') return profile ? profile + ' arrived at the shore with barter offers.' : null;
    if (event.type === 'MerchantDeparted') return profile ? profile + ' departed from the shore.' : null;
    if (event.type !== 'MerchantBartered') return null;
    const give = manifestText(facts.give), receive = manifestText(facts.receive);
    return give && receive ? 'The clan exchanged ' + give + ' for ' + receive + ' with a visiting merchant.' : null;
}
