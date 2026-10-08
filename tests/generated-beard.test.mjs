import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {Vector3} from 'three';
import {load} from './load-source.mjs';
import {readGLB,geometryGLTF} from '../scripts/characters/glb-inspection.mjs';
const {beardAssetPath}=load('../src/character-lab/GeneratedBeard.ts');
const {appearanceModules,disposeModules}=load('../src/character-lab/AppearanceModules.ts');
test('all reference beards have verified provenance, owned geometry and the profile hair colour',async()=>{
 for(const style of ['stubble','short','medium','long','split-braid','braid'])for(const lod of style==='braid'?[0,1,2]:[2]){
  const path=beardAssetPath(style,lod),bytes=readFileSync(new URL(`../public${path}`,import.meta.url));
  const record=JSON.parse(readFileSync(new URL(`../public${path.replace('.glb','.provenance.json')}`,import.meta.url)));
  assert.equal(record.outputSha256,createHash('sha256').update(bytes).digest('hex'));
  assert.equal(new URL(path,'https://local.test').searchParams.get('v'),record.outputSha256.slice(0,12));
  assert.equal(record.reviewRequired,false);
  const cleanup=[];
  const inspect=value=>{if(!value||typeof value!=='object')return;for(const [key,child]of Object.entries(value)){
   if(/^removed.*(?:Faces|Vertices)$/i.test(key))cleanup.push(child);
   if(child&&typeof child==='object')inspect(child);
  }};
  inspect(record);
  assert.ok(cleanup.length>0&&cleanup.every(value=>Number.isFinite(value)&&value>=0),'reference cleanup metrics must remain in the authoring chain');
  // This test owns geometry/profile tint and size semantics. Embedded MASK
  // textures are decoded by the independent browser pass; Node has no image
  // decoder. Geometry inspection retains the exact source accessors/BIN.
  const asset=await geometryGLTF(readGLB(path.split('?')[0]));
  const profile={hairStyle:'short',beardStyle:style,color:'#9b958d',greyAmount:.7};
  const group=appearanceModules(profile,new Vector3(.1992,.2397,.2189),lod,undefined,null,[],asset.scene);
  assert.equal(group.userData.beardAsset,'reference-generated');
  assert.ok(group.getObjectByName('GeneratedBeard'));
  const meshes=[];group.traverse(o=>{if(o.isMesh)meshes.push(o)});
  const originals=[];asset.scene.traverse(o=>{if(o.isMesh)originals.push(o)});
  assert.equal(meshes.length,originals.length);
  for(let i=0;i<meshes.length;i++){
   assert.notEqual(meshes[i].geometry,originals[i].geometry);
   assert.equal(`#${meshes[i].material.color.getHexString()}`,profile.color);
  }
  const enlarged=appearanceModules(profile,new Vector3(.1992,.2397,.2189),lod,{hair:1,beard:1.5,clothing:1},null,[],asset.scene);
  const largeMeshes=[];enlarged.traverse(o=>{if(o.isMesh)largeMeshes.push(o)});
  for(let i=0;i<meshes.length;i++){
   const base=meshes[i].geometry.attributes.position,large=largeMeshes[i].geometry.attributes.position;
   for(let v=0;v<base.count;v++)if(base.getY(v)>=-.045){
    assert.ok(new Vector3().fromBufferAttribute(base,v).distanceTo(new Vector3().fromBufferAttribute(large,v))<1e-6,'Size slider must preserve the cheek attachment');
   }
  }
  disposeModules(enlarged);
  disposeModules(group);
 }
 assert.equal(beardAssetPath('none',0),null);
 for(const style of ['stubble','short','medium','long','split-braid'])for(const lod of [0,1])assert.equal(beardAssetPath(style,lod),beardAssetPath(style,2));
});
