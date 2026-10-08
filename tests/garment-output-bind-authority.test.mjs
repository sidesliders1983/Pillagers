import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Vector3} from 'three';
import {geometryAsset} from './glb-fixture.mjs';
import {load} from './load-source.mjs';
import {publicFile} from '../scripts/characters/glb-inspection.mjs';
import {garmentBindToleranceMetres,validateGarmentBindProvenance} from '../scripts/characters/garment-bind-validation.mjs';

const {UniversalHuman}=load('../src/characters/UniversalHuman.ts');
const {universalHumanProfile}=load('../src/characters/UniversalHumanProfile.ts');
const {goldenCharacterDNA}=load('../src/characters/GoldenCharacters.ts');
const {characterAssets}=load('../src/characters/CharacterAssets.ts');
const {garmentBindBones}=load('../src/characters/AttachmentContract.ts');

test('final garment output frames match the actual neutral body, rather than only agreeing with the registry',async()=>{
    // An identically wrong registry and provenance table must not establish
    // canonical authority. Derive that authority independently from the real rig.
    for(const bodyLOD of [0,1,2]){
        const body=await geometryAsset(`universal-human/UniversalHuman_LOD${bodyLOD}.glb`);
        const human=new UniversalHuman(body,universalHumanProfile(goldenCharacterDNA('golden_neutral_01')),'#ffffff');
        try{
            for(const name of garmentBindBones)assert.ok(human.fit.canonicalJoints.get(name)?.toArray().every(Number.isFinite),`body LOD${bodyLOD}: missing canonical ${name}`);
            for(const asset of characterAssets.filter(entry=>entry.type==='garment')){
                for(const [lod,path] of Object.entries(asset.lods)){
                    const provenance=JSON.parse(readFileSync(publicFile(path.replace(/\.glb$/,'.provenance.json')),'utf8').replace(/^\uFEFF/,''));
                    const bindPath=path.slice(0,path.lastIndexOf('/')+1)+'garment-bind.json';
                    validateGarmentBindProvenance(asset,lod,provenance,{sidecarBytes:readFileSync(publicFile(bindPath))});
                    for(const name of garmentBindBones){
                        const authority=human.fit.canonicalJoints.get(name);
                        assert.ok(authority?.toArray().every(Number.isFinite),`body LOD${bodyLOD}: missing neutral ${name}`);
                        for(const [label,joints] of [['registry',asset.metadata.garmentBind.joints],['final output',provenance.outputGarmentBind.joints]]){
                            const error=new Vector3(...joints[name]).distanceTo(authority);
                            assert.ok(error<=garmentBindToleranceMetres,`${asset.id} LOD${lod}: ${label}.${name} differs from actual body LOD${bodyLOD} by ${error}m`);
                        }
                    }
                }
            }
        }finally{human.dispose();}
    }
});
