import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTypeScript } from '../scripts/load-typescript.mjs';
const core = loadTypeScript(new URL('../src/simulation/SimulationCore.ts', import.meta.url));
const merchants = loadTypeScript(new URL('../src/simulation/VisitingMerchants.ts', import.meta.url));

function campaign(enabled = true, seed = 32, livestock) {
    return core.createCampaign(seed, { initialFood: 1000, initialMaterials: 100 }, {
        mortalityBands: [{ minAge: 0, chanceBps: 0 }], fertilityChanceBps: 0,
        partnershipChanceBps: 0, switchTicks: 0,
    }, { enabled: false }, {}, { enabled: false }, {}, 'summer-800-v1',
    undefined, livestock ? { player: livestock } : undefined, {}, {}, { enabled });
}
const advance = (state, ticks) => core.applyCommand(state, { type: 'AdvanceTicks', ticks });

test('opt-in visits follow saved canonical time and leave domestic RNG and legacy campaigns alone', () => {
    const initial = campaign(), legacy = campaign(false);
    assert.equal(legacy.trade, undefined);
    assert.equal(initial.trade.nextArrivalTick, 802500);
    const before = advance(initial, 1999);
    assert.equal(merchants.inspectMerchants(before).visit, null);
    const arrived = advance(before, 1), domestic = advance(legacy, 2000);
    const view = merchants.inspectMerchants(arrived);
    assert.equal(view.visit.id, 'merchant-1');
    assert.ok(view.visit.offers.length >= 2 && view.visit.offers.length <= 4);
    assert.equal(view.visit.departureTick, 803500);
    assert.equal(arrived.rngState, domestic.rngState);
    assert.deepEqual(arrived.stocks, domestic.stocks);
    assert.deepEqual(arrived.personas, domestic.personas);
    const frozen = core.serializeState(arrived);
    for (let n = 0; n < 5; n++) merchants.inspectMerchants(arrived);
    assert.equal(core.serializeState(arrived), frozen);
    const restored = core.reconstructState(frozen);
    assert.deepEqual(merchants.inspectMerchants(restored), view);
    const departed = advance(restored, 1000);
    assert.equal(merchants.inspectMerchants(departed).visit, null);
    assert.ok(departed.trade.nextArrivalTick >= 805500 && departed.trade.nextArrivalTick <= 807500);
    assert.equal(departed.events.filter(event => event.type === 'MerchantArrived').length, 1);
    assert.equal(departed.events.filter(event => event.type === 'MerchantDeparted').length, 1);
    assert.equal(core.reconstructState(core.serializeState(legacy)).trade, undefined);
});


test('confirmed barter moves exact finite goods once through the real stock owners, including after reload', () => {
    let state = advance(campaign(), 2000);
    const offer = merchants.merchantOffer(state, 'offer-1');
    assert.equal(offer.available, true);
    assert.ok(offer.command);
    const before = structuredClone(state);
    state = core.applyCommand(state, offer.command);
    for (const line of offer.give) assert.equal(state.stocks[line.goodId],
        before.stocks[line.goodId] - line.quantity);
    for (const line of offer.receive) {
        const actual = line.goodId === 'food' || line.goodId === 'materials' ? state.stocks[line.goodId] :
            state.smithery.stored[line.goodId];
        const old = line.goodId === 'food' || line.goodId === 'materials' ? before.stocks[line.goodId] :
            before.smithery.stored[line.goodId];
        assert.equal(actual, old + line.quantity);
        assert.equal(state.trade.visit.stock[line.goodId],
            before.trade.visit.stock[line.goodId] - line.quantity);
    }
    const receipts = state.events.filter(event => event.type === 'MerchantBartered');
    assert.equal(receipts.length, 1);
    assert.deepEqual(receipts[0].details.give, offer.give);
    assert.deepEqual(receipts[0].details.receive, offer.receive);
    const saved = core.serializeState(state);
    state = core.applyCommand(core.reconstructState(saved), offer.command);
    assert.equal(core.serializeState(state), saved, 'A matching retry is a no-op');
    const conflicting = structuredClone(offer.command);
    conflicting.give[0].quantity++;
    assert.throws(() => core.applyCommand(state, conflicting), /request|confirmed|quote/i);
    assert.equal(core.serializeState(state), saved);
    const empty = structuredClone(before);
    empty.stocks[offer.give[0].goodId] = 0;
    assert.throws(() => core.applyCommand(empty, offer.command), /stock|enough/i);
    assert.equal(empty.trade.visit.offers[0].remainingLots, before.trade.visit.offers[0].remainingLots);
    while (merchants.merchantOffer(state, 'offer-1').available)
        state = core.applyCommand(state, merchants.merchantOffer(state, 'offer-1').command);
    assert.match(merchants.merchantOffer(state, 'offer-1').reason, /sold out/i);
    assert.throws(() => core.applyCommand(state, { ...offer.command, expectedSequence: state.trade.nextTransaction }), /sold out/i);
});


test('only an eligible at-home Trader improves the exact quote; sending them away invalidates that quote', () => {
    let state = advance(campaign(true, 1), 2000);
    const ordinary = merchants.merchantOffer(state, 'offer-1');
    assert.deepEqual(ordinary.give, [{ goodId: 'materials', quantity: 7 }]);
    const trader = state.personas['founder-1'];
    const preferences = state.mechanics.config.occupations.trader.preferences;
    Object.keys(trader.dna.traits).forEach((key, i) => trader.dna.traits[key] = preferences[i]);
    state = core.applyCommand(state, { type: 'AssignOccupation', personaId: trader.id, occupation: 'trader' });
    const improved = merchants.merchantOffer(state, 'offer-1');
    assert.deepEqual(improved.give, [{ goodId: 'materials', quantity: 6 }]);
    assert.equal(improved.command.traderId, trader.id);
    assert.equal(improved.command.discountBps, 1000);
    assert.deepEqual(improved.receive, ordinary.receive);
    state = core.applyCommand(state, { type: 'CreateExpeditionGroup', name: 'Away trader', memberIds: [trader.id] });
    const region = Object.values(state.world.regions).find(region => !region.requiresShip);
    state = core.applyCommand(state, { type: 'DispatchExpedition', groupId: 'group-1', regionId: region.id, mission: 'Recon' });
    assert.equal(merchants.merchantOffer(state, 'offer-1').command.traderId, null);
    assert.throws(() => core.applyCommand(state, improved.command), /quote|confirmed/i);
    const returned = advance(state, 250);
    assert.equal(merchants.merchantOffer(returned, 'offer-1').command.traderId, trader.id);
});


test('save validation rejects invented merchant goods, altered receipts and rerolled schedules', () => {
    let state = advance(campaign(true, 1), 2000);
    state = core.applyCommand(state, merchants.merchantOffer(state, 'offer-1').command);
    const corruptions = [
        value => value.trade.visit.stock.food++,
        value => value.trade.visit.offers[0].remainingLots++,
        value => value.trade.nextArrivalTick++,
        value => value.trade.nextTransaction++,
        value => value.trade.visit.offers[0].quantity++,
        value => value.events.find(event => event.type === 'MerchantBartered').details.receive[0].quantity++,
        value => value.events.find(event => event.type === 'MerchantBartered').details.discountBps = 10000,
        value => value.trade.visit.stock.horse = 1,
    ];
    for (const corrupt of corruptions) {
        const value = structuredClone(state);
        corrupt(value);
        assert.throws(() => core.reconstructState(JSON.stringify(value)), /merchant|barter|trade/i);
    }
    const restored = core.reconstructState(core.serializeState(state));
    assert.deepEqual(advance(restored, 1000), advance(state, 1000));
});


test('eligible Craft trades use real Hides and stored equipment; worn gear is never payment', () => {
    const rules = loadTypeScript(new URL('../src/config/FjordLivestock.ts', import.meta.url)).fjordLivestockRules;
    let state = campaign(true, 2, rules);
    state.mechanics.config.workPerUnit = 100000;
    state = advance(state, 2000);
    assert.equal(state.trade.visit.profile, 'craft');
    assert.equal(state.trade.visit.offers.length, 4);
    state = core.applyCommand(state, { type: 'AssignOccupation', personaId: 'founder-1', occupation: 'smith' });
    for (const item of ['woodenSpear', 'woodenShield'])
        state = core.applyCommand(state, { type: 'SetSmitheryTarget', item, target: 2 });
    state = advance(state, 100);
    assert.equal(state.smithery.stored.woodenSpear, 2);
    assert.equal(state.smithery.stored.woodenShield, 2);
    const hides = merchants.merchantOffer(state, 'offer-3');
    assert.deepEqual(hides.give, [{ goodId: 'woodenSpear', quantity: 2 }]);
    assert.deepEqual(hides.receive, [{ goodId: 'hides', quantity: 2 }]);
    state = core.applyCommand(state, hides.command);
    assert.equal(state.specialistStocks.hides, 2);
    assert.equal(state.smithery.stored.woodenSpear, 0);
    state = core.applyCommand(state, { type: 'AssignEquipment', personaId: 'founder-4', slot: 'shield', item: 'woodenShield' });
    assert.equal(merchants.merchantOffer(state, 'offer-4').available, false, 'One stored shield cannot spend another resident’s worn shield');
    const total = state.smithery.stored.woodenShield;
    assert.throws(() => core.applyCommand(state, merchants.merchantOffer(state, 'offer-4').command), /stored/i);
    assert.equal(state.smithery.stored.woodenShield, total);
    state = core.applyCommand(state, { type: 'AssignEquipment', personaId: 'founder-4', slot: 'shield', item: null });
    const shield = merchants.merchantOffer(state, 'offer-4');
    state = core.applyCommand(state, shield.command);
    assert.equal(state.smithery.stored.woodenShield, 0);
    assert.equal(state.smithery.stored.leatherShield, 1);
    assert.deepEqual(core.reconstructState(core.serializeState(state)), state);
    const historical = advance(campaign(true, 2), 2000);
    assert.equal(historical.trade.visit.offers.length, 2, 'Historical rules do not acquire Hides or leather-shield offers');
});
