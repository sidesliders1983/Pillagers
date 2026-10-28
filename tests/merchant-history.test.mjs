import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTypeScript } from '../scripts/load-typescript.mjs';
const core = loadTypeScript(new URL('../src/simulation/SimulationCore.ts', import.meta.url));
const trade = loadTypeScript(new URL('../src/simulation/VisitingMerchants.ts', import.meta.url));
const { attentionEvent } = loadTypeScript(new URL('../src/lore/AttentionHistory.ts', import.meta.url));
const { resolveAttentionTarget } = loadTypeScript(new URL('../src/lore/AttentionNavigation.ts', import.meta.url));
const { personalChronicleEntry } = loadTypeScript(new URL('../src/lore/Chronicle.ts', import.meta.url));

test('arrival links to current visiting trade; history describes only the actual exact barter and departure', () => {
    let state = core.createCampaign(1, { initialFood: 1000, initialMaterials: 100 }, {}, {}, {}, {}, {},
        'summer-800-v1', undefined, undefined, {}, {}, { enabled: true });
    state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 2000 });
    const arrival = state.events.find(event => event.type === 'MerchantArrived');
    const record = attentionEvent(arrival);
    assert.equal(record.severity, 'noteworthy');
    assert.match(record.headline, /Supply merchant.*arrived/i);
    assert.deepEqual(resolveAttentionTarget(state, record.target), { kind: 'surface', id: 'trade' });
    state = core.applyCommand(state, trade.merchantOffer(state, 'offer-1').command);
    const receipt = state.events.find(event => event.type === 'MerchantBartered');
    assert.match(personalChronicleEntry(receipt).text, /7 Materials.*8 Food/);
    state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 1000 });
    const departure = state.events.find(event => event.type === 'MerchantDeparted');
    assert.match(attentionEvent(departure).headline, /departed/);
    assert.match(personalChronicleEntry(arrival).text, /arrived/);
});
