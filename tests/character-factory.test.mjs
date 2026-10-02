import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {load} from './load-source.mjs';
const {Group}=createRequire(import.meta.url)('three');
const {WorldCharacter,movementState,worldLOD}=load('../src/characters/CharacterFactory.ts');
test('speed selects in-place states and LOD hysteresis avoids camera jitter',()=>{
    assert.deepEqual([0,.65,2].map(movementState),['Idle','Walk','Run']);
    assert.equal(worldLOD(24,1),1);assert.equal(worldLOD(24,2),2);
    assert.equal(worldLOD(21,2),1);assert.equal(worldLOD(29,1),2);
});
test('asynchronous LOD switch preserves navigation root and state; dispose releases both instances',async()=>{
    const make=()=>({root:new Group(),states:[],ticks:0,disposed:false,setAnimation(s){this.states.push(s);},update(){this.ticks++;},dispose(){this.disposed=true;}});
    const far=make(),near=make();let loads=0;
    const character=new WorldCharacter(far,async()=>{loads++;return near;},42);
    character.root.position.set(4,2,7);character.setMovementSpeed(.65);
    character.update(.016,10);character.update(.016,10);
    await new Promise(resolve=>setImmediate(resolve));character.update(.016,10);
    assert.equal(loads,1);assert.equal(character.lod,1);assert.deepEqual(near.states,['Walk']);
    assert.deepEqual(character.root.position.toArray(),[4,2,7]);
    character.update(.016,30);assert.equal(character.lod,2);
    character.setMovementSpeed(0);assert.equal(far.states.at(-1),'Idle');
    character.dispose();assert.ok(far.disposed&&near.disposed);
});

