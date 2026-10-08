import {test} from 'node:test';
import assert from 'node:assert/strict';
import {load} from './load-source.mjs';
import {Raycaster,Vector3} from 'three';
const {createTerrain,createRegionalTerrain,surfaceHeightAt}=load('../src/world/Terrain.ts');
const triangles=g=>{const p=g.getAttribute('position'),r=[];for(let i=0;i<p.count;i+=3)r.push(Array.from(p.array.slice(i*3,(i+3)*3)).join(','));return r;};
const dispose=o=>o.traverse(m=>{if(m.isMesh){m.geometry.dispose();m.material.dispose();}});
test('regional ground retains every canonical triangle and raycast height with continuous padded UVs',()=>{
 const original=createTerrain(),regional=createRegionalTerrain();
 try{
  const rows=[];regional.traverse(m=>{if(m.isMesh){rows.push(...triangles(m.geometry));assert.equal(m.material.vertexColors,false);const uv=m.geometry.getAttribute('uv');assert.ok(Array.from(uv.array).every(v=>v>0&&v<1));}});
  assert.equal(regional.children.length,12);assert.deepEqual(rows.sort(),triangles(original.geometry).sort());
  regional.updateMatrixWorld(true);const ray=new Raycaster();
  for(const [x,z] of [[-28,-8],[2,10],[32,38],[-28.0001,10.0001],[1.9999,37.9999],[57.9,61.9]]){ray.set(new Vector3(x,20,z),new Vector3(0,-1,0));const hit=ray.intersectObject(regional,true)[0];assert.ok(hit);assert.ok(Math.abs(hit.point.y-surfaceHeightAt(x,z))<1e-6);}
 }finally{dispose(original);if(regional)dispose(regional);}
});
