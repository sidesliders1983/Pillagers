import sharp from 'sharp';
import {readFileSync,writeFileSync,mkdirSync,copyFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
const root=resolve('public/sprites'), supplied=JSON.parse(readFileSync(process.argv[2],'utf8'));
const input=supplied.records?Object.fromEntries(supplied.records.map(r=>[r.id,{...r,source:resolve(root,r.source)}])):supplied;
const contract=JSON.parse(readFileSync('scripts/sprites/contract.json','utf8'));
mkdirSync(root+'/imagegen-source',{recursive:true});
const records=[];
for(const [id,record] of Object.entries(input)){
 const spec=contract.sprites.find(s=>s.id===id), original=readFileSync(record.source);
 if(resolve(record.source)!==resolve(root+'/imagegen-source/'+id+'.png'))copyFileSync(record.source,root+'/imagegen-source/'+id+'.png');
 const {data,info}=await sharp(original).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 let left=info.width,top=info.height,right=0,bottom=0,transparent=0;
 for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++){
  const alpha=data[(y*info.width+x)*4+3];if(alpha===0)transparent++;
  if(alpha>16){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
 }
 if(!transparent||left>right)throw new Error(id+': invalid alpha cutout');
 const height=Math.round(spec.height*contract.pixelsPerMeter*(id==='tent'?1.25:Math.sqrt(2/3)));
 const crop=await sharp(original).extract({left,top,width:right-left+1,height:bottom-top+1}).resize({height}).png().toBuffer();
 const dimensions=await sharp(crop).metadata();
 const output=await sharp({create:{width:spec.size,height:spec.size,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite([{input:crop,left:Math.round((spec.size-dimensions.width)/2),top:Math.round(spec.size/2-height)}]).png().toBuffer();
 writeFileSync(root+'/'+id+'.png',output);
 records.push({id,...record,source:'imagegen-source/'+id+'.png',sourceSha256:createHash('sha256').update(original).digest('hex'),outputSha256:createHash('sha256').update(output).digest('hex'),tool:'built-in image_gen',camera:'prompted isometric approximation',review:'temporary 2D proxy; broad facets and palette inspected; not a Character Lab certified asset'});
}
writeFileSync(root+'/imagegen-manifest.json',JSON.stringify({styleGuide:'docs/PILLAGERS-LOW-POLY-STYLE-GUIDE.md',styleVersion:'pillagers-character-style/0.4-draft.1',records},null,2));
console.log('Packed '+records.length+' ImageGen sprites');
