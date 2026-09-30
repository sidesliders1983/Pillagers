import {test} from 'node:test';
import assert from 'node:assert/strict';
import {load} from './load-source.mjs';
const {defaultDNA,cloneDNA,parseCharacterDNA,normalizeHeritage,editHeritage,heritageKeys}=load('../src/characters/CharacterDNA.ts');
const {generatePhenotype}=load('../src/characters/generatePhenotype.ts');
const {occupationFit,occupations}=load('../src/characters/occupationFit.ts');
const {mixedProbabilities}=load('../src/characters/heritageProfiles.ts');
const anatomy=['height','headWidth','headHeight','jawWidth','noseLength','cheekboneHeight','eyeSpacing','earSize','asymmetry','hairline'];
test('identical DNA produces identical phenotype and seed changes preserve the broad build',()=>{
  const dna=defaultDNA(),first=generatePhenotype(dna);
  assert.deepEqual(first,generatePhenotype(JSON.parse(JSON.stringify(dna))));
  const second=generatePhenotype({...dna,seed:dna.seed+1});
  assert.notDeepEqual(first,second);assert.notEqual(first.noseLength,second.noseLength);
  assert.ok(Math.abs(first.torsoMass-second.torsoMass)<.08);
});
test('heritage normalization handles partial, zero and invalid weights',()=>{
  const mix=normalizeHeritage({scandinavian:50,gaelic:25,baltic:25});
  assert.equal(mix.scandinavian,.5);assert.equal(mix.gaelic,.25);assert.equal(mix.baltic,.25);
  for(const source of [{},{sami:-3,gaelic:NaN,finnic:Infinity},{scandinavian:1e308,baltic:1e308},mix]){
    const result=normalizeHeritage(source);assert.ok(Math.abs(Object.values(result).reduce((a,b)=>a+b,0)-1)<1e-12);assert.ok(Object.values(result).every(v=>Number.isFinite(v)&&v>=0));
  }
  const edited=editHeritage(mix,'sami',.7);assert.equal(edited.sami,.7);assert.ok(Math.abs(Object.values(edited).reduce((a,b)=>a+b,0)-1)<1e-12);
  assert.ok(Math.abs(edited.scandinavian/edited.gaelic-2)<1e-12);
  const full=editHeritage(mix,'sami',1),reduced=editHeritage(full,'sami',.5);
  assert.equal(reduced.sami,.5);assert.ok(heritageKeys.filter(k=>k!=='sami').every(k=>Math.abs(reduced[k]-.1)<1e-12));
});
test('all heritage profiles overlap and mixed probabilities remain normalized',()=>{
  for(const key of heritageKeys)for(const category of ['hair','eyes','skin']){
    const probabilities=mixedProbabilities(normalizeHeritage({[key]:1}),category);
    assert.ok(probabilities.every(p=>p>0));assert.ok(Math.abs(probabilities.reduce((a,b)=>a+b,0)-1)<1e-12);
  }
});
test('physicality and agility visibly affect both sexes through the same axes',()=>{
  for(const sex of ['male','female']){
    const dna={...defaultDNA(),sex};const slight=cloneDNA(dna);slight.traits.physicality=0;const strong=cloneDNA(dna);strong.traits.physicality=1;
    const a=generatePhenotype(slight),b=generatePhenotype(strong);
    assert.ok(b.shoulderWidth>a.shoulderWidth*1.4);assert.ok(b.armThickness>a.armThickness*1.5);assert.ok(b.torsoMass>a.torsoMass);
    const slow=cloneDNA(dna);slow.traits.agility=0;const nimble=cloneDNA(dna);nimble.traits.agility=1;
    const c=generatePhenotype(slow),d=generatePhenotype(nimble);
    assert.ok(d.legRatio>c.legRatio);assert.ok(d.movementWeight<c.movementWeight);assert.ok(d.movementSpeed>c.movementSpeed);
  }
});
test('intelligence, cunning and temperament do not alter facial anatomy',()=>{
  const dna=defaultDNA(),baseline=generatePhenotype(dna);
  for(const key of ['intelligence','cunning','temperament']){
    const changed=cloneDNA(dna);changed.traits[key]=1;const phenotype=generatePhenotype(changed);
    for(const field of anatomy)assert.equal(phenotype[field],baseline[field],field);
    assert.equal(phenotype.skinTone,baseline.skinTone);
  }
});
test('aging preserves identity samples and moderates relative agility',()=>{
  const dna=defaultDNA();dna.traits.agility=1;
  const young=generatePhenotype({...dna,age:20}),old=generatePhenotype({...dna,age:68});
  for(const field of ['height','headWidth','jawWidth','noseLength','eyeSpacing','asymmetry'])assert.equal(young[field],old[field]);
  assert.ok(old.movementSpeed<young.movementSpeed);assert.notEqual(old.hairColor,young.hairColor);
});
test('occupation fit is bounded, responds to preferences and ignores heritage, sex, age and seed',()=>{
  const dna=defaultDNA();
  for(let i=0;i<20;i++)for(const key of Object.keys(occupations)){
    const varied=cloneDNA(dna);for(const trait of Object.keys(varied.traits))varied.traits[trait]=i/19;
    const fit=occupationFit(varied,key);assert.ok(fit>=.15&&fit<=1);
    assert.equal(fit,occupationFit({...varied,sex:'female',age:95,seed:999,heritage:normalizeHeritage({sami:1})},key));
  }
  const low=cloneDNA(dna),high=cloneDNA(dna);low.traits.physicality=.1;high.traits.physicality=.85;assert.ok(occupationFit(high,'blacksmith')>occupationFit(low,'blacksmith'));
  low.traits.agility=.1;high.traits.agility=.95;assert.ok(occupationFit(high,'scout')>occupationFit(low,'scout'));
  low.traits.intelligence=.1;high.traits.intelligence=.95;assert.ok(occupationFit(high,'healer')>occupationFit(low,'healer'));
  low.traits.cunning=.1;high.traits.cunning=.85;assert.ok(occupationFit(high,'trader')>occupationFit(low,'trader'));
});
test('JSON import roundtrips mixed DNA and rejects invalid data without silently changing identity',()=>{
  const dna=defaultDNA();assert.deepEqual(parseCharacterDNA(JSON.parse(JSON.stringify(dna))),dna);
  const partial={...dna,heritage:{scandinavian:50,baltic:50}};assert.equal(parseCharacterDNA(partial).heritage.baltic,.5);
  for(const invalid of [{...dna,seed:-1},{...dna,sex:'unknown'},{...dna,age:101},{...dna,traits:{...dna.traits,intelligence:2}},{...dna,heritage:{unknown:1}}])assert.throws(()=>parseCharacterDNA(invalid));
});
