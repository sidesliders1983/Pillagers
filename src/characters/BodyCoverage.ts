import {BufferAttribute, BufferGeometry, Vector3} from 'three';
import type {BodySurface, SurfaceAnchor} from './BodyFitAdapter';

export interface BodyCutPlane {regions:string[]; normal:number[]; constant:number;}

/** Own the coverage mesh and sew its cut edges to the module's exact LOD contacts. */
export function maskedBodyGeometry(
 source:BufferGeometry, surface:BodySurface, covered:ReadonlySet<number>,
 planes:readonly BodyCutPlane[]=[], rims:readonly SurfaceAnchor[]=[]
){
 const attributes=Object.entries(source.attributes);
 const arrays=new Map(attributes.map(([name,a])=>[name,Array.from({length:a.count*a.itemSize},(_,i)=>a.getComponent(Math.floor(i/a.itemSize),i%a.itemSize))]));
 const points=Array.from({length:surface.positions.length/3},(_,v)=>new Vector3().fromArray(surface.positions,v*3));
 const originalCount=points.length, indices:number[]=[], coverageWeights:{vertex:number;influences:[number,number][]}[]=[];
 const rimPoints=new Map<number,Vector3[]>();
 for(const anchor of rims){
  const p=new Vector3();
  for(let k=0;k<3;k++)p.addScaledVector(points[surface.indices[anchor.triangle*3+k]],anchor.barycentric[k]);
  const list=rimPoints.get(anchor.triangle)??[];
  if(!list.some(other=>p.distanceToSquared(other)<1e-14))list.push(p);
  rimPoints.set(anchor.triangle,list);
 }
 const mix=(a:number,b:number,t:number)=>{
  const id=points.length;points.push(points[a].clone().lerp(points[b],t));
  for(const [name,attribute] of attributes){const list=arrays.get(name)!;for(let k=0;k<attribute.itemSize;k++)list.push(list[a*attribute.itemSize+k]*(1-t)+list[b*attribute.itemSize+k]*t);}
  const joints=arrays.get('skinIndex')!,weights=arrays.get('skinWeight')!,merged=new Map<number,number>();
  for(const [v,amount] of [[a,1-t],[b,t]])for(let k=0;k<4;k++){const j=joints[v*4+k];merged.set(j,(merged.get(j)??0)+weights[v*4+k]*amount);}
  coverageWeights.push({vertex:id,influences:[...merged]});
  const top=[...merged].filter(([,w])=>w>0).sort((a,b)=>b[1]-a[1]||a[0]-b[0]).slice(0,4),total=top.reduce((n,[,w])=>n+w,0);
  for(let k=0;k<4;k++){joints[id*4+k]=top[k]?.[0]??0;weights[id*4+k]=(top[k]?.[1]??0)/total;}
  const normals=arrays.get('normal');
  if(normals){const n=new Vector3().fromArray(normals,id*3).normalize();normals.splice(id*3,3,...n.toArray());}
  return id;
 };
 for(let triangle=0;triangle<surface.triangles;triangle++){
  if(covered.has(triangle))continue;
  let polygon=[...surface.indices.slice(triangle*3,triangle*3+3)];
  for(const plane of planes){
   if(!polygon.every(v=>v>=surface.regions.length||plane.regions.includes(surface.regions[v])))continue;
   const normal=new Vector3(...plane.normal),distance=(v:number)=>points[v].dot(normal)+plane.constant,next:number[]=[];
   for(let k=0;k<polygon.length;k++){
    const a=polygon[k],b=polygon[(k+1)%polygon.length],da=distance(a),db=distance(b);
    if(da>=0)next.push(a);
    if((da>=0)!==(db>=0))next.push(mix(a,b,da/(da-db)));
   }
   polygon=next;if(!polygon.length)break;
  }
  // A rim may have more corners than the simplified body's edge. Subdivide that
  // edge at the shared source correspondences; do not move the clothing off it.
  const contacts=rimPoints.get(triangle);
  if(contacts&&polygon.length){
   const next:number[]=[];
   for(let k=0;k<polygon.length;k++){
    const a=polygon[k],b=polygon[(k+1)%polygon.length],edge=points[b].clone().sub(points[a]),length=edge.lengthSq();next.push(a);
    if(!length)continue;
    const cuts=contacts.map(p=>({p,t:p.clone().sub(points[a]).dot(edge)/length})).filter(({p,t})=>t>1e-7&&t<1-1e-7&&points[a].clone().addScaledVector(edge,t).distanceToSquared(p)<1e-12).sort((a,b)=>a.t-b.t);
    for(const {t} of cuts)next.push(mix(a,b,t));
   }
   polygon=next;
   // Fan from the surviving source corner, rather than from the collinear rim.
   const first=polygon.findIndex(v=>v<originalCount);
   if(first>0)polygon=[...polygon.slice(first),...polygon.slice(0,first)];
  }
  for(let k=1;k+1<polygon.length;k++)indices.push(polygon[0],polygon[k],polygon[k+1]);
 }
 const geometry=new BufferGeometry();
 for(const [name,attribute] of attributes){const values=arrays.get(name)!;geometry.setAttribute(name,new BufferAttribute(name==='skinIndex'?new Uint16Array(values):new Float32Array(values),attribute.itemSize));}
 geometry.setIndex(indices);geometry.userData.coverageWeights=coverageWeights;geometry.computeBoundingSphere();
 return geometry;
}
