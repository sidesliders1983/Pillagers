import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Vector3} from 'three';
import {loadTypeScript} from '../load-typescript.mjs';
import {readGLB,accessorValues,geometryGLTF,measureGLB,publicFile} from './glb-inspection.mjs';
const contract=loadTypeScript(new URL('../../src/characters/CharacterContract.ts',import.meta.url)).characterContract;
const registry=loadTypeScript(new URL('../../src/characters/CharacterAssets.ts',import.meta.url));
const {socketDefinitions,cageNames,landmarkNames}=loadTypeScript(new URL('../../src/characters/AttachmentContract.ts',import.meta.url));
const finite=value=>{if(Array.isArray(value))return value.every(finite);return typeof value!=='number'||Number.isFinite(value);};
export function validateLoadedBodyOrientation(asset,gltf){
    if(asset.type!=='body')return;
    const positions=[];gltf.scene.updateMatrixWorld(true);
    gltf.scene.traverse(object=>{if(!object.isMesh)return;if(object.isSkinnedMesh)object.skeleton.update();for(let i=0;i<object.geometry.attributes.position.count;i++)positions.push(object.getVertexPosition(i,new Vector3()).applyMatrix4(object.matrixWorld).toArray());});
    const feet=positions.filter(([x,y])=>Math.abs(x)>.10&&y<.075),ankles=positions.filter(([x,y])=>Math.abs(x)>.10&&y>.13&&y<.22);
    assert.ok(feet.length&&ankles.length,`${asset.id}: loaded scene lacks grounded foot landmarks`);
    const ankleZ=ankles.reduce((sum,p)=>sum+p[2],0)/ankles.length;
    assert.ok(Math.max(...feet.map(p=>p[2]))-ankleZ>ankleZ-Math.min(...feet.map(p=>p[2]))+.04,`${asset.id}: loaded scene/node transforms face away from canonical +Z`);
}
export function validateAssetRecord(asset,lod,record){
    const {json,binary}=record,check=(condition,rule)=>assert.ok(condition,`${asset.id} LOD${lod}: ${rule}`);
    check(json.scenes?.length&&json.nodes?.length&&json.meshes?.length,'expected scene/nodes/meshes');
    check(json.buffers?.length===1&&!json.buffers[0].uri&&json.buffers[0].byteLength<=binary.length,'expected self-contained BIN buffer');
    check(!json.extensionsRequired?.length,'unsupported required glTF extension');
    for(const view of json.bufferViews??[])check(view.buffer===0&&view.byteLength>0&&(view.byteOffset??0)>=0&&(view.byteOffset??0)+view.byteLength<=binary.length,'bufferView outside BIN');
    for(let i=0;i<(json.accessors?.length??0);i++)accessorValues(json,binary,i);
    for(const node of json.nodes){
        for(const key of ['translation','rotation','scale','matrix'])check(finite(node[key]),`non-finite ${key}`);
        if(node.mesh!==undefined)check(!!json.meshes[node.mesh],'missing node mesh');
        if(node.skin!==undefined)check(!!json.skins?.[node.skin],'missing node skin');
        for(const child of node.children??[])check(!!json.nodes[child],'missing child node');
    }
    for(const image of json.images??[]){
        const view=json.bufferViews[image.bufferView];
        check(!image.uri&&!!view,'texture must be embedded and present');
        const bytes=binary.subarray(view.byteOffset??0,(view.byteOffset??0)+view.byteLength);
        check(image.mimeType==='image/png'?bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):image.mimeType==='image/jpeg'&&bytes[0]===255&&bytes[1]===216,'invalid embedded PNG/JPEG signature');
    }
    for(const texture of json.textures??[])check(!!json.images?.[texture.source],'missing texture image');
    function textureReferences(value){if(!value||typeof value!=='object')return;for(const [key,child] of Object.entries(value)){if(key.endsWith('Texture')&&child?.index!==undefined)check(!!json.textures?.[child.index],`missing ${key}`);else textureReferences(child);}}
    for(const material of json.materials??[])textureReferences(material);
    let triangles=0;
    for(const mesh of json.meshes)for(const primitive of mesh.primitives){
        check((primitive.mode??4)===4,'expected triangles');
        const positions=accessorValues(json,binary,primitive.attributes.POSITION),indices=primitive.indices===undefined?positions.map((_,i)=>i):accessorValues(json,binary,primitive.indices).flat();
        check(indices.length%3===0&&indices.every(i=>Number.isInteger(i)&&i>=0&&i<positions.length),'invalid triangle index');triangles+=indices.length/3;
        if(primitive.material!==undefined)check(!!json.materials?.[primitive.material],'missing material');
        for(const index of Object.values(primitive.attributes))check(json.accessors[index].count===positions.length,'attribute count mismatch');
        for(const target of primitive.targets??[])for(const index of Object.values(target))check(json.accessors[index].count===positions.length,'morph count mismatch');
        if(asset.type==='body'){
            check(JSON.stringify(mesh.extras?.targetNames)===JSON.stringify(contract.morphs),'morph contract mismatch');
            check(primitive.targets?.length===contract.morphs.length,'missing morphology targets');
            const weights=accessorValues(json,binary,primitive.attributes.WEIGHTS_0),joints=accessorValues(json,binary,primitive.attributes.JOINTS_0);
            check(!primitive.attributes.WEIGHTS_1&&!primitive.attributes.JOINTS_1,'more than four skin influences');
            check(weights.every(row=>row.length===4&&row.every(v=>v>=0&&v<=1)&&Math.abs(row.reduce((a,b)=>a+b,0)-1)<.002),'invalid skin weights');
            check(joints.every(row=>row.length===4&&row.every(i=>Number.isInteger(i)&&i>=0&&i<json.skins[0].joints.length)),'invalid joint index');
            const feet=positions.filter(([x,y])=>Math.abs(x)>.10&&y<.075),ankles=positions.filter(([x,y])=>Math.abs(x)>.10&&y>.13&&y<.22);
            check(feet.length&&ankles.length,'missing foot/ankle landmarks for orientation check');
            const ankleZ=ankles.reduce((sum,p)=>sum+p[2],0)/ankles.length;
            check(Math.max(...feet.map(p=>p[2]))-ankleZ>ankleZ-Math.min(...feet.map(p=>p[2]))+.04,'feet must face canonical +Z');
        }
    }
    check(triangles>0&&triangles<=asset.budgets.triangles[lod],`triangle budget exceeded (${triangles} > ${asset.budgets.triangles[lod]})`);
    check((json.materials?.length??0)>0&&(json.materials?.length??0)<=asset.budgets.materials,'material budget exceeded or no material');
    if(asset.type==='body'){
        check(json.skins?.length===1,'expected exactly one shared armature');
        const names=json.nodes.map(node=>node.name),expected=[...contract.bones,...contract.legacySockets],skin=json.skins[0];
        check(names.filter(name=>name===contract.rig).length===1,'missing/duplicate PillagersHumanRig');
        const actual=skin.joints.map(i=>json.nodes[i]?.name);
        check(new Set(actual).size===actual.length&&actual.length===expected.length&&actual.every(name=>expected.includes(name)),'unexpected/duplicate rig bone or extra armature');
        for(const name of expected)check(actual.includes(name),`required bone/socket ${name} missing`);
        for(const node of skin.joints.map(i=>json.nodes[i])){
            const deltas=typeof node.extras?.morphTranslations==='string'?JSON.parse(node.extras.morphTranslations):node.extras?.morphTranslations;
            check(!!deltas,`${node.name}: missing morphology translations`);
            for(const [name,values] of Object.entries(deltas))check(contract.morphs.includes(name)&&Array.isArray(values)&&values.length===3&&values.every(Number.isFinite),`${node.name}: invalid ${name} morphology translation`);
        }
        check(JSON.stringify((json.animations??[]).map(a=>a.name).sort())===JSON.stringify([...contract.animations].sort()),'expected Idle/Walk/Run clips');
        for(const animation of json.animations){
            check(animation.channels.length>0,`empty ${animation.name} clip`);
            for(const channel of animation.channels){
                check(['translation','rotation','scale','weights'].includes(channel.target.path)&&!!json.nodes[channel.target.node],'invalid animation target');
                const sampler=animation.samplers[channel.sampler];check(!!sampler,'missing animation sampler');
                const times=accessorValues(json,binary,sampler.input).flat();
                check(times[0]>=0&&times.at(-1)>0&&times.every((time,i)=>i===0||time>times[i-1]),'invalid clip times');
            }
        }
    }else if(asset.type==='garment'){
        check(!json.skins?.length&&!json.animations?.length,'source garment must bind to the existing runtime rig');
        const meshes=json.nodes.filter(node=>node.mesh!==undefined);
        if(asset.metadata.garmentFit==='regional')check(meshes.every(node=>['cloth','skirt','mantle','footwear'].includes(node.extras?.garmentRegion)),'missing/unknown drape region');
        check(json.images?.length===1,'garment should have one baked reference albedo');
    }else if(asset.type==='hair'||asset.type==='beard'){
        check(!json.skins?.length&&!json.animations?.length,'head module must use the character socket rather than another rig');
        const frame=asset.sourceFrame;check(!!frame,'missing measured orientation/calibration frame');
        const up=new Vector3(...frame.up),front=new Vector3(...frame.front);
        check(finite([...frame.centre,...frame.up,...frame.front,frame.radius])&&frame.radius>0&&Math.abs(up.length()-1)<.001&&Math.abs(front.length()-1)<.001&&Math.abs(up.dot(front))<.001,'invalid measured up/front/centre frame');
    }
    return triangles;
}
export async function validateRegisteredAsset(asset,lod){
    const path=asset.lods[lod];
    try{
        const record=readGLB(path);validateAssetRecord(asset,lod,record);
        const gltf=await geometryGLTF(record),actual=measureGLB(record,gltf),expected=registry.assetMeasurement(path);
        validateLoadedBodyOrientation(asset,gltf);
        assert.deepEqual(actual,expected,'registry hash/count/bounds are stale; review then run assets:registry');
        const size=actual.bounds.max.map((v,i)=>v-actual.bounds.min[i]);
        assert.ok(size.every(v=>v>.001&&v<4),'scale/bounds outside sane metre range');
        if(asset.type==='body'){
            assert.ok(size[1]>1.7&&size[1]<1.9&&Math.abs(actual.bounds.min[1])<.02,'canonical body must be about 1.8m, +Y up, origin at ground');
            const bodyManifest=JSON.parse(readFileSync(publicFile('/universal-human/manifest.json'),'utf8'));
            assert.equal(bodyManifest.lods.find(item=>item.file===path.split('/').at(-1))?.sha256,record.sha256,'stale body authoring manifest');
        }else{
            const provenance=JSON.parse(readFileSync(publicFile(path.replace('.glb','.provenance.json')),'utf8').replace(/^\uFEFF/,''));
            assert.equal(provenance.outputSha256,record.sha256,'stale generated provenance');
            if(asset.type==='garment'){
                assert.equal(provenance.fit.front,'+Z');assert.equal(provenance.fit.up,'+Y');
                assert.ok(Math.abs(actual.bounds.min[1])<.04&&actual.bounds.max[1]<1.55,'outfit must be grounded and exclude the source head');
            }
            if(asset.sourceFrame){const bust=provenance.sourceProvenance?.generatedBust;assert.equal(asset.sourceFrame.sourceSha256,bust?.output?.sha256??bust?.outputSha256??bust?.generation?.output?.sha256,'measured frame belongs to another generated source');}
            if(Number(lod)===asset.runtimeLOD||asset.runtimeLOD==='requested')assert.equal(provenance.reviewRequired,false,'runtime source still requires reference review');
        }
        return {gltf,measurement:actual};
    }catch(error){throw new Error(`${asset.id} LOD${lod}: ${error.message}`,{cause:error});}
}
export async function validateGoldenRuntime(){
    const {goldenCharacters,goldenCharacterDNA}=loadTypeScript(new URL('../../src/characters/GoldenCharacters.ts',import.meta.url));
    const {CharacterFactory}=loadTypeScript(new URL('../../src/characters/CharacterFactory.ts',import.meta.url));
    const sources=new Map(),factory=new CharacterFactory(async url=>{
        const path=url.split('?')[0];if(!sources.has(path))sources.set(path,await geometryGLTF(readGLB(path)));return sources.get(path);
    });
    const checkCharacter=(character,id)=>{
        character.root.updateMatrixWorld(true);
        character.root.traverse(object=>{
            assert.ok(finite(object.matrixWorld.elements),`${id}: non-finite world transform`);
            if(!object.isMesh)return;
            assert.ok(finite(object.morphTargetInfluences??[]),`${id}: non-finite morph weights`);
            if(object.isSkinnedMesh){object.skeleton.update();assert.ok([...object.skeleton.boneMatrices].every(Number.isFinite),`${id}: non-finite skeleton`);}
            const count=object.geometry.attributes.position.count;
            for(let i=0;i<count;i++){const point=object.getVertexPosition(i,new Vector3());assert.ok(point.toArray().every(Number.isFinite),`${id}: non-finite rendered vertex ${i}`);}
        });
        assert.deepEqual([...character.fit.sockets.keys()].sort(),Object.keys(socketDefinitions).sort(),`${id}: missing canonical sockets`);
        assert.deepEqual([...character.fit.cages.keys()].sort(),[...cageNames].sort(),`${id}: missing fit cages`);
        assert.equal(character.fit.landmarks.size,landmarkNames.length,`${id}: missing surface landmarks`);
        for(const cage of character.fit.cages.values())assert.ok(!cage.bounds.isEmpty()&&finite([...cage.bounds.min.toArray(),...cage.bounds.max.toArray()]),`${id}: invalid ${cage.name}`);
    };
    const ids=new Set();
    for(const fixture of goldenCharacters){
        assert.ok(!ids.has(fixture.id),`${fixture.id}: duplicate Golden id`);ids.add(fixture.id);
        let instance,clone,world;
        try{
            const dna=goldenCharacterDNA(fixture.id);instance=await factory.create(dna,2);clone=await factory.create(dna,2);
            const first=instance.root.getObjectByName('Head'),second=clone.root.getObjectByName('Head');assert.ok(first&&second&&first!==second,`${fixture.id}: skeleton clones share bones`);
            const before=second.position.clone();first.position.x+=.05;assert.deepEqual(second.position.toArray(),before.toArray(),`${fixture.id}: clone mutation leaked`);first.position.x-=.05;
            for(const clip of contract.animations){instance.setAnimation(clip);for(let i=0;i<3;i++)instance.update(1/30);checkCharacter(instance,fixture.id);}
            world=await factory.createWorld(dna);world.applyDNA(dna);for(const clip of contract.animations){world.setState(clip);world.update(1/30,5);}assert.equal(world.lod,2,`${fixture.id}: World must retain fixed LOD2`);
        }catch(error){throw new Error(`${fixture.id}: ${error.message}`,{cause:error});}
        finally{instance?.dispose();clone?.dispose();world?.dispose();}
    }
    // Resolve/equip every registered appearance, including styles not chosen by this fixture set.
    const adult=await factory.create(goldenCharacterDNA('golden_masculine_01'),2,false);
    try{for(const asset of registry.characterAssets.filter(a=>a.metadata)){await factory.equip(adult,asset.id);assert.ok(adult.fit.modules.has(asset.id),`${asset.id}: registered module not equipped`);adult.update(1/30);checkCharacter(adult,asset.id);factory.unequip(adult,asset.id);}}
    finally{adult.dispose();}
    return {characters:goldenCharacters.length,modules:registry.characterAssets.filter(a=>a.metadata).length};
}
export async function validateCharacters({assetsOnly=false}={}){
    registry.validateCharacterRegistry();let files=0;
    const manifest={schemaVersion:1,assets:[]};
    for(const asset of registry.characterAssets){const lods={};for(const [lod,path] of Object.entries(asset.lods)){const {measurement}=await validateRegisteredAsset(asset,lod);lods[lod]={file:path,...measurement};files++;}manifest.assets.push({...asset,lods});}
    const published=JSON.parse(readFileSync(publicFile('/character-assets.manifest.json'),'utf8'));
    assert.deepEqual(published,JSON.parse(JSON.stringify(manifest)),'published character manifest is stale; run assets:registry');
    const runtime=assetsOnly?null:await validateGoldenRuntime();return {assets:registry.characterAssets.length,files,runtime};
}
