import test from 'node:test';
import assert from 'node:assert/strict';
import {Group,Mesh,BufferGeometry,Float32BufferAttribute,MeshStandardMaterial,Vector3} from 'three';
import {ConvexHull} from 'three/addons/math/ConvexHull.js';
import {geometryAsset} from './glb-fixture.mjs';
import {load} from './load-source.mjs';
const {UniversalHuman}=load('../src/characters/UniversalHuman.ts');
const {universalHumanProfile}=load('../src/characters/UniversalHumanProfile.ts');
const {goldenCharacters,goldenCharacterDNA}=load('../src/characters/GoldenCharacters.ts');
const {registeredAppearanceMetadata}=load('../src/characters/CharacterAssets.ts');
const {appearanceModules,disposeModules}=load('../src/character-lab/AppearanceModules.ts');
const frame=human=>{const cage=human.fit.cages.get('HEAD_CAGE'),centre=cage.bounds.getCenter(new Vector3()),size=cage.bounds.getSize(new Vector3());return {centre,size,skull:cage.points.map(point=>point.clone().sub(centre))};};

test('beard contact band includes the actual chin and under-chin on every Golden body LOD',async()=>{
    for(const lod of [0,1,2]){
        const body=await geometryAsset(`universal-human/UniversalHuman_LOD${lod}.glb`);
        for(const fixture of goldenCharacters){
            const human=new UniversalHuman(body,universalHumanProfile(fixture.dna),'#ffffff'),{centre,size}=frame(human);
            for(const style of ['short','medium','long','split-braid','braid']){
                const metadata=registeredAppearanceMetadata('beard',style),minimum=metadata.attachmentBand.minimumY*size.y;
                assert.equal(metadata.projection,'outward');
                for(const name of ['CHIN','UNDER_CHIN','JAW_L','JAW_R'])assert.ok(human.fit.landmarks.get(name).y-centre.y>minimum,`${fixture.id}/LOD${lod}/${style}: ${name} excluded from skull contact`);
            }
            human.dispose();
        }
    }
});

test('beard fitting clears lower-chin contact while preserving free hanging geometry',async()=>{
    const body=await geometryAsset('universal-human/UniversalHuman_LOD2.glb'),human=new UniversalHuman(body,universalHumanProfile(goldenCharacterDNA('golden_neutral_01')),'#ffffff');
    const {centre,size,skull}=frame(human),hull=new ConvexHull().setFromPoints(skull),chin=human.fit.landmarks.get('CHIN').clone().sub(centre).multiplyScalar(.8);
    assert.ok(hull.containsPoint(chin));assert.ok(chin.y<-.075,'regression point must lie below the old contact band');
    const source=new Group(),add=(name,points)=>{const geometry=new BufferGeometry();geometry.setAttribute('position',new Float32BufferAttribute(points.flatMap(point=>point.toArray()),3));geometry.computeVertexNormals();const mesh=new Mesh(geometry,new MeshStandardMaterial());mesh.name=name;source.add(mesh);};
    add('contact',[chin.clone().add(new Vector3(-.004,.003,0)),chin.clone().add(new Vector3(.004,.003,0)),chin.clone().add(new Vector3(0,-.003,.002))]);
    const free=[new Vector3(-.04,-.24,.12),new Vector3(.04,-.24,.12),new Vector3(0,-.36,.16)];add('free',free);
    const metadata={...registeredAppearanceMetadata('beard','long'),authoringFrame:'canonical'},profile={hairStyle:'short',beardStyle:'long',color:'#986e55',greyAmount:0};
    const fitted=appearanceModules(profile,size,2,undefined,null,skull,source,metadata,human.fit.cages),contact=fitted.getObjectByName('contact').geometry.attributes.position;
    const sample=new Vector3();for(let i=0;i<3;i++)sample.add(new Vector3().fromBufferAttribute(contact,i));sample.multiplyScalar(1/3);
    assert.equal(hull.containsPoint(sample),false,'the lower beard triangle must stay outside the skull');
    const actual=fitted.getObjectByName('free').geometry.attributes.position;
    const scale=size.clone().divide(new Vector3(.1992,.2397,.2189));
    free.forEach((point,index)=>assert.ok(new Vector3().fromBufferAttribute(actual,index).distanceTo(point.clone().multiply(scale))<1e-6,'free beard length must retain its authored silhouette'));
    disposeModules(fitted);source.traverse(mesh=>{if(mesh.isMesh){mesh.geometry.dispose();mesh.material.dispose();}});human.dispose();
});

test('automatic and explicitly equipped head modules share fitted geometry across Golden morphologies and LODs',async()=>{
    for(const lod of [0,1,2]){
        const body=await geometryAsset(`universal-human/UniversalHuman_LOD${lod}.glb`);
        for(const fixture of goldenCharacters)for(const [kind,style] of [['hair','short'],['beard','stubble'],['beard','long']]){
            const profile=universalHumanProfile(fixture.dna);if(kind==='beard'&&(profile.age<18||profile.masculinity<.5))continue;
            profile.appearance[kind==='hair'?'hairStyle':'beardStyle']=style;
            const path=kind==='hair'?`appearance/${style}/Hair_${style}_LOD2.glb`:`appearance/beards/${style}/Beard_${style}_LOD2.glb`,source=await geometryAsset(path);
            const automatic=new UniversalHuman(body,profile,'#ffffff',kind==='hair'?source.scene:null,kind==='beard'?source.scene:null),explicit=new UniversalHuman(body,profile,'#ffffff');
            explicit.equip(registeredAppearanceMetadata(kind,style),source.scene);automatic.update(0);explicit.update(0);automatic.root.updateMatrixWorld(true);explicit.root.updateMatrixWorld(true);
            const a=automatic.fit.modules.get(`${kind}/${style}`).object,b=explicit.fit.modules.get(`${kind}/${style}`).object;
            a.traverse(mesh=>{if(!mesh.isMesh)return;const other=b.getObjectByName(mesh.name);assert.ok(other);assert.deepEqual(Array.from(other.geometry.attributes.position.array),Array.from(mesh.geometry.attributes.position.array),`${fixture.id}/LOD${lod}/${kind}/${style}: auto and explicit fit differ`);
                for(let index=0;index<mesh.geometry.attributes.position.count;index+=13){const first=automatic.root.worldToLocal(mesh.localToWorld(new Vector3().fromBufferAttribute(mesh.geometry.attributes.position,index))),second=explicit.root.worldToLocal(other.localToWorld(new Vector3().fromBufferAttribute(other.geometry.attributes.position,index)));assert.ok(first.distanceTo(second)<1e-6,'auto and explicit attachment frame differs');}
            });automatic.dispose();explicit.dispose();
        }
    }
});
