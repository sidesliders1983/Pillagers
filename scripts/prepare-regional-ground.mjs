import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import sharp from 'sharp';
import {loadTypeScript} from './load-typescript.mjs';
const {regionalGroundConfig:config,groundRegions}=loadTypeScript(new URL('../src/config/RegionalGroundConfig.ts',import.meta.url));
const {groundTreatment}=loadTypeScript(new URL('../src/world/GroundTreatment.ts',import.meta.url));
const {heightAt,shoreAt}=loadTypeScript(new URL('../src/world/Terrain.ts',import.meta.url));
if(process.argv.includes('--path'))config.pathCandidate=true;
const regions=process.argv.includes('--pilot')?groundRegions().filter(r=>r.id==='1-0'||r.id==='1-1'):groundRegions();
const root=process.argv[2]||'scratch/ground-source',output=process.argv[3]||'public/ground-materials/v04';
const digest=b=>createHash('sha256').update(b).digest('hex');
const sourceFiles={Ground037:['Ground037/Ground037_1K-PNG_Color.png','Ground037/Ground037_1K-PNG_NormalGL.png','Ground037/Ground037_1K-PNG_Roughness.png'],Ground054:['Ground054/Ground054_1K-PNG_Color.png','Ground054/Ground054_1K-PNG_NormalGL.png','Ground054/Ground054_1K-PNG_Roughness.png'],mossy_rock:['mossy_rock_diff_1k.jpg','mossy_rock_nor_gl_1k.png','mossy_rock_rough_1k.png'],grass_path_2:['grass_path_2_diff_1k.jpg','grass_path_2_nor_gl_1k.png','grass_path_2_rough_1k.png']};
const linear=v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4,srgb=v=>v<=.0031308?v*12.92:1.055*v**(1/2.4)-.055;
const sources=[];
for(const [id,files] of Object.entries(sourceFiles)){
 const maps=[];for(const [i,file] of files.entries()){const bytes=await readFile(join(root,file));const {data,info}=await sharp(bytes).removeAlpha().toColourspace('srgb').raw().toBuffer({resolveWithObject:true});let values=data;
 if(i===0){values=new Float32Array(data.length);const {saturation,tint}=config.sources[id];for(let j=0;j<data.length;j+=3){const a=[linear(data[j]/255),linear(data[j+1]/255),linear(data[j+2]/255)],y=a[0]*.2126+a[1]*.7152+a[2]*.0722;for(let c=0;c<3;c++)values[j+c]=(y+(a[c]-y)*saturation)*tint[c];}}
 maps.push({data:values,info,file,sourceBytes:bytes,sha256:digest(bytes),bytes:bytes.length});}
 sources.push({id,maps,repeat:config.sources[id].repeatMeters});
}
// One shared world field grid, including gutters. No per-chunk RNG or edge clamp.
const spacing=config.fieldSpacing,minX=-62,minZ=-22,width=636,depth=456,field=new Float32Array(width*depth*4),sampleField=groundTreatment(heightAt,shoreAt,config.seed);
for(let y=0;y<depth;y++)for(let x=0;x<width;x++){const f=sampleField(minX+x*spacing,minZ+y*spacing),i=(y*width+x)*4;field[i]=f.shore;field[i+1]=f.wet;field[i+2]=f.worn**1.6;field[i+3]=f.rock;}
function fields(x,z,out){const gx=(x-minX)/spacing,gz=(z-minZ)/spacing,ix=Math.floor(gx),iz=Math.floor(gz),a=gx-ix,b=gz-iz;for(let c=0;c<4;c++)out[c]=field[(iz*width+ix)*4+c]*(1-a)*(1-b)+field[(iz*width+ix+1)*4+c]*a*(1-b)+field[((iz+1)*width+ix)*4+c]*(1-a)*b+field[((iz+1)*width+ix+1)*4+c]*a*b;}
const frac=v=>v-Math.floor(v);
function pixel(map,u,v,c){const {info,data}=map,px=frac(u)*info.width,py=frac(v)*info.height,x=Math.floor(px),y=Math.floor(py),a=px-x,b=py-y,ch=Math.min(c,info.channels-1),x1=(x+1)%info.width,y1=(y+1)%info.height;return data[(y*info.width+x)*info.channels+ch]*(1-a)*(1-b)+data[(y*info.width+x1)*info.channels+ch]*a*(1-b)+data[(y1*info.width+x)*info.channels+ch]*(1-a)*b+data[(y1*info.width+x1)*info.channels+ch]*a*b;}
const manifest={version:config.version,seed:config.seed,config,configSha256:digest(Buffer.from(JSON.stringify(config))),generatedWith:'sharp 0.35.5; scripts/prepare-regional-ground.mjs',normalConvention:'OpenGL, normalized after weighted blend',geometry:'Unchanged canonical 2m alternating triangles',regions:groundRegions(),sourceAssets:sources.map(({id,maps})=>({id,url:id.startsWith('Ground')?'https://ambientcg.com/view?id='+id:'https://polyhaven.com/a/'+id,license:'CC0-1.0',licenseUrl:id.startsWith('Ground')?'https://docs.ambientcg.com/license/':'https://polyhaven.com/license',publisherPhysicalScale:'Not asserted; authored repeat scale recorded separately',repeatMeters:config.sources[id].repeatMeters,maps:maps.map(({file,sha256,bytes,info},i)=>({file,download:id.startsWith('Ground')?'https://ambientcg.com/get?file='+id+'_1K-PNG.zip':'https://dl.polyhaven.org/file/ph-assets/Textures/'+(file.endsWith('.jpg')?'jpg':'png')+'/1k/'+id+'/'+file,sha256,bytes,width:info.width,height:info.height,role:['sRGB colour','OpenGL normal','roughness'][i]}))})),delivery:[]};
await mkdir(output,{recursive:true});
for(const [tier,{size,gutter}] of Object.entries(config.tiers)){
 if(process.argv.includes('--pilot')&&tier!=='standard')continue;
 await mkdir(join(output,tier),{recursive:true});const interior=size-2*gutter;
 // Band-limit the publisher maps to this tier's local footprint before sampling.
 // 2x oversampling retains detail without aliasing the 1K source into a sparse bake.
 const filteredSources=[];
 for(const source of sources){const dimension=Math.min(1024,Math.ceil(source.repeat*Math.min(interior/config.regionWidth,interior/config.regionDepth)*config.sampling.filterOversampling)),maps=[];
  for(const [kind,map] of source.maps.entries()){let operation=sharp(map.sourceBytes).removeAlpha();if(kind===0)operation=operation.gamma(2.2);const {data,info}=await operation.resize(dimension,dimension).toColourspace('srgb').raw().toBuffer({resolveWithObject:true});let values=data;
   if(kind===0){values=new Float32Array(data.length);const {saturation,tint}=config.sources[source.id];for(let j=0;j<data.length;j+=3){const a=[linear(data[j]/255),linear(data[j+1]/255),linear(data[j+2]/255)],l=a[0]*.2126+a[1]*.7152+a[2]*.0722;for(let c=0;c<3;c++)values[j+c]=(l+(a[c]-l)*saturation)*tint[c];}}
   maps.push({data:values,info});
  }filteredSources.push({...source,maps});
 }
 for(const region of regions){
  const colour=new Uint8Array(size*size*3),normal=new Uint8Array(size*size*3),rough=new Uint8Array(size*size*3),f=[0,0,0,0];
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
   const wx=region.minX+(x+.5-gutter)/interior*config.regionWidth,wz=region.minZ+(size-y-.5-gutter)/interior*config.regionDepth;fields(wx,wz,f);
   const [shore,wet,worn,rock]=f,path=config.pathCandidate?worn*(1-shore)*(1-rock)*.8:0,weights=[(1-shore)*(1-rock)-path,shore,rock*(1-shore),path];
   const cv=[0,0,0],nv=[0,0,0];let r=0;
   for(let j=0;j<4;j++){if(weights[j]<.00001)continue;const s=filteredSources[j],warp=config.sampling.warpMeters,u=(wx+warp*Math.sin(wz*.13))/s.repeat,v=-(wz+warp*Math.sin(wx*.17))/s.repeat,angle=config.sampling.secondaryAngle,cs=Math.cos(angle),sn=Math.sin(angle),u2=(wx*cs+wz*sn+7.31)/s.repeat,v2=-(-wx*sn+wz*cs+3.17)/s.repeat,mix=config.sampling.secondaryBlend;
    const secondNormal=[0,1,2].map(c=>pixel(s.maps[1],u2,v2,c)/255*2-1),rotated=[secondNormal[0]*cs-secondNormal[1]*sn,secondNormal[0]*sn+secondNormal[1]*cs,secondNormal[2]];
    for(let c=0;c<3;c++){cv[c]+=(pixel(s.maps[0],u,v,c)*(1-mix)+pixel(s.maps[0],u2,v2,c)*mix)*weights[j];nv[c]+=((pixel(s.maps[1],u,v,c)/255*2-1)*(1-mix)+rotated[c]*mix)*weights[j];}r+=(pixel(s.maps[2],u,v,0)*(1-mix)+pixel(s.maps[2],u2,v2,0)*mix)/255*weights[j];
   }
   const i=(y*size+x)*3,len=Math.hypot(...nv)||1;
   for(let c=0;c<3;c++){colour[i+c]=Math.round(Math.max(0,Math.min(1,srgb(cv[c]*(1-wet*.28))))*255);normal[i+c]=Math.round((nv[c]/len*.5+.5)*255);rough[i+c]=Math.round((.8+.2*r)*255);}
  }
  for(const [role,data] of [['colour',colour],['normal',normal],['roughness',rough]]){const file=`${tier}/${region.id}-${role}.webp`;await sharp(data,{raw:{width:size,height:size,channels:3}}).webp(role==='normal'?{lossless:true}:{quality:90}).toFile(join(output,file));const bytes=await readFile(join(output,file));manifest.delivery.push({tier,region:region.id,role,file,bytes:bytes.length,sha256:digest(bytes),width:size,height:size,gutter,texelsPerMeter:[interior/config.regionWidth,interior/config.regionDepth],colorSpace:role==='colour'?'SRGBColorSpace':'NoColorSpace'});}
  console.log(tier+' '+region.id);
 }
}
manifest.totalBytes=manifest.delivery.reduce((s,x)=>s+x.bytes,0);await writeFile(join(output,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');console.log('Delivery bytes '+manifest.totalBytes);
