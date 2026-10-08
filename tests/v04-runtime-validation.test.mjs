import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTypeScript} from '../scripts/load-typescript.mjs';
import {readGLB,geometryGLTF} from '../scripts/characters/glb-inspection.mjs';
import {runtimeValidationPlan,validateAssetRecord} from '../scripts/characters/validation.mjs';
const {characterAssets,characterAsset}=loadTypeScript(new URL('../src/characters/CharacterAssets.ts',import.meta.url));
const {labBodyAsset,goldenLabBody}=loadTypeScript(new URL('../src/characters/LabBodySources.ts',import.meta.url));
const {CharacterFactory}=loadTypeScript(new URL('../src/characters/CharacterFactory.ts',import.meta.url));
const {goldenCharacterDNA}=loadTypeScript(new URL('../src/characters/GoldenCharacters.ts',import.meta.url));
const sword=()=>structuredClone(characterAsset('equipment/v04-sword'));

test('runtime plan uses the exact source-bound v04 body and measured supported carries',()=>{
 const asset=sword();asset.reviewStatus='accepted';const [plan]=runtimeValidationPlan([asset]);
 assert.equal(plan.body.id,goldenLabBody.id);assert.equal(plan.body.sha256,goldenLabBody.sha256);assert.equal(plan.bodyPresentation.source,'golden-v04-preview');
 assert.deepEqual(plan.carries,Object.keys(asset.metadata.equipmentBindings.sockets));assert.equal(plan.carries.length,5);
 const legacy=characterAssets.filter(a=>a.metadata&&!a.scope),partitioned=runtimeValidationPlan(legacy);assert.equal(partitioned.length,legacy.length);assert.ok(partitioned.every(item=>item.body.id==='body/universal-human'&&item.bodyPresentation.source==='published'));
 for(const mutation of [a=>a.compatibleBodies[0].sha256='0'.repeat(64),a=>a.compatibleBodies[0].id='body/universal-human',a=>delete a.compatibleBodies,a=>a.metadata.equipmentBindings.sockets={}]){const invalid=sword();invalid.reviewStatus='accepted';mutation(invalid);assert.throws(()=>runtimeValidationPlan([invalid]));}
});
test('preview runtime audit is opt-in and cannot silently become final acceptance',()=>{
 const asset=sword();asset.reviewStatus='preview';assert.throws(()=>runtimeValidationPlan([asset]),/unreviewed v0.4 runtime module/);assert.equal(runtimeValidationPlan([asset],{allowLabPreview:true})[0].body.source,'golden-v04-preview');
 asset.scope='invented';assert.throws(()=>runtimeValidationPlan([asset],{allowLabPreview:true}),/unsupported runtime asset scope/);
});
test('rigid equipment rejects independent skins and animations in its actual source GLB',()=>{
 const asset=sword(),record=readGLB(asset.lods[2]);assert.equal(validateAssetRecord(asset,2,record),288);
 for(const mutate of [json=>json.skins=[{joints:[]}],json=>json.animations=[{name:'OwnMotion',channels:[],samplers:[]}]]){const changed={...record,json:structuredClone(record.json)};mutate(changed.json);assert.throws(()=>validateAssetRecord(asset,2,changed),/rigid equipment must not own a skin or animation/);}
});
test('actual canonical factory equips all sword carry frames on r3 and rejects the legacy body',async()=>{
 const sources=new Map(),factory=new CharacterFactory(async url=>{const path=url.split('?')[0];if(!sources.has(path))sources.set(path,await geometryGLTF(readGLB(path)));return sources.get(path);});
 const bare={hair:'none',beard:'none',outfit:'none',equipment:'none',equipmentSocket:'auto',hairColor:null,technicalWaistWrap:false},dna=goldenCharacterDNA('golden_masculine_01');
 const candidate=await factory.create(dna,2,bare,{version:1,preset:'neutral',source:goldenLabBody.source}),legacy=await factory.create(dna,2,bare);
 try{
  assert.equal(candidate.root.userData.bodySource.sha256,labBodyAsset(goldenLabBody.source,2).sha256);
  for(const socket of Object.keys(sword().metadata.equipmentBindings.sockets)){
   await factory.equip(candidate,'equipment/v04-sword',socket);const module=candidate.fit.modules.get('equipment/v04-sword');assert.ok(module);assert.ok(module.object.parent);let triangles=0;module.object.traverse(object=>{if(object.isMesh)triangles+=(object.geometry.index?.count??object.geometry.attributes.position.count)/3;});assert.equal(triangles,288);
   for(const clip of ['Idle','Walk','Run']){candidate.setAnimation(clip);candidate.update(.1);candidate.root.updateMatrixWorld(true);assert.ok(module.object.matrixWorld.elements.every(Number.isFinite));}
   factory.unequip(candidate,'equipment/v04-sword');assert.ok(!candidate.fit.modules.has('equipment/v04-sword'));
  }
  await assert.rejects(()=>factory.equip(legacy,'equipment/v04-sword'),/cannot be fitted to a legacy body/);
 }finally{candidate.dispose();legacy.dispose();}
});
