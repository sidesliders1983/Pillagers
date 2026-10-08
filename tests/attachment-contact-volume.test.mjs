import test from 'node:test';import assert from 'node:assert/strict';
import {Bone,Box3,BufferGeometry,Float32BufferAttribute,Group,Mesh,MeshStandardMaterial,Skeleton,SkinnedMesh,Uint16BufferAttribute,Vector3} from 'three';
import {createLoader} from './contact-source-loader.mjs';
const staged=createLoader(),baseline=createLoader(false);
const metadata=()=>({version:'pillagers-fit/0.1',id:'beard/new-v04-test',type:'beard',anchor:'socket_jaw',fitCage:'LOWER_FACE_CAGE',fitMode:'conform',clearance:0,authoringFrame:'canonical',canonicalHeadSize:[1,1,1],attachmentBand:{minimumY:null},fitContactZones:['HEAD']});
function fixture(load=staged,{calibrated=true,planar=false}={}){
 const {landmarkNames,socketDefinitions}=load('src/characters/AttachmentContract.ts');
 const {validateBodySurfaceCalibration}=load('src/characters/BodySurfaceCalibration.ts');
 const {CharacterFitSystem}=load('src/characters/CharacterFitSystem.ts');
 const root=new Group(),coordinates=[],coverage=[],sets={head:[],neck:[],torso:[],pelvis:[],handL:[],handR:[],footL:[],footR:[]};
 const tetra=(key,zone,x,y,z,scale=.1,copies=1)=>{
  for(let k=0;k<4;k++)for(let c=0;c<copies;c++){sets[key].push(coordinates.length/3);coordinates.push(x+(k===1?scale:0),y+(k===2&&(key!=='head'||!planar)?scale:0),z+(k===3?scale:0));coverage.push(zone);}
 };
 tetra('head','HEAD',-.04,1.58,.02,.08,2);tetra('neck','NECK',-.09,1.48,-.01,.18);tetra('torso','TORSO_UPPER',-.1,1.2,0);tetra('pelvis','PELVIS',-.1,.9,0);
 tetra('handL','LOWER_ARM_L',.3,.8,0);tetra('handR','LOWER_ARM_R',-.4,.8,0);tetra('footL','FEET',.1,0,0);tetra('footR','FEET',-.2,0,0);
 const geometry=new BufferGeometry();geometry.setAttribute('position',new Float32BufferAttribute(coordinates,3));
 const indices=[];for(let i=0;i<coordinates.length/3-2;i+=3)indices.push(i,i+1,i+2);geometry.setIndex(indices);
 geometry.setAttribute('skinIndex',new Uint16BufferAttribute(Array(coordinates.length/3*4).fill(0),4));
 geometry.setAttribute('skinWeight',new Float32BufferAttribute(Array.from({length:coordinates.length/3*4},(_,i)=>i%4===0?1:0),4));
 const deltas=Array(coordinates.length).fill(0);for(const id of sets.neck)deltas[id*3]=coordinates[id*3]*2;
 geometry.morphTargetsRelative=true;geometry.morphAttributes.position=[new Float32BufferAttribute(deltas,3)];
 const names=['Head',...new Set(Object.values(socketDefinitions).map(v=>v.bone))].filter((v,i,a)=>a.indexOf(v)===i),bones=names.map(n=>{const b=new Bone();b.name=n;root.add(b);return b;});
 const mesh=new SkinnedMesh(geometry,new MeshStandardMaterial());mesh.name='SyntheticCanonicalBody';root.add(mesh);root.updateMatrixWorld(true);mesh.bind(new Skeleton(bones));mesh.updateMorphTargets();
 const input={version:'pillagers-body-surface/1',sourceSHA256:'a'.repeat(64),meshes:[{name:mesh.name,neutralPositions:Array.from(geometry.attributes.position.array),triangleIndices:indices,coverage,
  cages:{HEAD_CAGE:sets.head,LOWER_FACE_CAGE:[...sets.head,...sets.neck],TORSO_CAGE:sets.torso,PELVIS_CAGE:sets.pelvis},headModuleFrame:sets.head,
  cores:{head:sets.head,hand_L:sets.handL,hand_R:sets.handR,foot_L:sets.footL,foot_R:sets.footR}}],landmarks:Object.fromEntries(landmarkNames.map(n=>[n,{mesh:0,vertex:sets.head[0]}]))};
 const calibration=calibrated?validateBodySurfaceCalibration(input,input.sourceSHA256,[mesh]):undefined;
 const fit=new CharacterFitSystem(root,[mesh],bones,calibration);if(calibrated)fit.refit();
 return {fit,root,mesh,bones,input,sets,geometry,load};
}
const snapshot=fit=>JSON.stringify([...fit.cages].map(([k,v])=>({k,points:v.points.map(p=>p.toArray()),bounds:[v.bounds.min.toArray(),v.bounds.max.toArray()],canonical:[v.canonicalBounds.min.toArray(),v.canonicalBounds.max.toArray()]})));
test('strict optional contact metadata; absent declaration remains legacy compatible',()=>{
 const {validateModule}=staged('src/characters/AttachmentContract.ts');assert.equal(validateModule(metadata()).fitContactZones[0],'HEAD');
 const old=metadata();delete old.fitContactZones;assert.equal(validateModule(old),old);
 for(const zones of [undefined,null,[],['NOPE'],['HEAD','HEAD'],{},Array(1),['HEAD',Infinity]])assert.throws(()=>validateModule({...metadata(),fitContactZones:zones}),/Contact fit zones/);
 assert.throws(()=>validateModule({...metadata(),fitMode:'rigid'}),/fitted cage/);
 assert.throws(()=>validateModule({...metadata(),fitCage:undefined}),/known cage/);
 const inherited=Object.assign(Object.create({fitContactZones:['HEAD']}),old);assert.throws(()=>validateModule(inherited),/Contact fit zones/);
});
test('neck girth expands full collision envelope but cannot widen HEAD contact subset',()=>{
 const f=fixture(),m=metadata(),initial=f.fit.contactVolume(m),canonical=initial.canonicalBounds.getSize(new Vector3()).toArray(),before=f.fit.cages.get('LOWER_FACE_CAGE').bounds.getSize(new Vector3()).x;
 assert.equal(initial.points.length,f.sets.head.length);assert.equal(initial.points.length,8);
 f.mesh.morphTargetInfluences[0]=1;f.fit.refit();const changed=f.fit.contactVolume(m),after=f.fit.cages.get('LOWER_FACE_CAGE').bounds.getSize(new Vector3()).x;
 assert.ok(after>before);assert.deepEqual(changed.points.map(p=>p.toArray()),initial.points.map(p=>p.toArray()));
 assert.deepEqual(changed.bounds.getSize(new Vector3()).toArray(),initial.bounds.getSize(new Vector3()).toArray());assert.deepEqual(changed.canonicalBounds.getSize(new Vector3()).toArray(),canonical);
 assert.equal(changed.bounds.getSize(new Vector3()).x/changed.canonicalBounds.getSize(new Vector3()).x,1);
});
test('no declaration is byte-equivalent for shared legacy cages and returns undefined',()=>{
 const f=fixture(),b=fixture(baseline),old=metadata();delete old.fitContactZones;
 const before=snapshot(f.fit);assert.equal(f.fit.contactVolume(old),undefined);assert.equal(snapshot(f.fit),before);assert.equal(snapshot(f.fit),snapshot(b.fit));
 const legacy=fixture(staged,{calibrated:false});assert.equal(legacy.fit.contactVolume(old),undefined);assert.throws(()=>legacy.fit.contactVolume(metadata()),/source-validated/);
});
test('explicit region fails closed for stale correspondence, invalid source and nonfinite evaluated geometry',()=>{
 const {validateBodySurfaceCalibration}=staged('src/characters/BodySurfaceCalibration.ts');const f=fixture();
 assert.throws(()=>validateBodySurfaceCalibration(f.input,'b'.repeat(64),[f.mesh]),/Stale/);
 const malformed=structuredClone(f.input);malformed.meshes[0].coverage[0]='BAD';assert.throws(()=>validateBodySurfaceCalibration(malformed,f.input.sourceSHA256,[f.mesh]),/coverage/);
 f.geometry.attributes.position.setX(0,.123);assert.throws(()=>f.fit.contactVolume(metadata()),/Stale.*POSITION/);
 const idx=fixture();idx.geometry.index.setX(0,1);assert.throws(()=>idx.fit.contactVolume(metadata()),/triangle correspondence/);
 const nonfinite=fixture();nonfinite.geometry.morphAttributes.position[0].setX(0,NaN);nonfinite.mesh.morphTargetInfluences[0]=1;assert.throws(()=>nonfinite.fit.contactVolume(metadata()),/Nonfinite/);
});
test('empty or planar contact domains reject instead of guessed fallback',()=>{
 const f=fixture();assert.throws(()=>f.fit.contactVolume({...metadata(),fitContactZones:['TORSO_LOWER']}),/Insufficient/);
 const planar=fixture(staged,{planar:true});assert.throws(()=>planar.fit.contactVolume(metadata()),/Insufficient/);
});
test('returned volume owns points and bounds and cannot mutate collision cages or calibration',()=>{
 const f=fixture(),before=snapshot(f.fit),volume=f.fit.contactVolume(metadata()),truth=f.fit.contactVolume(metadata());
 volume.points[0].set(999,999,999);volume.bounds.min.set(999,999,999);volume.canonicalBounds.max.set(999,999,999);
 const next=f.fit.contactVolume(metadata());assert.deepEqual(next.points.map(p=>p.toArray()),truth.points.map(p=>p.toArray()));assert.deepEqual(next.bounds,truth.bounds);assert.deepEqual(next.canonicalBounds,truth.canonicalBounds);assert.equal(snapshot(f.fit),before);
});
function simpleBeard(){const g=new Group(),geometry=new BufferGeometry();geometry.setAttribute('position',new Float32BufferAttribute([.04,-.08,.08,.06,-.08,.08,.04,-.09,.09],3));g.add(new Mesh(geometry,new MeshStandardMaterial()));return g;}
function firstPositions(group){const mesh=group.getObjectByName('GeneratedBeard').children[0];return Array.from(mesh.geometry.attributes.position.array);}
test('appearance width uses explicit contact only; no declaration matches baseline exactly',()=>{
 const f=fixture();f.mesh.morphTargetInfluences[0]=1;f.fit.refit();const m=metadata(),old={...m};delete old.fitContactZones;
 const current=staged('src/character-lab/AppearanceModules.ts').appearanceModules,previous=baseline('src/character-lab/AppearanceModules.ts').appearanceModules;
 const args=[{hairStyle:'short',beardStyle:'short',color:'#ffffff'},new Vector3(1,1,1),2,{hair:1,beard:1,clothing:1},null,[],simpleBeard()];
 const legacy=current(...args,old,f.fit.cages),base=previous(...args,old,f.fit.cages);assert.deepEqual(firstPositions(legacy),firstPositions(base));
 const contact=f.fit.contactVolume(m),out=current(...args,m,f.fit.cages,contact),raw=Array.from(args[6].children[0].geometry.attributes.position.array);assert.deepEqual(firstPositions(out),raw);
 assert.throws(()=>current(...args,m,f.fit.cages),/calibrated fitting volume/);assert.throws(()=>current(...args,m,f.fit.cages,{...contact,name:'HEAD_CAGE'}),/calibrated fitting volume/);
});

test('generic contact query does not imply unimplemented hair or garment fit consumption',()=>{
 const f=fixture(),garment={...metadata(),type:'garment',anchor:'socket_chest',fitCage:'TORSO_CAGE',fitMode:'drape',slot:'upper',fitContactZones:['TORSO_UPPER']};
 assert.equal(f.fit.contactVolume(garment).points.length,4);
 const fn=staged('src/character-lab/AppearanceModules.ts').appearanceModules,contact=f.fit.contactVolume(metadata());
 for(const kind of ['hair','mask','garment'])assert.throws(()=>fn({hairStyle:'short',beardStyle:'none',color:'#ffffff'},new Vector3(1,1,1),2,{hair:1,beard:1,clothing:1},simpleBeard(),[],null,{...metadata(),type:kind},f.fit.cages,contact),/only for the beard consumer|Garments need a slot/);
});
