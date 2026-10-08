// Source-derived thin coverage on canonical HEAD cages. Offline authoring only.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {deflateSync} from 'node:zlib';
import {Box3,Vector3} from 'three';
import {ConvexHull} from 'three/addons/math/ConvexHull.js';
import {geometryGLTF} from './glb-inspection.mjs';
import {loadTypeScript} from '../load-typescript.mjs';

import {clipToHalfSpace as clip,polygonArea,triangleCone as facetCone,refineAngularCells,cross2,hasAtlasCoverage} from './head-coverage-math.mjs';

export async function bakeHeadCoverage({source:sourcePath,output:outputPath,atlasSize=1024,bodyLOD=0,commonRefinement=true,pruneTransparent=true,moduleName='Head_coverage_LOD2',style='coverage',lod=2}){
if(!sourcePath||!outputPath)throw new Error('Source and output paths are required');
const source=resolve(sourcePath),output=resolve(outputPath),offset=.004,padding=5;
if(!output.endsWith('.glb')||source===output)throw new Error('Output must be a distinct .glb path');
if(!Number.isInteger(atlasSize)||atlasSize<256||atlasSize>2048)throw new Error('Invalid atlas size');
if(![0,1,2].includes(bodyLOD)||![0,1,2].includes(lod))throw new Error('Invalid canonical cage/module LOD');
if(!/^[A-Za-z0-9_-]+$/.test(moduleName))throw new Error('Invalid module name');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
function read(path){const bytes=readFileSync(path),length=bytes.readUInt32LE(12),start=20+length;return {bytes,json:JSON.parse(bytes.subarray(20,start)),binary:bytes.subarray(start+8),sha256:sha(bytes)};}
const input=read(source),bodyPath=resolve(`public/universal-human/UniversalHuman_LOD${bodyLOD}.glb`),body=read(bodyPath),sourceScene=(await geometryGLTF(input)).scene,bodyGLTF=await geometryGLTF(body);
sourceScene.updateMatrixWorld(true);const cones=[];
sourceScene.traverse(mesh=>{if(!mesh.isMesh)return;const p=mesh.geometry.attributes.position,indices=mesh.geometry.index,count=indices?.count??p.count;
 for(let i=0;i<count;i+=3){const triangle=[0,1,2].map(k=>new Vector3().fromBufferAttribute(p,indices?indices.getX(i+k):i+k).applyMatrix4(mesh.matrixWorld)),centre=triangle.reduce((sum,p)=>sum.add(p),new Vector3()),planes=[];
  for(let k=0;k<3;k++){const n=triangle[k].clone().cross(triangle[(k+1)%3]);if(n.length()<1e-12)continue;n.normalize();if(n.dot(centre)<0)n.negate();planes.push(n);}if(planes.length===3)cones.push(planes);
 }
});
const {UniversalHuman}=loadTypeScript(new URL('../../src/characters/UniversalHuman.ts',import.meta.url)),{universalHumanProfile}=loadTypeScript(new URL('../../src/characters/UniversalHumanProfile.ts',import.meta.url)),{goldenCharacterDNA}=loadTypeScript(new URL('../../src/characters/GoldenCharacters.ts',import.meta.url));
const human=new UniversalHuman(bodyGLTF,universalHumanProfile(goldenCharacterDNA('golden_neutral_01')),'#ffffff');
const points=human.fit.cages.get('HEAD_CAGE').points.map(p=>p.clone());human.dispose();
const originalBounds=new Box3().setFromPoints(points),centre=originalBounds.getCenter(new Vector3()),size=originalBounds.getSize(new Vector3()),canonicalSize=new Vector3(.1992,.2397,.2189);
points.forEach(p=>p.sub(centre).multiply(canonicalSize.clone().divide(size)));
const hull=new ConvexHull().setFromPoints(points),texelsPerMetre=1000;
const charts=hull.faces.map((face,id)=>{
 const e=face.edge,cycle=[e.vertex.point.clone(),e.next.vertex.point.clone(),e.next.next.vertex.point.clone()];
 let start=0;for(let k=1;k<3;k++)if(cycle[k].distanceToSquared(cycle[(k+1)%3])>cycle[start].distanceToSquared(cycle[(start+1)%3]))start=k;
 const triangle=[0,1,2].map(k=>cycle[(start+k)%3]),a=triangle[0],x=triangle[1].clone().sub(a).normalize(),y=face.normal.clone().cross(x).normalize(),local=triangle.map(p=>{const d=p.clone().sub(a);return [d.dot(x),d.dot(y)];});
 const minimum=[0,1].map(k=>Math.min(...local.map(p=>p[k]))),maximum=[0,1].map(k=>Math.max(...local.map(p=>p[k])));
 return {id,triangle,x,y,minimum,width:Math.ceil((maximum[0]-minimum[0])*texelsPerMetre)+2*padding+1,height:Math.ceil((maximum[1]-minimum[1])*texelsPerMetre)+2*padding+1};
});
let shelfX=0,shelfY=0,shelfHeight=0;
for(const chart of [...charts].sort((a,b)=>b.height-a.height||b.width-a.width||a.id-b.id)){
 if(chart.width>atlasSize||chart.height>atlasSize)throw new Error('Metric chart exceeds atlas');
 if(shelfX+chart.width>atlasSize){shelfX=0;shelfY+=shelfHeight;shelfHeight=0;}
 if(shelfY+chart.height>atlasSize)throw new Error('Metric charts do not fit the bounded atlas');
 chart.origin=[shelfX+padding,shelfY+padding];shelfX+=chart.width;shelfHeight=Math.max(shelfHeight,chart.height);
}
const refinementLayers=[];
if(commonRefinement)for(const lod of [0,1,2].filter(lod=>lod!==bodyLOD)){
 const path=resolve(`public/universal-human/UniversalHuman_LOD${lod}.glb`),record=read(path),gltf=await geometryGLTF(record),actor=new UniversalHuman(gltf,universalHumanProfile(goldenCharacterDNA('golden_neutral_01')),'#ffffff');
 const p=actor.fit.cages.get('HEAD_CAGE').points.map(p=>p.clone());actor.dispose();const box=new Box3().setFromPoints(p),c=box.getCenter(new Vector3()),scale=canonicalSize.clone().divide(box.getSize(new Vector3()));p.forEach(p=>p.sub(c).multiply(scale));
 const cage=new ConvexHull().setFromPoints(p);refinementLayers.push({lod,path,sha256:record.sha256,cones:cage.faces.map(f=>facetCone([f.edge.vertex.point,f.edge.next.vertex.point,f.edge.next.next.vertex.point]))});
}
const bits=new Uint8Array(atlasSize*atlasSize),positions=[],normals=[],uv=[],facets=[];
const commonCells=triangle=>refineAngularCells(triangle,refinementLayers);
function rasterTriangle(a,b,c){const signed=cross2(a,b,c);if(Math.abs(signed)<1e-12)return;if(signed<0)[b,c]=[c,b];
 const loX=Math.max(0,Math.floor(Math.min(a[0],b[0],c[0]))),hiX=Math.min(atlasSize-1,Math.ceil(Math.max(a[0],b[0],c[0]))),loY=Math.max(0,Math.floor(Math.min(a[1],b[1],c[1]))),hiY=Math.min(atlasSize-1,Math.ceil(Math.max(a[1],b[1],c[1])));
 for(let y=loY;y<=hiY;y++)for(let x=loX;x<=hiX;x++){let covered=bits[y*atlasSize+x];for(let sample=0;sample<4;sample++){if(covered&(1<<sample))continue;const p=[x+(sample%2+.5)/2,y+(Math.floor(sample/2)+.5)/2];if(cross2(a,b,p)>=-1e-8&&cross2(b,c,p)>=-1e-8&&cross2(c,a,p)>=-1e-8)covered|=1<<sample;}bits[y*atlasSize+x]=covered;}
}
for(const [id,face] of hull.faces.entries()){
 const chart=charts[id],[a,b,c]=chart.triangle,baseX=chart.origin[0],baseY=chart.origin[1];
 const toPixel=p=>{const d=p.clone().sub(a);return [baseX+(d.dot(chart.x)-chart.minimum[0])*texelsPerMetre,baseY+(d.dot(chart.y)-chart.minimum[1])*texelsPerMetre];};
 let polygons=0;for(const cone of cones){let polygon=[a,b,c];for(const n of cone){polygon=clip(polygon,n);if(polygon.length<3)break;}if(polygon.length<3)continue;const projected=polygon.map(toPixel);for(let k=1;k<projected.length-1;k++)rasterTriangle(projected[0],projected[k],projected[k+1]);polygons++;}
 const cells=commonCells([a,b,c]);let emitted=0;
 for(const polygon of cells)for(let k=1;k<polygon.length-1;k++){
  const triangle=[polygon[0],polygon[k],polygon[k+1]],expanded=triangle.map(p=>p.clone().addScaledVector(p.clone().normalize(),offset)),normal=expanded[1].clone().sub(expanded[0]).cross(expanded[2].clone().sub(expanded[0]));if(normal.length()<1e-12)continue;normal.normalize();
  expanded.forEach(p=>{positions.push(...p.toArray());normals.push(...normal.toArray());});
  for(const p of triangle){const [x,y]=toPixel(p);uv.push(x/atlasSize,y/atlasSize);}emitted++;
 }
 facets.push({id,sourcePolygons:polygons,commonCells:cells.length,emittedTriangles:emitted,maximumEdgeMetres:Math.max(a.distanceTo(b),b.distanceTo(c),c.distanceTo(a)),metresPerAtlasPixel:1/texelsPerMetre,chart:{x:baseX,y:baseY,width:chart.width,height:chart.height,triangle:[a,b,c].map(toPixel)}});
}
const alpha=new Uint8Array(bits.length);for(let i=0;i<bits.length;i++){let n=0;for(let k=0;k<4;k++)n+=(bits[i]>>k)&1;alpha[i]=Math.round(255*n/4);}
// Extend only OUTSIDE each geometric triangle. This protects sampler seams;
// selected coverage inside the visible facet is never dilated or filled.
for(const {chart:{x:bx,y:by,width,height,triangle}} of facets){const centre=triangle.reduce((p,q)=>[p[0]+q[0]/3,p[1]+q[1]/3],[0,0]);
 for(let y=by-padding;y<by-padding+height;y++)for(let x=bx-padding;x<bx-padding+width;x++){
 const point=[x+.5,y+.5];if(triangle.every((a,k)=>cross2(a,triangle[(k+1)%3],point)>=0))continue;
 let closest=null,distance=Infinity;
 for(let k=0;k<3;k++){const a=triangle[k],b=triangle[(k+1)%3],dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((point[0]-a[0])*dx+(point[1]-a[1])*dy)/(dx*dx+dy*dy))),q=[a[0]+dx*t,a[1]+dy*t],d=Math.hypot(q[0]-point[0],q[1]-point[1]);if(d<distance){distance=d;closest=q;}}
 if(distance>padding)continue;
 // At most one texel inward protects sampler seams; visible interior alpha
 // remains the exact union of source samples and is never dilated.
 const inward=[centre[0]-closest[0],centre[1]-closest[1]],length=Math.hypot(...inward),step=Math.min(1,length);
 const sx=Math.max(bx-padding,Math.min(bx-padding+width-1,Math.floor(closest[0]+inward[0]*step/Math.max(length,1e-12)))),sy=Math.max(by-padding,Math.min(by-padding+height-1,Math.floor(closest[1]+inward[1]*step/Math.max(length,1e-12))));
 alpha[y*atlasSize+x]=alpha[sy*atlasSize+sx];
}}
const fullSubstrateTriangles=positions.length/9;
if(pruneTransparent){
 const keptPositions=[],keptNormals=[],keptUV=[],guard=2;
 for(let triangle=0;triangle<fullSubstrateTriangles;triangle++){
  const corners=[0,1,2].map(k=>[uv[triangle*6+k*2]*atlasSize,uv[triangle*6+k*2+1]*atlasSize]);
  const visible=hasAtlasCoverage(corners,alpha,atlasSize,guard);
  if(visible){keptPositions.push(...positions.slice(triangle*9,triangle*9+9));keptNormals.push(...normals.slice(triangle*9,triangle*9+9));keptUV.push(...uv.slice(triangle*6,triangle*6+6));}
 }
 positions.splice(0,positions.length,...keptPositions);normals.splice(0,normals.length,...keptNormals);uv.splice(0,uv.length,...keptUV);
}
function crc32(bytes){let crc=0xffffffff;for(const b of bytes){crc^=b;for(let k=0;k<8;k++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^0xffffffff)>>>0;}
function pngChunk(type,data){const name=Buffer.from(type),size=Buffer.alloc(4),crc=Buffer.alloc(4);size.writeUInt32BE(data.length);crc.writeUInt32BE(crc32(Buffer.concat([name,data])));return Buffer.concat([size,name,data,crc]);}
const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(atlasSize);ihdr.writeUInt32BE(atlasSize,4);ihdr[8]=8;ihdr[9]=6;
const scan=Buffer.alloc(atlasSize*(1+atlasSize*4));for(let y=0;y<atlasSize;y++)for(let x=0;x<atlasSize;x++){const start=y*(1+atlasSize*4)+1+x*4;scan[start]=scan[start+1]=scan[start+2]=255;scan[start+3]=alpha[y*atlasSize+x];}
const png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),pngChunk('IHDR',ihdr),pngChunk('IDAT',deflateSync(scan,{level:9})),pngChunk('IEND',Buffer.alloc(0))]);
const pos=Buffer.from(new Float32Array(positions).buffer),norm=Buffer.from(new Float32Array(normals).buffer),coords=Buffer.from(new Float32Array(uv).buffer),parts=[pos,norm,coords,png],views=[];let binLength=0;
for(const part of parts){views.push({buffer:0,byteOffset:binLength,byteLength:part.length});binLength+=part.length+(4-part.length%4)%4;}
const binary=Buffer.concat(parts.flatMap(part=>[part,Buffer.alloc((4-part.length%4)%4)])),box=new Box3();for(let i=0;i<positions.length;i+=3)box.expandByPoint(new Vector3(...positions.slice(i,i+3)));
const json={asset:{version:'2.0',generator:'Pillagers measured source coverage on canonical fit cage'},scene:0,scenes:[{nodes:[0]}],nodes:[{mesh:0,name:moduleName}],meshes:[{name:moduleName,primitives:[{attributes:{POSITION:0,NORMAL:1,TEXCOORD_0:2},material:0}]}],materials:[{name:'Profile tint / source coverage',alphaMode:'MASK',alphaCutoff:.5,pbrMetallicRoughness:{baseColorFactor:[1,1,1,1],baseColorTexture:{index:0},metallicFactor:0,roughnessFactor:1}}],textures:[{sampler:0,source:0}],images:[{bufferView:3,mimeType:'image/png'}],samplers:[{magFilter:9729,minFilter:9987,wrapS:33071,wrapT:33071}],buffers:[{byteLength:binary.length}],bufferViews:views,accessors:[{bufferView:0,componentType:5126,count:positions.length/3,type:'VEC3',min:box.min.toArray(),max:box.max.toArray()},{bufferView:1,componentType:5126,count:normals.length/3,type:'VEC3'},{bufferView:2,componentType:5126,count:uv.length/2,type:'VEC2'}]};
const text=Buffer.from(JSON.stringify(json)),padded=Buffer.concat([text,Buffer.alloc((4-text.length%4)%4,32)]),header=Buffer.alloc(20),binHeader=Buffer.alloc(8);header.writeUInt32LE(0x46546c67);header.writeUInt32LE(2,4);header.writeUInt32LE(28+padded.length+binary.length,8);header.writeUInt32LE(padded.length,12);header.writeUInt32LE(0x4e4f534a,16);binHeader.writeUInt32LE(binary.length);binHeader.writeUInt32LE(0x004e4942,4);
mkdirSync(dirname(output),{recursive:true});writeFileSync(output,Buffer.concat([header,padded,binHeader,binary]));writeFileSync(output.replace('.glb','.coverage.png'),png);
const provenance={reviewRequired:true,style,lod,source,sourceSha256:input.sha256,sourceProvenance:JSON.parse(readFileSync(source.replace('.glb','.provenance.json'),'utf8')),outputSha256:sha(readFileSync(output)),bodyContactAuthority:{path:bodyPath,sha256:body.sha256,selection:`actual CharacterFitSystem HEAD_CAGE, Golden neutral bind, LOD${bodyLOD}`,originalBounds:{min:originalBounds.min.toArray(),max:originalBounds.max.toArray()}},fit:{authoringFrame:'canonical',canonicalHeadSize:canonicalSize.toArray(),projection:'shell',attachmentBand:{minimumY:null,maximumY:null},subdivisions:0,clearance:.003},geometryOptimization:{method:'Rasterize original source triangle angular coverage onto the actual closed faceted HEAD_CAGE, preserving source mask instead of tessellating colour pixels',sourceTriangles:cones.length,outputTriangles:positions.length/9,materials:1,contactRadialOffsetMetres:offset,atlasSize,samplesPerTexel:4,maskRGB:'white; DNA material supplies profile colour',alphaMode:'MASK',alphaCutoff:.5,contourRedrawn:false,interiorMaskDilationPixels:0,chartPaddingPixels:padding,maximumMetresPerTexel:Math.max(...facets.map(f=>f.metresPerAtlasPixel)),facets}};
provenance.geometryOptimization.commonAngularRefinement=refinementLayers.map(({lod,path,sha256,cones})=>({lod,path,sha256,facets:cones.length}));
provenance.geometryOptimization.transparentGeometryPruning={enabled:pruneTransparent,fullSubstrateTriangles,removedTriangles:fullSubstrateTriangles-positions.length/9,guardTexels:2,policy:'omit only triangles whose projected atlas neighborhood has no positive source alpha'};
writeFileSync(output.replace('.glb','.provenance.json'),JSON.stringify(provenance,null,2)+'\n');return {output,sha256:provenance.outputSha256,triangles:positions.length/9,sourceTriangles:cones.length,facets:hull.faces.length,refinement:provenance.geometryOptimization.commonAngularRefinement,atlasSize,maskBytes:png.length,maximumMetresPerTexel:provenance.geometryOptimization.maximumMetresPerTexel};
}
