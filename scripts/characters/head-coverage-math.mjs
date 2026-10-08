import {Vector3} from 'three';

/** Intersect a source polygon with an angular half-space without redrawing its contour. */
export function clipToHalfSpace(polygon,n){const result=[];for(let i=0;i<polygon.length;i++){const a=polygon[i],b=polygon[(i+1)%polygon.length],da=n.dot(a),db=n.dot(b),insideA=da>=-1e-11,insideB=db>=-1e-11;if(insideA)result.push(a);if(insideA!==insideB)result.push(a.clone().lerp(b,da/(da-db)));}return result;}
export function polygonArea(polygon){if(polygon.length<3)return 0;const sum=new Vector3(),origin=polygon[0];for(let k=1;k<polygon.length-1;k++)sum.add(polygon[k].clone().sub(origin).cross(polygon[k+1].clone().sub(origin)));return sum.length()/2;}
export function triangleCone(triangle){const centre=triangle.reduce((sum,p)=>sum.add(p),new Vector3());return triangle.map((p,i)=>{const normal=p.clone().cross(triangle[(i+1)%3]).normalize();if(normal.dot(centre)<0)normal.negate();return normal;});}

/** Partition contact facets at every cage boundary, avoiding triangles that span a skull fold. */
export function refineAngularCells(triangle,layers){let cells=[triangle];for(const layer of layers){const next=[];for(const cell of cells)for(const cone of layer.cones){let polygon=cell;for(const n of cone){polygon=clipToHalfSpace(polygon,n);if(polygon.length<3)break;}if(polygonArea(polygon)>1e-14)next.push(polygon);}cells=next;}return cells;}

export const cross2=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);

/** A conservative source-alpha test: transparent facets can be removed; nearby coverage cannot. */
export function hasAtlasCoverage(corners,alpha,atlasSize,guard=2){
 if(cross2(...corners)<0)corners=[corners[0],corners[2],corners[1]];
 const loX=Math.max(0,Math.floor(Math.min(...corners.map(p=>p[0]))-guard)),hiX=Math.min(atlasSize-1,Math.ceil(Math.max(...corners.map(p=>p[0]))+guard)),loY=Math.max(0,Math.floor(Math.min(...corners.map(p=>p[1]))-guard)),hiY=Math.min(atlasSize-1,Math.ceil(Math.max(...corners.map(p=>p[1]))+guard));
 for(let y=loY;y<=hiY;y++)for(let x=loX;x<=hiX;x++){
  if(alpha[y*atlasSize+x]===0)continue;const p=[x+.5,y+.5];
  if(corners.every((a,k)=>{const b=corners[(k+1)%3];return cross2(a,b,p)>=-guard*Math.hypot(b[0]-a[0],b[1]-a[1]);}))return true;
 }
 return false;
}
