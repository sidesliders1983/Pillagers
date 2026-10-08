import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {Vector3} from 'three';
import {load} from './load-source.mjs';
import {readGLB,geometryGLTF} from '../scripts/characters/glb-inspection.mjs';
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
                const attachment=human.fit.modules.get(`hair/${style}`),sourceGroup=attachment?.object,hairMeshes=[];
                assert.ok(sourceGroup,'The registered reference hair must be equipped on its canonical socket');
                assert.equal(sourceGroup.name,'GeneratedHair');assert.equal(attachment.metadata.anchor,'socket_head_top');
                sourceGroup.traverse(object=>{if(object.isMesh)hairMeshes.push(object);});
                assert.ok(hairMeshes.length>0);
                const expectedName=`Hair_${style}_LOD${lod}`;
                // GLTFLoader removes the dot in an authored Blender .NNN suffix.
                // Static validation checks the original node token; this rig test
                // also accepts that loader-normalized duplicate suffix.
                for(const object of hairMeshes)assert.ok(new RegExp(`^${expectedName}(?:[_.]?\\d{3})?$`).test(object.name),`The authored module must retain the correct LOD token: ${object.name}`);
                const mesh=hairMeshes[0];assert.equal(mesh.isSkinnedMesh,undefined);
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


test('all LOD2 reference beards follow the existing head through adult and elder animation cycles',async()=>{
    const body=await asset(2);
    for(const style of ['stubble','short','medium','long','split-braid','braid']){
        // Rig/geometry semantics retain exact accessors; embedded MASK imagery
        // is decoded and reviewed in the independent browser gate.
        const beard=await geometryGLTF(readGLB(`/appearance/beards/${style}/Beard_${style}_LOD2.glb`));
        for(const age of [18,70]){
            const profile=universalHumanProfile({...defaultDNA(),age,appearanceFit:{hair:1,beard:1.5,clothing:1}});
            profile.appearance.beardStyle=style;
            const human=new UniversalHuman(body,profile,'#eeccbb',null,beard.scene);
            const appearance=human.root.getObjectByName('Appearance'),head=appearance.parent;
            assert.equal(head.name,'Head');assert.equal(appearance.userData.beardAsset,'reference-generated');
            const mesh=human.root.getObjectByName(`Beard_${style}_LOD2`);assert.ok(mesh);
            human.update(0);human.root.updateMatrixWorld(true);
            const sample=()=>head.worldToLocal(mesh.localToWorld(new Vector3().fromBufferAttribute(mesh.geometry.attributes.position,0)));
            const local=sample();
            for(const clip of ['Idle','Walk','Run']){
                human.setAnimation(clip);
                for(let frame=0;frame<20;frame++){
                    human.update(.1);human.root.updateMatrixWorld(true);
                    assert.ok(sample().distanceTo(local)<1e-6,`${style} age${age} ${clip} must stay fixed to Head`);
                }
            }
            human.dispose();
        }
    }
});

test('LOD2 reference surfaces fit the actual skull, including triangle interiors',async()=>{
    const {ConvexHull}=await import('three/addons/math/ConvexHull.js');
    const {appearanceModules,disposeModules}=load('../src/character-lab/AppearanceModules.ts');
    const body=await asset(2),human=new UniversalHuman(body,universalHumanProfile(defaultDNA()),'#eeccbb'),cage=human.fit.cages.get('HEAD_CAGE');
    const centre=cage.bounds.getCenter(new Vector3()),size=cage.bounds.getSize(new Vector3()),skull=cage.points.map(point=>point.clone().sub(centre));
    const hull=new ConvexHull().setFromPoints(skull);
    const gap=p=>{const direction=p.clone().normalize();let radius=Infinity;
        for(const face of hull.faces){const d=face.normal.dot(direction);if(d>1e-6)radius=Math.min(radius,face.constant/d);}
        return p.length()-radius;
    };
    for(const style of ['short','medium','long','tied','bun','braid']){
        const bytes=readFileSync(new URL(`../public/appearance/${style}/Hair_${style}_LOD2.glb`,import.meta.url));
        const hair=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
        const profile={hairStyle:style,beardStyle:'none',color:'#986e55',greyAmount:0};
        const group=appearanceModules(profile,size,2,undefined,hair.scene,skull,null,undefined,human.fit.cages);
        group.traverse(mesh=>{if(!mesh.isMesh)return;const position=mesh.geometry.attributes.position,index=mesh.geometry.index,count=index?.count??position.count;
            const original=hair.scene.getObjectByName(mesh.name).geometry.attributes.position,copies=new Map();
            for(let i=0;i<original.count;i++){
                const key=[original.getX(i),original.getY(i),original.getZ(i)].join(',');
                const previous=copies.get(key);
                if(previous!==undefined)assert.ok(new Vector3().fromBufferAttribute(position,i).distanceTo(new Vector3().fromBufferAttribute(position,previous))<1e-6,`${style}: fit must not tear flat-normal or UV seam copies apart`);
                else copies.set(key,i);
            }
            for(let t=0;t<count;t+=3){const vertices=[0,1,2].map(k=>new Vector3().fromBufferAttribute(position,index?index.getX(t+k):t+k));
                const samples=[];for(let a=0;a<=7;a++)for(let b=0;b<=7-a;b++)samples.push([a/7,b/7,(7-a-b)/7]);
                for(const weights of samples){
                    const p=new Vector3();vertices.forEach((v,k)=>p.addScaledVector(v,weights[k]));
                    if(p.y>=-size.y*.45)assert.ok(gap(p)>.002,`${style} triangle ${t/3} cuts through the head: ${gap(p)}`);
                }
            }
        });disposeModules(group);
    }
    const beard=await geometryGLTF(readGLB('/appearance/beards/stubble/Beard_stubble_LOD2.glb'));
    const group=appearanceModules({hairStyle:'short',beardStyle:'stubble',color:'#986e55',greyAmount:0},size,2,undefined,null,skull,beard.scene,undefined,human.fit.cages);
    group.traverse(mesh=>{if(!mesh.isMesh)return;const p=mesh.geometry.attributes.position,index=mesh.geometry.index,count=index?.count??p.count;
        const source=beard.scene.getObjectByName(mesh.name).geometry,original=source.attributes.position;
        assert.equal(count,source.index?.count??original.count,'fixed-head contact must retain the authored stubble triangle budget');
        // Thin facial contact may bridge a coarse skull facet, but an 8mm
        // stand-off is already more than twice the authored 3mm clearance.
        // This rejects the measured 15.6mm chin balloon in rejected candidates.
        const copies=new Map(),maximumGap=.008;
        for(let i=0;i<p.count;i++){
            const clearance=gap(new Vector3().fromBufferAttribute(p,i));
            assert.ok(clearance>=.003-1e-6,'stubble corners must clear the actual skull by at least 3mm');
            assert.ok(clearance<=maximumGap,'bounded contact correction must not turn stubble into a floating face shell');
            const key=[original.getX(i),original.getY(i),original.getZ(i)].join(','),previous=copies.get(key);
            if(previous!==undefined)assert.ok(new Vector3().fromBufferAttribute(p,i).distanceTo(new Vector3().fromBufferAttribute(p,previous))<1e-6,'stubble fit must preserve flat-normal/UV seam copies');
            else copies.set(key,i);
        }
        for(let i=0;i<count;i+=3){
            const vertices=[0,1,2].map(k=>new Vector3().fromBufferAttribute(p,index?index.getX(i+k):i+k));
            for(let a=0;a<=7;a++)for(let b=0;b<=7-a;b++){
                const sample=new Vector3().addScaledVector(vertices[0],a/7).addScaledVector(vertices[1],b/7).addScaledVector(vertices[2],(7-a-b)/7);
                assert.ok(gap(sample)>.002,'stubble triangle interiors must clear the actual skull, as well as their corners');
            }
        }
    });disposeModules(group);human.dispose();
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
