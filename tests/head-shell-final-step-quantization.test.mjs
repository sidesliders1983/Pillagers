import test from 'node:test';
import assert from 'node:assert/strict';
import {BufferGeometry,Float32BufferAttribute,Mesh,MeshStandardMaterial,Vector3} from 'three';
import {loadTypeScript} from '../scripts/load-typescript.mjs';
import {readGLB,geometryGLTF} from '../scripts/characters/glb-inspection.mjs';
const {headSurfaceFitter}=loadTypeScript(new URL('../src/character-lab/HeadSurfaceContactFit.ts',import.meta.url));
const {CharacterFactory}=loadTypeScript(new URL('../src/characters/CharacterFactory.ts',import.meta.url));
const {goldenCharacterDNA}=loadTypeScript(new URL('../src/characters/GoldenCharacters.ts',import.meta.url));
const {goldenLabBody}=loadTypeScript(new URL('../src/characters/LabBodySources.ts',import.meta.url));
async function fixture(){const human=await new CharacterFactory(async url=>geometryGLTF(readGLB(url.split('?')[0]))).create(goldenCharacterDNA('golden_masculine_01'),2,{hair:'none',beard:'none',outfit:'none',equipment:'none',technicalWaistWrap:false},{version:1,preset:'neutral',source:goldenLabBody.source}),surface=human.fit.bodyContactSurface,centre=human.fit.headFrame.bounds.getCenter(new Vector3()),size=human.fit.headFrame.bounds.getSize(new Vector3()),hit=surface.raycast([-.004663094412535429,1.6256082653999329,2],[0,0,-1],{contactZones:['HEAD']}).nearest,facet=surface.evidence().facets.find(f=>f.mesh===hit.mesh&&f.triangle===hit.triangle);return {human,surface,centre,size,hit,facet,maximum:.25*Math.min(size.x,size.y,size.z)};}
function patch(f,inset){const anchor=new Vector3(...f.hit.point),direction=anchor.clone().sub(f.centre).normalize(),points=f.facet.points.map(p=>new Vector3(...p).sub(anchor).multiplyScalar(.002).add(anchor).sub(f.centre).addScaledVector(direction,-inset)),geometry=new BufferGeometry();geometry.setAttribute('position',new Float32BufferAttribute(points.flatMap(p=>p.toArray()),3));geometry.setIndex([0,1,2]);geometry.setAttribute('color',new Float32BufferAttribute([1,.4,.2,1,.4,.2,1,.4,.2],3));return new Mesh(geometry,new MeshStandardMaterial());}
const points=m=>Array.from({length:m.geometry.attributes.position.count},(_,i)=>new Vector3().fromBufferAttribute(m.geometry.attributes.position,i));
const snapshot=m=>({position:Array.from(m.geometry.attributes.position.array),index:Array.from(m.geometry.index.array),color:Array.from(m.geometry.attributes.color.array)});
test('last coherent step reserves Float32 rounding while exact displacement guard and excessive-fit rejection remain',async()=>{
 const f=await fixture(),m=patch(f,f.maximum*15/16),excessive=patch(f,f.maximum*1.2),before=points(m),saved=snapshot(m),negativeBefore=snapshot(excessive);
 try{
  // Geometry requires the last grid step: the previous step still penetrates
  // actual body. This fixture has no per-asset source or replacement collider.
  for(const p of before){const previous=p.clone().addScaledVector(p.clone().normalize(),f.maximum*7/8).toArray().map(Math.fround);assert.equal(f.surface.query(new Vector3(...previous).add(f.centre).toArray()).classification,'inside');}
  const naive=before.map(p=>new Vector3(...p.clone().addScaledVector(p.clone().normalize(),f.maximum).toArray().map(Math.fround)).distanceTo(p));
  assert.ok(naive.some(d=>d>f.maximum),'The old final step must reproduce a quantized strict-limit overflow.');
  headSurfaceFitter(f.surface,f.centre,f.size).clearMeshes([m],-Infinity,Infinity,.001);
  const fit=m.userData.headContactFit;assert.ok(fit.radialOffsetMetres>f.maximum*7/8&&fit.radialOffsetMetres<f.maximum);assert.equal(fit.maximumCorrectionMetres,f.maximum);assert.equal(fit.properBodyCrossings,0);assert.equal(fit.properSelfCrossings,0);
  for(const [i,p] of points(m).entries()){assert.ok(p.distanceTo(before[i])<=f.maximum);assert.equal(f.surface.query(p.clone().add(f.centre).toArray()).classification,'outside');}
  assert.deepEqual(snapshot(m).index,saved.index);assert.deepEqual(snapshot(m).color,saved.color);
  assert.throws(()=>headSurfaceFitter(f.surface,f.centre,f.size).clearMeshes([excessive],-Infinity,Infinity,.001),/still crosses/);assert.deepEqual(snapshot(excessive),negativeBefore);
 }finally{for(const mesh of [m,excessive]){mesh.geometry.dispose();mesh.material.dispose();}f.human.dispose();}
});
