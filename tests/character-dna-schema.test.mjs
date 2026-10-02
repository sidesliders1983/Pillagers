import test from 'node:test';
import assert from 'node:assert/strict';
import {load} from './load-source.mjs';
const {defaultDNA,parseCharacterDNA,serializeCharacterDNA,deserializeCharacterDNA,cloneDNA}=load('../src/characters/CharacterDNA.ts');
const {generateCharacterDNA}=load('../src/characters/generateCharacterDNA.ts');
const {universalHumanProfile}=load('../src/characters/UniversalHumanProfile.ts');
const {generatePhenotype}=load('../src/characters/generatePhenotype.ts');
const {goldenCharacters,goldenCharacterDNA}=load('../src/characters/GoldenCharacters.ts');

test('legacy user DNA migrates without changing seed, identity, phenotype or morphology',()=>{
    const legacy={seed:1885184954,sex:'male',age:20,
        traits:{physicality:.78,agility:.57,intelligence:.12,cunning:.2,temperament:.71},
        heritage:{scandinavian:.028440025880589824,angloSaxon:.23439964981313144,gaelic:.1594962292471368,finnic:.17366774106331118,sami:.17360313309252673,baltic:.23039322090330414}};
    const before=structuredClone(legacy),migrated=deserializeCharacterDNA(JSON.stringify(legacy));
    assert.equal(migrated.schemaVersion,1);assert.equal(migrated.seed,legacy.seed);assert.deepEqual(legacy,before);
    assert.deepEqual(universalHumanProfile(legacy),universalHumanProfile(migrated));
    assert.deepEqual(generatePhenotype(legacy),generatePhenotype(migrated));
    assert.deepEqual(parseCharacterDNA({...legacy,schemaVersion:0}),migrated);
});
test('all serialization paths use v1; generated and imported DNA round-trip with derived sex',()=>{
    for(const input of [defaultDNA(),generateCharacterDNA(42),...goldenCharacters.map(f=>f.dna)]){
        const json=serializeCharacterDNA(input),dna=deserializeCharacterDNA(json);
        assert.equal(dna.schemaVersion,1);assert.deepEqual(dna,parseCharacterDNA(input));
        assert.equal(serializeCharacterDNA(dna),json);
    }
    const feminine=deserializeCharacterDNA(JSON.stringify({...defaultDNA(),morphology:{masculinity:.19,height:1.33}}));
    assert.equal(feminine.sex,'female');
});
test('unsupported/malformed schemas and invalid ranges fail clearly before runtime',()=>{
    for(const schemaVersion of [2,-1,1.5,'1',null])assert.throws(()=>parseCharacterDNA({...defaultDNA(),schemaVersion}),/unsupported schemaVersion/);
    assert.throws(()=>deserializeCharacterDNA('{broken'),/invalid JSON/);
    assert.throws(()=>parseCharacterDNA([]),/JSON object/);
    assert.throws(()=>parseCharacterDNA({...defaultDNA(),traits:[]}),/traits/);
    assert.throws(()=>parseCharacterDNA({...defaultDNA(),morphology:{masculinity:.5,height:1.5}}),/50%/);
    assert.throws(()=>parseCharacterDNA({...defaultDNA(),morphology:{masculinity:1,height:1.61}}),/height/);
    assert.throws(()=>parseCharacterDNA({...defaultDNA(),seed:4294967296}),/32-bit/);
});
test('Golden Characters are fixed, immutable and return independent editable DNA',()=>{
    assert.equal(goldenCharacters.length,12);assert.equal(new Set(goldenCharacters.map(f=>f.id)).size,12);
    const first=goldenCharacterDNA('golden_mixed_01'),second=goldenCharacterDNA('golden_mixed_01');
    assert.equal(first.seed,1731203494);assert.equal(first.morphology.masculinity,.19);assert.equal(first.traits.agility,1);
    first.heritage.scandinavian=1;first.traits.intelligence=1;first.morphology.height=1.6;
    assert.deepEqual(second,goldenCharacterDNA('golden_mixed_01'));
    assert.throws(()=>{goldenCharacters[0].dna.age=60;},TypeError);
    assert.throws(()=>goldenCharacterDNA('missing'),/Unknown Golden/);
    const source=goldenCharacterDNA('golden_child_01'),copy=cloneDNA(source);copy.appearanceFit.hair=1.3;assert.equal(source.appearanceFit.hair,1);
});
