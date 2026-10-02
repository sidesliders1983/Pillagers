import test from 'node:test';
import assert from 'node:assert/strict';
import {Vector3} from 'three';
import {geometryAsset} from './glb-fixture.mjs';
import {load} from './load-source.mjs';
const {CharacterFactory}=load('../src/characters/CharacterFactory.ts');
const {characterOutfit,baseOutfits,characterAsset}=load('../src/characters/CharacterAssets.ts');
const {goldenCharacters}=load('../src/characters/GoldenCharacters.ts');
const factory=new CharacterFactory(url=>geometryAsset(url.split('?')[0].slice(1)));

test('reference clothing is seed assigned, age/sex independent, cached and LOD2 only',async()=>{
    const styles=new Set(Array.from({length:100},(_,seed)=>characterOutfit(seed).style));
    assert.deepEqual(styles,new Set(baseOutfits.map(outfit=>outfit.style)));
    for(const outfit of baseOutfits){const asset=characterAsset(`garment/${outfit.style}`);assert.equal(asset.runtimeLOD,2);assert.deepEqual(Object.keys(asset.lods),['2']);}
    const first=await factory.create(goldenCharacters[0].dna,2),second=await factory.create({...goldenCharacters[0].dna,age:70},2);
    assert.equal(first.root.userData.outfit,second.root.userData.outfit);
    const id=`garment/${first.root.userData.outfit}`,a=first.fit.modules.get(id).object,b=second.fit.modules.get(id).object;
    assert.notEqual(a,b);assert.notEqual(a.children[0].geometry,b.children[0].geometry);
    assert.equal(first.fit.modules.has('technical-waist-wrap'),false);
    first.dispose();second.dispose();
});

test('all three generated outfits share the rig and preserve drape regions on the Golden Characters',async()=>{
    for(const fixture of goldenCharacters)for(const outfit of baseOutfits){
        const human=await factory.create(fixture.dna,2,false);
        const id=`garment/${outfit.style}`,module=await factory.equip(human,id);
        const body=human.root.getObjectByName('UniversalHuman'),revision=human.fit.revision;
        const source=await geometryAsset(`clothing/${outfit.style}/Clothing_${outfit.style}_LOD2.glb`);
        assert.equal(human.fit.modules.has('technical-waist-wrap'),false);
        assert.ok(body.geometry.index.count<sourceBodyIndexCount,'covered body faces must be hidden');
        const originals=new Map(),sourceKeys=new Map(),regions=new Map();source.scene.updateMatrixWorld(true);
        source.scene.traverse(mesh=>{if(!mesh.isMesh)return;originals.set(mesh.name,Array.from(mesh.geometry.attributes.position.array));const keys=[];
            for(let i=0;i<mesh.geometry.attributes.position.count;i++){const key=new Vector3().fromBufferAttribute(mesh.geometry.attributes.position,i).applyMatrix4(mesh.matrixWorld).toArray().map(v=>Math.round(v*1e5)).join(',');keys.push(key);const roles=regions.get(key)??new Set();roles.add(mesh.userData.garmentRegion);regions.set(key,roles);}sourceKeys.set(mesh.name,keys);
        });
        module.traverse(mesh=>{
            if(!mesh.isSkinnedMesh)return;
            assert.equal(mesh.skeleton,body.skeleton,'clothing must not create a second armature');
            assert.ok(originals.has(mesh.name));assert.equal(mesh.geometry.attributes.position.count,originals.get(mesh.name).length/3);
            const weights=mesh.geometry.attributes.skinWeight,skin=mesh.geometry.attributes.skinIndex;
            for(let i=0;i<weights.count;i++){
                assert.ok(Math.abs([0,1,2,3].reduce((sum,k)=>sum+weights.getComponent(i,k),0)-1)<1e-5);
                const influence=(pattern)=>[0,1,2,3].reduce((sum,k)=>sum+(pattern.test(mesh.skeleton.bones[skin.getComponent(i,k)].name)?weights.getComponent(i,k):0),0);
                if(regions.get(sourceKeys.get(mesh.name)[i]).size>1)continue;
                if(mesh.userData.garmentRegion==='skirt')assert.ok(influence(/^Hips$/)>=.49,'skirt follows hips, with shared seam weights at the bodice');
                if(mesh.userData.garmentRegion==='mantle')assert.ok(influence(/^(Chest|Spine_02)$/)>=.49,'mantle follows torso, with shared sleeve seam weights');
                if(mesh.userData.garmentRegion==='footwear')assert.ok(influence(/^Foot_/)>=.49);
            }
        });
        for(const animation of ['Idle','Walk','Run']){
            human.setAnimation(animation);
            for(let frame=0;frame<12;frame++){
                human.update(1/30);human.root.updateMatrixWorld(true);body.skeleton.update();
                const sewn=new Map();module.traverse(mesh=>{if(!mesh.isSkinnedMesh)return;for(let i=0;i<mesh.geometry.attributes.position.count;i++){
                    const point=mesh.getVertexPosition(i,new Vector3()),key=sourceKeys.get(mesh.name)[i];assert.ok(point.toArray().every(Number.isFinite),`${fixture.id}/${outfit.style}/${animation}: nonfinite skinning`);
                    if(sewn.has(key))assert.ok(point.distanceTo(sewn.get(key))<1e-5,`${outfit.style}/${animation}: duplicated seam points separate`);else sewn.set(key,point);
                }});
            }
        }
        assert.equal(human.fit.revision,revision,'animation must not refit garments');
        for(const [name,positions] of originals){const mesh=source.scene.getObjectByName(name);assert.deepEqual(Array.from(mesh.geometry.attributes.position.array),positions,'cached garment must stay immutable');}
        human.unequip(id);assert.equal(body.geometry.index.count,sourceBodyIndexCount);human.dispose();
    }
});
const sourceBodyIndexCount=(await geometryAsset('universal-human/UniversalHuman_LOD2.glb')).scene.getObjectByName('UniversalHuman').geometry.index.count;
