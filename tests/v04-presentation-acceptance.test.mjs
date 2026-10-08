import test from 'node:test';
import assert from 'node:assert/strict';
import {load} from './load-source.mjs';
const {defaultDNA,serializeCharacterDNA}=load('../src/characters/CharacterDNA.ts');
const {characterAssets,characterAssetFitsBody}=load('../src/characters/CharacterAssets.ts');
const {v04BodyIdentity}=load('../src/characters/V04ModuleCatalog.ts');
const {resolveCharacterPresentation,presentationChoices}=load('../src/characters/CharacterPresentation.ts');

test('Auto excludes compatible unaccepted previews while explicit inspection stays available and DNA stays fixed',()=>{
 const hair=characterAssets.filter(a=>a.type==='hair'&&characterAssetFitsBody(a,v04BodyIdentity));
 assert.ok(hair.length,'actual registered new-source hair fixture required');
 const statuses=hair.map(a=>a.reviewStatus),dna=defaultDNA(),before=serializeCharacterDNA(dna);
 try{
  for(const a of hair)a.reviewStatus='preview';
  assert.equal(resolveCharacterPresentation(dna,undefined,v04BodyIdentity).hairId,null,'Auto must not expose any compatible unaccepted source');
  assert.ok(presentationChoices('hair',v04BodyIdentity).some(a=>a.id===hair[0].id&&a.label.endsWith('(preview)')),'manual candidate inspection is explicitly labelled');
  assert.equal(resolveCharacterPresentation(dna,{hair:hair[0].id},v04BodyIdentity).hairId,hair[0].id,'explicit manual preview selection remains exact');
  hair[0].reviewStatus='accepted';
  assert.equal(resolveCharacterPresentation(dna,undefined,v04BodyIdentity).hairId,hair[0].id,'Auto selects the sole independently accepted source');
  assert.equal(serializeCharacterDNA(dna),before,'review status does not write identity');
 }finally{hair.forEach((a,i)=>{a.reviewStatus=statuses[i];});}
});

test('accepted-only automatic policy leaves the legacy body deterministic',()=>{
 const dna=defaultDNA(),a=resolveCharacterPresentation(dna);
 assert.deepEqual(resolveCharacterPresentation(structuredClone(dna)),a);
 assert.ok(a.hairId===null||a.hairId.startsWith('hair/'));
});
