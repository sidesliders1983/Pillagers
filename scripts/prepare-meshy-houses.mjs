import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS,EXTTextureWebP} from '@gltf-transform/extensions';
import {dedup,prune,meshopt,getBounds,simplify,weld} from '@gltf-transform/functions';
import {MeshoptEncoder,MeshoptDecoder,MeshoptSimplifier} from 'meshoptimizer';
import sharp from 'sharp';
import {readFile,writeFile,mkdir,copyFile,access} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {createHash} from 'node:crypto';
const sourceRoot=resolve(process.argv[2]??'C:/Users/Devoteam/iCloudDrive/Pillagers/Houses');
const output=resolve('public/game-assets/houses');await mkdir(output,{recursive:true});
await Promise.all([MeshoptEncoder.ready,MeshoptDecoder.ready,MeshoptSimplifier.ready]);
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.encoder':MeshoptEncoder,'meshopt.decoder':MeshoptDecoder});
const sources={greatHall:'Standard/GreatHouse/house-greathouse.glb',hut:'Standard/Hut/house-hut.glb',homestead:'Standard/Homestead/house-homestead.glb',longhouse:'Standard/LongHouse/house-longhouse.glb',farmHut:'Farmyard/Hut/farm-hut.glb',farmHomestead:'Farmyard/Homestead/farm-homestead.glb',farmHutTerrain:'Farmyard/Hut/farm-hut-terrain.glb',farmHomesteadTerrain:'Farmyard/Homestead/farm-homestead-terrain.glb'};
const assets={};
for(const [key,relative] of Object.entries(sources)){
 let path=resolve(sourceRoot,relative);try{await access(path);}catch(error){path=resolve('Assets/Houses',relative);try{await access(path);}catch{if(key==='farmHomesteadTerrain')continue;throw error;}}
 const bytes=await readFile(path);const local=resolve('Assets/Houses',relative);await mkdir(dirname(local),{recursive:true});if(path!==local)await copyFile(path,local);
 if(process.env.HOUSING_ASSET_ONLY && process.env.HOUSING_ASSET_ONLY!==key){const previous=JSON.parse(await readFile(resolve(output,'manifest.json'),'utf8'));assets[key]=previous.assets[key];continue;}
 const doc=await io.read(path),bounds=getBounds(doc.getRoot().listScenes()[0]);
 doc.createExtension(EXTTextureWebP).setRequired(true);
 const exactMaps=new Set(doc.getRoot().listMaterials().flatMap(m=>[m.getNormalTexture(),m.getMetallicRoughnessTexture(),m.getOcclusionTexture()].filter(Boolean)));
 for(const texture of doc.getRoot().listTextures()){
  const image=sharp(texture.getImage()).resize({width:1024,height:1024,fit:'inside',withoutEnlargement:true});
  const data=await image.webp(exactMaps.has(texture)?{lossless:true,effort:4}:{quality:85,alphaQuality:100,effort:4}).toBuffer();
  texture.setImage(data).setMimeType('image/webp');
 }
 const triangleCount=doc.getRoot().listMeshes().reduce((s,m)=>s+m.listPrimitives().reduce((n,p)=>n+(p.getIndices()?.getCount()??p.getAttribute('POSITION').getCount())/3,0),0);
 if(triangleCount>20000)await doc.transform(weld(),simplify({simplifier:MeshoptSimplifier,ratio:20000/triangleCount,error:.005,lockBorder:false}));
 await doc.transform(dedup(),prune(),meshopt({encoder:MeshoptEncoder,level:'medium'}));
 const result=await io.writeBinary(doc),file=relative.split('/').at(-1);await writeFile(resolve(output,file),result);
 assets[key]={file,source:'Assets/Houses/'+relative,sourceBytes:bytes.length,textureLimit:1024,sourceTriangles:triangleCount,sourceSha256:createHash('sha256').update(bytes).digest('hex'),bytes:result.length,bounds,triangles:doc.getRoot().listMeshes().reduce((s,m)=>s+m.listPrimitives().reduce((n,p)=>n+(p.getIndices()?.getCount()??p.getAttribute('POSITION').getCount())/3,0),0)};
}
await writeFile(resolve(output,'manifest.json'),JSON.stringify({schemaVersion:1,assets},null,2)+'\n');console.log(JSON.stringify(assets,null,2));

