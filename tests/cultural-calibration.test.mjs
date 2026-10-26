import test from 'node:test';
import assert from 'node:assert/strict';
import { runCase } from '../scripts/qa/cultural-events-study.mjs';

test('calibration records actual paid interventions without amplifying one annual risk reduction', () => {
    const baseline = runCase({ phase: 'controlled', seed: 1, weather: 'Severe', arm: 'none' });
    const one = runCase({ phase: 'controlled', seed: 1, weather: 'Severe', arm: 'one' });
    const two = runCase({ phase: 'controlled', seed: 1, weather: 'Severe', arm: 'two' });
    assert.equal(baseline.totals.foodPaid, 0);
    assert.equal(one.totals.foodPaid, 3);
    assert.equal(two.totals.foodPaid, 6);
    assert.equal(one.annual[0].supportApplied[0].riskInputs.find(risk => risk.personaId === 'founder-7').mortalityRiskBps, 155);
    assert.deepEqual(two.annual[0].supportApplied[0].riskInputs, one.annual[0].supportApplied[0].riskInputs);
    assert.equal(one.annual[0].supportAfter, 0);
    assert.equal(two.annual[0].supportAfter, 1);
    assert.equal(one.annual[0].residentDeaths.length, baseline.annual[0].residentDeaths.length - 1);
    assert.deepEqual(runCase({ phase: 'controlled', seed: 1, weather: 'Severe', arm: 'one' }), one);
    for (const result of [baseline, one, two]) assert.equal(result.accounting, 'passed');
});
