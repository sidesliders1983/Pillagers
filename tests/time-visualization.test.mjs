import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {Scene,Group,Mesh,BoxGeometry,MeshStandardMaterial}=createRequire(import.meta.url)('three');
import {load} from './load-source.mjs';
const {WorldLighting}=load('../src/core/WorldLighting.ts');
const {SeasonTint}=load('../src/world/SeasonTint.ts');
const {daylight,seasonBlend}=load('../src/config/timeVisualization.ts');
test('year visualization wraps through four seasons and noon/midnight without a discontinuity',()=>{
    assert.deepEqual([0,.25,.5,.75,1].map(p=>seasonBlend(p).from.name),['Winter','Spring','Summer','Autumn','Winter']);
    assert.equal(daylight(0),daylight(1));assert.equal(daylight(0),0);assert.equal(daylight(.5),1);
    assert.ok(seasonBlend(.99999).mix>.9999999);
});
test('animated lighting and foliage reuse lights, shadow map and geometry, restoring Off and fog settings',()=>{
    const scene=new Scene(),renderer={shadowMap:{enabled:true},toneMappingExposure:1};
    const assets={windowMaterials:[new MeshStandardMaterial()],fireMaterials:[new MeshStandardMaterial()]};
    const lighting=new WorldLighting(scene,renderer,assets),resources=[...scene.children];
    lighting.setFog(false);lighting.setVisualization('day-night');
    const shadow={dispose(){throw new Error('Animated cycle must not reallocate shadow map');}};
    lighting.directional.shadow.map=shadow;
    lighting.update(0,0);const noon=scene.background.clone();lighting.update(30,.5);
    assert.notDeepEqual(scene.background,noon);assert.equal(assets.windowMaterials[0].emissiveIntensity,0);assert.equal(scene.fog,null);
    lighting.update(60,1);assert.deepEqual(scene.background,noon);assert.equal(lighting.directional.shadow.map,shadow);
    const root=new Group(),geometry=new BoxGeometry(),material=new MeshStandardMaterial(),foliage=new Mesh(geometry,material),ground=new Mesh(geometry,material.clone());
    foliage.userData.seasonalFoliage=true;root.add(foliage,ground);const tint=new SeasonTint(root,ground);
    const own=foliage.material;assert.notEqual(own,material);
    const shader={uniforms:{},fragmentShader:'#include <color_fragment>'};own.onBeforeCompile(shader);
    tint.update(0);assert.equal(shader.uniforms.seasonSnowAmount.value,.65);assert.match(shader.fragmentShader,/seasonMask=smoothstep/);
    lighting.setVisualization('seasons');
    for(const p of [0,.25,.5,.75,1]){lighting.update(p*60,p);tint.update(p);assert.equal(foliage.geometry,geometry);assert.equal(foliage.material,own);assert.deepEqual(scene.children,resources);}
    assert.notDeepEqual(own.color,material.color);assert.equal(lighting.directional.shadow.map,shadow);
    lighting.setVisualization('off');tint.update(null);assert.deepEqual(own.color,material.color);assert.equal(assets.windowMaterials[0].emissiveIntensity,0);
    assert.equal(shader.uniforms.seasonSnowAmount.value,0);
    assert.equal(scene.fog,null);assert.equal(lighting.directional.shadow.mapSize.x,2048);
    tint.dispose();geometry.dispose();material.dispose();ground.material.dispose();lighting.halo.geometry.dispose();lighting.halo.material.dispose();
});
