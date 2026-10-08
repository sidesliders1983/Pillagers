import {load} from './load-source.mjs';
const {referenceGarmentFrames}=load('../docs/archive/legacy-clothing/ReferenceGarmentFrames.ts');
// Technical fit contract metadata only; this does not register or publish an outfit.
export const technicalGarmentMetadata={version:'pillagers-fit/0.1',id:'garment/technical-contract',type:'garment',anchor:'socket_waist',fitCage:'TORSO_CAGE',fitMode:'drape',slot:'full',garmentFit:'regional',authoringFrame:'canonical',clearance:.025,garmentBind:referenceGarmentFrames['long-dress'],covers:[]};
export function technicalGarmentRecord(){
 const rows=[new Float32Array([0,0,0,1,0,0,0,1,0]),new Float32Array([0,0,1,0,0,1,0,0,1]),new Uint32Array([0,1,2]),new Float32Array([0,0,1,0,0,1])],chunks=rows.map(row=>Buffer.from(row.buffer));
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jKXcAAAAASUVORK5CYII=','base64');chunks.push(png);let offset=0;
 const bufferViews=chunks.map(chunk=>{const v={buffer:0,byteOffset:offset,byteLength:chunk.length};offset+=chunk.length;return v;});
 const binary=Buffer.concat(chunks),json={asset:{version:'2.0'},buffers:[{byteLength:binary.length}],bufferViews,accessors:[{bufferView:0,count:3,type:'VEC3',componentType:5126},{bufferView:1,count:3,type:'VEC3',componentType:5126},{bufferView:2,count:3,type:'SCALAR',componentType:5125},{bufferView:3,count:3,type:'VEC2',componentType:5126}],scenes:[{nodes:[0]}],nodes:[{mesh:0,extras:{garmentRegion:'cloth'}}],meshes:[{primitives:[{attributes:{POSITION:0,NORMAL:1,TEXCOORD_0:3},indices:2,material:0}]}],materials:[{pbrMetallicRoughness:{baseColorTexture:{index:0}}}],textures:[{source:0}],images:[{bufferView:4,mimeType:'image/png'}]};
 return {asset:{id:technicalGarmentMetadata.id,type:'garment',version:1,runtimeLOD:2,lods:{2:'/technical/contract.glb'},metadata:structuredClone(technicalGarmentMetadata),materialVariants:['technical'],tags:[],budgets:{triangles:{2:10},materials:1,runtimeTriangles:10}},record:{json,binary}};
}
