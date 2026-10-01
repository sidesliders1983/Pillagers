import test from 'node:test';
import assert from 'node:assert/strict';
import {load} from './load-source.mjs';
const {defaultDNA,parseCharacterDNA,cloneDNA}=load('../src/characters/CharacterDNA.ts');
const {universalHumanProfile,humanMorphNames}=load('../src/characters/UniversalHumanProfile.ts');
test('adult anatomy is deterministic and independent of cognitive traits, temperament and identity sex',()=>{
    const dna=defaultDNA(),first=universalHumanProfile(dna);
    assert.deepEqual(first,universalHumanProfile(dna));
    for(const key of ['intelligence','cunning','temperament']) assert.deepEqual(first,universalHumanProfile({...dna,traits:{...dna.traits,[key]:1}}));
    assert.deepEqual(first,universalHumanProfile({...dna,sex:'female'}));
    assert.notDeepEqual(first,universalHumanProfile({...dna,seed:dna.seed+1}));
    assert.deepEqual(Object.keys(first.weights),humanMorphNames);
});
test('physicality and agility compose independently; explicit morphology survives DNA roundtrip',()=>{
    const dna={...defaultDNA(),morphology:{masculinity:.95,height:2.1},traits:{...defaultDNA().traits,physicality:1,agility:1}};
    assert.deepEqual(parseCharacterDNA(JSON.parse(JSON.stringify(dna))),dna);
    const profile=universalHumanProfile(dna);
    assert.equal(profile.weights.Powerful,1);assert.equal(profile.weights.Agile,1);assert.equal(profile.weights.Tall,1);
    const clone=cloneDNA(dna);clone.morphology.height=1.5;assert.equal(dna.morphology.height,2.1);
    assert.throws(()=>parseCharacterDNA({...dna,morphology:{masculinity:NaN,height:1.8}}));
    assert.throws(()=>parseCharacterDNA({...dna,morphology:{masculinity:.5,height:0}}));
    assert.equal(universalHumanProfile({...dna,age:0}).adultAge,18);
});
