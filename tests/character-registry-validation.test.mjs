import {technicalGarmentRecord} from './technical-garment-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {load} from './load-source.mjs';
import {readGLB,publicFile,geometryGLTF} from '../scripts/characters/glb-inspection.mjs';
import {validateAssetRecord,validateLoadedBodyOrientation} from '../scripts/characters/validation.mjs';
const {characterAssets,characterAsset,characterAssetURL,validateCharacterRegistry,availableHairStyles}=load('../src/characters/CharacterAssets.ts');

test('registry discovery retains reviewed LOD policy and validates module references',()=>{
    assert.equal(characterAssets.filter(asset=>asset.scope!=='lab-v04'&&asset.scope!=='body-bound').length,13,'retired outfits are not active inventory');
    assert.equal(validateCharacterRegistry().length,17+load('../src/characters/V04ModuleCatalog.ts').v04CharacterModules.length);
    assert.deepEqual(characterAssets.filter(a=>a.scope==='body-bound').map(a=>a.id).sort(),['beard/meshy-compact-wedge','equipment/meshy-belt-pouch','garment/meshy-tunic-trousers','hair/meshy-short-angular']);
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
    const noRuntime=structuredClone(characterAsset('hair/short'));delete noRuntime.budgets.runtimeTriangles;
    assert.throws(()=>validateCharacterRegistry([noRuntime]),/hair\/short: fitted runtime triangle budget is required/);
});
test('module metadata rejects unknown policies, reversed contact bands and incomplete measured bind joints',()=>{
    for(const patch of [{fitMode:'invented'},{authoringFrame:'unknown'},{projection:'invented'},{subdivisions:3},{attachmentBand:{minimumY:1,maximumY:0}},{canonicalHeadSize:[.2,.2]}]){
        const hair=structuredClone(characterAsset('hair/short'));Object.assign(hair.metadata,patch);assert.throws(()=>validateCharacterRegistry([hair]),/hair\/short:/);
    }
    const garment=technicalGarmentRecord().asset;garment.metadata.garmentBind={joints:{Hips:[0,1,0]}};
    assert.throws(()=>validateCharacterRegistry([garment]),/garment\/technical-contract: Invalid measured garment bind joints/);
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

test('measured garments require VEC2 UVs before runtime surface refinement',()=>{
    const {asset,record:source}=technicalGarmentRecord();
    assert.ok(asset.metadata.garmentBind);
    for(const substitute of [undefined,'POSITION']){
        const record={...source,json:structuredClone(source.json)},primitive=record.json.meshes[0].primitives[0];
        if(substitute===undefined)delete primitive.attributes.TEXCOORD_0;
        else primitive.attributes.TEXCOORD_0=primitive.attributes[substitute];
        assert.throws(()=>validateAssetRecord(asset,2,record),/garment\/technical-contract LOD2: measured garment requires TEXCOORD_0\/VEC2/);
    }
});

test('garment bind domains validate canonical torso and limb source ownership',()=>{
    const {asset,record:source}=technicalGarmentRecord();
    const fixture=()=>({...source,json:structuredClone(source.json)});
    for(const domain of ['torso','limb',undefined]){
        const record=fixture(),node=record.json.nodes.find(n=>n.mesh!==undefined);
        node.extras={...node.extras,garmentBindDomain:domain};
        assert.ok(validateAssetRecord(asset,2,record)>0);
    }
    for(const location of ['node','mesh'])for(const domain of ['invented',null]){
        const record=fixture(),node=record.json.nodes.find(n=>n.mesh!==undefined),target=location==='node'?node:record.json.meshes[node.mesh];
        target.extras={...target.extras,garmentBindDomain:domain};
        assert.throws(()=>validateAssetRecord(asset,2,record),/garment\/technical-contract LOD2: unknown garment bind domain/);
    }
    const conflict=fixture(),node=conflict.json.nodes.find(n=>n.mesh!==undefined);
    node.extras={...node.extras,garmentBindDomain:'torso'};
    conflict.json.meshes[node.mesh].extras={...conflict.json.meshes[node.mesh].extras,garmentBindDomain:'limb'};
    assert.throws(()=>validateAssetRecord(asset,2,conflict),/conflicting mesh\/node garment bind domains/);
    const unmeasured=structuredClone(asset);delete unmeasured.metadata.garmentBind;
    assert.throws(()=>validateAssetRecord(unmeasured,2,conflict),/garment bind domain requires measured regional fitting/);
});

test('source accessory surfaces require measured garments and mesh ownership',()=>{
    const {asset,record:source}=technicalGarmentRecord();
    const fixture=()=>({...source,json:structuredClone(source.json)});
    for(const location of ['node','mesh']){
        const record=fixture(),node=record.json.nodes.find(n=>n.mesh!==undefined),target=location==='node'?node:record.json.meshes[node.mesh];
        target.extras={...target.extras,garmentSurface:'accessory'};
        assert.ok(validateAssetRecord(asset,2,record)>0);
        for(const value of ['cloth','invented',null]){
            target.extras.garmentSurface=value;
            assert.throws(()=>validateAssetRecord(asset,2,record),/garment\/technical-contract LOD2: unknown garment surface/);
        }
    }
    const group=fixture();group.json.nodes.push({extras:{garmentSurface:'accessory'}});
    assert.throws(()=>validateAssetRecord(asset,2,group),/garment surface must belong to a mesh node/);
    const record=fixture(),node=record.json.nodes.find(n=>n.mesh!==undefined);node.extras={...node.extras,garmentSurface:'accessory'};
    const unmeasured=structuredClone(asset);delete unmeasured.metadata.garmentBind;
    assert.throws(()=>validateAssetRecord(unmeasured,2,record),/garment surface requires measured regional fitting/);
    const body=characterAsset('body/universal-human'),bodyRecord=readGLB(body.lods[2]),invalidBody={...bodyRecord,json:structuredClone(bodyRecord.json)};
    invalidBody.json.nodes.find(n=>n.mesh!==undefined).extras={garmentSurface:'accessory'};
    assert.throws(()=>validateAssetRecord(body,2,invalidBody),/garment surface requires measured regional fitting/);
});

test('material texture coordinates reject missing default UVs, wrong types and invalid indices',()=>{
    const asset=characterAsset('body/universal-human'),source=readGLB(asset.lods[2]);
    const fixture=()=>{const record={...source,json:structuredClone(source.json)},primitive=record.json.meshes[0].primitives[0],info=record.json.materials[primitive.material].pbrMetallicRoughness.baseColorTexture;assert.ok(info);return {record,primitive,info};};
    assert.equal(validateAssetRecord(asset,2,source),1293);
    const missing=fixture();delete missing.primitive.attributes.TEXCOORD_0;
    assert.throws(()=>validateAssetRecord(asset,2,missing.record),/baseColorTexture: requires TEXCOORD_0\/VEC2/);
    const wrong=fixture();wrong.primitive.attributes.TEXCOORD_0=wrong.primitive.attributes.POSITION;
    assert.throws(()=>validateAssetRecord(asset,2,wrong.record),/baseColorTexture: requires TEXCOORD_0\/VEC2/);
    for(const coordinate of [-1,.5,'1',null]){
        const item=fixture();item.info.texCoord=coordinate;
        assert.throws(()=>validateAssetRecord(asset,2,item.record),/texture coordinate index must be a nonnegative integer/);
    }
    const absentSecondary=fixture();absentSecondary.info.texCoord=99;
    assert.throws(()=>validateAssetRecord(asset,2,absentSecondary.record),/baseColorTexture: requires TEXCOORD_99\/VEC2/);
    const nested=fixture();nested.record.json.materials[nested.primitive.material].extensions={KHR_materials_clearcoat:{clearcoatTexture:{index:nested.info.index,texCoord:1}}};
    assert.throws(()=>validateAssetRecord(asset,2,nested.record),/clearcoatTexture: requires TEXCOORD_1\/VEC2/);
});

test('material texture coordinates resolve secondary UVs and texture-transform overrides per primitive',()=>{
    const asset=characterAsset('body/universal-human'),source=readGLB(asset.lods[2]);
    const fixture=()=>{const record={...source,json:structuredClone(source.json)},primitive=record.json.meshes[0].primitives[0],info=record.json.materials[primitive.material].pbrMetallicRoughness.baseColorTexture;return {record,primitive,info};};
    const secondary=fixture();secondary.primitive.attributes.TEXCOORD_1=secondary.primitive.attributes.TEXCOORD_0;delete secondary.primitive.attributes.TEXCOORD_0;secondary.info.texCoord=1;
    assert.equal(validateAssetRecord(asset,2,secondary.record),1293);
    const separate=fixture();separate.info.texCoord=1;separate.primitive.attributes.TEXCOORD_1=separate.primitive.attributes.TEXCOORD_0;
    const otherPrimitive=structuredClone(separate.primitive);delete otherPrimitive.attributes.TEXCOORD_1;separate.record.json.meshes[0].primitives.push(otherPrimitive);
    assert.throws(()=>validateAssetRecord(asset,2,separate.record),/baseColorTexture: requires TEXCOORD_1\/VEC2/,'UVs on another primitive must not satisfy the material');
    const override=fixture();override.primitive.attributes.TEXCOORD_1=override.primitive.attributes.TEXCOORD_0;delete override.primitive.attributes.TEXCOORD_0;
    override.info.texCoord=0;override.info.extensions={KHR_texture_transform:{offset:[.1,.2],texCoord:1}};
    assert.equal(validateAssetRecord(asset,2,override.record),1293);
    for(const coordinate of [-1,.5,'1',null]){
        const invalid=fixture();invalid.info.extensions={KHR_texture_transform:{texCoord:coordinate}};
        assert.throws(()=>validateAssetRecord(asset,2,invalid.record),/texture coordinate index must be a nonnegative integer/);
    }
    const missing=fixture();missing.info.extensions={KHR_texture_transform:{texCoord:3}};
    assert.throws(()=>validateAssetRecord(asset,2,missing.record),/baseColorTexture: requires TEXCOORD_3\/VEC2/);
    const wrong=fixture();wrong.primitive.attributes.TEXCOORD_1=wrong.primitive.attributes.POSITION;wrong.info.extensions={KHR_texture_transform:{texCoord:1}};
    assert.throws(()=>validateAssetRecord(asset,2,wrong.record),/baseColorTexture: requires TEXCOORD_1\/VEC2/);
    const unused=fixture(),extra=structuredClone(unused.record.json.materials[unused.primitive.material]);extra.pbrMetallicRoughness.baseColorTexture.texCoord=99;unused.record.json.materials.push(extra);
    assert.equal(validateAssetRecord({...asset,budgets:{...asset.budgets,materials:2}},2,unused.record),1293,'unused material UVs must not impose an unrelated primitive requirement');
});
import {validateRegisteredAsset} from '../scripts/characters/validation.mjs';
test('registry validation checks declared Lab previews without promoting them to accepted assets',async()=>{
 const previews=characterAssets.filter(asset=>asset.scope==='lab-v04'&&asset.reviewStatus==='preview');
 assert.ok(previews.length);
 for(const asset of previews){await assert.rejects(()=>validateRegisteredAsset(asset,2),/runtime source still requires reference review|unreviewed/);const result=await validateRegisteredAsset(asset,2,{allowLabPreview:true});assert.ok(result.measurement.triangles>0);assert.equal(asset.reviewStatus,'preview');}
});
