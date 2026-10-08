import {NodeIO} from '@gltf-transform/core';
import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';import {createHash} from 'node:crypto';import {join} from 'node:path';
export async function prepareNature(sourceRoot){
 if(!sourceRoot)throw Error('Usage: node scripts/asset-pipeline.mjs nature <extracted official pack root>');
 const lock=JSON.parse(await readFile('docs/references/environment/kaykit-source-lock.json','utf8')),sha=b=>createHash('sha256').update(b).digest('hex');
 for(const f of [lock.atlas,lock.licenseFile,...lock.assets.flatMap(a=>a.sourceFiles)])if(sha(await readFile(join(sourceRoot,f.path)))!==f.sha256)throw Error('Source does not match file lock: '+f.path);
 const output='public/nature/kaykit-v1';await mkdir(output,{recursive:true});await copyFile(join(sourceRoot,lock.atlas.path),output+'/forest_texture.png');await copyFile(join(sourceRoot,lock.licenseFile.path),output+'/License.txt');
 const io=new NodeIO(),assets={};for(const a of lock.assets){const d=await io.read(join(sourceRoot,a.sourceFiles[0].path));
 // glTF JSON+BIN publication retains every accessor/node and shares one original atlas.
 const {json,resources}=await io.writeJSON(d,{format:'gltf'});for(const image of json.images||[])image.uri='forest_texture.png';
 const file=a.id+'.gltf';for(const buffer of json.buffers||[]){const original=buffer.uri;buffer.uri=a.id+'.bin';await writeFile(output+'/'+buffer.uri,resources[original]);}
 await writeFile(output+'/'+file,JSON.stringify(json));
 const glb=await io.writeBinary(d);await writeFile(output+'/'+a.id+'.glb',glb);
 const bytes=await readFile(output+'/'+file);assets[a.id]={file,sha256:sha(bytes),binary:{file:a.id+'.bin',sha256:sha(await readFile(output+'/'+a.id+'.bin'))},convertedGLB:{file:a.id+'.glb',sha256:sha(glb),bytes:glb.length},sourceFiles:a.sourceFiles,sourceAtlas:lock.atlas,transforms:a.transforms};
 }
 await writeFile(output+'/manifest.json',JSON.stringify({schemaVersion:1,pack:lock.pack,sourceUrl:lock.sourceUrl,archiveSha256:lock.archiveSha256,license:lock.license,atlas:lock.atlas,conversion:'@gltf-transform/core 4.2.1 container conversion only; geometry, UVs, node transforms and original atlas unchanged; shared glTF atlas at runtime; embedded GLB audit copies',assets},null,2)+'\n');console.log('Published '+Object.keys(assets).length+' exact KayKit models to '+output);
}
