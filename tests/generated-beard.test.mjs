import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {Vector3} from 'three';
import {load} from './load-source.mjs';
const {beardAssetPath}=load('../src/character-lab/GeneratedBeard.ts');
const {appearanceModules,disposeModules}=load('../src/character-lab/AppearanceModules.ts');
test('reference braid has verified provenance, owned geometry and the profile hair colour in every LOD',async()=>{
 for(const lod of [0,1,2]){
  const path=beardAssetPath('braid',lod),bytes=readFileSync(new URL(`../public${path}`,import.meta.url));
  const record=JSON.parse(readFileSync(new URL(`../public${path.replace('.glb','.provenance.json')}`,import.meta.url)));
  assert.equal(record.outputSha256,createHash('sha256').update(bytes).digest('hex'));
  assert.equal(record.removedSmallComponentVertices,0);
  const asset=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  const profile={hairStyle:'short',beardStyle:'braid',color:'#9b958d',greyAmount:.7};
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
  disposeModules(group);
 }
 assert.equal(beardAssetPath('none',0),null);assert.equal(beardAssetPath('short',0),null);
});
