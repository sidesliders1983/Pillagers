import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
const nativeRequire = createRequire(import.meta.url), cache = new Map();
// Compile the production modules in memory; exercise the actual steering and terrain code.
function load(path) {
  if(cache.has(path))return cache.get(path);
  const result = {exports:{}};cache.set(path,result.exports);
  const source = ts.transpileModule(readFileSync(new URL(path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  new Function('require','module','exports',source)(name=>name.startsWith('.')?load(new URL(name+'.ts',new URL(path,import.meta.url)).href):nativeRequire(name),result,result.exports);
  return result.exports;
}
const {seededRandom}=load('../src/config/worldConfig.ts');
const {heightAt,shoreAt,surfaceHeightAt,createTerrain}=load('../src/world/Terrain.ts');
const {buildings,pathWeight,routes}=load('../src/world/SettlementLayout.ts');
const {MovementSystem,walkable}=load('../src/systems/MovementSystem.ts');
const {Villager}=load('../src/entities/Villager.ts');
test('world seed reproduces scenery randomness',()=>{const a=seededRandom(1983),b=seededRandom(1983);for(let i=0;i<100;i++)assert.equal(a(),b());});
test('coast is submerged and hills rise above settlement',()=>{assert.ok(heightAt(0,-18)<0);assert.ok(heightAt(-19,19)>heightAt(0,0)+3);});
test('shoreline height is continuous and building footprints are level',()=>{
  for(let x=-40;x<=40;x+=2){const shore=shoreAt(x);assert.ok(Math.abs(heightAt(x,shore+.001)-heightAt(x,shore-.001))<.01);}
  for(const b of buildings){const center=heightAt(b.x,b.z);for(const [u,v] of [[0,0],[b.halfWidth-.2,b.halfDepth-.2],[-b.halfWidth+.2,-b.halfDepth+.2]]){
    const x=b.x+u*Math.cos(b.rotation)+v*Math.sin(b.rotation),z=b.z-u*Math.sin(b.rotation)+v*Math.cos(b.rotation);
    assert.ok(Math.abs(heightAt(x,z)-center)<1e-6);
  }}
});
test('desire paths connect the harbor and building entrances, with clear space away from paths',()=>{
  for(const [x,z] of routes.flatMap(route=>[route.points[0],route.points[2]]))assert.ok(pathWeight(x,z)>.99);
  assert.ok(pathWeight(15,-6)<.01);
});
test('path grounding matches the rendered terrain triangles',()=>{
  const {Raycaster,Vector3}=nativeRequire('three');const terrain=createTerrain();terrain.updateMatrixWorld(true);
  const ray=new Raycaster();
  for(const [x,z] of [[-4.7,-9.3],[-3.2,-5.1],[1.7,2.3],[8.1,4.4],[-8.6,3.9],[6.2,-4.1]]){
    ray.set(new Vector3(x,20,z),new Vector3(0,-1,0));const hit=ray.intersectObject(terrain)[0];
    assert.ok(hit);assert.ok(Math.abs(hit.point.y-surfaceHeightAt(x,z))<1e-6);
  }
  terrain.geometry.dispose();terrain.material.dispose();
});
test('inhabitants stay on dry ground and outside buildings during ten simulated minutes',()=>{
  const units=Array.from({length:10},(_,i)=>new Villager(i));const movement=new MovementSystem(units);const initial=units.map(u=>u.visual.position.clone());
  for(let frame=0;frame<12000;frame++){movement.update(.05);for(const unit of units){const p=unit.visual.position;assert.ok(walkable(p.x,p.z));assert.ok(heightAt(p.x,p.z)>0);}}
  assert.ok(units.every((u,i)=>u.visual.position.distanceTo(initial[i])>1));
});
