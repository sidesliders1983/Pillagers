import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTypeScript } from '../scripts/load-typescript.mjs';
const { newFjordScenario } = loadTypeScript(new URL('../src/fjord-play/FjordScenario.ts', import.meta.url));
const { GameplaySession } = loadTypeScript(new URL('../src/gameplay-lab/GameplaySession.ts', import.meta.url));
const merchants = loadTypeScript(new URL('../src/simulation/VisitingMerchants.ts', import.meta.url));

test('new Fjord campaigns include merchants by default; pause, restart and old-save import retain their meaning', () => {
    const ordinary = newFjordScenario(1, false, false);
    assert.equal(ordinary.snapshot().trade, undefined);
    const session = newFjordScenario(1);
    assert.ok(session.snapshot().trade);
    session.command({ type: 'AdvanceTicks', ticks: 2000 });
    const saved = session.saveJSON();
    session.elapse(60000);
    assert.equal(session.saveJSON(), saved, 'Paused real time creates no visits or stocks');
    const quote = merchants.merchantOffer(session.snapshot(), 'offer-1');
    // A stock fixture makes transaction integration independent of domestic affordability.
    const state = session.snapshot(); state.stocks.materials = 100;
    session.loadJSON(JSON.stringify(state));
    session.commandBatch([quote.command]);
    assert.equal(session.snapshot().events.filter(event => event.type === 'MerchantBartered').length, 1);
    const restored = new GameplaySession(); restored.loadJSON(session.saveJSON());
    assert.deepEqual(restored.snapshot(), session.snapshot());
    assert.ok(restored.restartProposal().snapshot().trade);
    restored.loadJSON(ordinary.saveJSON());
    assert.equal(restored.snapshot().trade, undefined, 'Loading an old campaign does not activate trade');
});


test('an actual home Trader can negotiate after a normal role change without waiting a full Winter', () => {
    const session = newFjordScenario(1, false, true);
    session.command({ type: 'AdvanceTicks', ticks: 2000 });
    const person = Object.values(session.snapshot().personas).find(person => person.deathWinter === null && person.dna.sex === 'male');
    session.command({ type: 'AssignOccupation', personaId: person.id, occupation: 'farmer' });
    session.command({ type: 'AssignOccupation', personaId: person.id, occupation: 'trader' });
    assert.equal(merchants.merchantOffer(session.snapshot(), 'offer-1').command.traderId, person.id);
});


test('the campaign book reconciles both sides of real barter at its ordinary five-Winter checkpoint', () => {
    const session = newFjordScenario(1, false, true);
    session.command({ type: 'AdvanceTicks', ticks: 2000 });
    session.commandBatch([merchants.merchantOffer(session.snapshot(), 'offer-2').command]);
    session.commandBatch([merchants.merchantOffer(session.snapshot(), 'offer-1').command]);
    session.command({ type: 'AdvanceTicks', ticks: 2500 });
    const ledger = session.book.snapshot().chapters.at(-1).facts.ledger;
    assert.equal(ledger.food.residual, 0);
    assert.equal(ledger.materials.residual, 0);
    assert.equal(ledger.food.complete, true);
    assert.equal(ledger.materials.complete, true);
    const trades = ledger.transactions.filter(transaction => transaction.purpose === 'MerchantBartered');
    assert.equal(trades.length, 4);
    assert.deepEqual(trades.map(transaction => [transaction.resource, transaction.category, transaction.units]), [
        ['food', 'spending', 8], ['materials', 'otherReceipts', 4],
        ['materials', 'spending', 7], ['food', 'otherReceipts', 8],
    ]);
});
