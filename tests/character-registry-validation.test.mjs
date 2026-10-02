import test from 'node:test';
import assert from 'node:assert/strict';
import {load} from './load-source.mjs';
import {readGLB,publicFile,geometryGLTF} from '../scripts/characters/glb-inspection.mjs';
import {validateAssetRecord,validateLoadedBodyOrientation} from '../scripts/characters/validation.mjs';
const {characterAssets,characterAsset,characterAssetURL,validateCharacterRegistry,availableHairStyles}=load('../src/characters/CharacterAssets.ts');

test('registry discovery retains reviewed LOD policy and validates module references',()=>{
    assert.equal(validateCharacterRegistry().length,13);
    for(const style of availableHairStyles)assert.equal(characterAssetURL(`hair/${style}`,0),characterAssetURL(`hair/${style}`,2));
    assert.notEqual(characterAssetURL('body/universal-human',0),characterAssetURL('body/universal-human',2));
    assert.notEqual(characterAssetURL('beard/braid',0),characterAssetURL('beard/braid',2));
    assert.throws(()=>characterAssetURL('hair/short',3),/hair\/short: invalid LOD/);
    assert.throws(()=>characterAsset('hair/missing'),/Unknown character asset/);
    assert.throws(()=>publicFile('/../../credentials.json'),/Invalid public/);
});
test('registry errors identify duplicate ids, missing LODs, budgets, sockets, cages and coverage',()=>{
    assert.throws(()=>validateCharacterRegistry([characterAssets[0],characterAssets[0]]),/body\/universal-human: asset id must be unique/);
    const body=structuredClone(characterAssets[0]);delete body.lods[2];assert.throws(()=>validateCharacterRegistry([body]),/body\/universal-human: body requires/);
    for(const patch of [{anchor:'socket_unknown'},{fitCage:'HEAD_BIG'},{covers:['UNKNOWN']}]){
        const hair=structuredClone(characterAsset('hair/short'));Object.assign(hair.metadata,patch);
        assert.throws(()=>validateCharacterRegistry([hair]),/hair\/short:/);
    }
    const hair=structuredClone(characterAsset('hair/short'));hair.budgets.triangles[2]=0;
    assert.throws(()=>validateCharacterRegistry([hair]),/hair\/short: LOD2 requires a triangle budget/);
});
test('asset validation rejects real rig regressions, broken textures, indices and budgets with asset ids',()=>{
    const body=characterAsset('body/universal-human'),source=readGLB(body.lods[2]);
    assert.equal(validateAssetRecord(body,2,source),1293);
    function rejects(mutate,pattern){const record={...source,json:structuredClone(source.json)};mutate(record.json);assert.throws(()=>validateAssetRecord(body,2,record),pattern);}
    rejects(json=>{json.nodes.find(n=>n.name==='Head').name='DifferentHead';},/body\/universal-human LOD2: unexpected/);
    rejects(json=>{json.animations[0].name='MissingIdle';},/expected Idle\/Walk\/Run/);
    rejects(json=>{json.textures[0].source=99;},/missing texture image/);
    rejects(json=>{json.images[0].uri='missing.png';},/texture must be embedded/);
    rejects(json=>{json.meshes[0].primitives[0].material=100;},/missing material/);
    rejects(json=>{json.nodes[0].scale=[1,NaN,1];},/non-finite scale/);
    const tiny={...body,budgets:{...body.budgets,triangles:{2:10}}};
    assert.throws(()=>validateAssetRecord(tiny,2,source),/body\/universal-human LOD2: triangle budget exceeded/);
});
test('body orientation validation includes scene transforms, not only local mesh coordinates',async()=>{
    const body=characterAsset('body/universal-human'),gltf=await geometryGLTF(readGLB(body.lods[2]));
    validateLoadedBodyOrientation(body,gltf);
    gltf.scene.rotation.y=Math.PI;
    assert.throws(()=>validateLoadedBodyOrientation(body,gltf),/body\/universal-human: loaded scene\/node transforms face away/);
});
