import test from 'node:test';
import assert from 'node:assert/strict';
import {BoxGeometry,CylinderGeometry,Float32BufferAttribute,Group,Matrix4,Mesh,MeshStandardMaterial,Quaternion,Vector3} from 'three';
import {load} from './load-source.mjs';
import {geometryAsset} from './glb-fixture.mjs';
const {CharacterFactory}=load('../src/characters/CharacterFactory.ts');
const {defaultDNA}=load('../src/characters/CharacterDNA.ts');
const {attachmentVersion,validateModule,moduleAtEquipmentSocket}=load('../src/characters/AttachmentContract.ts');
const {fitGarment,disposeGarment}=load('../src/characters/GarmentFit.ts');
const {appearanceModules,disposeModules}=load('../src/character-lab/AppearanceModules.ts');
const factory=new CharacterFactory(url=>geometryAsset(url.split('?')[0].slice(1)));
const identityFrame={position:[0,0,0],quaternion:[0,0,0,1]};
const metadata=()=>({version:attachmentVersion,id:'technical/grip-contract',type:'equipment',anchor:'socket_hand_R',authoringFrame:'canonical',fitMode:'rigid',clearance:0,equipmentBindings:{grip:{position:[.02,.1,-.01],quaternion:new Quaternion().setFromAxisAngle(new Vector3(1,0,0),.3).toArray()},sockets:{socket_hand_R:structuredClone(identityFrame),socket_hip_R:{position:[.03,-.01,.02],quaternion:new Quaternion().setFromAxisAngle(new Vector3(0,0,1),.4).toArray()},socket_back:structuredClone(identityFrame)}}});
const release=source=>source.traverse(m=>{if(m.isMesh){m.geometry.dispose();for(const mat of Array.isArray(m.material)?m.material:[m.material])mat.dispose();}});
test('equipment rejects missing/inherited/unsupported or malformed measured bindings before graph mutation',async()=>{
 for(const change of [m=>delete m.equipmentBindings,m=>m.anchor='toString',m=>m.anchor='socket_chest',m=>m.equipmentBindings.grip.quaternion=[0,0,0,2],m=>m.equipmentBindings.grip.position=new Array(3),m=>m.equipmentBindings.sockets={toString:identityFrame},m=>m.equipmentBindings.sockets.socket_hand_R.position=[NaN,0,0]]){
  const m=metadata();change(m);assert.throws(()=>validateModule(m));
 }
 assert.throws(()=>moduleAtEquipmentSocket(metadata(),'socket_hip_L'),/Unsupported/);
 const requests=[],f=new CharacterFactory(async p=>{requests.push(p);throw Error('should not load');});f.registerModule(metadata(),'/technical/sword.glb');
 await assert.rejects(f.equip({root:{userData:{}}},'technical/grip-contract','socket_hip_L'),/Unsupported/);assert.deepEqual(requests,[]);
});
test('grip frames follow hand/hip/back during motion without editing shared geometry or metadata',async()=>{
 const a=await factory.create(defaultDNA(),2,false),b=await factory.create(defaultDNA(),2,false),source=new Group(),mesh=new Mesh(new BoxGeometry(.08,.5,.02),new MeshStandardMaterial());source.add(mesh);
 const original=Array.from(mesh.geometry.attributes.position.array),m=metadata(),frozen=JSON.stringify(m);
 try{const untouched=b.fit.snapshot();
  for(const socket of ['socket_hand_R','socket_hip_R','socket_back']){
   const definition=moduleAtEquipmentSocket(m,socket),object=a.equip(definition,source);a.sampleAnimation('Walk',.35);a.root.updateMatrixWorld(true);
   const grip=object.localToWorld(new Vector3(...m.equipmentBindings.grip.position));const expected=object.parent.localToWorld(new Vector3(...m.equipmentBindings.sockets[socket].position));assert.ok(grip.distanceTo(expected)<1e-6,socket+' grip position');
   const frame=value=>new Matrix4().compose(new Vector3(...value.position),new Quaternion(...value.quaternion),new Vector3(1,1,1));const world=object.matrixWorld.clone().multiply(frame(m.equipmentBindings.grip)),target=object.parent.matrixWorld.clone().multiply(frame(m.equipmentBindings.sockets[socket]));assert.ok(world.elements.every((v,i)=>Math.abs(v-target.elements[i])<1e-6),socket+' complete inherited affine grip frame');
   assert.notEqual(object.children[0].geometry,mesh.geometry);assert.deepEqual(Array.from(object.children[0].geometry.attributes.position.array),original);
  }
  assert.equal(JSON.stringify(m),frozen);assert.deepEqual(Array.from(mesh.geometry.attributes.position.array),original);assert.deepEqual(b.fit.snapshot(),untouched);
 }finally{a.dispose();b.dispose();release(source);}
});
function garmentMetadata(human){return {version:attachmentVersion,id:'technical/mapless-regional',type:'garment',anchor:'socket_waist',fitCage:'TORSO_CAGE',fitMode:'drape',slot:'full',garmentFit:'regional',authoringFrame:'canonical',clearance:.005,covers:[],garmentBind:{joints:Object.fromEntries([...human.fit.canonicalJoints].filter(([name])=>['Hips','Chest','Neck','UpperArm_L','UpperArm_R','LowerArm_L','LowerArm_R','Hand_L','Hand_R','UpperLeg_L','UpperLeg_R','LowerLeg_L','LowerLeg_R','Foot_L','Foot_R','Toe_L','Toe_R'].includes(name)).map(([name,p])=>[name,p.toArray()]))}};}
test('regional mapless drape preserves facet COLOR_0 through refinement without inventing UVs',async()=>{
 const human=await factory.create(defaultDNA(),2,false),source=new Group(),geometry=new CylinderGeometry(.5,.55,.5,8,1,true).toNonIndexed().translate(0,1.25,0),values=[];
 for(let i=0;i<geometry.attributes.position.count;i++)values.push(.75,.65,.45);geometry.setAttribute('color',new Float32BufferAttribute(values,3));geometry.deleteAttribute('uv');
 const mesh=new Mesh(geometry,new MeshStandardMaterial({vertexColors:true,flatShading:true}));mesh.name='technical-palette-panels';mesh.userData={garmentRegion:'cloth',garmentBindDomain:'torso'};source.add(mesh);
 const before=Array.from(geometry.attributes.color.array);let result;
 try{result=fitGarment(source,garmentMetadata(human),human.root.getObjectByName('UniversalHuman'),human.fit);const fitted=result.getObjectByName(mesh.name);assert.ok(fitted.geometry.attributes.fitReference);assert.equal(fitted.geometry.attributes.uv,undefined);assert.equal(fitted.material.vertexColors,true);assert.equal(fitted.material.map,null);assert.equal(fitted.geometry.attributes.color.count,fitted.geometry.attributes.position.count);
  for(let i=0;i<fitted.geometry.attributes.color.count;i++)assert.ok(Math.abs(fitted.geometry.attributes.color.getX(i)-.75)<1e-6&&Math.abs(fitted.geometry.attributes.color.getY(i)-.65)<1e-6&&Math.abs(fitted.geometry.attributes.color.getZ(i)-.45)<1e-6);
  assert.deepEqual(Array.from(geometry.attributes.color.array),before);assert.equal(geometry.attributes.uv,undefined);
 }finally{if(result)disposeGarment(result);human.dispose();release(source);}
});
test('split left/right footwear order cannot overwrite the opposite foot with an empty calibration',async()=>{
 const human=await factory.create(defaultDNA(),2,false),sources=[],outputs=[];
 try{for(const order of [[1,-1],[-1,1],[1]]){
  const source=new Group();sources.push(source);for(const side of order){const mesh=new Mesh(new BoxGeometry(.15,.14,.26).translate(side*.2,.08,.08),new MeshStandardMaterial());mesh.name='technical-boot-'+side;mesh.userData.garmentRegion='footwear';source.add(mesh);}
  const result=fitGarment(source,garmentMetadata(human),human.root.getObjectByName('UniversalHuman'),human.fit);outputs.push(result);result.traverse(m=>{if(m.isMesh){for(const a of Object.values(m.geometry.attributes))assert.ok(Array.from(a.array).every(Number.isFinite));}});
 }
 for(const side of [1,-1])assert.deepEqual(Array.from(outputs[0].getObjectByName('technical-boot-'+side).geometry.attributes.position.array),Array.from(outputs[1].getObjectByName('technical-boot-'+side).geometry.attributes.position.array));
 }finally{outputs.forEach(disposeGarment);sources.forEach(release);human.dispose();}
});
test('hair and beard tint consumers retain mapless vertex palettes and owned flat materials',()=>{
 for(const kind of ['hair','beard']){const source=new Group(),geometry=new BoxGeometry(.12,.08,.04).toNonIndexed(),palette=Array.from({length:geometry.attributes.position.count},()=>[.8,.7,.6]).flat();geometry.setAttribute('color',new Float32BufferAttribute(palette,3));const actualPalette=Array.from(geometry.attributes.color.array);const mesh=new Mesh(geometry,new MeshStandardMaterial({vertexColors:true}));source.add(mesh);
 const m={version:attachmentVersion,id:kind+'/technical-palette',type:kind,anchor:kind==='hair'?'socket_head_top':'socket_jaw',fitCage:kind==='hair'?'HEAD_CAGE':'LOWER_FACE_CAGE',fitMode:'conform',authoringFrame:'canonical',canonicalHeadSize:[1,1,1],clearance:.003,subdivisions:0};
 let result;try{result=appearanceModules({hairStyle:kind==='hair'?'short':'none',beardStyle:kind==='beard'?'short':'none',color:'#aa3311'},new Vector3(1,1,1),2,{hair:1,beard:1,clothing:1},kind==='hair'?source:null,[],kind==='beard'?source:null,m);let observed=0;result.traverse(node=>{if(node.isMesh){observed++;assert.deepEqual(Array.from(node.geometry.attributes.color.array),actualPalette);assert.equal(node.material.vertexColors,true);assert.equal(node.material.flatShading,true);assert.equal(node.material.map,null);assert.equal(node.material.color.getHexString(),'aa3311');assert.notEqual(node.material,mesh.material);}});assert.equal(observed,1);assert.deepEqual(Array.from(geometry.attributes.color.array),actualPalette);
 }finally{if(result)disposeModules(result);release(source);}}
});
