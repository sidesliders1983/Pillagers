import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {load} from './load-source.mjs';
const require=createRequire(import.meta.url),THREE=require('three');
const {UniversalHuman}=load('../src/character-lab/UniversalHuman.ts');
const {defaultDNA}=load('../src/characters/CharacterDNA.ts');
const {universalHumanProfile}=load('../src/characters/UniversalHumanProfile.ts');
test('morph bind matrices remain independent of source and pinned instances; owned bone textures are released',()=>{
    const scene=new THREE.Group(),root=new THREE.Bone(),head=new THREE.Bone();
    root.name='Root';head.name='Head';head.position.y=1.5;root.add(head);scene.add(root);
    head.userData.morphTranslations=JSON.stringify({Tall:[0,.3,0]});
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0,1,0,0,0,1,0],3));
    const mesh=new THREE.SkinnedMesh(geometry,new THREE.MeshStandardMaterial());scene.add(mesh);scene.updateMatrixWorld(true);
    mesh.bind(new THREE.Skeleton([root,head]));
    const source=mesh.skeleton.boneInverses.map(matrix=>matrix.toArray());
    const asset={scene,animations:['Idle','Walk','Run'].map(name=>new THREE.AnimationClip(name,1,[]))};
    const dna=defaultDNA(),a=new UniversalHuman(asset,universalHumanProfile({...dna,morphology:{masculinity:.51,height:1.6}}),'#eeccbb');
    let own;a.root.traverse(object=>{if(object.isSkinnedMesh)own=object;});
    const aInverses=own.skeleton.boneInverses.map(matrix=>matrix.toArray());
    const b=new UniversalHuman(asset,universalHumanProfile({...dna,morphology:{masculinity:0,height:1.16}}),'#eeccbb');
    assert.deepEqual(mesh.skeleton.boneInverses.map(matrix=>matrix.toArray()),source);
    assert.deepEqual(own.skeleton.boneInverses.map(matrix=>matrix.toArray()),aInverses);
    assert.notDeepEqual(aInverses,source);
    assert.equal(own.geometry,geometry);assert.notEqual(own.material,mesh.material);
    own.skeleton.computeBoneTexture();let disposed=0;own.skeleton.boneTexture.addEventListener('dispose',()=>disposed++);
    a.dispose();b.dispose();assert.equal(disposed,1);
});


