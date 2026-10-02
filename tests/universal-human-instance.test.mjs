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
    geometry.morphAttributes.position=['BellyJiggle','BreastJiggle'].map(name=>{const a=new THREE.Float32BufferAttribute(Array(9).fill(0),3);a.name=name;return a;});
    const mesh=new THREE.SkinnedMesh(geometry,new THREE.MeshStandardMaterial());scene.add(mesh);scene.updateMatrixWorld(true);
    geometry.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(Array(12).fill(0),4));
    geometry.setAttribute('skinWeight',new THREE.Float32BufferAttribute([1,0,0,0,1,0,0,0,1,0,0,0],4));
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
    for(let i=0;i<30;i++)a.update(1/60);
    assert.notEqual(own.morphTargetInfluences[0],0);
    assert.equal(own.morphTargetInfluences[1],0);
    assert.deepEqual(mesh.morphTargetInfluences,[0,0]);
    let pinned;b.root.traverse(object=>{if(object.isSkinnedMesh)pinned=object;});
    assert.deepEqual(pinned.morphTargetInfluences,[0,0]);
    // Reapply while attached to a moved world slot: bind inverses must be
    // identical to an equivalent model prepared at the origin.
    const world=new THREE.Group();world.position.set(8,2,-6);world.rotation.y=1.2;world.add(a.root);
    a.root.position.set(1,0,2);a.root.rotation.y=.3;
    const updated=universalHumanProfile({...dna,age:33,morphology:{masculinity:.51,height:1.6}});
    const origin=new UniversalHuman(asset,updated,'#eeccbb');let originMesh;origin.root.traverse(o=>{if(o.isSkinnedMesh)originMesh=o;});
    a.apply(updated,'#eeccbb',false);
    assert.equal(a.root.parent,world);assert.deepEqual(a.root.position.toArray(),[1,0,2]);
    assert.ok(Math.abs(a.root.rotation.y-.3)<1e-9);
    assert.deepEqual(own.skeleton.boneInverses.map(m=>m.toArray()),originMesh.skeleton.boneInverses.map(m=>m.toArray()));
    a.update(0);origin.update(0);
    const local=own.getVertexPosition(1,new THREE.Vector3()),expected=originMesh.getVertexPosition(1,new THREE.Vector3());
    assert.ok(local.distanceTo(expected)<1e-8);origin.dispose();
    own.skeleton.computeBoneTexture();let disposed=0;own.skeleton.boneTexture.addEventListener('dispose',()=>disposed++);
    a.dispose();b.dispose();assert.equal(disposed,1);
});


