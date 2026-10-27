import { occupationAptitude } from './Mechanics';
import { isProvidingCare } from './FamilyMechanics';
import { personaAway } from './WorldExpeditions';
import { personaAge } from './PersonaAge';
import type { SimulationEvent, SimulationState } from './SimulationCore';
import { seededRandom } from '../characters/seededRandom';
import { tradeGoods, type TradeGoodId, type TradeManifest } from './TradeGoods';
import { assertTradeInventory, exchangeTradeInventory } from './TradeInventory';

export type TradeConfig = { enabled: boolean };
/** Review-only values. Future balancing must retain this saved policy's interpretation. */
export const merchantPolicyV1 = Object.freeze({
    version: 1, firstDelayWinters: 2, visitWinters: 1,
    intervalMinWinters: 3, intervalMaxWinters: 5,
    markupBps: 12500, maximumTraderDiscountBps: 1000,
    maximumOffers: 4, maximumLots: 3,
});
export type MerchantProfile = 'supply' | 'craft';
export type MerchantOffer = {
    id: string;
    goodId: TradeGoodId;
    quantity: number;
    paymentGoodId: TradeGoodId;
    initialLots: number;
    remainingLots: number;
};
export type MerchantVisit = {
    id: string;
    sequence: number;
    hidesEnabled: boolean;
    profile: MerchantProfile;
    arrivalTick: number;
    departureTick: number;
    stock: Partial<Record<TradeGoodId, number>>;
    offers: MerchantOffer[];
};
export type TradeState = {
    version: 1;
    catalogVersion: 1;
    policyVersion: 1;
    activatedAtTick: number;
    nextArrivalTick: number;
    nextVisit: number;
    nextTransaction: number;
    visit: MerchantVisit | null;
};
const now = (state: SimulationState) => state.time.winter * state.ticksPerWinter + state.time.tick;
function record(state: SimulationState, type: string, details: Record<string, unknown>) {
    state.events.push({ id: 'event-' + (state.events.length + 1), time: { ...state.time }, type,
        details: { ...details, clanId: state.clan.id } });
}
/** Explicit new-campaign setup, never called by reconstruction or a read projection. */
export function initializeTrade(state: SimulationState, config: Partial<TradeConfig> = {}): void {
    if (config.enabled === undefined || config.enabled === false) return;
    if (config.enabled !== true || !state.mechanics) throw new Error('Invalid trade activation.');
    state.trade = { version: 1, catalogVersion: 1, policyVersion: 1, activatedAtTick: now(state),
        nextArrivalTick: now(state) + 2 * state.ticksPerWinter, nextVisit: 1, nextTransaction: 1, visit: null };
}
function makeVisit(state: SimulationState, sequence = state.trade!.nextVisit,
    arrivalTick = now(state)): MerchantVisit {
    const random = seededRandom(state.seed, 'visiting-merchants-v1:' + sequence);
    const profile: MerchantProfile = random() < 0.5 ? 'supply' : 'craft';
    const candidates: [TradeGoodId, number, TradeGoodId][] = profile === 'supply' ?
        [['food', 8, 'materials'], ['materials', 4, 'food']] :
        [['woodenSpear', 1, 'food'], ['woodenShield', 1, 'materials']];
    if (profile === 'craft' && state.landing?.livestock?.version === 2)
        candidates.push(['hides', 2, 'woodenSpear'], ['leatherShield', 1, 'woodenShield']);
    else if (profile === 'supply' && random() < 0.3) candidates.push(['woodenSpear', 1, 'materials']);
    const offers = candidates.map(([goodId, quantity, paymentGoodId], index) => {
        const lots = 1 + Math.floor(random() * 3);
        return { id: 'offer-' + (index + 1), goodId, quantity, paymentGoodId,
            initialLots: lots, remainingLots: lots };
    });
    const stock: MerchantVisit['stock'] = {};
    for (const offer of offers) stock[offer.goodId] = (stock[offer.goodId] ?? 0) +
        offer.quantity * offer.initialLots;
    return { id: 'merchant-' + sequence, sequence, hidesEnabled: state.landing?.livestock?.version === 2,
        profile, arrivalTick, departureTick: arrivalTick + state.ticksPerWinter, stock, offers };
}
/** Constant work on ordinary ticks; inventory draws occur only at an actual arrival. */
export function stepMerchants(state: SimulationState): void {
    const trade = state.trade;
    if (!trade) return;
    if (trade.visit && now(state) >= trade.visit.departureTick) {
        record(state, 'MerchantDeparted', { visitId: trade.visit.id, profile: trade.visit.profile });
        trade.visit = null;
    }
    if (!trade.visit && now(state) >= trade.nextArrivalTick) {
        const visit = trade.visit = makeVisit(state);
        trade.nextArrivalTick = nextArrival(state, trade.nextVisit, now(state));
        trade.nextVisit++;
        record(state, 'MerchantArrived', { visitId: visit.id, profile: visit.profile,
            departureTick: visit.departureTick, hidesEnabled: visit.hidesEnabled, offers: structuredClone(visit.offers) });
    }
}
export function inspectMerchants(state: SimulationState) {
    return { enabled: !!state.trade, prototype: true, catalogVersion: 1,
        nextArrivalTick: state.trade?.nextArrivalTick ?? null,
        visit: structuredClone(state.trade?.visit ?? null) };
}
export function validateTrade(state: SimulationState, events: readonly SimulationEvent[]): void {
    const trade = state.trade;
    if (trade === undefined) {
        if (events.length) throw new Error('Merchant history requires its saved trade state.');
        return;
    }
    const uint = (value: unknown) => Number.isSafeInteger(value) && Number(value) >= 0;
    if (!trade || trade.version !== 1 || trade.catalogVersion !== 1 || trade.policyVersion !== 1 || !state.mechanics ||
        !uint(trade.activatedAtTick) || trade.activatedAtTick > now(state) ||
        !uint(trade.nextArrivalTick) || trade.nextArrivalTick <= now(state) ||
        !uint(trade.nextVisit) || trade.nextVisit < 1)
        throw new Error('Invalid saved merchant schedule.');
    const visit = trade.visit;
    validateMerchantHistory(state, events);
    if (!visit) return;
    if (visit.id !== 'merchant-' + visit.sequence || visit.sequence !== trade.nextVisit - 1 ||
        !['supply', 'craft'].includes(visit.profile) || !uint(visit.arrivalTick) ||
        visit.arrivalTick > now(state) || visit.departureTick !== visit.arrivalTick + state.ticksPerWinter ||
        visit.departureTick <= now(state) || !Array.isArray(visit.offers) ||
        visit.offers.length < 2 || visit.offers.length > 4 || !visit.stock)
        throw new Error('Invalid saved merchant visit.');
    for (const [good, count] of Object.entries(visit.stock))
        if (!Object.hasOwn(tradeGoods, good) || !tradeGoods[good as TradeGoodId].inventory || !uint(count))
            throw new Error('Invalid merchant inventory.');
    for (const [index, offer] of visit.offers.entries())
        if (!offer || offer.id !== 'offer-' + (index + 1) || !Object.hasOwn(tradeGoods, offer.goodId) ||
            !tradeGoods[offer.goodId].inventory || !Object.hasOwn(tradeGoods, offer.paymentGoodId) ||
            !tradeGoods[offer.paymentGoodId].inventory || !uint(offer.quantity) || offer.quantity < 1 ||
            !uint(offer.initialLots) || offer.initialLots < 1 || offer.initialLots > 3 ||
            !uint(offer.remainingLots) || offer.remainingLots > offer.initialLots)
            throw new Error('Invalid merchant offer.');
}

export type MerchantCommand = {
    type: 'BarterWithMerchant';
    visitId: string;
    offerId: string;
    expectedSequence: number;
    give: TradeManifest;
    receive: TradeManifest;
    traderId: string | null;
    discountBps: number;
};
/** Best actual aptitude wins; a group reservation without departure is not absence. */
export function merchantNegotiator(state: SimulationState) {
    const candidates = Object.values(state.personas).filter(person =>
        state.mechanics && person.occupation === 'trader' && person.deathWinter === null &&
        personaAge(state, person.id) >= Math.max(state.mechanics.config.workAge, state.mechanics.config.adultAge) &&
        !personaAway(state, person.id) && !isProvidingCare(state, person.id) &&
        !Object.values(state.world?.spatial?.missions ?? {}).some(mission =>
            mission.status === 'Prepared' && mission.memberIds.includes(person.id)))
        .map(person => ({ id: person.id, name: person.name,
            aptitudeBps: occupationAptitude(state, person.id, 'trader') }))
        .sort((a, b) => b.aptitudeBps - a.aptitudeBps || a.id.localeCompare(b.id));
    const best = candidates[0];
    return { traderId: best?.id ?? null, name: best?.name ?? null,
        aptitudeBps: best?.aptitudeBps ?? 0,
        discountBps: best ? Math.floor(best.aptitudeBps * merchantPolicyV1.maximumTraderDiscountBps / 10000) : 0 };
}
export function merchantOffer(state: SimulationState, offerId: string) {
    const visit = state.trade?.visit;
    const offer = visit?.offers.find(offer => offer.id === offerId);
    const give: TradeManifest = [], receive: TradeManifest = [];
    const negotiator = merchantNegotiator(state);
    let reason = !visit ? 'No merchant is visiting.' : !offer ? 'This offer is unavailable.' :
        offer.remainingLots < 1 ? 'This offer is sold out.' : null;
    if (offer) {
        const payment = barterPayment(offer, negotiator.discountBps);
        give.push({ goodId: offer.paymentGoodId, quantity: payment });
        receive.push({ goodId: offer.goodId, quantity: offer.quantity });
        if (!reason) try { assertTradeInventory(state, give, receive); }
        catch (error) { reason = (error as Error).message; }
    }
    const command: MerchantCommand | undefined = offer && visit ? {
        type: 'BarterWithMerchant', visitId: visit.id, offerId,
        expectedSequence: state.trade!.nextTransaction, give, receive,
        traderId: negotiator.traderId, discountBps: negotiator.discountBps,
    } : undefined;
    return { available: !reason, reason, give, receive, command };
}
function confirmationKey(command: MerchantCommand): string {
    return JSON.stringify([command.visitId, command.offerId, command.expectedSequence,
        command.give?.map(line => [line.goodId, line.quantity]),
        command.receive?.map(line => [line.goodId, line.quantity]), command.traderId, command.discountBps]);
}
export function applyMerchantCommand(state: SimulationState, command: MerchantCommand): void {
    const trade = state.trade;
    if (!trade) throw new Error('Visiting trade is not enabled for this campaign.');
    if (!Number.isSafeInteger(command.expectedSequence) || command.expectedSequence < 1)
        throw new Error('Invalid barter request sequence.');
    if (command.expectedSequence < trade.nextTransaction) {
        const receipt = state.events.find(event => event.type === 'MerchantBartered' &&
            event.details?.sequence === command.expectedSequence);
        if (receipt?.details?.confirmationKey === confirmationKey(command)) return;
        throw new Error('This request conflicts with a confirmed barter.');
    }
    const quote = merchantOffer(state, command.offerId);
    if (!quote.available) throw new Error(quote.reason!);
    if (!quote.command || confirmationKey(quote.command) !== confirmationKey(command))
        throw new Error('The confirmed quote has changed. Review the current offer.');
    const visit = trade.visit!, offer = visit.offers.find(offer => offer.id === command.offerId)!;
    for (const line of command.receive)
        if ((visit.stock[line.goodId] ?? 0) < line.quantity) throw new Error('Merchant stock is insufficient.');
    for (const line of command.give)
        if (!Number.isSafeInteger((visit.stock[line.goodId] ?? 0) + line.quantity))
            throw new Error('Merchant stock would overflow.');
    exchangeTradeInventory(state, command.give, command.receive);
    for (const line of command.give) visit.stock[line.goodId] = (visit.stock[line.goodId] ?? 0) + line.quantity;
    for (const line of command.receive) visit.stock[line.goodId]! -= line.quantity;
    offer.remainingLots--;
    trade.nextTransaction++;
    const negotiator = merchantNegotiator(state);
    record(state, 'MerchantBartered', { traderName: negotiator.name, traderAptitudeBps: negotiator.aptitudeBps, visitId: visit.id, offerId: offer.id,
        sequence: command.expectedSequence, give: structuredClone(command.give),
        receive: structuredClone(command.receive), traderId: command.traderId,
        discountBps: command.discountBps, confirmationKey: confirmationKey(command) });
}

function nextArrival(state: SimulationState, sequence: number, arrivalTick: number): number {
    const random = seededRandom(state.seed, 'merchant-interval-v1:' + sequence);
    return arrivalTick + (3 + Math.floor(random() * 3)) * state.ticksPerWinter;
}
function same(a: unknown, b: unknown): boolean {
    // Save object-key order has no semantic meaning; arrays and actual quantities do.
    const ordered = (value: unknown): unknown => Array.isArray(value) ? value.map(ordered) :
        value && typeof value === 'object' ? Object.fromEntries(Object.entries(value)
            .sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => [key, ordered(entry)])) : value;
    return JSON.stringify(ordered(a)) === JSON.stringify(ordered(b));
}
/** Rebuild only the merchant ledger; clan stocks remain with their existing owners. */
function validateMerchantHistory(state: SimulationState, events: readonly SimulationEvent[]) {
    const trade = state.trade!;
    let arrival = trade.activatedAtTick + 2 * state.ticksPerWinter;
    let sequence = 1, transaction = 1;
    let visit: MerchantVisit | null = null;
    const fail = () => { throw new Error('Merchant state does not match its deterministic barter history.'); };
    for (const event of events) {
        const at = event.time.winter * state.ticksPerWinter + event.time.tick;
        const d = event.details ?? {};
        if (d.clanId !== state.clan.id) fail();
        if (event.type === 'MerchantArrived') {
            if (visit || at !== arrival) fail();
            visit = makeVisit(state, sequence, at);
            if (d.visitId !== visit.id || d.profile !== visit.profile || d.departureTick !== visit.departureTick ||
                d.hidesEnabled !== visit.hidesEnabled || !same(d.offers, visit.offers)) fail();
            arrival = nextArrival(state, sequence++, at);
        } else if (event.type === 'MerchantDeparted') {
            if (!visit || at !== visit.departureTick || d.visitId !== visit.id || d.profile !== visit.profile) fail();
            visit = null;
        } else if (event.type === 'MerchantBartered') {
            if (!visit || at < visit.arrivalTick || at >= visit.departureTick ||
                d.visitId !== visit.id || d.sequence !== transaction++) fail();
            const active = visit!;
            const offer = active.offers.find(offer => offer.id === d.offerId);
            if (!offer || offer.remainingLots < 1 || !Number.isSafeInteger(d.discountBps) ||
                Number(d.discountBps) < 0 || Number(d.discountBps) > 1000 ||
                d.traderId !== null && (typeof d.traderId !== 'string' ||
                    !state.personas[d.traderId] && !state.personaArchive?.[d.traderId]) ||
                d.traderId === null && (d.discountBps !== 0 || d.traderName !== null || d.traderAptitudeBps !== 0) ||
                d.traderId !== null && (typeof d.traderName !== 'string' || !d.traderName ||
                    !Number.isSafeInteger(d.traderAptitudeBps) || Number(d.traderAptitudeBps) < 0 ||
                    Number(d.traderAptitudeBps) > 10000 || d.discountBps !== Math.floor(
                        Number(d.traderAptitudeBps) * merchantPolicyV1.maximumTraderDiscountBps / 10000))) fail();
            const entry = offer!;
            const give = [{ goodId: entry.paymentGoodId, quantity: barterPayment(entry, Number(d.discountBps)) }];
            const receive = [{ goodId: entry.goodId, quantity: entry.quantity }];
            const command: MerchantCommand = { type: 'BarterWithMerchant', visitId: active.id,
                offerId: entry.id, expectedSequence: Number(d.sequence), give, receive,
                traderId: d.traderId as string | null, discountBps: Number(d.discountBps) };
            if (!same(d.give, give) || !same(d.receive, receive) ||
                d.confirmationKey !== confirmationKey(command)) fail();
            for (const line of give) active.stock[line.goodId] = (active.stock[line.goodId] ?? 0) + line.quantity;
            for (const line of receive) active.stock[line.goodId]! -= line.quantity;
            entry.remainingLots--;
        } else fail();
    }
    if (trade.nextArrivalTick !== arrival || trade.nextVisit !== sequence ||
        trade.nextTransaction !== transaction || !same(trade.visit, visit)) fail();
}

function barterPayment(offer: MerchantOffer, discountBps: number): number {
    return Math.ceil(offer.quantity * tradeGoods[offer.goodId].tradeValue * merchantPolicyV1.markupBps *
        (10000 - discountBps) / (100000000 * tradeGoods[offer.paymentGoodId].tradeValue));
}
