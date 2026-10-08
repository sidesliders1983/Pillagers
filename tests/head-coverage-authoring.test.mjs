import test from 'node:test';
import assert from 'node:assert/strict';
import {Vector3} from 'three';
import {clipToHalfSpace,polygonArea,triangleCone,refineAngularCells,hasAtlasCoverage} from '../scripts/characters/head-coverage-math.mjs';
import {bakeHeadCoverage} from '../scripts/characters/head-coverage-authoring.mjs';

test('native angular coverage preserves gaps and does not mutate source geometry',()=>{
 const source=[new Vector3(-1,-1,2),new Vector3(0,-1,2),new Vector3(-1,1,2)],before=source.map(p=>p.toArray()),cone=triangleCone(source);
 const inside=new Vector3(-.75,-.5,2),gap=new Vector3(.5,0,2);
 assert.ok(cone.every(n=>n.dot(inside)>=0));assert.ok(cone.some(n=>n.dot(gap)<0),'an unselected region must stay outside source coverage');
 let clipped=[new Vector3(-2,-2,2),new Vector3(2,-2,2),new Vector3(0,2,2)];for(const normal of cone)clipped=clipToHalfSpace(clipped,normal);
 assert.ok(polygonArea(clipped)>0);assert.ok(clipped.every(p=>cone.every(n=>n.dot(p)>=-1e-10)));assert.deepEqual(source.map(p=>p.toArray()),before);
});

test('common cage partition preserves facet area and never spans another cage fold',()=>{
 const triangle=[new Vector3(-1,-1,2),new Vector3(1,-1,2),new Vector3(0,1,2)],before=triangle.map(p=>p.toArray()),positive=new Vector3(1,0,0),negative=positive.clone().negate();
 const cells=refineAngularCells(triangle,[{cones:[[positive],[negative]]}]);assert.equal(cells.length,2);
 assert.ok(Math.abs(cells.reduce((sum,p)=>sum+polygonArea(p),0)-polygonArea(triangle))<1e-10);
 assert.ok(cells.every(cell=>cell.every(p=>p.x>=-1e-10)||cell.every(p=>p.x<=1e-10)),'a retained contact facet crosses the partition');
 assert.deepEqual(triangle.map(p=>p.toArray()),before);
});

test('alpha pruning preserves nearby source coverage without filling transparent regions',()=>{
 const size=16,alpha=new Uint8Array(size*size),corners=[[5,5],[10,5],[5,10]],before=corners.map(p=>[...p]);
 assert.equal(hasAtlasCoverage(corners,alpha,size),false);alpha[6*size+6]=255;assert.equal(hasAtlasCoverage(corners,alpha,size),true);
 alpha.fill(0);alpha[5*size+4]=255;assert.equal(hasAtlasCoverage(corners,alpha,size,2),true,'sampler guard must retain a nearby alpha facet');assert.equal(hasAtlasCoverage(corners,alpha,size,0),false);
 alpha.fill(0);alpha[15*size+15]=255;assert.equal(hasAtlasCoverage(corners,alpha,size),false);assert.deepEqual(corners,before);assert.equal(alpha.filter(v=>v>0).length,1,'pruning must not dilate the source mask');
});

test('authoring refuses overwriting source or an invalid contact authority before reading files',async()=>{
 await assert.rejects(bakeHeadCoverage({source:'native.glb',output:'native.glb'}),/distinct/);
 await assert.rejects(bakeHeadCoverage({source:'native.glb',output:'new.glb',bodyLOD:4}),/LOD/);
 await assert.rejects(bakeHeadCoverage({source:'native.glb',output:'new.glb',atlasSize:64}),/atlas/);
});
