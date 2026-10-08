import {test} from 'node:test';
import assert from 'node:assert/strict';
import {load} from './load-source.mjs';
const {createTerrain,surfaceHeightAt}=load('../src/world/Terrain.ts');
const {Raycaster,Vector3}=await import('three');
const release=mesh=>{mesh.geometry.dispose();mesh.material.dispose();};

test('ground treatment adds usable texture coordinates without changing the rendered landscape',()=>{
 const original=createTerrain(),treated=createTerrain({treatment:'ground-v02'});
 try{
  assert.deepEqual(treated.geometry.attributes.position.array,original.geometry.attributes.position.array);
  const uv=treated.geometry.getAttribute('uv');assert.ok(uv,'native ground maps need continuous texture coordinates');
  assert.equal(uv.count,treated.geometry.attributes.position.count);
  assert.ok(Array.from(uv.array).every(v=>Number.isFinite(v)&&v>=0&&v<=1));
  treated.updateMatrixWorld(true);const ray=new Raycaster();
  for(const [x,z] of [[-4.7,-9.3],[1.7,2.3],[8.1,4.4],[-8.6,3.9]]){
   ray.set(new Vector3(x,20,z),new Vector3(0,-1,0));const hit=ray.intersectObject(treated)[0];assert.ok(hit);
   assert.ok(Math.abs(hit.point.y-surfaceHeightAt(x,z))<1e-6);
  }
 }finally{release(original);release(treated);}
});

test('ground treatment distinguishes sand, vegetated ground and worn paths without per-triangle color seams',()=>{
 const mesh=createTerrain({treatment:'ground-v02'});const p=mesh.geometry.attributes.position,c=mesh.geometry.attributes.color;
 const colorAt=(x,z)=>{for(let i=0;i<p.count;i++)if(p.getX(i)===x&&p.getZ(i)===z)return [c.getX(i),c.getY(i),c.getZ(i)];throw Error('missing terrain point');};
 try{
  const grass=colorAt(-40,0),sand=colorAt(0,-8),earth=colorAt(-2,-2);
  assert.ok(grass[1]>grass[0],'vegetated ground should read as muted green');
  assert.ok(sand[0]>sand[1]&&sand[0]>grass[0]+.1,'the shore should read as lighter sand');
  assert.ok(earth[0]>earth[1],'the harbour path should retain warm trampled earth');
  const seen=new Map();for(let i=0;i<p.count;i++){const key=p.getX(i)+','+p.getZ(i),color=[c.getX(i),c.getY(i),c.getZ(i)];if(seen.has(key))assert.deepEqual(color,seen.get(key));else seen.set(key,color);}
 }finally{release(mesh);}
});
