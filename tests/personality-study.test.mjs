import test from 'node:test';
import assert from 'node:assert/strict';
import {runSocialScenario} from '../scripts/qa/personality-scenario.mjs';

test('public paired harness reports real opportunities, source events, baseline parity and replay', () => {
    const run = runSocialScenario({seed: 41, winters: 8, fixture: true, verify: true});
    assert.equal(run.baselineParity, true);
    assert.equal(run.verification.repeat, true);
    assert.equal(run.verification.saveLoad, true);
    assert.equal(run.verification.batched, true);
    assert.equal(run.annual.length, 8);
    assert.ok(run.counts.quarrelOpportunities > 0);
    assert.ok(run.events.every(event => event.details.incidentId));
    assert.ok(run.annual.every(year => year.foodShortfall >= 0));
    assert.equal(run.configuration.social.enabled, true);
    assert.equal(run.fixture, true);
});

test('paired full-world output keeps each CPU event namespace independent', () => {
    const run = runSocialScenario({seed: 32, winters: 13, fullWorld: true});
    assert.equal(run.baselineParity, true);
});
