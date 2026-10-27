import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { loadTypeScript } from './load-typescript.mjs';

const { newFjordScenario } = loadTypeScript(new URL('../src/fjord-play/FjordScenario.ts', import.meta.url));
const core = loadTypeScript(new URL('../src/simulation/SimulationCore.ts', import.meta.url));
const trade = loadTypeScript(new URL('../src/simulation/VisitingMerchants.ts', import.meta.url));
const { tradeGoods } = loadTypeScript(new URL('../src/simulation/TradeGoods.ts', import.meta.url));
const hash = value => createHash('sha256').update(value).digest('hex');
const value = manifest => manifest.reduce((sum, line) => sum + tradeGoods[line.goodId].tradeValue * line.quantity, 0);
const rows = [];
for (let seed = 1; seed <= 30; seed++) {
    const active = newFjordScenario(seed, false, true), control = newFjordScenario(seed);
    active.command({ type: 'AdvanceTicks', ticks: 2000 });
    control.command({ type: 'AdvanceTicks', ticks: 2000 });
    const state = active.snapshot(), domestic = control.snapshot();
    assert.equal(state.rngState, domestic.rngState);
    assert.deepEqual(state.stocks, domestic.stocks);
    assert.deepEqual(state.personas, domestic.personas);
    assert.deepEqual(state.world, domestic.world);
    const candidates = Object.values(state.personas).filter(person => person.deathWinter === null &&
        core.personaAge(state, person.id) >= state.mechanics.config.adultAge && !core.isProvidingCare(state, person.id))
        .sort((a, b) => core.occupationAptitude(state, b.id, 'trader') - core.occupationAptitude(state, a.id, 'trader'));
    let negotiated = state;
    if (candidates[0]) {
        negotiated = core.applyCommand(negotiated, { type: 'AssignOccupation', personaId: candidates[0].id, occupation: 'trader' });
        // Negotiation is not production: compare the two prices at the same canonical instant.
    }
    const offers = state.trade.visit.offers.map(entry => {
        const baseline = trade.merchantOffer(state, entry.id), improved = trade.merchantOffer(negotiated, entry.id);
        assert.ok(value(baseline.give) > value(baseline.receive));
        assert.ok(value(improved.give) > value(improved.receive));
        return { id: entry.id, receive: baseline.receive, standardGive: baseline.give,
            negotiatedGive: improved.give, affordableAtArrival: baseline.available,
            reasonAtArrival: baseline.reason, remainingLots: entry.remainingLots,
            negotiator: improved.command.traderId, discountBps: improved.command.discountBps };
    });
    rows.push({ seed, profile: state.trade.visit.profile, stocksAtArrival: state.stocks,
        rngParity: true, autonomousCpuParity: true, offers });
}
const files = ['src/simulation/TradeGoods.ts', 'src/simulation/TradeInventory.ts',
    'src/simulation/VisitingMerchants.ts', 'src/simulation/SimulationCore.ts', 'src/simulation/Mechanics.ts',
    'src/config/FjordLivestock.ts', 'src/lore/BookLedger.ts', 'scripts/measure-visiting-trade.mjs'];
const report = { schemaVersion: 1, seeds: [1, 30], ticks: 2000,
    purpose: 'First-visit affordability, domestic/CPU parity without trade, and fixed-rate value-loss checks. Not a fun or long-run economy study.',
    baseCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    sourceHashes: Object.fromEntries(files.map(file => [file, hash(readFileSync(file))])),
    policy: trade.merchantPolicyV1, catalog: tradeGoods,
    summary: { cases: rows.length, supplyVisits: rows.filter(row => row.profile === 'supply').length,
        craftVisits: rows.filter(row => row.profile === 'craft').length,
        offers: rows.reduce((n, row) => n + row.offers.length, 0),
        affordableOffers: rows.reduce((n, row) => n + row.offers.filter(offer => offer.affordableAtArrival).length, 0),
        improvedWholeQuotes: rows.reduce((n, row) => n + row.offers.filter(offer =>
            JSON.stringify(offer.standardGive) !== JSON.stringify(offer.negotiatedGive)).length, 0) }, rows };
mkdirSync('docs/qa/visiting-merchants-281', { recursive: true });
writeFileSync('docs/qa/visiting-merchants-281/rate-review.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report.summary));
