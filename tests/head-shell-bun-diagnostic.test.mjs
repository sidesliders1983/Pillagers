import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {Vector3} from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {loadTypeScript} from '../scripts/load-typescript.mjs';
import {readLocalGLB} from '../scripts/characters/style-validation.mjs';
import {auditSurfaceIntersections} from '../scripts/characters/surface-intersections.mjs';
const registeredShells=[{style:'bun',triangles:492,sha256:'3b1b2885c6bc6192b84b2418ecfcb163a3a2ac3ffc41860bc237ef07b383e7c1'},{style:'short',triangles:338,sha256:'128826eefc475d915d227579656db86e5e2c96f02682f41e2626ebd05dbab0a3'}];
const {CharacterFactory}=loadTypeScript(new URL('../src/characters/CharacterFactory.ts',import.meta.url));
const {defaultDNA}=loadTypeScript(new URL('../src/characters/CharacterDNA.ts',import.meta.url));
function digest(source){const rows=[];source.scene.traverse(o=>{if(o.isMesh)rows.push({matrix:o.matrix.toArray(),attributes:Object.fromEntries(Object.entries(o.geometry.attributes).map(([k,a])=>[k,Array.from(a.array)])),index:o.geometry.index?Array.from(o.geometry.index.array):null,materials:(Array.isArray(o.material)?o.material:[o.material]).map(m=>({color:m.color.toArray(),flatShading:m.flatShading,map:!!m.map}))});});return createHash('sha256').update(JSON.stringify(rows)).digest('hex');}
function bodyGeometry(h){const rows=[];h.root.traverse(o=>{if(o.isSkinnedMesh)rows.push({name:o.name,position:Array.from(o.geometry.attributes.position.array),index:Array.from(o.geometry.index.array)});});return rows;}
for(const asset of registeredShells)test('registered '+asset.style+' shell clears complete r3 body and itself for adult, child and older profiles in three poses',async()=>{
 const base='public/character-lab/modules/v04/hair/'+asset.style,sourcePath=base+'/'+asset.style+'.glb';
 const body=readLocalGLB('public/character-lab/candidates/golden-v04/body-r3.glb'),record=readLocalGLB(sourcePath);
 assert.equal(record.sha256,asset.sha256);assert.equal(body.sha256,'8e01bc03d4d663bb9c3298cfbf8a5703089a696a51be71b1c7ab39c9f5ebd47e');
 const parse=r=>new GLTFLoader().parseAsync(r.bytes.buffer.slice(r.bytes.byteOffset,r.bytes.byteOffset+r.bytes.byteLength),'');
 const factory=new CharacterFactory(async()=>parse(body)),source=await parse(record),before=digest(source),metadata=JSON.parse(readFileSync(base+'/'+asset.style+'.authoring.json')).metadata,samples=[];
 for(const age of[32,8,70]){
  const dna={...defaultDNA(),age,sex:'male',morphology:{masculinity:.51,height:1.44}},h=await factory.create(dna,2,{hair:'none',beard:'none',outfit:'none',equipment:'none',technicalWaistWrap:false},{version:1,source:'golden-v04-preview',preset:'neutral'}),bodyBefore=bodyGeometry(h);
  try{
   h.equip(metadata,source.scene);const equipped=h.fit.modules.get(metadata.id);assert.ok(equipped);assert.deepEqual(bodyGeometry(h),bodyBefore);
   for(const [animation,time] of [['Idle',0],['Walk',.25],['Run',.2]]){
    h.sampleAnimation(animation,time);h.root.updateMatrixWorld(true);const inverse=h.root.matrixWorld.clone().invert(),positions=[],triangles=[],ids=[];let bodyCount=0,moduleCount=0,fit;
    h.root.traverse(o=>{if(!o.isSkinnedMesh)return;o.skeleton.update();const off=positions.length,p=o.geometry.attributes.position,ix=o.geometry.index;for(let i=0;i<p.count;i++){const point=o.getVertexPosition(i,new Vector3()).applyMatrix4(o.matrixWorld).applyMatrix4(inverse).toArray();positions.push(point);ids.push('body/'+point.map(v=>v.toFixed(7)).join(','));}for(let t=0;t<ix.count;t+=3)triangles.push([0,1,2].map(k=>off+ix.getX(t+k)));bodyCount+=ix.count/3;});
    assert.equal(bodyCount,1322);
    equipped.object.traverse(o=>{if(!o.isMesh)return;fit=o.userData.headContactFit;const off=positions.length,p=o.geometry.attributes.position,ix=o.geometry.index,count=ix?.count??p.count;for(let i=0;i<p.count;i++){const point=o.getVertexPosition(i,new Vector3()).applyMatrix4(o.matrixWorld).applyMatrix4(inverse).toArray();positions.push(point);ids.push('hair/'+point.map(v=>v.toFixed(7)).join(','));}for(let t=0;t<count;t+=3)triangles.push([0,1,2].map(k=>off+(ix?ix.getX(t+k):t+k)));moduleCount+=count/3;});
    assert.equal(moduleCount,asset.triangles);const audit=auditSurfaceIntersections({positions,triangles,correspondenceIds:ids}),bodyPairs=audit.properPairs.filter(p=>p.triangles[0]<bodyCount&&p.triangles[1]>=bodyCount),selfPairs=audit.properPairs.filter(p=>p.triangles.every(t=>t>=bodyCount));samples.push({age,animation,time,bodyPairs:bodyPairs.length,selfPairs:selfPairs.length,fit});assert.equal(bodyPairs.length,0,age+'/'+animation+' actual body pairs');assert.equal(selfPairs.length,0,age+'/'+animation+' actual shell self pairs');
   }
   assert.equal(digest(source),before);assert.deepEqual(bodyGeometry(h),bodyBefore);
  }finally{h.dispose();}
 }
 assert.equal(readLocalGLB(sourcePath).sha256,record.sha256);assert.equal(readLocalGLB('public/character-lab/candidates/golden-v04/body-r3.glb').sha256,body.sha256);
 console.log('ACTUAL_REGISTERED_HEAD_COHERENT_FIT '+JSON.stringify({style:asset.style,moduleSHA256:record.sha256,bodySHA256:body.sha256,samples,sourceCloneDigestBefore:before,sourceCloneDigestAfter:digest(source),sourceUnchanged:true,visualAcceptance:false}));
});

