import {test} from 'node:test';
import assert from 'node:assert/strict';
import {load} from './load-source.mjs';
const {generateName,fullName,characterName}=load('../src/characters/naming/generateName.ts');
const {nameProfiles}=load('../src/characters/naming/nameProfiles.ts');
const {heritageKeys,defaultDNA,parseCharacterDNA}=load('../src/characters/CharacterDNA.ts');
const context={heritage:{scandinavian:60,gaelic:25,baltic:15},culture:'scandinavian',sex:'male',seed:1983};
test('names are deterministic, normalized and vary across seeds',()=>{
 const name=generateName(context);assert.deepEqual(name,generateName(structuredClone(context)));
 assert.deepEqual(name,generateName({...context,heritage:{scandinavian:.6,gaelic:.25,baltic:.15}}));
 assert.ok(new Set(Array.from({length:100},(_,seed)=>fullName(generateName({...context,seed})))).size>60);
});
test('all cultures and sexes use only their curated grammar and compatible loans',()=>{
 for(const culture of heritageKeys)for(const sex of ['male','female'])for(let seed=0;seed<200;seed++){
  const name=generateName({...context,culture,sex,seed}),profile=nameProfiles[culture];
  const pattern=profile[sex==='male'?'malePatterns':'femalePatterns'].find(p=>p.id===name.derivation.patternId);
  assert.ok(pattern);const [start,end]=name.derivation.components,source=name.derivation.sourceProfiles[0];
  assert.ok((source===culture?pattern.starts:profile.loans[source]).includes(start));assert.ok(pattern.endings.includes(end));
  assert.equal(name.givenName,start+end);assert.match(name.givenName,/^[\p{L}]+$/u);assert.match(name.givenName,/[aeiouyæáÁ]/i);
  assert.equal(name.dominantCulture,culture);assert.equal(Boolean(name.patronymic),culture==='scandinavian');
  if(name.patronymic)assert.ok(name.patronymic.endsWith(sex==='male'?'son':'dóttir'));
 }
});
test('heritage shifts compatible source probabilities without forcing mixed names',()=>{
 let pure=0,mixed=0,local=0;
 for(let seed=0;seed<2000;seed++){
  pure+=generateName({...context,seed,heritage:{scandinavian:1}}).derivation.sourceProfiles[0]==='gaelic';
  const source=generateName({...context,seed,heritage:{gaelic:1}}).derivation.sourceProfiles[0];mixed+=source==='gaelic';local+=source==='scandinavian';
 }
 assert.equal(pure,0);assert.ok(mixed>300&&mixed<500);assert.ok(local>1500);
 for(const culture of ['gaelic','finnic','sami']){
  const patterns=(heritage)=>Array.from({length:300},(_,seed)=>generateName({...context,culture,seed,heritage}).derivation.patternId);
  assert.notDeepEqual(patterns({sami:1}),patterns({angloSaxon:1}));
 }
});
test('name configuration round trips independently of phenotype DNA; legacy DNA works',()=>{
 const dna=defaultDNA(),named={...dna,naming:{culture:'baltic',seed:13}};
 assert.deepEqual(parseCharacterDNA(JSON.parse(JSON.stringify(named))),named);
 assert.deepEqual(characterName(dna),characterName(parseCharacterDNA(dna)));
 assert.notDeepEqual(characterName(named),characterName({...named,naming:{...named.naming,seed:14}}));
 assert.throws(()=>parseCharacterDNA({...dna,naming:{culture:'unknown',seed:0}}));
 assert.throws(()=>parseCharacterDNA({...dna,naming:{culture:'sami',seed:-1}}));
 const parent=generateName({...context,family:{father:{givenName:'Bjorn',genitive:'Bjarnar'}}});
 assert.equal(parent.patronymic,'Bjarnarson');assert.equal(parent.derivation.parentSource,'provided');
 assert.equal(fullName({...parent,epithet:'Wolf-Eye'}),fullName(parent)+' “Wolf-Eye”');
});
