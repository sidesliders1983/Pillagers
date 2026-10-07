import test from 'node:test';
import assert from 'node:assert/strict';
import {runScenario} from '../scripts/qa/run-cattle-calibration.mjs';
test('cattle measurement conserves cattle identities, records Food and repeats through midpoint save/load',()=>{
 const outside=runScenario(32,'outside',3),farm=runScenario(32,'farmyard',3);
 assert.deepEqual(runScenario(32,'outside',3),outside);
 for(const run of [outside,farm]){const last=run.annual.at(-1);assert.equal(last.living,3+last.births-last.deaths-last.slaughters);assert.equal(run.annual.length,4);assert.ok(last.foodProduced>=0);assert.ok(last.foodConsumed>=0);}
 assert.equal(outside.annual[1].foodProduced,4);assert.equal(outside.annual[1].foodConsumed,3);
 assert.equal(farm.annual[1].foodProduced,8);assert.equal(farm.annual[1].foodConsumed,3);
 assert.equal(farm.annual[0].sheltered,3);assert.equal(outside.annual[0].sheltered,0);
});
