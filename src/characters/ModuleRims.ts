import {BufferAttribute, BufferGeometry, Vector3} from 'three';
import type {BodySurface, ModuleBindingV2, SurfaceAnchor} from './BodyFitAdapter';
import type {MeshyBodyFitAdapter} from './MeshyBodyFitAdapter';
import {anchorPoint} from './MeshyBodyFitAdapter';

/** Include every body-LOD opening corner in the owned clothing boundary. */
export function sewModuleOpenings(source:BufferGeometry,binding:ModuleBindingV2,fit:MeshyBodyFitAdapter){
 if(!binding.coverageRimContacts?.length)return source;
 const contacts=new Set(binding.coverageRimContacts),surface=fit.source;
 const sections=(binding.coverageClipPlanes??[]).map(plane=>{
  const normal=new Vector3(...plane.normal),points:{point:Vector3;anchor:SurfaceAnchor}[]=[];
  for(let triangle=0;triangle<surface.triangles;triangle++){
   const ids=surface.indices.slice(triangle*3,triangle*3+3);
   if(!ids.every(i=>plane.regions.includes(surface.regions[i])))continue;
   const p=ids.map(i=>new Vector3().fromArray(surface.positions,i*3)),d=p.map(p=>p.dot(normal)+plane.constant);
   for(let k=0;k<3;k++){
    const j=(k+1)%3;if((d[k]>=0)===(d[j]>=0))continue;
    const t=d[k]/(d[k]-d[j]),point=p[k].clone().lerp(p[j],t),barycentric:[number,number,number]=[0,0,0];barycentric[k]=1-t;barycentric[j]=t;
    if(!points.some(other=>other.point.distanceToSquared(point)<1e-12))points.push({point,anchor:{triangle,barycentric,offset:[0,0,0]}});
   }
  }
  const centre=points.reduce((s,p)=>s.add(p.point),new Vector3()).divideScalar(points.length),u=new Vector3(0,0,1).addScaledVector(normal,-normal.z/normal.lengthSq()).normalize(),w=normal.clone().normalize().cross(u);
  const angle=(p:Vector3)=>{const v=p.clone().sub(centre);return Math.atan2(v.dot(w),v.dot(u));};
  return {normal,constant:plane.constant,points,angle};
 });
 const count=source.getAttribute('position').count,attributes=Object.entries(source.attributes),arrays=new Map(attributes.map(([name,a])=>[name,Array.from({length:count*a.itemSize},(_,i)=>a.getComponent(Math.floor(i/a.itemSize),i%a.itemSize))]));
 const p=source.getAttribute('position'),world=(v:number)=>new Vector3().fromBufferAttribute(p,v).applyMatrix4(fit.encoding),inverse=fit.encoding.clone().invert(),indices:number[]=[];
 const base=source.index?Array.from(source.index.array):Array.from({length:count},(_,i)=>i);
 const wrap=(r:number)=>Math.atan2(Math.sin(r),Math.cos(r));
 let appended=0;
 const add=(a:number,b:number,t:number,anchor:SurfaceAnchor)=>{
  const id=count+appended++;
  for(const [name,attribute] of attributes){const list=arrays.get(name)!;for(let k=0;k<attribute.itemSize;k++)list.push(list[a*attribute.itemSize+k]*(1-t)+list[b*attribute.itemSize+k]*t);}
  const point=anchorPoint(surface,anchor).applyMatrix4(inverse),positions=arrays.get('position')!;positions.splice(id*3,3,...point.toArray());
  const values=new Map<number,number>(),bi=fit.sourceGeometry.getAttribute('skinIndex'),bw=fit.sourceGeometry.getAttribute('skinWeight');
  for(let k=0;k<3;k++){const vertex=surface.indices[anchor.triangle*3+k];for(let j=0;j<4;j++){const joint=bi.getComponent(vertex,j);values.set(joint,(values.get(joint)??0)+bw.getComponent(vertex,j)*anchor.barycentric[k]);}}
  const top=[...values].filter(([,w])=>w>0).sort((a,b)=>b[1]-a[1]||a[0]-b[0]).slice(0,4),total=top.reduce((n,[,w])=>n+w,0);
  for(let k=0;k<4;k++){arrays.get('skinIndex')![id*4+k]=top[k]?.[0]??0;arrays.get('skinWeight')![id*4+k]=(top[k]?.[1]??0)/total;}
  return id;
 };
 for(let t=0;t<base.length;t+=3){
  const face=base.slice(t,t+3);let sewn=false;
  for(let k=0;k<3;k++){
   const a=face[k],b=face[(k+1)%3],c=face[(k+2)%3];if(!contacts.has(a)||!contacts.has(b))continue;
   const A=world(a),B=world(b),section=sections.find(s=>Math.abs(A.dot(s.normal)+s.constant)<1e-6&&Math.abs(B.dot(s.normal)+s.constant)<1e-6);
   if(!section)continue;
   const start=section.angle(A),delta=wrap(section.angle(B)-start);if(Math.abs(delta)<1e-8)continue;
   const interior=section.points.map(p=>({...p,t:wrap(section.angle(p.point)-start)/delta})).filter(p=>p.t>1e-6&&p.t<1-1e-6&&p.point.distanceTo(A)>1e-6&&p.point.distanceTo(B)>1e-6).sort((a,b)=>a.t-b.t);
   if(!interior.length)continue;
   let previous=a;for(const point of interior){const v=add(a,b,point.t,point.anchor);indices.push(previous,v,c);previous=v;}indices.push(previous,b,c);sewn=true;break;
  }
  if(!sewn)indices.push(...face);
 }
 if(!appended)return source;
 const geometry=new BufferGeometry();
 for(const [name,attribute] of attributes)geometry.setAttribute(name,new BufferAttribute(name==='skinIndex'?new Uint16Array(arrays.get(name)!):new Float32Array(arrays.get(name)!),attribute.itemSize));
 geometry.setIndex(indices);geometry.userData.sharedOpeningCorners=appended;geometry.computeBoundingSphere();return geometry;
}
