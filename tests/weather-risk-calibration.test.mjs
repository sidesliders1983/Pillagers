import test from 'node:test';
import assert from 'node:assert/strict';
import {runWeather,runBatch} from '../scripts/qa/run-weather-risk.mjs';
test('weather risk measurement records both real opening policies and replays across workers',async()=>{
 const jobs=[{kind:'weather',seed:0,winters:2},{kind:'weather',seed:1,winters:2}];
 const a=await runBatch(jobs,1),b=await runBatch(jobs,2);assert.deepEqual(a,b);
 assert.equal(a[0].policy,'opening-farmyard');assert.equal(a[1].policy,'passive-outside');
 assert.equal(a[0].annual[0].exposedCattle,0);assert.equal(a[1].annual[0].exposedCattle,3);
 assert.deepEqual(a[0].annual.map(r=>r.winter),[800,801]);
 assert.equal(runWeather({seed:0,winters:2}).finalStateHash,a[0].finalStateHash);
 assert.equal(a[0].configuration.weather.enabled,true);
});
