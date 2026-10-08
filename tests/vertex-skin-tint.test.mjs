import test from 'node:test';
import assert from 'node:assert/strict';
import {Color,Float32BufferAttribute,InterleavedBuffer,InterleavedBufferAttribute,MeshStandardMaterial,Texture,Uint8BufferAttribute} from 'three';
import {clone} from 'three/addons/utils/SkeletonUtils.js';
import {geometryAsset} from './glb-fixture.mjs';
import {load} from './load-source.mjs';
const {tintSkinPixels,tintSkinVertexColors}=load('../src/character-lab/SkinTint.ts');
const {UniversalHuman}=load('../src/characters/UniversalHuman.ts');
const {bodyZone}=load('../src/characters/CharacterFitSystem.ts');
const {universalHumanProfile}=load('../src/characters/UniversalHumanProfile.ts');
const {defaultDNA}=load('../src/characters/CharacterDNA.ts');
const profile=universalHumanProfile(defaultDNA()),toneA='#e3c4a6',toneB='#bd9574';
const linear=hex=>new Color(hex).toArray();
const red=linear('#cd462d'),green=linear('#43844a'),dark=linear('#171310');
function tuple(attribute,index){return Array.from({length:attribute.itemSize},(_,channel)=>attribute.getComponent(index,channel));}
function meshOf(human){return human.root.getObjectByName('UniversalHuman');}
function geometryShape(geometry){return {attributes:Object.fromEntries(Object.entries(geometry.attributes).filter(([name])=>name!=='color').map(([name,attribute])=>[name,{itemSize:attribute.itemSize,normalized:attribute.normalized,values:Array.from(attribute.array)}])),morphs:Object.fromEntries(Object.entries(geometry.morphAttributes).map(([name,attributes])=>[name,attributes.map(attribute=>({name:attribute.name,itemSize:attribute.itemSize,values:Array.from(attribute.array)}))])),morphTargetsRelative:geometry.morphTargetsRelative,index:geometry.index?Array.from(geometry.index.array):null,groups:structuredClone(geometry.groups)};}
async function fixture(mode='palette'){
    // Actual canonical rig/morph topology with an in-memory test palette only.
    // This fixture is not a generated source, reviewed style proof or published asset.
    const donor=await geometryAsset('universal-human/UniversalHuman_LOD2.glb'),scene=clone(donor.scene);
    scene.traverse(mesh=>{if(!mesh.isSkinnedMesh)return;
        mesh.geometry=mesh.geometry.clone();const count=mesh.geometry.attributes.position.count,values=[];
        for(let vertex=0;vertex<count;vertex++){
            const underlayer=['TORSO_UPPER','TORSO_LOWER','PELVIS'].includes(bodyZone(mesh,vertex));
            values.push(...(underlayer?[1,1,1]:red),.35+(vertex%3)*.2);
        }
        // Non-skin palette entries exercise preservation independent of a white underlayer.
        values.splice(0,4,...green,.25);values.splice(4,4,...dark,.75);
        mesh.geometry.setAttribute('color',new Float32BufferAttribute(values,4));
        const material=new MeshStandardMaterial({vertexColors:true,color:'#ffffff'});
        if(mode==='mapped')material.map=new Texture();
        if(mode==='mixed'){
            const textured=material.clone();textured.map=new Texture();mesh.material=[material,textured];
        }else mesh.material=material;
    });
    return {...donor,scene};
}
function create(asset,tone=toneA){return new UniversalHuman(asset,profile,tone,null,null,[],{technicalWaistWrap:false});}

test('linear RGB(A) tint matches the selective 40% pixel blend and retains white, other colours and alpha',()=>{
    const source=new Float32BufferAttribute([...red,.3,1,1,1,.4,...green,.5,...dark,.6],4),original=Array.from(source.array);
    const result=tintSkinVertexColors(source,toneA),pixels=new Uint8ClampedArray([205,70,45,255]);tintSkinPixels(pixels,toneA);
    const srgb=new Color().setRGB(...tuple(result,0).slice(0,3)).convertLinearToSRGB().toArray().map(channel=>channel*255);
    for(let channel=0;channel<3;channel++)assert.ok(Math.abs(srgb[channel]-pixels[channel])<=.51,'same blend with continuous vertex precision');
    assert.deepEqual(Array.from(source.array),original);assert.notEqual(result.array,source.array);
    for(const vertex of [1,2,3])assert.deepEqual(tuple(result,vertex),tuple(source,vertex));
    for(let vertex=0;vertex<source.count;vertex++)assert.equal(result.getW(vertex),source.getW(vertex));
    const rgb=new Float32BufferAttribute(red,3);assert.equal(tintSkinVertexColors(rgb,toneB).itemSize,3);
});

test('palette conversion supports normalized and interleaved attributes and rejects malformed values',()=>{
    const source=new Uint8BufferAttribute([153,17,7,128,255,255,255,64],4,true),result=tintSkinVertexColors(source,toneA);
    assert.equal(result.getW(0),Math.fround(source.getW(0)));assert.deepEqual(tuple(result,1),tuple(source,1).map(Math.fround));
    const interleaved=new InterleavedBufferAttribute(new InterleavedBuffer(new Float32Array([99,...red,.7,99,1,1,1,.8]),5),4,1);
    const before=Array.from(interleaved.data.array),tinted=tintSkinVertexColors(interleaved,toneA);
    assert.deepEqual(tuple(tinted,1),tuple(interleaved,1));assert.deepEqual(Array.from(interleaved.data.array),before);
    assert.throws(()=>tintSkinVertexColors(new Float32BufferAttribute([1,0],2),toneA),/RGB or RGBA/);
    for(const value of [NaN,Infinity,-.01,1.01])assert.throws(()=>tintSkinVertexColors(new Float32BufferAttribute([value,.2,.1],3),toneA),/finite normalized/);
});

test('real UniversalHuman palettes are owned, source/pinned independent and A→B→A recolouring is exact',async()=>{
    const asset=await fixture(),source=asset.scene.getObjectByName('UniversalHuman'),original=Array.from(source.geometry.attributes.color.array),shape=geometryShape(source.geometry);
    const a=create(asset),b=create(asset,toneB),own=meshOf(a),pinned=meshOf(b),owned=own.geometry;
    try{
        assert.notEqual(owned,source.geometry);assert.notEqual(owned,pinned.geometry);
        assert.notEqual(own.geometry.attributes.color,pinned.geometry.attributes.color);
        const first=Array.from(own.geometry.attributes.color.array),pinColours=Array.from(pinned.geometry.attributes.color.array);
        assert.notDeepEqual(first,original,'heritage tint must change actual skin vertices');
        assert.deepEqual(geometryShape(owned),shape,'colour ownership never changes rig or morph topology');
        for(let vertex=0;vertex<source.geometry.attributes.color.count;vertex++){
            const src=tuple(source.geometry.attributes.color,vertex),current=tuple(own.geometry.attributes.color,vertex);
            assert.equal(current[3],src[3]);
            if(src.slice(0,3).every(value=>value===1)||vertex<2)assert.deepEqual(current,src,'underlayer/non-skin colours stay exact');
        }
        a.apply(profile,toneB,false);assert.notDeepEqual(Array.from(own.geometry.attributes.color.array),first);
        a.apply(profile,toneA,false);assert.deepEqual(Array.from(own.geometry.attributes.color.array),first);
        assert.equal(own.geometry,owned);assert.deepEqual(geometryShape(owned),shape);
        assert.deepEqual(Array.from(source.geometry.attributes.color.array),original);assert.deepEqual(Array.from(pinned.geometry.attributes.color.array),pinColours);
        for(const motion of ['Idle','Walk','Run']){a.sampleAnimation(motion,.35);a.update(.02);assert.deepEqual(Array.from(own.geometry.attributes.color.array),first);}
    }finally{a.dispose();b.dispose();}
});

test('canonical coverage clones retain the latest palette and removing coverage restores tinted base geometry',async()=>{
    const asset=await fixture(),source=asset.scene.getObjectByName('UniversalHuman'),a=create(asset),own=meshOf(a),base=own.geometry,sourceShape=geometryShape(source.geometry);
    try{
        a.fit.maskBody(['TORSO_UPPER']);const masked=own.geometry;
        assert.notEqual(masked,base);assert.ok(masked.index.count<base.index.count,'fixture must exercise actual covered triangles');
        const coveredIndex=Array.from(masked.index.array);
        a.apply(profile,toneB,false);
        assert.equal(own.geometry,masked);assert.deepEqual(Array.from(masked.index.array),coveredIndex);
        assert.deepEqual(Array.from(masked.attributes.color.array),Array.from(base.attributes.color.array));
        assert.deepEqual(Array.from(base.attributes.color.array),Array.from(tintSkinVertexColors(source.geometry.attributes.color,toneB).array));
        a.fit.maskBody();assert.equal(own.geometry,base);
        assert.deepEqual(geometryShape(base),sourceShape);assert.deepEqual(geometryShape(source.geometry),sourceShape);
        assert.deepEqual(Array.from(base.attributes.color.array),Array.from(tintSkinVertexColors(source.geometry.attributes.color,toneB).array));
    }finally{a.dispose();}
});

test('palette base and coverage geometry dispose once while cached source and pinned instances stay intact',async()=>{
    const asset=await fixture(),source=asset.scene.getObjectByName('UniversalHuman'),a=create(asset),b=create(asset),base=meshOf(a).geometry,pinned=meshOf(b);
    let baseDisposals=0,sourceDisposals=0,maskDisposals=0,pinDisposals=0;
    base.addEventListener('dispose',()=>baseDisposals++);source.geometry.addEventListener('dispose',()=>sourceDisposals++);pinned.geometry.addEventListener('dispose',()=>pinDisposals++);
    a.fit.maskBody(['TORSO_UPPER']);meshOf(a).geometry.addEventListener('dispose',()=>maskDisposals++);
    const pinColours=Array.from(pinned.geometry.attributes.color.array);a.dispose();
    assert.equal(baseDisposals,1);assert.equal(maskDisposals,1);assert.equal(sourceDisposals,0);assert.equal(pinDisposals,0);
    assert.deepEqual(Array.from(pinned.geometry.attributes.color.array),pinColours);b.sampleAnimation('Walk',.4);b.dispose();assert.equal(pinDisposals,1);assert.equal(sourceDisposals,0);
});

test('mapped and mixed-material bodies retain the legacy texture path without vertex double tint or geometry ownership',async()=>{
    for(const mode of ['mapped','mixed']){
        const asset=await fixture(mode),source=asset.scene.getObjectByName('UniversalHuman'),original=Array.from(source.geometry.attributes.color.array),a=create(asset),own=meshOf(a);
        try{
            assert.equal(own.geometry,source.geometry);assert.deepEqual(Array.from(own.geometry.attributes.color.array),original);
            a.apply(profile,toneB,false);assert.equal(own.geometry,source.geometry);assert.deepEqual(Array.from(own.geometry.attributes.color.array),original);
            const sourceMats=Array.isArray(source.material)?source.material:[source.material],ownMats=Array.isArray(own.material)?own.material:[own.material];
            for(let i=0;i<ownMats.length;i++)assert.equal(ownMats[i].map,sourceMats[i].map,'headless test retains immutable texture source through the unchanged fallback');
        }finally{a.dispose();}
    }
});
