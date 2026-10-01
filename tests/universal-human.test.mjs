import test from 'node:test';
import assert from 'node:assert/strict';
import {load} from './load-source.mjs';
const {defaultDNA,parseCharacterDNA,cloneDNA,sexFromMasculinity,nextMasculinity}=load('../src/characters/CharacterDNA.ts');
const {universalHumanProfile,humanMorphNames}=load('../src/characters/UniversalHumanProfile.ts');
test('adult anatomy is deterministic and independent of cunning, temperament and identity sex',()=>{
    const dna={...defaultDNA(),morphology:{masculinity:.51,height:1.8}},first=universalHumanProfile(dna);
    assert.deepEqual(first,universalHumanProfile(dna));
    for(const key of ['cunning','temperament']) assert.deepEqual(first,universalHumanProfile({...dna,traits:{...dna.traits,[key]:1}}));
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

test('masculinity determines sex and excludes the midpoint in both slider directions',()=>{
    assert.equal(sexFromMasculinity(.49),'female');assert.equal(sexFromMasculinity(.51),'male');
    assert.throws(()=>sexFromMasculinity(.5));
    assert.equal(nextMasculinity(50,.49),.51);assert.equal(nextMasculinity(50,.51),.49);
    const dna={...defaultDNA(),sex:'male',morphology:{masculinity:.49,height:1.8}};
    assert.equal(parseCharacterDNA(dna).sex,'female');
    assert.equal(parseCharacterDNA({...dna,sex:undefined}).sex,'female');
    assert.throws(()=>parseCharacterDNA({...dna,morphology:{masculinity:.5,height:1.8}}));
});

test('intelligence controls seeded weight deviation without altering muscle, sex or height',()=>{
    const dna=defaultDNA();let heavy=0,thin=0;
    for(let seed=0;seed<100;seed++){
        const low=universalHumanProfile({...dna,seed,traits:{...dna.traits,intelligence:0}});
        const mid=universalHumanProfile({...dna,seed,traits:{...dna.traits,intelligence:.5}});
        const high=universalHumanProfile({...dna,seed,traits:{...dna.traits,intelligence:1}});
        assert.ok(Math.abs(low.weightDeviation)>Math.abs(mid.weightDeviation));
        assert.equal(high.weights.Overweight,0);assert.equal(high.weights.Underweight,0);
        assert.equal(low.weights.Powerful,high.weights.Powerful);assert.equal(low.weights.Masculine,high.weights.Masculine);
        assert.equal(low.height,high.height);assert.equal(low.weights.Jaw,high.weights.Jaw);
        assert.deepEqual(low,universalHumanProfile({...dna,seed,traits:{...dna.traits,intelligence:0}}));
        if(low.weightDeviation>0)heavy++;else thin++;
    }
    assert.ok(heavy>thin&&thin>0);
});
