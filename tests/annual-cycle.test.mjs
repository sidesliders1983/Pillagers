import test from 'node:test';
import assert from 'node:assert/strict';
import {load} from './load-source.mjs';
const {AnnualCycle,agePersona}=load('../src/systems/AnnualCycle.ts');
const {defaultDNA}=load('../src/characters/CharacterDNA.ts');
const {randomWalkablePosition,walkable}=load('../src/systems/MovementSystem.ts');
const {seededRandom}=load('../src/config/worldConfig.ts');
const {heightAt}=load('../src/world/Terrain.ts');
test('60 wall-clock seconds advance one year, preserve remainder and catch up missed ticks',()=>{
    const cycle=new AnnualCycle(1000),ticks=[];
    cycle.update(60999,y=>ticks.push(y));assert.equal(cycle.year,1200);assert.deepEqual(ticks,[]);
    cycle.update(61000,y=>ticks.push(y));assert.equal(cycle.year,1201);assert.equal(cycle.progress,0);
    cycle.update(61000,y=>ticks.push(y));assert.deepEqual(ticks,[1201]);
    cycle.update(196000,y=>ticks.push(y));assert.deepEqual(ticks,[1201,1202,1203]);assert.equal(cycle.progress,.25);
});
test('population ages once per year and replaces age 60 with a deterministic independent five-year-old',()=>{
    const original=defaultDNA(),adult={...original,age:58};
    const aged=agePersona(adult,1201,0);assert.equal(aged.dna.age,59);assert.equal(aged.replaced,false);assert.equal(adult.age,58);
    const child=agePersona(aged.dna,1202,0);assert.equal(child.dna.age,5);assert.equal(child.replaced,true);
    assert.notEqual(child.dna.seed,original.seed);assert.deepEqual(child,agePersona(aged.dna,1202,0));
    assert.notEqual(child.dna.seed,agePersona(aged.dna,1202,1).dna.seed);
    assert.equal(agePersona({...adult,age:80},1201,0).dna.age,5);
    let population=Array.from({length:10},(_,i)=>({...original,seed:i,age:59}));
    for(let year=1201;year<=1320;year++){
        population=population.map((dna,i)=>agePersona(dna,year,i).dna);
        assert.equal(population.length,10);assert.ok(population.every(dna=>dna.age>=5&&dna.age<60));
    }
});
test('random respawn locations are dry, walkable and inside the playable area, including fallback',()=>{
    const random=seededRandom(1983),positions=[];
    for(let i=0;i<1000;i++){const p=randomWalkablePosition(random);assert.ok(walkable(p.x,p.z));assert.ok(heightAt(p.x,p.z)>0);positions.push(p);}
    assert.ok(new Set(positions.map(p=>p.x)).size>990);
    const fallback=randomWalkablePosition(()=>1);assert.ok(walkable(fallback.x,fallback.z));
});
