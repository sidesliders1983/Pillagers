import {readFile,writeFile} from 'node:fs/promises';import {createHash} from 'node:crypto';import sharp from 'sharp';
const root='public/ground-materials/v04',m=JSON.parse(await readFile(root+'/manifest.json','utf8')),digest=b=>createHash('sha256').update(b).digest('hex'),hashes=[];
for(const d of m.delivery){const b=await readFile(root+'/'+d.file);if(digest(b)!==d.sha256)throw Error('Delivery hash mismatch '+d.file);hashes.push(d.file);}
for(const source of m.sourceAssets)for(const map of source.maps){const b=await readFile('scratch/ground-source/'+map.file);if(digest(b)!==map.sha256)throw Error('Source hash mismatch '+map.file);}
const seams=[];
for(const tier of ['standard','low'])for(const role of ['colour','normal','roughness']){
 const {size,gutter}=m.config.tiers[tier],images=new Map();for(const r of m.regions)images.set(r.id,(await sharp(root+'/'+tier+'/'+r.id+'-'+role+'.webp').removeAlpha().raw().toBuffer()));
 let max=0,sum=0,count=0;
 const compare=(a,b,x,y,vertical)=>{const sample=(data,coord,along)=>{const i0=(vertical?(along*size+coord):(coord*size+along))*3,i1=(vertical?(along*size+coord+1):((coord+1)*size+along))*3;return [0,1,2].map(c=>(data[i0+c]+data[i1+c])/2);};for(let along=gutter;along<size-gutter;along++){const aa=sample(a,x,along),bb=sample(b,y,along);for(let c=0;c<3;c++){const delta=Math.abs(aa[c]-bb[c]);max=Math.max(max,delta);sum+=delta*delta;count++;}}};
 for(let col=0;col<4;col++)for(let row=0;row<3;row++){const a=images.get(col+'-'+row);if(col<3)compare(a,images.get((col+1)+'-'+row),size-gutter-1,gutter-1,true);if(row<2)compare(a,images.get(col+'-'+(row+1)),gutter-1,size-gutter-1,false);}
 seams.push({tier,role,samples:count,maxCodeDifference:max,rmsCodeDifference:Math.sqrt(sum/count)});
}
const tiers=Object.fromEntries(['standard','low'].map(t=>[t,{deliveryBytes:m.delivery.filter(d=>d.tier===t).reduce((s,d)=>s+d.bytes,0),runtimeDeliveryBytes:m.delivery.filter(d=>d.tier===t&&(t!=='low'||d.role!=='normal')).reduce((s,d)=>s+d.bytes,0),runtimeLayers:t==='low'?['colour','roughness']:['colour','normal','roughness'],textureRGBA8WithMipUpperBoundBytes:12*(t==='low'?2:3)*m.config.tiers[t].size**2*4*4/3,texelsPerMeter:m.delivery.find(d=>d.tier===t).texelsPerMeter}]));
await writeFile('docs/qa/ground-v04/material-audit.json',JSON.stringify({verifiedDeliveryFiles:hashes.length,verifiedSources:12,configSha256:m.configSha256,tiers,seams,note:'Boundary bilinear samples in encoded maps; hardware mip/anisotropic appearance still requires capture inspection. Memory is an RGBA8 + mip upper bound, not measured VRAM.'},null,2)+'\n');console.log({tiers,seams});
