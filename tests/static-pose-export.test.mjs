import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {Group,Mesh,BufferGeometry,Float32BufferAttribute,MeshStandardMaterial,Vector3,Texture} from 'three';
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {load} from './load-source.mjs';
import {readLocalGLB,validateVertexPaletteStyle,STYLE_FAMILY_PROFILES} from '../scripts/characters/style-validation.mjs';
import {auditSurfaceIntersections} from '../scripts/characters/surface-intersections.mjs';
const {createStaticPoseExport}=load('../src/character-lab/StaticPoseExport.ts');
globalThis.FileReader=class {result=null;onloadend=null;readAsArrayBuffer(blob){blob.arrayBuffer().then(value=>{this.result=value;this.onloadend?.({target:this});});}};
const roundtrip=async root=>{const bytes=await new GLTFExporter().parseAsync(root,{binary:true,onlyVisible:true});const asset=await new GLTFLoader().parseAsync(bytes,'');return{bytes,asset};};
function faces(mesh){let minNormalDot=1,maxUnitNormalError=0;const p=mesh.geometry.attributes.position,n=mesh.geometry.attributes.normal,index=mesh.geometry.index,rows=[];const at=i=>index?index.getX(i):i;
 for(let t=0;t<(index?.count??p.count);t+=3){const ids=[at(t),at(t+1),at(t+2)],ps=ids.map(i=>new Vector3().fromBufferAttribute(p,i));const geometric=ps[1].clone().sub(ps[0]).cross(ps[2].clone().sub(ps[0])).normalize();
  for(const i of ids){const normal=new Vector3().fromBufferAttribute(n,i);maxUnitNormalError=Math.max(maxUnitNormalError,Math.abs(normal.length()-1));minNormalDot=Math.min(minNormalDot,normal.dot(geometric));assert(Math.abs(normal.length()-1)<2e-6);assert(normal.dot(geometric)>1-2e-6);}rows.push(ids);}rows.minNormalDot=minNormalDot;rows.maxUnitNormalError=maxUnitNormalError;return rows;
}
function fixture(){
 const geometry=new BufferGeometry();geometry.setAttribute('position',new Float32BufferAttribute([0,0,0,1,0,0,1,1,0,0,1,0],3));geometry.setIndex([0,1,2,0,2,3]);
 geometry.setAttribute('normal',new Float32BufferAttribute(Array(4).fill([0,0,-1]).flat(),3));
 geometry.setAttribute('color',new Float32BufferAttribute(Array(4).fill([.2,.4,.6]).flat(),3));geometry.setAttribute('uv',new Float32BufferAttribute([0,0,1,0,1,1,0,1],2));
 geometry.morphTargetsRelative=true;geometry.morphAttributes.position=[new Float32BufferAttribute([0,0,0,0,0,0,0,0,.4,0,0,0],3)];
 const material=new MeshStandardMaterial({vertexColors:true,flatShading:true}),mesh=new Mesh(geometry,material);mesh.morphTargetInfluences=[.5];mesh.position.set(.2,.3,.4);
 const root=new Group();root.position.set(-1,.5,0);root.scale.set(1,.8,1);root.add(mesh);return{root,mesh,geometry,material};
}
test('split-corner static round trip uses actual morph/transforms and portable normals without a second scale',async()=>{
 const {root,mesh,geometry,material}=fixture(),positions=Array.from(geometry.attributes.position.array),normals=Array.from(geometry.attributes.normal.array),world=root.matrixWorld.toArray(),snapshot={profile:'unit',pose:{animation:'Walk',time:.25}},source={sha256:'fixture'},owned=createStaticPoseExport(root,{snapshot,source});
 assert.equal(owned.triangles,2);assert.equal(owned.materials,1);assert.equal(owned.root.children.length,1);const baked=owned.root.children[0];
 assert.equal(baked.geometry.attributes.position.count,6);assert.equal(baked.geometry.index,null);assert.equal(baked.material.flatShading,false);faces(baked);
 const p=baked.geometry.attributes.position;assert(Math.abs(p.getY(2)-1.04)<1e-6);assert(Math.abs(p.getX(0)-.2)<1e-6);assert(Math.abs(p.getZ(2)-.6)<1e-6);
 const {asset}=await roundtrip(owned.root);let imported;asset.scene.traverse(o=>{if(o.isMesh)imported=o;assert(!o.isSkinnedMesh);assert(!o.isBone);});
 let exportedMetadata;asset.scene.traverse(o=>{if(o.userData.staticPoseExport?.metadata)exportedMetadata=o.userData.staticPoseExport.metadata;});assert.deepEqual(exportedMetadata,{snapshot,source});
 assert.equal(asset.animations.length,0);assert.equal(imported.material.flatShading,false);assert.equal(imported.geometry.morphAttributes.position,undefined);faces(imported);
 assert.deepEqual(Array.from(imported.geometry.attributes.position.array),Array.from(p.array));assert.deepEqual(Array.from(imported.geometry.attributes.color.array),Array.from(baked.geometry.attributes.color.array));
 assert.deepEqual(Array.from(imported.geometry.attributes.uv.array),Array.from(baked.geometry.attributes.uv.array));
 assert.deepEqual(Array.from(geometry.attributes.position.array),positions);assert.deepEqual(Array.from(geometry.attributes.normal.array),normals);assert.deepEqual(root.matrixWorld.toArray(),world);assert.equal(mesh.morphTargetInfluences[0],.5);assert.equal(material.flatShading,true);
 assert.deepEqual(owned.root.userData.staticPoseExport.metadata,{snapshot,source});snapshot.profile='changed';assert.equal(owned.root.userData.staticPoseExport.metadata.snapshot.profile,'unit');owned.dispose();
});
test('visibility, draw ranges, material regions and overlay exclusion preserve only actually rendered triangles',()=>{
 const {root,mesh,geometry}=fixture(),a=mesh.material,b=a.clone();b.visible=false;mesh.material=[a,b];geometry.addGroup(0,3,0);geometry.addGroup(3,3,1);
 const overlay=new Group(),extra=new Mesh(geometry,a);overlay.add(extra);root.add(overlay);const hidden=new Group();hidden.visible=false;hidden.add(new Mesh(geometry,a));root.add(hidden);
 const owned=createStaticPoseExport(root,{snapshot:{},source:{}},{excludedRoots:[overlay]});assert.equal(owned.triangles,1);assert.equal(owned.materials,1);assert.equal(owned.root.children.length,1);assert.equal(overlay.visible,true);owned.dispose();
});
test('snapshot disposal is idempotent and never disposes source resources',()=>{
 const {root,geometry,material}=fixture();let sourceGeometry=0,sourceMaterial=0,ownedGeometry=0,ownedMaterial=0;geometry.addEventListener('dispose',()=>sourceGeometry++);material.addEventListener('dispose',()=>sourceMaterial++);
 const owned=createStaticPoseExport(root,{snapshot:{},source:{}}),mesh=owned.root.children[0];mesh.geometry.addEventListener('dispose',()=>ownedGeometry++);mesh.material.addEventListener('dispose',()=>ownedMaterial++);owned.dispose();owned.dispose();
 assert.deepEqual({sourceGeometry,sourceMaterial,ownedGeometry,ownedMaterial},{sourceGeometry:0,sourceMaterial:0,ownedGeometry:1,ownedMaterial:1});
});
test('degenerate Float32 faces and lossy provenance fail closed without mutating source',()=>{
 const {root,geometry}=fixture();assert.throws(()=>createStaticPoseExport(root,{snapshot:{value:NaN},source:{}}),/finite JSON/);
 const sparse=[];sparse[1]=1;assert.throws(()=>createStaticPoseExport(root,{snapshot:sparse,source:{}}),/dense/);
 geometry.attributes.position.array.fill(0);assert.throws(()=>createStaticPoseExport(root,{snapshot:{},source:{}}),/degenerates/);
});

test('parent transforms and reflected winding are baked once while shared textures remain source owned',()=>{
 const {root,geometry,material}=fixture(),parent=new Group();parent.position.set(2,0,0);parent.scale.set(2,1,1);root.scale.x=-1;parent.add(root);
 const texture=new Texture();let textureDisposed=0;texture.addEventListener('dispose',()=>textureDisposed++);material.map=texture;
 const owned=createStaticPoseExport(root,{snapshot:{},source:{}}),baked=owned.root.children[0],p=baked.geometry.attributes.position;
 assert.equal(owned.triangles,2);assert.equal(baked.userData.staticPoseExport.reflectedTransformWindingCorrected,true);assert(Math.abs(p.getX(0)-1.6)<1e-6);assert.equal(baked.material.map,texture);faces(baked);
 assert.equal(root.position.x,-1);assert.equal(parent.position.x,2);owned.dispose();assert.equal(textureDisposed,0);
});
test('incomplete material ranges and missing provenance reject without emitting partial snapshots',()=>{
 const {root,mesh,geometry}=fixture();assert.throws(()=>createStaticPoseExport(root,{snapshot:{}}),/provenance/);
 geometry.setDrawRange(1,3);assert.throws(()=>createStaticPoseExport(root,{snapshot:{},source:{}}),/complete triangles/);
 geometry.setDrawRange(0,3);const owned=createStaticPoseExport(root,{snapshot:{},source:{}});assert.equal(owned.triangles,1);owned.dispose();
});


test('authoritative matrix root translation is normalized without trusting stale position components',()=>{
 const {root}=fixture();root.matrixAutoUpdate=false;root.matrix.compose(new Vector3(9,4,-3),root.quaternion,root.scale);const matrix=root.matrix.toArray(),owned=createStaticPoseExport(root,{snapshot:{},source:{}}),p=owned.root.children[0].geometry.attributes.position;
 assert(Math.abs(p.getX(0)-.2)<1e-6);assert(Math.abs(p.getY(2)-1.04)<1e-6);assert.deepEqual(root.matrix.toArray(),matrix);assert.equal(root.position.x,-1);owned.dispose();
});
test('representable tiny nonzero facets retain valid normals and malformed array provenance fails',()=>{
 const geometry=new BufferGeometry();geometry.setAttribute('position',new Float32BufferAttribute([0,0,0,1e-10,0,0,0,1e-10,0],3));const root=new Group();root.add(new Mesh(geometry,new MeshStandardMaterial()));
 const owned=createStaticPoseExport(root,{snapshot:{},source:{}});faces(owned.root.children[0]);owned.dispose();const array=[];array.extra='lossy';assert.throws(()=>createStaticPoseExport(root,{snapshot:array,source:{}}),/dense/);const compensating=[];compensating[1]=1;compensating.extra='lossy';assert.throws(()=>createStaticPoseExport(root,{snapshot:compensating,source:{}}),/dense/);
});

test('actual r3 neutral/female/Giant/compound/child frozen GLBs are portable', {skip:process.env.RUN_R3_EVIDENCE!=='1'},async()=>{
 const {UniversalHuman}=load('../src/characters/UniversalHuman.ts'),{defaultDNA}=load('../src/characters/CharacterDNA.ts'),{resolveLabBodyProfile}=load('../src/characters/LabBodyPresentation.ts');
 const path='scratch/character-lab-v04/body-r3/fullrange/body-r3.glb',raw=fs.readFileSync(path),sha=crypto.createHash('sha256').update(raw).digest('hex'),out='artifacts/character-lab-v04/export-proof/',rows=[],defs=[
 ['neutral',32,{preset:'neutral'},null],['female0588',32,{preset:'neutral',morphs:{Feminine:.98,Breasts:.98}},['Walk',.25]],['giant',32,{preset:'giant'},['Run',.2]],['compound',32,{preset:'neutral',morphs:{Powerful:1,Masculine:1,Grounded:1,Overweight:1}},['Run',.65]],['child6',6,{preset:'neutral'},['Walk',.65]],
 ];
 assert.equal(sha,'8e01bc03d4d663bb9c3298cfbf8a5703089a696a51be71b1c7ab39c9f5ebd47e');
 for(const[name,age,body,pose]of defs){
  const dna={...defaultDNA(),age},presentation={version:1,source:'golden-v04-preview',...body},profile=resolveLabBodyProfile(dna,presentation).profile,g=await new GLTFLoader().parseAsync(raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength),'');
  const h=new UniversalHuman(g,profile,'#cc986f',null,null,[],{technicalWaistWrap:false});if(pose)h.sampleAnimation(...pose);h.root.updateMatrixWorld(true);let sourceMesh;h.root.traverse(o=>{if(o.isSkinnedMesh)sourceMesh=o;});sourceMesh.skeleton.update();
  const expected=Array.from({length:sourceMesh.geometry.attributes.position.count},(_,i)=>sourceMesh.getVertexPosition(i,new Vector3()).applyMatrix4(sourceMesh.matrixWorld).toArray().map(Math.fround)),before={position:Array.from(sourceMesh.geometry.attributes.position.array),normals:Array.from(sourceMesh.geometry.attributes.normal.array),palette:Array.from(sourceMesh.geometry.attributes.color.array),bones:sourceMesh.skeleton.boneMatrices.slice(),bind:sourceMesh.bindMatrix.toArray(),root:h.root.matrixWorld.toArray()};
  h.root.position.x=-1;const owned=createStaticPoseExport(h.root,{snapshot:{dna,body:presentation,profile,pose:pose?{animation:pose[0],time:pose[1]}:{animation:'rest',time:0}},source:{id:'lab-body/golden-v04-candidate-002-r3',path:'/character-lab/candidates/golden-v04/body-r3.glb',sha256:sha,styleVersion:'pillagers-character-style/0.4-candidate-002-r3'}},{excludedRoots:[h.fit.debug]});
  assert.equal(owned.triangles,1322);assert.equal(owned.materials,1);const {asset,bytes}=await roundtrip(owned.root),file=out+name+'-static.glb';fs.writeFileSync(file,Buffer.from(bytes));
  let imported;asset.scene.traverse(o=>{if(o.isMesh)imported=o;assert(!o.isSkinnedMesh);assert(!o.isBone);});assert.equal(asset.animations.length,0);assert.equal(imported.material.flatShading,false);assert(!imported.geometry.attributes.skinIndex);assert.equal(Object.keys(imported.geometry.morphAttributes).length,0);
  const indices=faces(imported),p=imported.geometry.attributes.position,actual=Array.from({length:p.count},(_,i)=>new Vector3().fromBufferAttribute(p,i).toArray());assert.deepEqual(actual,expected);assert.deepEqual(Array.from(imported.geometry.attributes.color.array),before.palette);
  assert.deepEqual(Array.from(sourceMesh.geometry.attributes.position.array),before.position);assert.deepEqual(Array.from(sourceMesh.geometry.attributes.normal.array),before.normals);assert.deepEqual(Array.from(sourceMesh.skeleton.boneMatrices),Array.from(before.bones));assert.deepEqual(sourceMesh.bindMatrix.toArray(),before.bind);assert.deepEqual(h.root.matrixWorld.toArray(),before.root);assert.equal(h.root.position.x,-1);
  const source=readLocalGLB(file),style=validateVertexPaletteStyle(source,STYLE_FAMILY_PROFILES['body-proof']);assert(style.valid,JSON.stringify(style.issues));
  const ids=JSON.parse(fs.readFileSync('artifacts/character-lab-v04/golden-rig/candidate-002/NEUTRAL-RIG-SCAFFOLD-CORRECTED-RECEIPT.json')).sourceVertexIdsByImportedVertex,crossings=auditSurfaceIntersections({positions:actual,triangles:indices,correspondenceIds:ids});assert.equal(crossings.properInteriorCrossingPairs,0);
  rows.push({name,pose,sourceSHA256:sha,exportSHA256:source.sha256,path:file,triangles:indices.length,materials:owned.materials,positionsExactAfterFloat32:true,maximumPositionResidual:0,normalsGeometricDefaultSmooth:true,minimumCornerNormalDot:indices.minNormalDot,maximumUnitNormalError:indices.maxUnitNormalError,invalidOrOpposedNormals:0,sourceOwnershipExact:true,stylePASS:style.valid,properCrossings:crossings.properInteriorCrossingPairs,minY:Math.min(...actual.map(p=>p[1])),crownY:Math.max(...actual.map(p=>p[1]))});owned.dispose();h.dispose();
 }
 fs.writeFileSync(out+'ACTUAL-R3-EVIDENCE.json',JSON.stringify({at:new Date().toISOString(),sourceSHA256:sha,rows,pass:true,scope:'Five actual r3 canonical profiles in retained rest/Walk/Run poses, static GLTF round trip through default smooth GLTFLoader. No broad matrix/browser qualification; editable rig export unchanged.'},null,2));
});
