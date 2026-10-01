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
        for(const masculinity of [0,1]){
            const dna={...defaultDNA(),seed:4010941107,morphology:{masculinity,height:1.44},traits:{...defaultDNA().traits,physicality:1,intelligence:.2}};
            const human=new UniversalHuman(source,universalHumanProfile(dna),'#eeccbb');
            const meshes=[];human.root.traverse(o=>{if(o.isSkinnedMesh)meshes.push(o);});
            human.update(0);human.root.updateMatrixWorld(true);
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
                            assert.ok(posed[a].distanceTo(posed[b])<=base*3.5+.005,`LOD${lod} ${clip} frame ${frame}: surface edge ${a}/${b} stretches from ${base} to ${posed[a].distanceTo(posed[b])}`);
                        }
                    });
                }
            }
            human.dispose();
        }
    }
});


