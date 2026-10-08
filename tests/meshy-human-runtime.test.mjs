import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {createRequire} from 'node:module';
import {load} from './load-source.mjs';
const require=createRequire(import.meta.url);
const {GLTFLoader}=require('three/addons/loaders/GLTFLoader.js');
const {MeshoptDecoder}=require('three/addons/libs/meshopt_decoder.module.js');
const {AnimationMixer,LoopOnce}=require('three');
const {MeshyHumanFactory,meshyAnimationClips}=load('../src/characters/MeshyHuman.ts');
const {generateCharacterDNA}=load('../src/characters/generateCharacterDNA.ts');
globalThis.self=globalThis;
// Node has no image decoder; browser QA verifies rendering.
globalThis.createImageBitmap=async()=>({width:2048,height:2048,close(){}});
const loader=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
async function readAsset(path){const bytes=await readFile(new URL(path,import.meta.url));return loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');}
const hasAssets=existsSync(new URL('../Assets/Characters/Human/Human-textured.glb',import.meta.url))&&existsSync(new URL('../public/game-assets/human/Human_LOD0.glb',import.meta.url));
const source=hasAssets?await readAsset('../Assets/Characters/Human/Human-textured.glb'):null;
const optimized=hasAssets?await readAsset('../public/game-assets/human/Human_LOD0.glb'):null;
const dna=generateCharacterDNA(1983);

test('runtime export preserves all source clips and sampled bone motion',{skip:!hasAssets},()=>{
 assert.deepEqual(optimized.animations.map(a=>a.name),source.animations.map(a=>a.name));
 const a=new AnimationMixer(source.scene),b=new AnimationMixer(optimized.scene);
 for(const sourceClip of source.animations){
  const targetClip=optimized.animations.find(c=>c.name===sourceClip.name);
  assert.ok(Math.abs(sourceClip.duration-targetClip.duration)<.0001);
  a.stopAllAction();b.stopAllAction();a.clipAction(sourceClip).setLoop(LoopOnce,1).play();b.clipAction(targetClip).setLoop(LoopOnce,1).play();
  for(const time of [0,sourceClip.duration*.3,sourceClip.duration*.7,sourceClip.duration-.001]){
   a.setTime(time);b.setTime(time);
   source.scene.traverse(node=>{if(node.isBone){const target=optimized.scene.getObjectByName(node.name);assert.ok(target,node.name);assert.ok(node.position.distanceTo(target.position)<.002,sourceClip.name+' position '+node.name);assert.ok(node.quaternion.clone().normalize().angleTo(target.quaternion.clone().normalize())<.005,sourceClip.name+' rotation '+node.name);}});
  }
 }
 a.stopAllAction();b.stopAllAction();
});
test('40 residents share source geometry but own independent skeletons and mixers',{skip:!hasAssets},async()=>{
 let calls=0;const factory=new MeshyHumanFactory(async()=>{calls++;return optimized;});
 const models=await Promise.all(Array.from({length:40},(_,i)=>factory.create(generateCharacterDNA(i),0)));
 assert.equal(calls,1);
 const meshes=models.map(model=>{let mesh;model.root.traverse(node=>{if(node.isSkinnedMesh)mesh=node;});return mesh;});
 assert.equal(new Set(meshes.map(mesh=>mesh.geometry)).size,1);
 assert.equal(new Set(meshes.map(mesh=>mesh.skeleton.bones[0])).size,40);
 assert.equal(new Set(meshes.map(mesh=>mesh.material)).size,40);
 models[0].setAnimation('Talk');models[0].update(.2);
 assert.equal(models[1].root.userData.clip,'Idle_02');
 for(const state of Object.keys(meshyAnimationClips)){models[0].setAnimation(state);models[0].update(.1);}
 models[0].setAnimation('Death');models[0].update(20);
 let bone;models[0].root.traverse(node=>{if(node.isBone&&!bone)bone=node;});
 const position=bone.position.clone();models[0].update(1);assert.ok(position.equals(bone.position));
 models[0].root.position.set(5,0,7);models[0].applyDNA(generateCharacterDNA(500));assert.deepEqual(models[0].root.position.toArray(),[5,0,7]);
 models[0].dispose();models[1].update(.1);models.forEach(model=>model.dispose());
});
test('each LOD decodes with a rig, all source clips and decreasing triangle counts',{skip:!hasAssets},async()=>{
 let previous=Infinity;
 for(const lod of [0,1,2]){
  const asset=await readAsset('../public/game-assets/human/Human_LOD'+lod+'.glb');let count=0,rig;
  asset.scene.traverse(node=>{if(node.isSkinnedMesh){rig=node.skeleton;count+=node.geometry.index.count/3;}});
  assert.equal(asset.animations.length,source.animations.length);assert.equal(rig.bones.length,44);assert.ok(count<previous);previous=count;
 }
});



test('optimized geometry preserves the animated silhouette within 5 mm',{skip:!hasAssets},()=>{
 const a=new AnimationMixer(source.scene),b=new AnimationMixer(optimized.scene);
 const {Box3}=require('three');
 for(const name of ['Idle_02','Walking','Running','Talk_Passionately','Fall_Dead_from_Abdominal_Injury']){
  a.stopAllAction();b.stopAllAction();
  const clip=source.animations.find(c=>c.name===name);a.clipAction(clip).setLoop(LoopOnce,1).play();b.clipAction(optimized.animations.find(c=>c.name===name)).setLoop(LoopOnce,1).play();
  for(const time of [0,clip.duration*.5,clip.duration-.001]){
   a.setTime(time);b.setTime(time);source.scene.updateMatrixWorld(true);optimized.scene.updateMatrixWorld(true);
   const sourceBox=new Box3().setFromObject(source.scene,true),runtimeBox=new Box3().setFromObject(optimized.scene,true);
   assert.ok(sourceBox.min.distanceTo(runtimeBox.min)<.005,name+' minimum bounds');
   assert.ok(sourceBox.max.distanceTo(runtimeBox.max)<.005,name+' maximum bounds');
  }
 }
 a.stopAllAction();b.stopAllAction();
});



test('each LOD preserves all authored texture images unchanged',{skip:!hasAssets},async()=>{
 const {NodeIO}=await import('@gltf-transform/core');
 const {ALL_EXTENSIONS}=await import('@gltf-transform/extensions');
 const {MeshoptDecoder:decoder}=await import('meshoptimizer');
 const {createHash}=await import('node:crypto');
 const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':decoder});
 const signature=root=>root.listTextures().map(texture=>({mime:texture.getMimeType(),hash:createHash('sha256').update(texture.getImage()).digest('hex')}));
 const expected=signature((await io.read(new URL('../Assets/Characters/Human/Human-textured.glb',import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1'))).getRoot());
 assert.equal(expected.length,3);
 for(const lod of [0,1,2]){
  const bytes=await readFile(new URL('../public/game-assets/human/Human_LOD'+lod+'.glb',import.meta.url));
  assert.deepEqual(signature((await io.readBinary(bytes)).getRoot()),expected);
 }
});

test('child proportions change head-to-height ratio and remain grounded through age changes',{skip:!hasAssets},async()=>{
 const {Box3}=require('three');const factory=new MeshyHumanFactory(async()=>optimized);
 const adultDNA=generateCharacterDNA(1983);adultDNA.age=32;adultDNA.morphology={height:1.44,masculinity:.51};
 const childDNA=structuredClone(adultDNA);childDNA.age=6;
 const adult=await factory.create(adultDNA),child=await factory.create(childDNA);
 const measure=model=>{model.root.updateMatrixWorld(true);const box=new Box3().setFromObject(model.root,true),head=model.root.getObjectByName('mixamorigHead'),top=model.root.getObjectByName('mixamorigHeadTop_End');return {box,ratio:head.getWorldPosition(new (require('three').Vector3)()).distanceTo(top.getWorldPosition(new (require('three').Vector3)()))/(box.max.y-box.min.y)};};
 adult.sample(0);child.sample(0);const a=measure(adult),c=measure(child);assert.ok(c.ratio>a.ratio*1.2);assert.ok(c.box.max.y<a.box.max.y*.8);assert.ok(Math.abs(c.box.min.y)<.02,JSON.stringify({adult:a.box.min.y,child:c.box.min.y}));
 child.applyDNA(adultDNA);const grown=measure(child);assert.ok(Math.abs(grown.ratio-a.ratio)<1e-5);assert.ok(Math.abs(grown.box.max.y-a.box.max.y)<1e-5);
 child.applyDNA(childDNA);assert.ok(Math.abs(measure(child).ratio-c.ratio)<1e-5);
 adult.dispose();child.dispose();
});
test('proportion changes remain stable under all clips and DNA updates preserve world placement',{skip:!hasAssets},async()=>{
 const factory=new MeshyHumanFactory(async()=>optimized),dna=generateCharacterDNA(1983);dna.age=6;
 const model=await factory.create(dna);model.root.position.set(8,2,12);model.root.rotation.y=.8;
 for(const clip of model.clips){model.playClip(clip.name);for(let i=0;i<20;i++)model.update(.05);model.root.traverse(bone=>{if(bone.isBone)assert.ok([...bone.position.toArray(),...bone.scale.toArray(),...bone.quaternion.toArray()].every(Number.isFinite),clip.name);});}
 model.applyDNA({...dna,age:80});assert.deepEqual(model.root.position.toArray(),[8,2,12]);assert.equal(model.root.rotation.y,.8);
 model.setAnimation('Idle');model.sample(.2);model.root.updateMatrixWorld(true);const before=model.root.getObjectByName('mixamorigSpine2').quaternion.clone();model.sample(.2);assert.ok(before.normalize().angleTo(model.root.getObjectByName('mixamorigSpine2').quaternion.clone().normalize())<1e-6);
 model.dispose();
});




test('LOD2 preserves animated body bounds of LOD1 within 2 cm for children and adults',{skip:!hasAssets},async()=>{
 const {Box3}=require('three'),assets=[await readAsset('../public/game-assets/human/Human_LOD1.glb'),await readAsset('../public/game-assets/human/Human_LOD2.glb')];
 for(const age of [6,32,80]){
  const dna=generateCharacterDNA(1983);dna.age=age;
  const models=await Promise.all(assets.map(asset=>new MeshyHumanFactory(async()=>asset).create(dna)));
  for(const clip of assets[0].animations){
   for(const model of models){model.playClip(clip.name);model.sample(clip.duration*.5);model.root.updateMatrixWorld(true);}
   const [a,b]=models.map(model=>new Box3().setFromObject(model.root,true));
   assert.ok(a.min.distanceTo(b.min)<.02,age+' '+clip.name+' minimum');assert.ok(a.max.distanceTo(b.max)<.02,age+' '+clip.name+' maximum');
  }
  models.forEach(model=>model.dispose());
 }
});
test('Meshy skin follows DNA at 20% with independent uniforms and shared source textures',{skip:!hasAssets},async()=>{
 const {generatePhenotype}=load('../src/characters/generatePhenotype.ts');const {Color}=require('three');
 const factory=new MeshyHumanFactory(async()=>optimized),a=await factory.create(dna),other=generateCharacterDNA(90210),b=await factory.create(other);
 const materials=model=>{const values=[];model.root.traverse(node=>{if(node.isMesh)values.push(...(Array.isArray(node.material)?node.material:[node.material]));});return values;};
 const ma=materials(a)[0],mb=materials(b)[0];assert.equal(ma.map,mb.map);
 const shaderA={uniforms:{},fragmentShader:'#include <map_fragment>'},shaderB={uniforms:{},fragmentShader:'#include <map_fragment>'};ma.onBeforeCompile(shaderA);mb.onBeforeCompile(shaderB);
 assert.notEqual(shaderA.uniforms.pillagersSkinTone,shaderB.uniforms.pillagersSkinTone);assert.match(shaderA.fragmentShader,/blendedSkin=mix\(sourceSkin,.*0\.20\)/);
 const previousB=shaderB.uniforms.pillagersSkinTone.value.clone();a.applyDNA(other);assert.ok(shaderA.uniforms.pillagersSkinTone.value.equals(new Color(generatePhenotype(other).skinTone)));assert.ok(shaderB.uniforms.pillagersSkinTone.value.equals(previousB));assert.equal(a.root.userData.skinTint.strength,.2);
 a.dispose();b.dispose();
});
