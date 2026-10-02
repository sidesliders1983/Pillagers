import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {Vector3} from 'three';
import {load} from './load-source.mjs';
const {UniversalHuman}=load('../src/character-lab/UniversalHuman.ts');
const {defaultDNA}=load('../src/characters/CharacterDNA.ts');
const {universalHumanProfile}=load('../src/characters/UniversalHumanProfile.ts');
async function asset(lod){
    const bytes=readFileSync(new URL(`../public/universal-human/UniversalHuman_LOD${lod}.glb`,import.meta.url));
    const length=bytes.readUInt32LE(12),json=JSON.parse(bytes.subarray(20,20+length));
    // Geometry/rig tests need no image decoder or network requests.
    delete json.images;delete json.textures;delete json.materials;delete json.samplers;
    delete json.extensionsUsed;delete json.extensionsRequired;
    for(const mesh of json.meshes)for(const primitive of mesh.primitives)delete primitive.material;
    const text=Buffer.from(JSON.stringify(json)),padding=Buffer.alloc((4-text.length%4)%4,32);
    const binary=bytes.subarray(20+length),header=Buffer.alloc(20);
    header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);header.writeUInt32LE(20+text.length+padding.length+binary.length,8);
    header.writeUInt32LE(text.length+padding.length,12);header.writeUInt32LE(0x4e4f534a,16);
    const data=Buffer.concat([header,text,padding,binary]);
    return new Promise((resolve,reject)=>new GLTFLoader().parse(data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength),'',resolve,reject));
}
test('actual skinned vertices remain connected through walk/run around arms and waist',async()=>{
    for(let lod=0;lod<3;lod++){
        const source=await asset(lod);
        for(const masculinity of [0,1])for(const age of [6,14,35,90]){
            const dna={...defaultDNA(),age,seed:4010941107,morphology:{masculinity,height:1.44},traits:{...defaultDNA().traits,physicality:1,agility:1,intelligence:.2}};
            const human=new UniversalHuman(source,universalHumanProfile(dna),'#eeccbb');
            const meshes=[];human.root.traverse(o=>{if(o.isSkinnedMesh)meshes.push(o);});
            const appearance=human.root.getObjectByName('Appearance');
            assert.equal(appearance.parent.name,'Head','appearance must follow the shared animated head');
            const expected=universalHumanProfile(dna).appearance;
            let moduleTriangles=0;
            appearance.traverse(o=>{if(o.isMesh){moduleTriangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;
                if(!o.name.endsWith('Tie'))assert.equal('#'+o.material.color.getHexString(),expected.color);
            }});
            assert.ok(moduleTriangles<1000,'appearance modules must retain the low-poly budget');
            if(masculinity===0||age<18)assert.equal(appearance.children.some(o=>o.name.startsWith('Beard')),false);
            const garment=human.root.getObjectByName('ClothingWaistWrap');
            assert.ok(garment);assert.equal(garment.skeleton,meshes.find(o=>o!==garment).skeleton,'garment shares the body skeleton');
            human.update(0);human.root.updateMatrixWorld(true);
            assert.equal(appearance.getObjectByName('HairCap'),undefined,'no procedural hair fallback');
            assert.equal(appearance.children.length,0,'unloaded reference modules remain absent');
            const rest=meshes.map(mesh=>Array.from({length:mesh.geometry.attributes.position.count},(_,i)=>mesh.getVertexPosition(i,new Vector3())));
            for(const clip of ['Walk','Run']){
                human.setAnimation(clip);
                for(let frame=0;frame<12;frame++){
                    human.update(source.animations.find(a=>a.name===clip).duration/12);human.root.updateMatrixWorld(true);
                    meshes.forEach((mesh,m)=>{
                        const posed=Array.from({length:rest[m].length},(_,i)=>mesh.getVertexPosition(i,new Vector3()));
                        const indices=mesh.geometry.index.array;
                        for(let k=0;k<indices.length;k++){
                            const a=indices[k],b=indices[Math.floor(k/3)*3+(k+1)%3];
                            const position=mesh.geometry.attributes.position;
                            const original=Math.hypot(position.getX(a)-position.getX(b),position.getY(a)-position.getY(b),position.getZ(a)-position.getZ(b));
                            const base=Math.max(original,rest[m][a].distanceTo(rest[m][b]));
                            assert.ok(posed[a].distanceTo(posed[b])<=base*3.5+.005,`age ${age} M${masculinity} points ${JSON.stringify([a,b].map(i=>[position.getX(i),position.getY(i),position.getZ(i)]))} LOD${lod} ${clip} frame ${frame}: surface edge ${a}/${b} stretches from ${base} to ${posed[a].distanceTo(posed[b])}`);
                        }
                    });
                }
            }
            human.dispose();
        }
    }
});




test('reference hair follows the existing head through child adult elder animations and all LODs',async()=>{
    for(let lod=0;lod<3;lod++){
        const body=await asset(lod);
        for(const style of ['short','medium','long','tied','bun','braid']){
            const bytes=readFileSync(new URL(`../public/appearance/${style}/Hair_${style}_LOD${lod}.glb`,import.meta.url));
            const hair=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
            for(const age of [6,35,90])for(const ratio of [1,1.3]){
                const profile=universalHumanProfile({...defaultDNA(),age,appearanceFit:{hair:ratio,beard:1,clothing:1}});
                profile.appearance.hairStyle=style;
                const human=new UniversalHuman(body,profile,'#eeccbb',hair.scene);
                const appearance=human.root.getObjectByName('Appearance'),head=appearance.parent;
                assert.equal(head.name,'Head');assert.equal(appearance.userData.hairAsset,'reference-generated');
                assert.equal(human.root.getObjectByName('HairCap'),undefined);
                assert.equal(appearance.children.some(o=>o.name.startsWith('Beard')),false);
                const mesh=appearance.getObjectByName(`Hair_${style}_LOD${lod}`);
                assert.ok(mesh);assert.equal(mesh.isSkinnedMesh,undefined);
                human.update(0);human.root.updateMatrixWorld(true);
                const sample=()=>head.worldToLocal(mesh.localToWorld(new Vector3().fromBufferAttribute(mesh.geometry.attributes.position,0)));
                const local=sample();
                for(const clip of ['Idle','Walk','Run']){
                    human.setAnimation(clip);
                    for(let frame=0;frame<4;frame++){
                        human.update(.1);human.root.updateMatrixWorld(true);
                        assert.ok(sample().distanceTo(local)<1e-6,`${style} age${age} LOD${lod} ${clip} must follow the existing head rigidly`);
                    }
                }
                human.dispose();
            }
        }
    }
});


test('annual aging on actual world LODs preserves local vertices and reuses garment geometry',async()=>{
    const {Group}=await import('three');
    for(const lod of [1,2]){
        const source=await asset(lod),dna={...defaultDNA(),age:58};
        const human=new UniversalHuman(source,universalHumanProfile(dna),'#eeccbb');
        const parent=new Group();parent.position.set(12,2,-5);parent.rotation.y=1.7;parent.add(human.root);
        const garment=human.root.getObjectByName('ClothingWaistWrap'),geometry=garment.geometry;
        for(const age of [59,5,6]){
            const profile=universalHumanProfile({...dna,age});
            human.apply(profile,'#eeccbb',false);human.update(0);
            const reference=new UniversalHuman(source,profile,'#eeccbb');reference.update(0);
            const meshes=[];human.root.traverse(o=>{if(o.isSkinnedMesh&&o.name!=='ClothingWaistWrap')meshes.push(o);});
            for(const mesh of meshes){const other=reference.root.getObjectByName(mesh.name);
                for(let i=0;i<mesh.geometry.attributes.position.count;i+=7){
                    const a=mesh.getVertexPosition(i,new Vector3()),b=other.getVertexPosition(i,new Vector3());
                    assert.ok(a.distanceTo(b)<1e-5,`LOD${lod} age${age} vertex${i} differs from origin rig`);
                }
            }
            assert.equal(human.root.parent,parent);assert.equal(garment.geometry,geometry);reference.dispose();
        }
        human.dispose();
    }
});
