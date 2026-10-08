import {test} from 'node:test';import assert from 'node:assert/strict';import {load} from './load-source.mjs';
const {MovementSystem,walkable,residentMovementConfig}=load('../src/systems/MovementSystem.ts');const {Villager}=load('../src/entities/Villager.ts');const {Group}=await import('three');
function clearing(){for(let x=-18;x<18;x++)for(let z=-12;z<20;z++){if([-3,0,3].every(dx=>[-3,0,3].every(dz=>walkable(x+dx,z+dz))))return {x,z};}throw Error('No clearing');}
function setup(n=2){const units=Array.from({length:n},(_,i)=>new Villager(i,new Group())),system=new MovementSystem(units),p=clearing();units[0].visual.position.set(p.x-.65,0,p.z);units[1].visual.position.set(p.x+.65,0,p.z);Object.assign(units[0].target,{x:p.x+3,z:p.z});Object.assign(units[1].target,{x:p.x-3,z:p.z});return {units,system,p};}
function simulate(system,seconds){for(let i=0;i<Math.round(seconds/.05);i++)system.update(.05);}
function separated(units){for(let i=0;i<units.length;i++)for(let j=i+1;j<units.length;j++)assert.ok(Math.hypot(units[i].visual.position.x-units[j].visual.position.x,units[i].visual.position.z-units[j].visual.position.z)>=2*residentMovementConfig.radius-1e-6,'residents overlap');}
test('encounter stops before overlap, faces partner, lasts five simulation seconds and retains destinations',()=>{
 const {units,system}=setup(),targets=units.map(u=>({...u.target})),positions=units.map(u=>u.visual.position.clone());system.update(.05);assert.deepEqual(units.map(u=>u.interactionState),['talking','listening']);assert.equal(units[0].partnerId,1);simulate(system,1);assert.ok(Math.abs(units[0].visual.rotation.y-Math.PI/2)<.01);assert.ok(Math.abs(units[1].visual.rotation.y+Math.PI/2)<.01);simulate(system,3.9);assert.equal(units[0].interactionState,'talking');units.forEach((u,i)=>assert.ok(u.visual.position.equals(positions[i])));system.update(.1);assert.equal(units[0].interactionState,'resume');assert.equal(units[0].partnerId,null);assert.deepEqual(units.map(u=>u.target),targets);simulate(system,2.5);assert.ok(units.every(u=>u.interactionState==='resume'));separated(units);simulate(system,1);assert.ok(units.every(u=>u.interactionState==='none'));assert.ok(units[0].visual.position.distanceTo(units[1].visual.position)>1.8);
});
test('busy residents sidestep and make progress without replacing their intended destinations',()=>{
 const {units,system,p}=setup();units[0].busy=true;const targets=units.map(u=>({...u.target}));simulate(system,6);separated(units);assert.ok(units.every(u=>u.partnerId===null));assert.ok(units[0].visual.position.x>p.x&&units[1].visual.position.x<p.x);assert.deepEqual(units.map(u=>u.target),targets);
});
test('third resident avoids a locked pair, while zero time pauses the encounter',()=>{
 const {units,system,p}=setup(3);units[2].visual.position.set(p.x,0,p.z-2);Object.assign(units[2].target,{x:p.x,z:p.z+2});system.update(.05);const before=system.snapshot();system.update(0);assert.deepEqual(system.snapshot(),before);simulate(system,4);assert.equal(units[2].partnerId,null);assert.equal(units[0].partnerId,1);separated(units);
});
test('replacement releases the old partner and spawns in unoccupied space',()=>{const {units,system}=setup();system.update(.05);const replacement=new Villager(0,new Group());units[0]=replacement;system.spawn(replacement);assert.equal(units[1].partnerId,null);separated(units);system.update(.05);});
test('ten roaming residents remain separated and use exclusive social pairs',()=>{
 const units=Array.from({length:10},(_,i)=>new Villager(i,new Group())),system=new MovementSystem(units),travel=units.map(()=>0);for(let i=0;i<2400;i++){const before=units.map(u=>u.visual.position.clone());system.update(.05);units.forEach((u,index)=>travel[index]+=u.visual.position.distanceTo(before[index]));separated(units);for(const unit of units)if(unit.partnerId!==null)assert.equal(units[unit.partnerId].partnerId,unit.id);}
 assert.ok(travel.every(distance=>distance>5),'resident deadlock');
});

test('third resident commits to a wide detour and passes the pair before the conversation ends',()=>{
 const {units,system,p}=setup(3);units[2].visual.position.set(p.x,0,p.z-.9);Object.assign(units[2].target,{x:p.x,z:p.z+3});units[2].socialEnabled=false;const target={...units[2].target};system.update(.05);let lateral=0,stalled=0;
 for(let i=0;i<95;i++){system.update(.05);separated(units);lateral=Math.max(lateral,Math.abs(units[2].visual.position.x-p.x));if(units[2].speed===0)stalled++;}
 assert.ok(lateral>1.2,'third resident must walk around the pair');assert.ok(stalled<20,'third resident stalls against pair beyond brief turns');assert.ok(units[2].visual.position.z>p.z,'third resident must pass the conversation');assert.deepEqual(units[2].target,target);
});
test('route resumption turns before walking and never translates backwards',()=>{
 const {units,system}=setup();system.update(.05);simulate(system,4.95);
 // Return to a destination behind the conversational facing direction.
 const unit=units[0];Object.assign(unit.target,{x:unit.visual.position.x-3,z:unit.visual.position.z});let moved=false,turnedInPlace=false;
 for(let i=0;i<40;i++){const before=unit.visual.position.clone();system.update(.05);const dx=unit.visual.position.x-before.x,dz=unit.visual.position.z-before.z;if(Math.hypot(dx,dz)>1e-8){moved=true;assert.ok(dx*Math.sin(unit.visual.rotation.y)+dz*Math.cos(unit.visual.rotation.y)>0,'walking backwards');}else if(unit.partnerId===null)turnedInPlace=true;}
 assert.ok(turnedInPlace,'must turn before restarting locomotion');assert.ok(moved,'must resume walking after turning');
});
