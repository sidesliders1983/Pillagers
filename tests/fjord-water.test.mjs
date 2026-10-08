import {test} from 'node:test';
import assert from 'node:assert/strict';
import {load} from './load-source.mjs';
const {waterDepthAt}=load('../src/world/FjordWater.ts');

test('open sea has 53 cm depth at the lab water level',()=>{
 // The dry/wet terrain fixture has a flat sea floor of -0.65 m here; water is -0.12 m.
 assert.ok(Math.abs(waterDepthAt(0,-20)-.53)<1e-7);
});
test('land reports a negative depth and raising water by 10 cm adds 10 cm to sea depth',()=>{
 assert.ok(waterDepthAt(0,0)<0);
 assert.ok(Math.abs(waterDepthAt(0,-20,-.02)-.63)<1e-7);
});
test('invalid depth-query coordinates cannot propagate non-finite water depths',()=>{
 assert.throws(()=>waterDepthAt(NaN,-20),RangeError);
 assert.throws(()=>waterDepthAt(0,Infinity),RangeError);
 assert.throws(()=>waterDepthAt(0,-20,NaN),RangeError);
});
