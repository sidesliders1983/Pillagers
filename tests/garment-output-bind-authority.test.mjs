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
            for(const asset of characterAssets.filter(entry=>entry.type==='garment'&&entry.metadata.version==='pillagers-fit/0.1')){
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

test('native outfit free panels preserve their export and opening rims join the exact decoded body LOD',async()=>{
 const {GLTFLoader}=await import('three/addons/loaders/GLTFLoader.js'),{MeshoptDecoder}=await import('three/addons/libs/meshopt_decoder.module.js'),{MeshyHumanFactory}=load('../src/characters/MeshyHuman.ts'),{meshyHumanAssetIdentity}=load('../src/characters/MeshyHumanAssetIdentity.ts');
 globalThis.self=globalThis;globalThis.createImageBitmap=async()=>({width:2048,height:2048,close(){}});const loader=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
 const read=async url=>{const bytes=readFileSync(publicFile(url.split('?')[0]));return loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');};
 const factory=new MeshyHumanFactory(read,async url=>{const b=readFileSync(publicFile(url.split('?')[0]));return b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);}),outfit=characterAssets.find(a=>a.id==='garment/meshy-tunic-trousers'),binding=JSON.parse(readFileSync(publicFile(outfit.metadata.nativeBinding.path),'utf8')),exported=await read(outfit.lods[2]);let authored;exported.scene.traverse(n=>{if(n.isMesh)authored=n.geometry.getAttribute('position');});
 for(const lod of [0,1,2]){const dna=goldenCharacterDNA('golden_neutral_01'),human=await factory.create(dna,lod,undefined,{hair:'none',beard:'none',outfit:outfit.id,equipment:'none'});
  try{const source=human.fit.surface('source'),entry=binding.lods[lod];assert.equal(entry.bodySha256,meshyHumanAssetIdentity[lod].sha256);assert.equal(binding.rigSignature,human.fit.body.rigSignature);assert.equal(human.fit.modules.get(outfit.id).children[0].skeleton,human.fit.nativeSkeleton);
   for(let v=0;v<authored.count;v++){const anchor=entry.anchors[entry.vertexAnchors[v]],point=new Vector3();for(let k=0;k<3;k++)point.addScaledVector(new Vector3().fromArray(source.positions,source.indices[anchor.triangle*3+k]*3),anchor.barycentric[k]);point.add(new Vector3(...anchor.offset));const exportedPoint=new Vector3().fromBufferAttribute(authored,v),mesh=human.fit.modules.get(outfit.id).children[0],fittedPoint=new Vector3().fromBufferAttribute(mesh.geometry.getAttribute('position'),v).applyMatrix4(human.fit.encoding);
    if(binding.coverageRimContacts.includes(v)){assert.deepEqual(anchor.offset,[0,0,0],'Shared opening must use the actual body surface');assert.ok(point.distanceTo(exportedPoint)<.005,'LOD opening remap exceeded 5mm');assert.ok(binding.coverageClipPlanes.some(plane=>Math.abs(point.dot(new Vector3(...plane.normal))+plane.constant)<.000001),'Opening left its fixed source section');}
    else assert.ok(point.distanceTo(exportedPoint)<.000001,'Free panel or stand-off lost its exported Meshy bind position');
    assert.ok(fittedPoint.distanceTo(point)<.000001,'Runtime lost its declared body-LOD correspondence');}
   assert.ok(entry.coverageTriangles.length>0);await factory.equip(human,{hair:'none',beard:'none',outfit:'none',equipment:'none'});assert.equal(human.fit.mesh.geometry,human.fit.sourceGeometry);
  }finally{human.dispose();}
 }
});
