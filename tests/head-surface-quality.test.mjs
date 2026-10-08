import test from 'node:test';
import assert from 'node:assert/strict';
import {BufferGeometry,Float32BufferAttribute,Group,Mesh,MeshStandardMaterial,Vector3,DataTexture,RGBAFormat,FrontSide} from 'three';
import {ConvexHull} from 'three/addons/math/ConvexHull.js';
import {load} from './load-source.mjs';
const {appearanceModules,disposeModules}=load('../src/character-lab/AppearanceModules.ts');
const {registeredAppearanceMetadata}=load('../src/characters/CharacterAssets.ts');

test('skull contact preserves seams, triangle budget and face-order independent fitting',()=>{
    const size=new Vector3(.1992,.2397,.2189),skull=[];
    for(const x of [-.08,.08])for(const y of [-.1,.1])for(const z of [-.08,.08])skull.push(new Vector3(x,y,z));
    const hull=new ConvexHull().setFromPoints(skull),corners=[[-.07,.08,.035],[-.07,.025,.035],[.07,.025,.035],[.07,.08,.035]],triangles=[[0,1,2],[0,2,3]];
    const make=reverse=>{const faces=reverse?[...triangles].reverse():triangles,geometry=new BufferGeometry(),authored=faces.flatMap(face=>face.map(id=>corners[id]));geometry.setAttribute('position',new Float32BufferAttribute(authored.flat(),3));geometry.computeVertexNormals();const source=new Group(),mesh=new Mesh(geometry,new MeshStandardMaterial());mesh.name='reference-patch';source.add(mesh);return {source,authored};};
    const profile={hairStyle:'short',beardStyle:'none',color:'#885b40',greyAmount:0},metadata={...registeredAppearanceMetadata('hair','short'),authoringFrame:'canonical',attachmentBand:{minimumY:-1},clearance:.002};
    const fit=fixture=>appearanceModules(profile,size,2,undefined,fixture.source,skull,null,metadata),a=make(false),b=make(true),first=fit(a),second=fit(b),positions=first.getObjectByName('reference-patch').geometry.attributes.position,other=second.getObjectByName('reference-patch').geometry.attributes.position;
    assert.equal(positions.count,6,'contact fitting must not retessellate the source');assert.equal(other.count,6);
    const bySource=new Map();a.authored.forEach((point,id)=>{const key=point.join(','),fitted=new Vector3().fromBufferAttribute(positions,id);if(bySource.has(key))assert.ok(fitted.distanceTo(bySource.get(key))<1e-7,'flat-normal seam copies separated');bySource.set(key,fitted);});
    b.authored.forEach((point,id)=>assert.ok(new Vector3().fromBufferAttribute(other,id).distanceTo(bySource.get(point.join(',')))<1e-7,'triangle visit order changes fitted shape'));
    for(let base=0;base<positions.count;base+=3){const centre=new Vector3();for(let k=0;k<3;k++)centre.add(new Vector3().fromBufferAttribute(positions,base+k));centre.multiplyScalar(1/3);assert.equal(hull.containsPoint(centre),false,'a fitted contact face crosses the skull');}
    for(const fitted of [first,second])disposeModules(fitted);for(const fixture of [a,b])fixture.source.traverse(mesh=>{if(mesh.isMesh){mesh.geometry.dispose();mesh.material.dispose();}});
});

test('reference MASK coverage keeps UV alpha and DNA tint without mutating cached assets',()=>{
    const map=new DataTexture(new Uint8Array([255,255,255,255,255,255,255,0]),2,1,RGBAFormat),sourceMaterial=new MeshStandardMaterial({color:'#ffffff',map,alphaTest:.5,roughness:.2}),source=new Group();
    const geometry=new BufferGeometry();geometry.setAttribute('position',new Float32BufferAttribute([-.02,.04,.10,.02,.04,.10,0,0,.10],3));geometry.setAttribute('uv',new Float32BufferAttribute([0,0,1,0,.5,1],2));geometry.computeVertexNormals();
    for(const name of ['source-a','source-b']){const mesh=new Mesh(geometry,sourceMaterial);mesh.name=name;source.add(mesh);}
    const originalPositions=Array.from(geometry.attributes.position.array),originalUVs=Array.from(geometry.attributes.uv.array),originalPixels=Array.from(map.image.data),profile={hairStyle:'short',beardStyle:'stubble',color:'#885b40',greyAmount:0},metadata={...registeredAppearanceMetadata('beard','stubble'),authoringFrame:'canonical'};
    const fitted=appearanceModules(profile,new Vector3(.1992,.2397,.2189),2,undefined,null,[],source,metadata),a=fitted.getObjectByName('source-a'),b=fitted.getObjectByName('source-b');
    assert.notEqual(a.material,sourceMaterial);assert.equal(a.material,b.material,'one owned material for one source coverage');assert.equal(a.material.map,map,'immutable reference alpha texture retained');assert.equal(a.material.alphaTest,.5);assert.equal(a.material.transparent,false,'MASK uses discard rather than blend sorting');assert.equal(a.material.side,FrontSide);assert.equal(a.material.color.getHexString(),'885b40');assert.equal(a.material.flatShading,true);assert.equal(a.material.roughness,1);assert.deepEqual(Array.from(a.geometry.attributes.uv.array),originalUVs);assert.equal(a.geometry.index?.count??a.geometry.attributes.position.count,3,'alpha coverage does not grow source topology');
    assert.deepEqual(Array.from(geometry.attributes.position.array),originalPositions);assert.deepEqual(Array.from(map.image.data),originalPixels);assert.equal(sourceMaterial.color.getHexString(),'ffffff');assert.equal(sourceMaterial.roughness,.2);
    let fittedDisposed=0,sourceDisposed=0,textureDisposed=0;a.material.addEventListener('dispose',()=>fittedDisposed++);sourceMaterial.addEventListener('dispose',()=>sourceDisposed++);map.addEventListener('dispose',()=>textureDisposed++);disposeModules(fitted);assert.equal(fittedDisposed,1);assert.equal(sourceDisposed,0);assert.equal(textureDisposed,0);geometry.dispose();sourceMaterial.dispose();map.dispose();
});

test('opaque reference materials retain the shared faceted profile behavior',()=>{
    const source=new Group(),geometry=new BufferGeometry();geometry.setAttribute('position',new Float32BufferAttribute([-.02,.04,.10,.02,.04,.10,0,0,.10],3));geometry.computeVertexNormals();
    const cached=[new MeshStandardMaterial({color:'#ff0000',roughness:.2}),new MeshStandardMaterial({color:'#00ff00',roughness:.8})];cached.forEach((material,i)=>{const mesh=new Mesh(geometry,material);mesh.name=`source-${i}`;source.add(mesh);});
    const profile={hairStyle:'short',beardStyle:'none',color:'#7b5b40',greyAmount:0},metadata={...registeredAppearanceMetadata('hair','short'),authoringFrame:'canonical'},fitted=appearanceModules(profile,new Vector3(.1992,.2397,.2189),2,undefined,source,[],null,metadata),a=fitted.getObjectByName('source-0'),b=fitted.getObjectByName('source-1');
    assert.equal(a.material,b.material);assert.equal(a.material.color.getHexString(),'7b5b40');assert.equal(a.material.alphaTest,0);assert.equal(a.material.map,null);assert.equal(a.material.transparent,false);assert.equal(a.material.flatShading,true);assert.equal(a.material.roughness,1);assert.equal(cached[0].color.getHexString(),'ff0000');assert.equal(cached[1].color.getHexString(),'00ff00');disposeModules(fitted);geometry.dispose();cached.forEach(material=>material.dispose());
});
