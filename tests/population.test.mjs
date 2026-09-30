import {test} from 'node:test';
import assert from 'node:assert/strict';
import {load} from './load-source.mjs';
const {generateCharacterDNA}=load('../src/characters/generateCharacterDNA.ts');
const {parseCharacterDNA}=load('../src/characters/CharacterDNA.ts');
const {generatePhenotype}=load('../src/characters/generatePhenotype.ts');
const {characterName,fullName}=load('../src/characters/naming/generateName.ts');
const {worldConfig}=load('../src/config/worldConfig.ts');
test('ten world residents use reproducible lab DNA with varied age, sex, traits and heritage',()=>{
 const residents=Array.from({length:worldConfig.villagers},(_,i)=>generateCharacterDNA((worldConfig.seed+Math.imul(i+1,2654435761))>>>0));
 assert.equal(residents.length,10);assert.equal(new Set(residents.map(d=>d.sex)).size,2);assert.ok(new Set(residents.map(d=>d.age)).size>5);
 assert.ok(new Set(residents.map(d=>fullName(characterName(d)))).size>=6);
 for(const dna of residents){
  assert.deepEqual(generateCharacterDNA(dna.seed),dna);const parsed=parseCharacterDNA(dna);
  assert.deepEqual({...parsed,heritage:dna.heritage},dna);for(const key of Object.keys(dna.heritage))assert.ok(Math.abs(parsed.heritage[key]-dna.heritage[key])<1e-12);
  assert.deepEqual(characterName(parsed),characterName(dna));assert.ok(dna.age>=18&&dna.age<=80);assert.ok(generatePhenotype(dna).height>0);
 }
});
