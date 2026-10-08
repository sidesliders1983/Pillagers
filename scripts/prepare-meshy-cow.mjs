import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS,EXTTextureWebP} from '@gltf-transform/extensions';
import {dedup,prune,resample,meshopt} from '@gltf-transform/functions';
import {MeshoptEncoder,MeshoptDecoder} from 'meshoptimizer';
import sharp from 'sharp';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {createHash} from 'node:crypto';

const configs=JSON.parse((await readFile(new URL('./cattle-rigs.json',import.meta.url),'utf8')).replace(/^\uFEFF/,''));
const args=process.argv.slice(2),flag=args.indexOf('--variant');
if(flag>=0&&!configs[args[flag+1]])throw Error('Select a configured cattle variant');
const variants=flag<0?Object.keys(configs):[args[flag+1]];
const expected=['Graze','HumanInteraction','Idle','Walk'];
const hash=data=>createHash('sha256').update(data).digest('hex');
await Promise.all([MeshoptEncoder.ready,MeshoptDecoder.ready]);
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
 'meshopt.encoder':MeshoptEncoder,'meshopt.decoder':MeshoptDecoder});
const triangles=d=>d.getRoot().listMeshes().reduce((sum,m)=>sum+m.listPrimitives().reduce((s,p)=>
 s+(p.getIndices()?.getCount()??p.getAttribute('POSITION').getCount())/3,0),0);
for(const variant of variants){
 const c=configs[variant],sourceRelative='Assets/Characters/Cow/'+c.source;
 const sourceDirectory=resolve(dirname(sourceRelative),'Animations'),output=resolve('public/game-assets/cattle',variant);
 const source=resolve(sourceDirectory,c.stem+'-animated.glb');
 const authoring=JSON.parse(await readFile(resolve(sourceDirectory,'authoring.json'),'utf8'));
 if(hash(await readFile(sourceRelative))!==authoring.sourceSha256)throw Error('Original cow source changed: '+variant);
 function verify(d){
  if(d.getRoot().listScenes().length!==1||d.getRoot().listMeshes().length!==1)throw Error('Export must contain only the cow');
  if(d.getRoot().listSkins().length!==1||d.getRoot().listSkins()[0].listJoints().length!==c.bones)throw Error('Cow rig changed: '+variant);
  if(triangles(d)!==c.triangles)throw Error('Source geometry changed: '+variant);
  if(JSON.stringify(d.getRoot().listAnimations().map(a=>a.getName()).sort())!==JSON.stringify(expected))throw Error('Expected four cattle animations');
  for(const animation of d.getRoot().listAnimations()){
   const duration=Math.max(...animation.listSamplers().map(s=>s.getInput().getMax([])[0]));
   if(Math.abs(duration-authoring.clips[animation.getName()].duration)>0.001)throw Error('Animation duration changed');
   for(const sampler of animation.listSamplers()){
    const output=sampler.getOutput(),array=output.getArray(),width=output.getElementSize();
    if(!array.every(Number.isFinite))throw Error('Non-finite animation output');
    for(let k=0;k<width;k++)if(Math.abs(array[k]-array[array.length-width+k])>1e-4)throw Error('Loop seam: '+variant+' '+animation.getName());
   }
  }
 }
 const original=await readFile(source),doc=await io.readBinary(original);verify(doc);
 doc.createExtension(EXTTextureWebP).setRequired(true);
 const normals=new Set(doc.getRoot().listMaterials().map(m=>m.getNormalTexture()).filter(Boolean));
 const exact=new Set(doc.getRoot().listMaterials().flatMap(m=>
  [m.getNormalTexture(),m.getMetallicRoughnessTexture(),m.getOcclusionTexture()].filter(Boolean)));
 const textures=[];
 for(const texture of doc.getRoot().listTextures()){
  const limit=normals.has(texture)?512:exact.has(texture)?256:1024;
  const image=sharp(texture.getImage()).resize({width:limit,height:limit,fit:'inside',withoutEnlargement:true});
  const bytes=await image.webp(exact.has(texture)?{lossless:true,effort:4}:{quality:88,alphaQuality:100,effort:4}).toBuffer();
  texture.setImage(bytes).setMimeType('image/webp');
  const meta=await sharp(bytes).metadata();
  textures.push({name:texture.getName(),width:meta.width,height:meta.height,bytes:bytes.length,lossless:exact.has(texture)});
 }
 await doc.transform(dedup(),resample({tolerance:1e-6}),prune(),meshopt({encoder:MeshoptEncoder,level:'medium'}));
 const bytes=await io.writeBinary(doc),checked=await io.readBinary(bytes);verify(checked);
 const manifest={schemaVersion:1,variant,label:c.label,file:c.stem+'.glb',source:sourceRelative,
  sourceSha256:authoring.sourceSha256,authoringSha256:hash(original),sha256:hash(bytes),
  authoringBytes:original.length,bytes:bytes.length,triangles:triangles(checked),joints:c.bones,
  height:authoring.height,withersHeightM:authoring.withersHeightM,sourceWithersHeightM:authoring.sourceWithersHeightM,physicalScale:authoring.physicalScale,
  walkSpeedMps:authoring.walkSpeedMps,walkCycleSeconds:authoring.walkCycleSeconds,
  clips:authoring.clips,grazing:authoring.grazing,textures,blenderVersion:authoring.blenderVersion,referenceMethod:authoring.referenceMethod};
 await mkdir(output,{recursive:true});
 const metadata=JSON.stringify(manifest,null,2)+'\n';
 await writeFile(resolve(output,manifest.file),bytes);await writeFile(resolve(output,'manifest.json'),metadata);
 await writeFile(resolve(sourceDirectory,c.stem+'-runtime.glb'),bytes);await writeFile(resolve(sourceDirectory,'runtime-manifest.json'),metadata);
 console.log(JSON.stringify({variant,bytes:bytes.length,triangles:manifest.triangles,joints:manifest.joints,withers:manifest.withersHeightM}));
}
