import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {Vector3} from 'three';
import {loadTypeScript} from '../load-typescript.mjs';
import {readGLB,accessorValues,geometryGLTF,measureGLB,publicFile} from './glb-inspection.mjs';
import {inspectGeometryQuality} from './geometry-quality.mjs';
import {validateVertexPaletteStyle,STYLE_FAMILY_PROFILES} from './style-validation.mjs';
import {validateModuleProvenance} from './provenance-validation.mjs';
import {validateGarmentBindProvenance} from './garment-bind-validation.mjs';
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
    const bindDomain=value=>{
        if(value===undefined)return;
        check(asset.type==='garment'&&asset.metadata?.garmentFit==='regional'&&!!asset.metadata?.garmentBind,'garment bind domain requires measured regional fitting');
        check(['torso','limb'].includes(value),'unknown garment bind domain');
    };
    const garmentSurface=value=>{
        if(value===undefined)return;
        check(asset.type==='garment'&&asset.metadata?.garmentFit==='regional'&&!!asset.metadata?.garmentBind,'garment surface requires measured regional fitting');
        check(value==='accessory','unknown garment surface');
    };
    check(json.scenes?.length&&json.nodes?.length&&json.meshes?.length,'expected scene/nodes/meshes');
    if(asset.type==='equipment'){
        check(!json.skins?.length&&!json.animations?.length,'rigid equipment must not own a skin or animation');
        check(json.nodes.every(node=>node.skin===undefined),'rigid equipment must not reference a skin');
    }
    check(json.buffers?.length===1&&!json.buffers[0].uri&&json.buffers[0].byteLength<=binary.length,'expected self-contained BIN buffer');
    check(!json.extensionsRequired?.length,'unsupported required glTF extension');
    for(const view of json.bufferViews??[])check(view.buffer===0&&view.byteLength>0&&(view.byteOffset??0)>=0&&(view.byteOffset??0)+view.byteLength<=binary.length,'bufferView outside BIN');
    for(let i=0;i<(json.accessors?.length??0);i++)accessorValues(json,binary,i);
    for(const node of json.nodes){
        for(const key of ['translation','rotation','scale','matrix'])check(finite(node[key]),`non-finite ${key}`);
        if(node.mesh!==undefined)check(!!json.meshes[node.mesh],'missing node mesh');
        bindDomain(node.extras?.garmentBindDomain);
        if(node.extras?.garmentBindDomain!==undefined){
            check(node.mesh!==undefined,'garment bind domain must belong to a mesh node');
            const meshDomain=json.meshes[node.mesh].extras?.garmentBindDomain;
            check(meshDomain===undefined||meshDomain===node.extras.garmentBindDomain,'conflicting mesh/node garment bind domains');
        }
        garmentSurface(node.extras?.garmentSurface);
        if(node.extras?.garmentSurface!==undefined){
            check(node.mesh!==undefined,'garment surface must belong to a mesh node');
            const meshSurface=json.meshes[node.mesh].extras?.garmentSurface;
            check(meshSurface===undefined||meshSurface===node.extras.garmentSurface,'conflicting mesh/node garment surfaces');
        }
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
    function textureReferences(value,visit){if(!value||typeof value!=='object')return;for(const [key,child] of Object.entries(value)){if(key.endsWith('Texture')&&child?.index!==undefined){check(!!json.textures?.[child.index],`missing ${key}`);visit?.(child,key);}else textureReferences(child,visit);}}
    for(const material of json.materials??[])textureReferences(material);
    for(const mesh of json.meshes){bindDomain(mesh.extras?.garmentBindDomain);garmentSurface(mesh.extras?.garmentSurface);}
    let triangles=0;
    for(const mesh of json.meshes)for(const primitive of mesh.primitives){
        check((primitive.mode??4)===4,'expected triangles');
        if(asset.metadata?.garmentBind&&asset.scope!=='lab-v04'){
            const uv=primitive.attributes.TEXCOORD_0;
            check(uv!==undefined&&json.accessors[uv]?.type==='VEC2','measured garment requires TEXCOORD_0/VEC2 for fit refinement');
        }
        const positions=accessorValues(json,binary,primitive.attributes.POSITION),indices=primitive.indices===undefined?positions.map((_,i)=>i):accessorValues(json,binary,primitive.indices).flat();
        check(indices.length%3===0&&indices.every(i=>Number.isInteger(i)&&i>=0&&i<positions.length),'invalid triangle index');triangles+=indices.length/3;
        if(primitive.material!==undefined){
            check(!!json.materials?.[primitive.material],'missing material');
            textureReferences(json.materials[primitive.material],(info,name)=>{
                const transform=info.extensions?.KHR_texture_transform;
                for(const coordinate of [info.texCoord,transform?.texCoord])if(coordinate!==undefined)check(Number.isInteger(coordinate)&&coordinate>=0,`${name}: texture coordinate index must be a nonnegative integer`);
                const coordinate=transform?.texCoord!==undefined?transform.texCoord:info.texCoord??0,semantic=`TEXCOORD_${coordinate}`,accessor=primitive.attributes[semantic];
                check(accessor!==undefined&&json.accessors[accessor]?.type==='VEC2',`${name}: requires ${semantic}/VEC2 on its material's primitive`);
            });
        }
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
    if(asset.type!=='body'){
        const quality=inspectGeometryQuality(record);
        check(quality.unusedVertices===0,`unused vertices (${quality.unusedVertices})`);
        check(quality.degenerateTriangles===0,`degenerate triangles (${quality.degenerateTriangles})`);
        check(quality.duplicateTriangles===0,`duplicate coplanar faces (${quality.duplicateTriangles})`);
        check(quality.invalidNormals===0,`missing/non-unit normals (${quality.invalidNormals})`);
        check(quality.opposedNormals===0,`vertex normals oppose triangle winding (${quality.opposedNormals})`);
        check(quality.nonManifoldEdges===0,`non-manifold edges (${quality.nonManifoldEdges})`);
        check(quality.nonManifoldVertices===0,`pinched/disconnected vertex links (${quality.nonManifoldVertices})`);
    }
    if(asset.scope==='lab-v04'){
        const key=asset.type==='garment'?'v04-outfit-source':asset.type==='equipment'?'v04-equipment-source':'v04-head-source';
        const result=validateVertexPaletteStyle(record,STYLE_FAMILY_PROFILES[key]);
        check(result.valid,'v0.4 strict mapless constant planar palette: '+result.issues.map(i=>i.code).join(', '));
        check(asset.metadata?.authoringFrame==='canonical','v0.4 modules require an authored canonical frame');
    }
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
        if(asset.scope!=='lab-v04')check(json.images?.length===1,'garment should have one baked reference albedo');
    }else if(asset.type==='hair'||asset.type==='beard'){
        check(!json.skins?.length&&!json.animations?.length,'head module must use the character socket rather than another rig');
        if(asset.scope==='lab-v04'){check(asset.metadata.authoringFrame==='canonical'&&asset.metadata.canonicalHeadSize?.length===3,'v0.4 head requires source-bound canonical head dimensions');return triangles;}
        const frame=asset.sourceFrame;check(!!frame,'missing measured orientation/calibration frame');
        const up=new Vector3(...frame.up),front=new Vector3(...frame.front);
        check(finite([...frame.centre,...frame.up,...frame.front,frame.radius])&&frame.radius>0&&Math.abs(up.length()-1)<.001&&Math.abs(front.length()-1)<.001&&Math.abs(up.dot(front))<.001,'invalid measured up/front/centre frame');
    }
    return triangles;
}
export async function validateRegisteredAsset(asset,lod,{allowLabPreview=false}={}){
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
            validateModuleProvenance(asset,lod,provenance,record.sha256,{allowLabPreview,record,authoringReceiptBytes:asset.scope==='lab-v04'?readFileSync(publicFile(provenance.v04Canonicalization?.authoringReceipt)):undefined});
            if(asset.type==='garment'){
                if(asset.metadata?.garmentBind){
                    const bindPath=path.slice(0,path.lastIndexOf('/')+1)+'garment-bind.json';
                    validateGarmentBindProvenance(asset,lod,provenance,{sidecarBytes:readFileSync(publicFile(bindPath))});
                }
                const outputFrame=asset.metadata?.garmentBind?provenance.outputGarmentBind:provenance.fit;
                assert.equal(outputFrame?.front,'+Z');assert.equal(outputFrame?.up,'+Y');
                assert.ok(Math.abs(actual.bounds.min[1])<.04&&actual.bounds.max[1]<1.55,'outfit must be grounded and exclude the source head');
            }
        }
        return {gltf,measurement:actual};
    }catch(error){throw new Error(`${asset.id} LOD${lod}: ${error.message}`,{cause:error});}
}
/** Partition real registered modules by their exact canonical body identity.
 * Preview auditing is opt-in; the final validator never supplies that option. */
export function runtimeValidationPlan(assets=registry.characterAssets,{allowLabPreview=false}={}){
    const {labBodyAsset,goldenLabBody}=loadTypeScript(new URL('../../src/characters/LabBodySources.ts',import.meta.url));
    const v04Body=labBodyAsset(goldenLabBody.source,2),legacyBody=labBodyAsset('published',2);
    return assets.filter(asset=>asset.metadata).map(asset=>{
        if(asset.scope==='lab-v04'){
            assert.ok(asset.reviewStatus==='accepted'||allowLabPreview===true&&asset.reviewStatus==='preview',asset.id+': unreviewed v0.4 runtime module');
            assert.ok(asset.compatibleBodies?.some(body=>body.id===v04Body.id&&body.sha256===v04Body.sha256),asset.id+': no exact registered v0.4 runtime body');
            const carries=asset.type==='equipment'?Object.keys(asset.metadata.equipmentBindings?.sockets??{}):[undefined];
            assert.ok(carries.length,asset.id+': no supported equipment carry');
            return {asset,body:v04Body,bodyPresentation:{version:1,preset:'neutral',source:goldenLabBody.source},carries};
        }
        assert.ok(asset.scope===undefined,asset.id+': unsupported runtime asset scope');
        const carries=asset.type==='equipment'?Object.keys(asset.metadata.equipmentBindings?.sockets??{}):[undefined];
        assert.ok(carries.length,asset.id+': no supported equipment carry');
        return {asset,body:legacyBody,bodyPresentation:{version:1,preset:'auto',source:'published'},carries};
    });
}

function immutableSourceDigest(gltf){
    const hash=createHash('sha256');gltf.scene.traverse(object=>{
        hash.update(JSON.stringify([object.name,object.position.toArray(),object.quaternion.toArray(),object.scale.toArray()]));
        if(!object.isMesh)return;for(const [name,attribute]of Object.entries(object.geometry.attributes)){hash.update(name);hash.update(Buffer.from(attribute.array.buffer,attribute.array.byteOffset,attribute.array.byteLength));}
        if(object.geometry.index)hash.update(Buffer.from(object.geometry.index.array.buffer,object.geometry.index.array.byteOffset,object.geometry.index.array.byteLength));
        for(const [name,attributes]of Object.entries(object.geometry.morphAttributes))for(const attribute of attributes){hash.update(name);hash.update(Buffer.from(attribute.array.buffer,attribute.array.byteOffset,attribute.array.byteLength));}
    });return hash.digest('hex');
}
export async function validateGoldenRuntime({allowLabPreview=false}={}){
    const {goldenCharacters,goldenCharacterDNA}=loadTypeScript(new URL('../../src/characters/GoldenCharacters.ts',import.meta.url));
    const {CharacterFactory}=loadTypeScript(new URL('../../src/characters/CharacterFactory.ts',import.meta.url));
    const sources=new Map(),sourceDigests=new Map(),factory=new CharacterFactory(async url=>{
        const path=url.split('?')[0];if(!sources.has(path)){const gltf=await geometryGLTF(readGLB(path));sources.set(path,gltf);sourceDigests.set(path,immutableSourceDigest(gltf));}return sources.get(path);
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
    // Use the actual source-bound factory, never a legacy body substituted for r3.
    // Every supported carry is tested on every eligible morphology and motion.
    const plan=runtimeValidationPlan(registry.characterAssets,{allowLabPreview});let moduleCases=0,motionSamples=0;
    const {labCandidatePresetNames}=loadTypeScript(new URL('../../src/characters/LabBodySources.ts',import.meta.url));
    const bare={hair:'none',beard:'none',outfit:'none',equipment:'none',equipmentSocket:'auto',hairColor:null,technicalWaistWrap:false};
    for(const {asset,body,bodyPresentation,carries}of plan){
        const cases=goldenCharacters.map(fixture=>({id:fixture.id,dna:goldenCharacterDNA(fixture.id),bodyPresentation:{...bodyPresentation,preset:'auto'}}));
        if(asset.scope==='lab-v04')for(const preset of ['neutral',...labCandidatePresetNames])cases.push({id:'v04-'+preset,dna:goldenCharacterDNA('golden_masculine_01'),bodyPresentation:{...bodyPresentation,preset}});
        for(const entry of cases){
            // Eligibility is resolved by the factory, not bypassed by direct equip.
            const key=asset.type==='garment'?'outfit':asset.type==='mask'?'hair':asset.type;
            const {resolveCharacterPresentation}=loadTypeScript(new URL('../../src/characters/CharacterPresentation.ts',import.meta.url));
            const eligible=asset.type!=='beard'||resolveCharacterPresentation(entry.dna,bare,body).beardEligible;
            let instance;try{
                instance=await factory.create(entry.dna,2,bare,entry.bodyPresentation);
                assert.equal(instance.root.userData.bodySource.id,body.id,asset.id+': incorrect runtime body ID');
                assert.equal(instance.root.userData.bodySource.sha256,body.sha256,asset.id+': incorrect runtime body SHA');
                if(!eligible){
                    // Manual selection must continue to obey sex/age eligibility.
                    const ineligible=await factory.create(entry.dna,2,{...bare,[key]:asset.id},entry.bodyPresentation);
                    try{assert.ok(!ineligible.fit.modules.has(asset.id),asset.id+': ineligible beard was equipped');}finally{ineligible.dispose();}
                    continue;
                }
                const originalBody=[];instance.root.traverse(object=>{if(object.isSkinnedMesh){originalBody.push({geometry:object.geometry,index:object.geometry.index?.array.slice()??null});}});
                for(const socket of carries){
                    await factory.equip(instance,asset.id,socket);assert.ok(instance.fit.modules.has(asset.id),asset.id+': registered module not equipped');
                    const module=instance.fit.modules.get(asset.id).object;
                    assert.ok(module.parent,asset.id+': unattached module');let fittedTriangles=0;
                    module.traverse(object=>{if(object.isMesh)fittedTriangles+=(object.geometry.index?.count??object.geometry.attributes.position.count)/3;});
                    assert.ok(fittedTriangles>0&&fittedTriangles<=asset.budgets.runtimeTriangles,asset.id+': fitted runtime triangle budget exceeded ('+fittedTriangles+' > '+asset.budgets.runtimeTriangles+')');
                    for(const clip of contract.animations){instance.setAnimation(clip);for(const time of [0,.25,.5]){instance.update(time);checkCharacter(instance,asset.id+' / '+entry.id+' / '+(socket??'default')+' / '+clip);motionSamples++;}}
                    factory.unequip(instance,asset.id);assert.ok(!instance.fit.modules.has(asset.id),asset.id+': module removal failed');
                    for(const original of originalBody)assert.deepEqual(original.geometry.index?.array??null,original.index,asset.id+': removing module did not restore body coverage');
                    checkCharacter(instance,asset.id+' removal');moduleCases++;
                }
            }catch(error){throw new Error(asset.id+' / '+entry.id+': '+error.message,{cause:error});}finally{instance?.dispose();}
        }
    }
    for(const [path,source]of sources)assert.equal(immutableSourceDigest(source),sourceDigests.get(path),path+': runtime fitting mutated cached source geometry or pose');
    return {characters:goldenCharacters.length,modules:plan.length,moduleCases,motionSamples,bodySources:[...new Set(plan.map(item=>item.body.id))]};
}

export async function validateCharacters({assetsOnly=false,allowLabPreview=false}={}){
    registry.validateCharacterRegistry();let files=0;
    const manifest={schemaVersion:1,assets:[]};
    for(const asset of registry.characterAssets){const lods={};for(const [lod,path] of Object.entries(asset.lods)){const {measurement}=await validateRegisteredAsset(asset,lod,{allowLabPreview});lods[lod]={file:path,...measurement};files++;}manifest.assets.push({...asset,lods});}
    const published=JSON.parse(readFileSync(publicFile('/character-assets.manifest.json'),'utf8'));
    assert.deepEqual(published,JSON.parse(JSON.stringify(manifest)),'published character manifest is stale; run assets:registry');
    const runtime=assetsOnly?null:await validateGoldenRuntime({allowLabPreview});return {assets:registry.characterAssets.length,files,runtime};
}
