import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Scene,Mesh,BufferGeometry,Float32BufferAttribute,MeshStandardMaterial,Color} from 'three';
import {load} from './load-source.mjs';
const {splitEmissiveSurfaces}=load('../src/core/EmissiveSurfaces.ts');
const {WorldLighting}=load('../src/core/WorldLighting.ts');
const {lightingConfig,fireFlicker}=load('../src/config/lightingConfig.ts');
test('emissive partition preserves triangles and isolates only fully matching faces',()=>{
 const geometry=new BufferGeometry();geometry.setAttribute('position',new Float32BufferAttribute([0,0,0,1,0,0,0,1,0, 2,0,0,3,0,0,2,1,0],3));
 const mesh=new Mesh(geometry,new MeshStandardMaterial({vertexColors:true}));const original=mesh.material;
 const glow=splitEmissiveSurfaces(mesh,i=>i<3);
 assert.ok(glow);assert.notEqual(glow,original);assert.equal(glow.vertexColors,true);
 assert.deepEqual(Array.from(geometry.index.array),[3,4,5,0,1,2]);assert.deepEqual(geometry.groups,[{start:0,count:3,materialIndex:0},{start:3,count:3,materialIndex:1}]);
 const other=new Mesh(geometry.clone(),original);assert.equal(splitEmissiveSurfaces(other,i=>i===0),null);assert.equal(other.material,original);
 geometry.dispose();other.geometry.dispose();glow.dispose();original.dispose();
});
test('night switch is reversible, uses one shadow source, and preserves fog/shadow preferences',()=>{
 const scene=new Scene(),renderer={shadowMap:{needsUpdate:false,enabled:false},toneMappingExposure:0};
 const assets={windowMaterials:[new MeshStandardMaterial()],fireMaterials:[new MeshStandardMaterial()]};
 const lights=new WorldLighting(scene,renderer,assets),day=scene.background.clone();
 assert.equal(lights.mode,'day');assert.equal(lights.campfire.visible,false);assert.equal(assets.windowMaterials[0].emissiveIntensity,0);
 lights.setFog(false);lights.setMode('night');
 assert.equal(scene.fog,null);assert.notDeepEqual(scene.background,day);assert.equal(lights.directional.name,'Moonlight');assert.equal(lights.directional.shadow.mapSize.x,1024);
 assert.equal(scene.children.filter(light=>light.isLight&&light.castShadow).length,1);assert.equal(lights.campfire.castShadow,false);assert.equal(renderer.shadowMap.enabled,false);
 assert.equal(assets.windowMaterials[0].emissiveIntensity,lightingConfig.windows.emissiveIntensity);
 const resources=[...scene.children];lights.update(5);assert.notEqual(lights.campfire.intensity,lightingConfig.fire.intensity);assert.deepEqual(scene.children,resources);
 lights.setFog(true);assert.equal(scene.fog,lights.fog);lights.setMode('day');assert.deepEqual(scene.background,day);assert.equal(lights.directional.shadow.mapSize.x,2048);assert.equal(lights.halo.visible,false);assert.equal(assets.windowMaterials[0].emissiveIntensity,0);
 assert.equal(lights.halo.raycast({},[]),undefined);lights.halo.geometry.dispose();lights.halo.material.dispose();assets.windowMaterials[0].dispose();assets.fireMaterials[0].dispose();
});
test('fire flicker is deterministic, restrained and smooth',()=>{
 for(let frame=0;frame<6000;frame++){
  const time=frame/60,flicker=fireFlicker(time);assert.equal(fireFlicker(time),flicker);
  assert.ok(Math.abs(flicker-1)<=lightingConfig.fire.flickerAmount+1e-9);assert.ok(Math.abs(fireFlicker(time+1/60)-flicker)<.004);
 }
});
