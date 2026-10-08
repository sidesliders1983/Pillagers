import test from 'node:test';
import assert from 'node:assert/strict';
import {load} from './load-source.mjs';
import {geometryAsset} from './glb-fixture.mjs';
import {Vector3} from 'three';
const {defaultDNA,serializeCharacterDNA}=load('../src/characters/CharacterDNA.ts');
const {defaultCharacterPresentation,parseCharacterPresentation,resolveCharacterPresentation}=load('../src/characters/CharacterPresentation.ts');
const {CharacterFactory}=load('../src/characters/CharacterFactory.ts');
const {labSnapshotVersion,labStyleVersion,parseLabSnapshot,snapshotModules,fixedLabViews}=load('../src/character-lab/LabSnapshot.ts');

function snapshot(dna=defaultDNA(),presentation={...defaultCharacterPresentation}){
 return {version:labSnapshotVersion,styleVersion:labStyleVersion,contractVersion:1,fitVersion:'pillagers-fit/0.1',dna,presentation,body:{version:1,preset:'auto'},lod:2,pose:{animation:'Walk',time:.35,paused:true},camera:{...structuredClone(fixedLabViews.front),type:'orthographic',scale:2.4,fov:38},lighting:'lab-neutral/1',modules:snapshotModules(dna,presentation,2)};
}
function factory(){const requests=[];return {requests,factory:new CharacterFactory(path=>{const p=new URL(path,'http://local.test').pathname;requests.push(p);return geometryAsset(p.slice(1));})};}

test('registry presentation choices are independent of DNA; Auto is deterministic and None really removes sources',()=>{
 const dna=defaultDNA(),before=serializeCharacterDNA(dna),auto=resolveCharacterPresentation(dna);
 assert.deepEqual(auto,resolveCharacterPresentation(structuredClone(dna)));
 const manual=resolveCharacterPresentation(dna,{hair:'hair/bun',beard:'beard/short',outfit:'none',hairColor:'#226644'});
 assert.equal(manual.hairId,'hair/bun');assert.equal(manual.beardId,'beard/short');assert.equal(manual.outfitId,null);assert.equal(manual.profile.appearance.color,'#226644');
 const bare=resolveCharacterPresentation(dna,{hair:'none',beard:'none',outfit:'none'});assert.equal(bare.hairId,null);assert.equal(bare.beardId,null);assert.equal(bare.outfitId,null);
 assert.equal(serializeCharacterDNA(dna),before);
});

test('manual beard choices cannot bypass derived sex or the 18-year threshold',()=>{
 for(const [age,masculinity,eligible] of [[17,.77,false],[18,.77,true],[32,.49,false]]){
  const dna={...defaultDNA(),age,morphology:{masculinity,height:1.5}},resolved=resolveCharacterPresentation(dna,{beard:'beard/long'});
  assert.equal(resolved.beardEligible,eligible);assert.equal(resolved.beardId,eligible?'beard/long':null);assert.equal(resolved.profile.appearance.beardStyle,eligible?'long':'none');
 }
});

test('presentation parser rejects unknown assets, wrong asset families, colours and malformed fields',()=>{
 for(const value of [null,[],{hair:'hair/missing'},{hair:'beard/long'},{outfit:'body/universal-human'},{beard:5},{hairColor:'red'},{hairColor:'#fff'},{technicalWaistWrap:'false'},{heightScale:2}])assert.throws(()=>parseCharacterPresentation(value));
});

test('snapshots roundtrip exact DNA, presentation, pose, camera and asset hashes without shared mutable state',()=>{
 const original=snapshot(defaultDNA(),{...defaultCharacterPresentation,hair:'hair/bun',outfit:'none',hairColor:'#123456'});original.body={version:1,preset:'neutral',morphology:{height:1.5},morphs:{Agile:.4,Grounded:0}};const round=parseLabSnapshot(JSON.parse(JSON.stringify(original)));
 assert.deepEqual(round,original);round.presentation.hair='none';round.dna.traits.agility=0;round.camera.position[0]=5;round.body.morphs.Agile=.9;
 assert.equal(original.presentation.hair,'hair/bun');assert.equal(original.dna.traits.agility,.55);assert.equal(original.camera.position[0],0);assert.equal(original.body.morphs.Agile,.4);
});

test('snapshots reject invalid/nonfinite/out-of-range settings, unsupported versions and stale/unknown registry assets',()=>{
 const changes=[s=>s.version='future',s=>s.styleVersion='unreviewed',s=>s.contractVersion=4,s=>s.fitVersion='other',s=>s.lod=3,s=>s.lod=1.5,s=>s.pose.time=NaN,s=>s.pose.time=-1,s=>s.pose.time=61,s=>s.pose.animation='Dance',s=>s.pose.paused='yes',s=>s.camera.type='fisheye',s=>s.camera.scale=0,s=>s.camera.scale=Infinity,s=>s.camera.fov=90,s=>s.camera.position=[0,Infinity,3],s=>s.camera.target=[0,0],s=>s.camera.position=[0,0,0],s=>s.camera.position=[0,.95,20],s=>s.presentation.hair='hair/missing',s=>s.modules[0].sha256='0'.repeat(64),s=>s.modules[0].id='unknown',s=>s.modules=[],s=>s.body.preset='Giant',s=>s.body.morphs={Child:1},s=>s.body.morphs={Agile:Infinity}];
 for(const mutate of changes){const s=snapshot();mutate(s);assert.throws(()=>parseLabSnapshot(s));}
 for(const key of ['constructor','toString','__proto__']){const s=snapshot();s.body.morphs=Object.fromEntries([[key,.5]]);assert.throws(()=>parseLabSnapshot(JSON.parse(JSON.stringify(s))),/Unsupported Lab body axis/);}
});

test('factory bare presentation has no modules or technical waist wrap and retains instance/source independence',async()=>{
 const {factory:f,requests}=factory(),dna=defaultDNA(),presentation={...defaultCharacterPresentation,hair:'none',beard:'none',outfit:'none'};
 const a=await f.create(dna,2,presentation),b=await f.create(dna,2,presentation);
 try{assert.equal(a.fit.modules.size,0);assert.deepEqual(a.root.userData.selectedAssets,{hair:null,beard:null,outfit:null,equipment:null});assert.deepEqual(requests,['/universal-human/UniversalHuman_LOD2.glb']);assert.notEqual(a.root.getObjectByName('Head'),b.root.getObjectByName('Head'));
  const legacy=await f.create(dna,2,false);try{assert.ok(legacy.fit.modules.has('technical-waist-wrap'),'legacy boolean behavior retained');}finally{legacy.dispose();}
 }finally{a.dispose();b.dispose();}
});

test('manual factory selections use canonical sockets and independent owned colour materials',async()=>{
 const {factory:f}=factory(),dna=defaultDNA(),red={...defaultCharacterPresentation,hair:'hair/bun',beard:'beard/short',outfit:'none',hairColor:'#aa3311'},blue={...red,hairColor:'#1144aa'};
 const a=await f.create(dna,2,red),b=await f.create(dna,2,blue);
 try{const ah=a.fit.modules.get('hair/bun').object,bh=b.fit.modules.get('hair/bun').object;assert.equal(ah.parent.name,'socket_head_top');assert.equal(a.fit.modules.get('beard/short').object.parent.name,'socket_jaw');
  let am,bm;ah.traverse(o=>{if(o.isMesh)am=o.material;});bh.traverse(o=>{if(o.isMesh)bm=o.material;});assert.notEqual(am,bm);assert.equal(am.color.getHexString(),'aa3311');assert.equal(bm.color.getHexString(),'1144aa');am.color.set('#000000');assert.equal(bm.color.getHexString(),'1144aa');
 }finally{a.dispose();b.dispose();}
});

test('ineligible manually saved beard is not requested or installed by factory',async()=>{
 const {factory:f,requests}=factory();const human=await f.create({...defaultDNA(),age:17},2,{...defaultCharacterPresentation,hair:'none',beard:'beard/long',outfit:'none'});
 try{assert.equal(human.fit.modules.size,0);assert.equal(requests.some(path=>path.includes('/beards/')),false);}finally{human.dispose();}
});

test('one-shot exact clip sampling is repeatable after motion, resets stale springs and does not refit',async()=>{
 const {factory:f}=factory(),human=await f.create(defaultDNA(),2,{...defaultCharacterPresentation,hair:'none',beard:'none',outfit:'none'});
 try{const body=human.root.getObjectByName('UniversalHuman'),revision=human.fit.revision;
  const vertices=()=>[0,100,500,body.geometry.attributes.position.count-1].map(i=>body.getVertexPosition(i,new Vector3()).toArray());
  human.sampleAnimation('Run',.35);const first=vertices();for(let n=0;n<8;n++)human.update(.05);human.sampleAnimation('Run',.35);assert.deepEqual(vertices(),first);assert.equal(human.animationState.time,.35);assert.equal(human.fit.revision,revision);
  for(const axis of ['BellyJiggle','BreastJiggle'])assert.equal(body.morphTargetInfluences[body.morphTargetDictionary[axis]],0);
  assert.throws(()=>human.sampleAnimation('Run',Infinity));assert.throws(()=>human.sampleAnimation('Dance',0));
 }finally{human.dispose();}
});


test('factory applies a Lab body override to the same source/fit path while Auto instances and identity remain unchanged',async()=>{
 const {factory:f}=factory(),dna=defaultDNA(),before=serializeCharacterDNA(dna),bare={...defaultCharacterPresentation,hair:'none',beard:'none',outfit:'none'};
 const auto=await f.create(dna,2,bare),neutral=await f.create(dna,2,bare,{version:1,preset:'neutral'});
 try{assert.equal(auto.root.userData.bodyPresentationStatus,'auto');assert.equal(neutral.root.userData.bodyPresentationStatus,'override');assert.equal(neutral.root.userData.universalHumanProfile.height,1.44);assert.equal(auto.root.userData.universalHumanProfile.height,load('../src/characters/UniversalHumanProfile.ts').universalHumanProfile(dna).height);assert.equal(neutral.root.userData.universalHumanProfile.age,dna.age);assert.equal(serializeCharacterDNA(dna),before);assert.deepEqual(Object.keys(auto.fit.snapshot().cages),Object.keys(neutral.fit.snapshot().cages));const a=auto.root.getObjectByName('UniversalHuman'),n=neutral.root.getObjectByName('UniversalHuman');assert.equal(a.geometry,n.geometry,'immutable body geometry remains shared');assert.notEqual(a.morphTargetInfluences,n.morphTargetInfluences);assert.notEqual(a.skeleton.boneInverses,n.skeleton.boneInverses);const original=a.morphTargetInfluences.slice();n.morphTargetInfluences.fill(0);assert.deepEqual(a.morphTargetInfluences,original);}
 finally{auto.dispose();neutral.dispose();}
});
