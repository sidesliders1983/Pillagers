import {mkdir,readFile,writeFile,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import sharp from 'sharp';
import {loadTypeScript} from './load-typescript.mjs';
const {groundTreatmentConfig:config}=loadTypeScript(new URL('../src/config/GroundTreatmentConfig.ts',import.meta.url));
const {groundTreatment}=loadTypeScript(new URL('../src/world/GroundTreatment.ts',import.meta.url));
const {heightAt,shoreAt}=loadTypeScript(new URL('../src/world/Terrain.ts',import.meta.url));
const sourceRoot=process.argv[2]||'scratch/ground-source',output='public/ground-materials/v02';
const digest=b=>createHash('sha256').update(b).digest('hex');
const assets=await Promise.all(['Ground037','Ground054'].map(async id=>{
 const archive=await readFile(join(sourceRoot,id+'_1K-PNG.zip'));
 const maps={};for(const kind of ['NormalGL','Roughness']){const file=id+'_1K-PNG_'+kind+'.png',path=join(sourceRoot,id,file);const original=await readFile(path);const {data,info}=await sharp(original).resize(256,256).removeAlpha().raw({depth:'uchar'}).toBuffer({resolveWithObject:true});maps[kind]={data,info,file,sha256:digest(original)};}
 return {id,archiveSha256:digest(archive),maps};
}));
const rockMaps={};for(const [kind,file] of [['NormalGL','mossy_rock_nor_gl_1k.png'],['Roughness','mossy_rock_rough_1k.png']]){const original=await readFile(join(sourceRoot,file));const {data,info}=await sharp(original).resize(256,256).removeAlpha().raw({depth:'uchar'}).toBuffer({resolveWithObject:true});rockMaps[kind]={data,info,file,sha256:digest(original)};}
assets.push({id:'mossy_rock',archiveSha256:null,maps:rockMaps});
const sampleFields=groundTreatment(heightAt,shoreAt,config.seed),grid=config.signalGrid,fields=new Float32Array(grid*grid*3);
for(let y=0;y<grid;y++)for(let x=0;x<grid;x++){const f=sampleFields(-58+x/(grid-1)*116,62-y/(grid-1)*80);fields[(y*grid+x)*3]=Math.max(f.shore,f.worn*.7);fields[(y*grid+x)*3+1]=1-f.worn*.45-f.wet*.15;fields[(y*grid+x)*3+2]=f.rock;}
const field=(u,v,c)=>{const gx=u*(grid-1),gy=v*(grid-1),x=Math.min(grid-2,Math.floor(gx)),y=Math.min(grid-2,Math.floor(gy)),a=gx-x,b=gy-y;return fields[(y*grid+x)*3+c]*(1-a)*(1-b)+fields[(y*grid+x+1)*3+c]*a*(1-b)+fields[((y+1)*grid+x)*3+c]*(1-a)*b+fields[((y+1)*grid+x+1)*3+c]*a*b;};
const pixel=(map,x,z,c)=>{const frac=v=>v-Math.floor(v);const px=Math.floor(frac(x/config.textureMeters)*256),py=Math.floor(frac(-z/config.textureMeters)*256);return map.data[(py*256+px)*map.info.channels+Math.min(c,map.info.channels-1)]/255;};
const size=config.atlasSize,normal=new Uint8Array(size*size*3),roughness=new Uint8Array(size*size*3);
for(let y=0;y<size;y++)for(let x=0;x<size;x++){
 const u=(x+.5)/size,v=(y+.5)/size,wx=-58+u*116,wz=62-v*80,mix=field(u,v,0),strength=field(u,v,1),rock=field(u,v,2),i=(y*size+x)*3;
 const n=[];for(let c=0;c<3;c++)n[c]=((pixel(assets[0].maps.NormalGL,wx,wz,c)*(1-mix)+pixel(assets[1].maps.NormalGL,wx,wz,c)*mix)*(1-rock)+pixel(assets[2].maps.NormalGL,wx,wz,c)*rock)*2-1;
 n[0]*=strength;n[1]*=strength;const length=Math.hypot(...n)||1;for(let c=0;c<3;c++)normal[i+c]=Math.round((n[c]/length*.5+.5)*255);
 // Restrained roughness variation, with native material roughness=1. No displacement/albedo.
 const r=.84+.16*((pixel(assets[0].maps.Roughness,wx,wz,0)*(1-mix)+pixel(assets[1].maps.Roughness,wx,wz,0)*mix)*(1-rock)+pixel(assets[2].maps.Roughness,wx,wz,0)*rock);roughness[i]=roughness[i+1]=roughness[i+2]=Math.round(r*255);
}
await mkdir(output,{recursive:true});
const delivery=[];for(const [name,data] of [['normal',normal],['roughness',roughness]]){const path=join(output,name+'.png');await sharp(data,{raw:{width:size,height:size,channels:3}}).png({compressionLevel:9}).toFile(path);const bytes=await readFile(path);delivery.push({file:name+'.png',bytes:(await stat(path)).size,sha256:digest(bytes),width:size,height:size,colorSpace:'NoColorSpace'});}
const manifest={version:config.version,seed:config.seed,configSha256:digest(Buffer.from(JSON.stringify(config))),generatedWith:'sharp 0.35.5; scripts/prepare-ground-materials.mjs',license:'CC0-1.0',licenseUrl:'https://docs.ambientcg.com/license/',terrainBounds:{minX:-58,maxX:58,minZ:-18,maxZ:62},sourceAssets:assets.map(({id,archiveSha256,maps})=>({id,url:id==='mossy_rock'?'https://polyhaven.com/a/mossy_rock':'https://ambientcg.com/view?id='+id,download:id==='mossy_rock'?'https://api.polyhaven.com/files/mossy_rock':'https://ambientcg.com/get?file='+id+'_1K-PNG.zip',licenseUrl:id==='mossy_rock'?'https://polyhaven.com/license':'https://docs.ambientcg.com/license/',archiveSha256,maps:Object.values(maps).map(({file,sha256})=>({file,sha256})),used:['OpenGL normals','roughness'],notUsed:['albedo','displacement','ambient occlusion']})),delivery};
await writeFile(join(output,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');console.log(JSON.stringify({sources:assets.map(a=>a.id),delivery},null,2));
