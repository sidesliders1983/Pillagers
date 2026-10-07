import test from 'node:test';
import assert from 'node:assert/strict';
import {runScenario,runBatch,summarize} from '../scripts/qa/run-economy-calibration.mjs';

test('calibration uses the real landing, changes only three Food rates and conserves recorded Food',()=>{
  const low=runScenario({seed:32,baseline:4,winters:1}),control=runScenario({seed:32,baseline:10,winters:1});
  assert.equal(low.initial.population,10);assert.equal(low.initial.food,30);assert.equal(low.initial.materials,5);
  assert.equal(low.initial.founderFingerprint,control.initial.founderFingerprint);
  assert.equal(low.initial.foodWorkers+low.initial.materialsWorkers+low.initial.inactiveWorkers,10);
  const lowConfig=structuredClone(low.configuration),highConfig=structuredClone(control.configuration);
  for(const role of ['farmer','fisher','hunter']){assert.equal(lowConfig.mechanics.occupations[role].unitsPerWinter,4);lowConfig.mechanics.occupations[role].unitsPerWinter=10;}
  assert.deepEqual(lowConfig,highConfig);
  assert.equal(low.food.cattleProduced,4);assert.equal(low.food.cattleConsumed,3);
  assert.equal(low.food.totalProduced,low.food.residentProduced+4);
  assert.equal(low.food.totalConsumed,low.food.residentConsumed+3);
  assert.equal(low.annual.at(-1).food,30+low.food.totalProduced-low.food.totalConsumed);
  assert.deepEqual(runScenario({seed:32,baseline:4,winters:1}),low);
});

test('batch ordering and results are independent of worker count and report measured medians',async()=>{
  const serial=await runBatch({seedStart:0,seedCount:2,winters:1,baselines:[4,10],workers:1});
  const progress=[];
  const parallel=await runBatch({seedStart:0,seedCount:2,winters:1,baselines:[4,10],workers:2,onProgress:(done,total)=>progress.push([done,total])});
  assert.deepEqual(progress.at(-1),[4,4]);assert.ok(progress.every(([,total])=>total===4));
  assert.deepEqual(parallel,serial);assert.deepEqual(serial.map(r=>[r.baseline,r.seed]),[[4,0],[4,1],[10,0],[10,1]]);
  const report=summarize(serial);
  assert.equal(report.length,2);assert.equal(report[0].runs,2);
  const values=serial.filter(r=>r.baseline===4).map(r=>r.annual.at(-1).food);
  assert.equal(report[0].foodMedian,(values[0]+values[1])/2);
  assert.throws(()=>runScenario({seed:1,baseline:-1,winters:15}));
});
