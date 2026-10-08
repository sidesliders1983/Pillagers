import test from 'node:test';
import assert from 'node:assert/strict';
import {Vector3} from 'three';
import {geometryAsset} from './glb-fixture.mjs';
import {load} from './load-source.mjs';
const {UniversalHuman}=load('../src/characters/UniversalHuman.ts');
const {universalHumanProfile}=load('../src/characters/UniversalHumanProfile.ts');
const {goldenCharacterDNA}=load('../src/characters/GoldenCharacters.ts');
const {garmentBindBones,validateModule}=load('../src/characters/AttachmentContract.ts');
const {characterAssets}=load('../src/characters/CharacterAssets.ts');

test('measured reference garment joints obey the canonical frame and retain the whole body',()=>{
    for(const asset of characterAssets.filter(asset=>asset.type==='garment')){
        assert.deepEqual(Object.keys(asset.metadata.garmentBind.joints).sort(),[...garmentBindBones].sort());
        assert.deepEqual(asset.metadata.covers,[]);validateModule(asset.metadata);
        const reversed=structuredClone(asset.metadata);reversed.garmentBind.joints.Neck[1]=0;
        assert.throws(()=>validateModule(reversed),/canonical \+Y/);
        const collapsed=structuredClone(asset.metadata);collapsed.garmentBind.joints.Toe_L=collapsed.garmentBind.joints.Foot_L;
        assert.throws(()=>validateModule(collapsed),/nonzero length/);
    }
});

test('neutral rig joint calibration stays independent of morphology, animation and world placement',async()=>{
    for(const lod of [0,1,2]){
        const source=await geometryAsset(`universal-human/UniversalHuman_LOD${lod}.glb`);
        let expected;
        for(const id of ['golden_neutral_01','golden_child_01','golden_older_01']){
            const dna=goldenCharacterDNA(id),human=new UniversalHuman(source,universalHumanProfile(dna),'#eeccbb');
            const points=Object.fromEntries([...human.fit.canonicalJoints].map(([name,point])=>[name,point.toArray()]));
            if(!expected)expected=points;else assert.deepEqual(points,expected,`${id}/LOD${lod}: canonical joints depend on DNA`);
            for(const name of garmentBindBones)assert.ok(human.fit.canonicalJoints.get(name)?.toArray().every(Number.isFinite),name);
            human.root.position.set(3,0,-2);human.root.rotation.y=.7;human.setAnimation('Run');human.update(.2);
            human.apply(universalHumanProfile({...dna,age:60}),'#eeccbb');
            assert.deepEqual(Object.fromEntries([...human.fit.canonicalJoints].map(([name,point])=>[name,point.toArray()])),points);
            assert.ok(human.fit.canonicalJoints.get('Chest').distanceTo(new Vector3(0,1.32,0))<.2);
            human.dispose();
        }
    }
});
