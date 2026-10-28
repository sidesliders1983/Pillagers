import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTypeScript } from '../scripts/load-typescript.mjs';

const goods = loadTypeScript(new URL('../src/simulation/TradeGoods.ts', import.meta.url));

test('commercial cargo measures space independently of barter value and gates future animals', () => {
    assert.equal(goods.tradeCatalogVersion, 1);
    assert.equal(goods.commercialHoldCapacity, 10);
    assert.equal(goods.cargoUsed([
        { goodId: 'woodenShield', quantity: 2 }, { goodId: 'materials', quantity: 6 },
    ]), 10);
    assert.throws(() => goods.cargoUsed([
        { goodId: 'woodenShield', quantity: 2 }, { goodId: 'materials', quantity: 7 },
    ]), /capacity/i);
    assert.equal(goods.tradeGoods.horse.cargoUnitsPerUnit, 10);
    assert.equal(goods.tradeGoods.horse.inventory, null);
    assert.notEqual(goods.tradeGoods.food.tradeValue, goods.tradeGoods.materials.tradeValue);
    assert.equal(goods.tradeGoods.food.cargoUnitsPerUnit, goods.tradeGoods.materials.cargoUnitsPerUnit);
    for (const [goodId, quantity] of [
        ['food', 0], ['food', -1], ['food', 1.5], ['food', Number.MAX_SAFE_INTEGER],
        ['horse', 1], ['coins', 1], ['food', NaN], ['materials', Infinity],
    ]) assert.throws(() => goods.cargoUsed([{ goodId, quantity }]));
    assert.throws(() => goods.cargoUsed([{ goodId: 'food', quantity: 1 },
        { goodId: 'food', quantity: 1 }]));
});
