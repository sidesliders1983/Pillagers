import test from 'node:test';
import assert from 'node:assert/strict';
import {CylinderGeometry, Group, Mesh, MeshStandardMaterial, Vector3} from 'three';
import {geometryAsset} from './glb-fixture.mjs';
import {load} from './load-source.mjs';
const {UniversalHuman}=load('../src/characters/UniversalHuman.ts');
const {universalHumanProfile}=load('../src/characters/UniversalHumanProfile.ts');
const {defaultDNA}=load('../src/characters/CharacterDNA.ts');
const {fitPreset,fitPresetLabels}=load('../src/characters/FitPresets.ts');
const {socketDefinitions,landmarkNames,cageNames,appearanceMetadata,attachmentVersion,validateModule}=load('../src/characters/AttachmentContract.ts');
const {CharacterFactory}=load('../src/characters/CharacterFactory.ts');

function garmentFixture(full){
    // Contract-validation mesh only, never a renderable published clothing asset.
    const source=new Group(),geometry=new CylinderGeometry(.28,full?.34:.26,full?.95:.46,12,5,true);
    geometry.translate(0,full?1.0:1.3,0);const mesh=new Mesh(geometry,new MeshStandardMaterial());mesh.name=full?'technical-long-garment':'technical-upper-garment';source.add(mesh);
    return {source,metadata:{version:attachmentVersion,id:mesh.name,type:'garment',anchor:'socket_waist',fitCage:'TORSO_CAGE',fitMode:'drape',slot:full?'full':'upper',covers:full?['TORSO_UPPER','TORSO_LOWER','PELVIS']:['TORSO_UPPER'],clearance:.02,authoringFrame:'canonical'}};
}
test('contract resolves sockets and topology landmarks across LODs and extreme profiles',async()=>{
    for(const lod of [0,1,2]){
        const body=await geometryAsset(`universal-human/UniversalHuman_LOD${lod}.glb`);
        for(const key of Object.keys(fitPresetLabels)){
            const profile=universalHumanProfile(fitPreset(key)),human=new UniversalHuman(body,profile,'#eeccbb'),fit=human.fit;
            assert.deepEqual([...fit.sockets.keys()],Object.keys(socketDefinitions));assert.equal(fit.landmarks.size,landmarkNames.length);
            for(const cage of cageNames){const volume=fit.cages.get(cage);assert.ok(volume.points.length>=4);assert.ok(volume.bounds.getSize(new Vector3()).toArray().every(value=>value>0&&Number.isFinite(value)));}
            for(const [name,definition] of Object.entries(socketDefinitions)){
                const socket=fit.sockets.get(name);assert.equal(socket.parent.name,definition.bone);
                if(definition.landmark){const point=human.root.worldToLocal(socket.getWorldPosition(new Vector3()));assert.ok(point.distanceTo(fit.landmarks.get(definition.landmark))<1e-5,`${name} must follow its actual surface landmark`);}
            }
            const revision=fit.revision;human.setAnimation('Run');for(let i=0;i<5;i++)human.update(.02);assert.equal(fit.revision,revision,'animation must not refit');
            human.dispose();
        }
    }
});
test('short/braided hair and short/long beards use the shared sockets over profile extremes',async()=>{
    const body=await geometryAsset('universal-human/UniversalHuman_LOD2.glb');
    for(const key of Object.keys(fitPresetLabels))for(const kind of ['hair','beard'])for(const style of kind==='hair'?['short','braid']:['short','long']){
        const dna=fitPreset(key),profile=universalHumanProfile(dna);if(kind==='beard'&&(profile.age<18||profile.masculinity<.5))continue;
        profile.appearance[kind==='hair'?'hairStyle':'beardStyle']=style;
        const asset=await geometryAsset(kind==='hair'?`appearance/${style}/Hair_${style}_LOD2.glb`:`appearance/beards/${style}/Beard_${style}_LOD2.glb`);
        const human=new UniversalHuman(body,profile,'#eeccbb',kind==='hair'?asset.scene:null,kind==='beard'?asset.scene:null);
        const module=human.fit.modules.get(`${kind}/${style}`);assert.ok(module);assert.equal(module.object.parent.name,kind==='hair'?'socket_head_top':'socket_jaw');
        assert.equal(module.metadata.fitCage,kind==='hair'?'HEAD_CAGE':'LOWER_FACE_CAGE');
        const head=human.root.getObjectByName('Head'),point=module.object.getWorldPosition(new Vector3()),local=head.worldToLocal(point.clone());
        human.setAnimation('Walk');human.update(.09);const animated=head.worldToLocal(module.object.getWorldPosition(new Vector3()));assert.ok(local.distanceTo(animated)<1e-5);
        human.dispose();
    }
});
test('upper and long garment fixtures retain silhouette, bind to the rig and refit only on DNA change',async()=>{
    const body=await geometryAsset('universal-human/UniversalHuman_LOD2.glb');
    for(const key of Object.keys(fitPresetLabels))for(const full of [false,true]){
        const fixture=garmentFixture(full),human=new UniversalHuman(body,universalHumanProfile(fitPreset(key)),'#eeccbb');
        const object=human.equip(fixture.metadata,fixture.source),moduleMesh=object.children[0];
        assert.ok(moduleMesh.isSkinnedMesh);assert.equal(moduleMesh.skeleton,human.root.getObjectByName('UniversalHuman').skeleton);
        const original=fixture.source.children[0].geometry.attributes.position,positions=moduleMesh.geometry.attributes.position;
        assert.equal(positions.count,original.count,'fit must retain the authored topology');
        assert.ok([...positions.array].every(Number.isFinite));
        const weights=moduleMesh.geometry.attributes.skinWeight;
        for(let i=0;i<weights.count;i++)assert.ok(Math.abs([0,1,2,3].reduce((sum,k)=>sum+weights.getComponent(i,k),0)-1)<1e-5);
        const before=Array.from(positions.array),revision=human.fit.revision;human.setAnimation('Run');human.update(.1);assert.deepEqual(Array.from(positions.array),before);assert.equal(human.fit.revision,revision);
        if(full){const hips=moduleMesh.skeleton.bones.findIndex(bone=>bone.name==='Hips'),skin=moduleMesh.geometry.attributes.skinIndex;
            for(let i=0;i<original.count;i++)if(original.getY(i)<human.fit.cages.get('TORSO_CAGE').canonicalBounds.min.y)assert.equal(skin.getX(i),hips,'open skirt follows hips rather than splitting between legs');
        }
        const immutable=body.scene.getObjectByName('UniversalHuman').geometry,sourceIndex=Array.from(immutable.index.array);
        const changed=fitPreset(key);changed.age=55;human.apply(universalHumanProfile(changed),'#eeccbb',false);
        assert.equal(human.fit.revision,revision+1,'equipped modules refit on DNA change even through the world update path');
        assert.deepEqual(Array.from(immutable.index.array),sourceIndex,'masking never edits cached body topology');human.unequip(fixture.metadata.id);
        assert.equal(human.root.getObjectByName('UniversalHuman').geometry,immutable,'removing coverage restores shared immutable source');
        human.dispose();fixture.source.children[0].geometry.dispose();fixture.source.children[0].material.dispose();
    }
});
test('factory registry replaces hair through the same cage and keeps cloned instances independent',async()=>{
    const body=await geometryAsset('universal-human/UniversalHuman_LOD2.glb'),hair=await geometryAsset('appearance/short/Hair_short_LOD2.glb');
    const paths=[],factory=new CharacterFactory(async path=>{paths.push(path);return path.includes('universal-human')?body:hair;});
    const metadata={...appearanceMetadata('hair','short'),id:'registered-short'};factory.registerModule(metadata,'/accepted-short.glb');
    const first=await factory.create(defaultDNA(),2,false),second=await factory.create(defaultDNA(),2,false);
    await factory.equip(first,metadata.id);await factory.equip(second,metadata.id);
    assert.equal(paths.filter(path=>path==='/accepted-short.glb').length,1,'immutable sources remain cached');
    const a=first.fit.modules.get(metadata.id).object,b=second.fit.modules.get(metadata.id).object;
    assert.notEqual(a,b);assert.equal(a.parent.name,'socket_head_top');assert.equal(first.fit.modules.get('hair/medium'),undefined);
    assert.ok(a.getObjectByName('Hair_short_LOD2').geometry!==b.getObjectByName('Hair_short_LOD2').geometry);
    factory.unequip(first,metadata.id);assert.ok(second.fit.modules.has(metadata.id));first.dispose();second.dispose();
});
test('visible debug overlays animate without altering body or refitting; registry rejects invalid metadata',async()=>{
    const body=await geometryAsset('universal-human/UniversalHuman_LOD2.glb'),human=new UniversalHuman(body,universalHumanProfile(defaultDNA()),'#eeccbb');
    const revision=human.fit.revision;human.fit.setDebug({sockets:true,landmarks:true,cages:true,coverage:true,bounds:true});human.setAnimation('Run');human.update(.1);
    assert.ok(human.fit.debug.visible);assert.ok(human.fit.debug.getObjectByName('HEAD_CAGE'));assert.equal(human.fit.revision,revision);
    const marker=human.fit.debug.getObjectByName('CHIN'),socket=human.fit.sockets.get('socket_jaw');
    assert.ok(marker.getWorldPosition(new Vector3()).distanceTo(socket.getWorldPosition(new Vector3()))<.005);
    human.fit.setDebug({sockets:false,landmarks:false,cages:false,coverage:false,bounds:false});assert.equal(human.fit.debug.children.length,0);human.dispose();
    assert.throws(()=>validateModule({...appearanceMetadata('hair','short'),anchor:'made_up'}));
    for(const metadata of [appearanceMetadata('hair','long'),appearanceMetadata('beard','stubble')])assert.deepEqual(JSON.parse(JSON.stringify(metadata)),metadata,'module metadata must round-trip as JSON');
    const factory=new CharacterFactory(async()=>body);factory.registerModule(appearanceMetadata('hair','short'),'/appearance/short/Hair_short_LOD2.glb');
    assert.throws(()=>factory.registerModule({...appearanceMetadata('hair','short'),clearance:-1},'/invalid.glb'));
});
