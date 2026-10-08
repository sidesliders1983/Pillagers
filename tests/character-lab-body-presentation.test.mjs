import test from 'node:test';import assert from 'node:assert/strict';import {load} from './load-source.mjs';
const {defaultDNA,serializeCharacterDNA}=load('../src/characters/CharacterDNA.ts');
const {universalHumanProfile}=load('../src/characters/UniversalHumanProfile.ts');
const {goldenCharacters}=load('../src/characters/GoldenCharacters.ts');
const {parseLabBodyPresentation,resolveLabBodyProfile}=load('../src/characters/LabBodyPresentation.ts');

test('Auto body presentation preserves every existing Golden identity profile exactly',()=>{
 for(const {dna} of goldenCharacters){const before=serializeCharacterDNA(dna),resolved=resolveLabBodyProfile(dna);assert.deepEqual(resolved.profile,universalHumanProfile(dna));assert.equal(resolved.status,'auto');assert.equal(serializeCharacterDNA(dna),before);}
});

test('technical Neutral changes only visual weights and displayed height; shared anatomy knobs stay unavailable',()=>{
 const dna=defaultDNA(),before=serializeCharacterDNA(dna),base=universalHumanProfile(dna),r=resolveLabBodyProfile(dna,{version:1,preset:'neutral'});
 assert.equal(r.profile.height,1.44);for(const key of ['Masculine','Feminine','Breasts','Powerful','Slight','Agile','Grounded','Overweight','Underweight','Age','Tall','Short','LegRatio','ShoulderSlope','Asymmetry'])assert.equal(r.profile.weights[key],0,key);
 const {weights:_a,height:_b,...identity}=r.profile,{weights:_c,height:_d,...original}=base;assert.deepEqual(identity,original);assert.equal(serializeCharacterDNA(dna),before);
 assert.throws(()=>parseLabBodyPresentation({version:1,preset:'neutral',headScale:2}));
});

test('explicit zero overrides seed-derived values and one-sided edits clear opposed axes',()=>{
 const dna={...defaultDNA(),age:75,morphology:{masculinity:1,height:1.6}};
 const r=resolveLabBodyProfile(dna,{version:1,preset:'auto',morphs:{Masculine:0,Overweight:0,Agile:0}});
 for(const key of ['Masculine','Overweight','Agile','MasculineAgility','ElderHeavy'])assert.equal(r.profile.weights[key],0,key);
 const opposite=resolveLabBodyProfile(dna,{version:1,preset:'auto',morphs:{Feminine:1,Underweight:.7}});assert.equal(opposite.profile.weights.Masculine,0);assert.equal(opposite.profile.weights.Overweight,0);assert.equal(opposite.profile.weights.Feminine,.6);assert.equal(opposite.profile.weights.Breasts,.6);
});

test('shared pre-strength body composition scales bases and compounds once rather than compounding .6',()=>{
 const a=resolveLabBodyProfile(defaultDNA(),{version:1,preset:'neutral',morphs:{Masculine:1,Agile:1,Overweight:.5,Age:.8}}).profile;
 assert.equal(a.weights.Masculine,.6);assert.equal(a.weights.Agile,.6);assert.equal(a.weights.MasculineAgility,.6);assert.equal(a.weights.ElderHeavy,.8*.5*.6);
 const b=resolveLabBodyProfile(defaultDNA(),{version:1,preset:'neutral',morphs:{Feminine:.8,Powerful:.9,Breasts:.4}}).profile;
 assert.equal(b.weights.FemininePower,.8*.9*.6);assert.equal(b.weights.Breasts,.4*.6);
});

test('visual power/posture overrides do not restore Physicality anatomy or change real age/appearance/motion/eligibility',()=>{
 const d=defaultDNA(),a=universalHumanProfile({...d,traits:{...d.traits,physicality:0}}),b=universalHumanProfile({...d,traits:{...d.traits,physicality:1}});assert.deepEqual(a.weights,b.weights);
 const power=resolveLabBodyProfile(d,{version:1,preset:'auto',morphs:{Powerful:1}}).profile;assert.equal(power.weights.Powerful,.6);
 for(const [age,visualAge]of [[32,1],[75,0]]){const dna={...d,age},base=universalHumanProfile(dna),p=resolveLabBodyProfile(dna,{version:1,preset:'auto',morphs:{Age:visualAge}}).profile;assert.equal(p.age,age);assert.equal(p.stage,base.stage);assert.deepEqual(p.appearance,base.appearance);assert.deepEqual(p.motion,base.motion);assert.equal(p.masculinity,base.masculinity);assert.equal(p.weights.Age,visualAge);}
});

test('adult height override uses existing range/axes without writing another DNA field',()=>{
 const dna=defaultDNA(),original=serializeCharacterDNA(dna),p=resolveLabBodyProfile(dna,{version:1,preset:'auto',morphology:{height:1.16}}).profile;
 assert.equal(p.height,1.16);assert.equal(p.weights.Short,1);assert.equal(p.weights.Tall,0);assert.equal(serializeCharacterDNA(dna),original);assert.throws(()=>parseLabBodyPresentation({version:1,preset:'auto',morphology:{heightScale:.8}}));
});

test('requested adult controls pause below eighteen while original child/teen growth and identity still render',()=>{
 for(const age of [6,9,12,15,17]){const dna={...defaultDNA(),age},r=resolveLabBodyProfile(dna,{version:1,preset:'neutral',morphs:{Powerful:1},morphology:{height:1.6}});assert.equal(r.status,'unsupported-age');assert.deepEqual(r.profile,universalHumanProfile(dna));assert.equal(r.body.morphs.Powerful,1);}
 assert.equal(resolveLabBodyProfile({...defaultDNA(),age:18},{version:1,preset:'neutral'}).status,'override');
});

test('unknown axes/presets, malformed values, direct compounds, child controls and incompatible pairs fail explicitly',()=>{
 for(const body of [null,[],{version:4,preset:'auto'},{version:1,preset:'Giant'},{version:1,preset:'auto',morphs:{Masculine:1,Feminine:1}},{version:1,preset:'auto',morphs:{Age:Infinity}},{version:1,preset:'auto',morphs:{Child:1}},{version:1,preset:'auto',morphs:{ElderHeavy:.5}},{version:1,preset:'auto',morphs:{LegRatio:.251}},{version:1,preset:'auto',morphology:{height:1.61}},{version:1,preset:'auto',morphs:{Powerful:'1'}}])assert.throws(()=>parseLabBodyPresentation(body));
});


test('prototype-named axes are rejected as unknown own keys rather than inherited range entries',()=>{
 for(const key of ['constructor','toString','__proto__']){
  const morphs=JSON.parse(JSON.stringify(Object.fromEntries([[key,.5]])));assert.equal(Object.hasOwn(morphs,key),true);
  assert.throws(()=>parseLabBodyPresentation({version:1,preset:'auto',morphs}),/Unsupported Lab body axis/);
 }
 assert.equal(parseLabBodyPresentation({version:1,preset:'auto',morphs:{Agile:0}}).morphs.Agile,0);assert.equal(Object.prototype.Agile,undefined);
});
