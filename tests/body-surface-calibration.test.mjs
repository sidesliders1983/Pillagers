import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {loadTypeScript} from '../scripts/load-typescript.mjs';
const {validateBodySurfaceCalibration,requireValidatedBodySurfaceCalibration}=loadTypeScript(new URL('../src/characters/BodySurfaceCalibration.ts',import.meta.url));
const {goldenBodySurfaceCalibration:metadata}=loadTypeScript(new URL('../src/characters/GoldenBodySurfaceCalibration.ts',import.meta.url));
const {goldenLabBody}=loadTypeScript(new URL('../src/characters/LabBodySources.ts',import.meta.url));
const bytes=readFileSync(new URL('../public'+goldenLabBody.path,import.meta.url));
const source=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
const meshes=[];source.scene.traverse(node=>{if(node.isSkinnedMesh)meshes.push(node);});
test('authored body calibration binds exact source, ordered neutral geometry and topology without WebCrypto',()=>{
 const prior=globalThis.crypto;Object.defineProperty(globalThis,'crypto',{configurable:true,value:undefined});
 try{assert.equal(createHash('sha256').update(bytes).digest('hex'),metadata.sourceSHA256);assert.equal(metadata.sourceSHA256,goldenLabBody.sha256);const result=validateBodySurfaceCalibration(metadata,goldenLabBody.sha256,meshes);assert.equal(result.meshes[0].cages.HEAD_CAGE.length,877);assert.equal(result.meshes[0].headModuleFrame.length,859);}
 finally{Object.defineProperty(globalThis,'crypto',{configurable:true,value:prior});}
});
test('source calibration rejects stale bytes, reordered indices and malformed or split-copy membership',()=>{
 const cases=[
  c=>c.version='invalid',c=>c.sourceSHA256='0'.repeat(64),c=>c.unrecognized=true,
  c=>c.meshes[0].neutralPositions[0]+=.000001,c=>c.meshes[0].triangleIndices[0]=c.meshes[0].triangleIndices[1],
  c=>c.meshes[0].name='wrong',c=>c.meshes[0].cages.HEAD_CAGE.pop(),c=>c.meshes[0].headModuleFrame.push(10000),
  c=>delete c.meshes[0].coverage[0],c=>delete c.meshes[0].headModuleFrame[0],
  c=>c.meshes[0].cages.TORSO_CAGE=c.meshes[0].cages.HEAD_CAGE.slice(),
  c=>c.meshes[0].coverage[c.meshes[0].cages.HEAD_CAGE[0]]='NECK',c=>c.landmarks.CHIN.vertex=10000,
  c=>c.meshes[0].headModuleFrame.splice(1,0,c.meshes[0].headModuleFrame[0])
 ];for(const mutate of cases){const candidate=structuredClone(metadata);mutate(candidate);assert.throws(()=>validateBodySurfaceCalibration(candidate,metadata.sourceSHA256,meshes));}
 assert.throws(()=>requireValidatedBodySurfaceCalibration(metadata,meshes));
});
test('validated calibration owns deeply immutable correspondence arrays and anchors',()=>{
 const candidate=structuredClone(metadata),result=validateBodySurfaceCalibration(candidate,metadata.sourceSHA256,meshes);
 candidate.landmarks.CHIN.vertex=0;candidate.meshes[0].coverage.fill('PELVIS');
 assert.notEqual(result.landmarks.CHIN.vertex,0);assert.equal(result.meshes[0].cages.HEAD_CAGE.length,877);
 assert(Object.isFrozen(result.meshes[0].coverage));assert.throws(()=>{result.meshes[0].headModuleFrame.push(1);});
});

test('validated maps still reject unrelated or changed cloned meshes at fit construction',()=>{
 const result=validateBodySurfaceCalibration(metadata,metadata.sourceSHA256,meshes),wrong=meshes[0].clone();wrong.geometry=wrong.geometry.clone();
 try{wrong.geometry.getAttribute('position').setX(0,wrong.geometry.getAttribute('position').getX(0)+.000001);assert.throws(()=>requireValidatedBodySurfaceCalibration(result,[wrong]));assert.throws(()=>requireValidatedBodySurfaceCalibration(result,[]));requireValidatedBodySurfaceCalibration(result,meshes);}finally{wrong.geometry.dispose();}
});
