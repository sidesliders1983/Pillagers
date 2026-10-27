import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTypeScript } from '../scripts/load-typescript.mjs';
const { newFjordScenario } = loadTypeScript(new URL('../src/fjord-play/FjordScenario.ts', import.meta.url));
const { GameplaySession } = loadTypeScript(new URL('../src/gameplay-lab/GameplaySession.ts', import.meta.url));
const merchants = loadTypeScript(new URL('../src/simulation/VisitingMerchants.ts', import.meta.url));

test('new-campaign trade is explicit; session commands, pause, restart and old-save import retain their meaning', () => {
    const ordinary = newFjordScenario(1);
    assert.equal(ordinary.snapshot().trade, undefined);
    const session = newFjordScenario(1, false, true);
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
