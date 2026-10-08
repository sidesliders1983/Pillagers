// QA only: compare an immutable fitted module with the complete bare body from
// precisely the same camera/pose. Visibility changes do not modify geometry.
import {createRequire} from 'node:module';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE??'playwright');
const readJSON=p=>JSON.parse(readFileSync(p,'utf8').replace(/^\uFEFF/,''));
const id=process.env.REVIEW_FILTER,file=process.env.REVIEW_CANDIDATE_MAP?readJSON(process.env.REVIEW_CANDIDATE_MAP)[id]:null;
if(!id||!file||!existsSync(file))throw new Error('One explicit immutable candidate id/path is required; no fallback');
const bytes=readFileSync(file),hash=b=>createHash('sha256').update(b).digest('hex'),candidateSHA256=hash(bytes);
const output=process.env.REVIEW_OUTPUT??'artifacts/appearance-pass/agent-d/module-contact';mkdirSync(output,{recursive:true});
const report={timestamp:new Date().toISOString(),id,file,candidateSHA256,checks:[],loaded:[],errors:[],geometryMutated:false,visualApproval:'pending independent inspection'};
const browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-webgl']});
try{
 const page=await browser.newPage({viewport:{width:640,height:720}});page.setDefaultTimeout(120000);await page.routeWebSocket('**/*',socket=>socket.onMessage(()=>{}));
 page.on('pageerror',e=>report.errors.push(e.message));
 page.on('response',async response=>{const p=new URL(response.url()).pathname;if(!p.endsWith('.glb')&&!p.startsWith('/src/')&&!p.startsWith('/scripts/qa/'))return;try{const b=await response.body();report.loaded.push({url:response.url(),sha256:hash(b)});}catch(e){report.errors.push(e.message);}});
 await page.route(/\/(appearance|clothing)\/.*\.glb/,route=>{const p=new URL(route.request().url()).pathname.split('/'),kind=p[1]==='clothing'?'garment':p[2]==='beards'?'beard':'hair';if(`${kind}/${p.at(-2)}`!==id){report.errors.push('Unexpected candidate request');return route.abort('failed');}return route.fulfill({body:bytes,contentType:'model/gltf-binary'});});
 await page.goto('http://127.0.0.1:4176/scripts/qa/appearance-review.html');await page.waitForFunction(()=>window.ready);
 await page.evaluate(id=>window.review.overrideFrames([id],'canonical'),id);
 if(process.env.REVIEW_METADATA_JSON)await page.evaluate(meta=>window.review.overrideMetadata(meta),readJSON(process.env.REVIEW_METADATA_JSON));
 for(const lod of (process.env.REVIEW_LODS??'0,1,2').split(',').map(Number)){
  const start=await page.evaluate(args=>window.review.load(...args),[id,process.env.REVIEW_PROFILE??'golden_neutral_01',lod,Number(process.env.REVIEW_RATIOS??1)]);
  for(const angle of (process.env.REVIEW_ANGLES??'front,side,opposite,underside').split(','))for(const bodyOnly of [false,true]){
   const result=await page.evaluate(args=>{window.review.human.fit.modules.get(args.id).object.visible=!args.bodyOnly;return window.review.sample(args.angle,'Idle',0);},{id,angle,bodyOnly});
   const screenshot=`${output}/LOD${lod}-${angle}-${bodyOnly?'body-only':'with-module'}.png`;await page.screenshot({path:screenshot});report.checks.push({id,lod,angle,bodyOnly,screenshot,...result,effectiveMetadata:start.effectiveMetadata});
  }
 }
 if(hash(readFileSync(file))!==candidateSHA256)throw new Error('Candidate changed during diagnostic');
 const actual=report.loaded.filter(v=>/\/(appearance|clothing)\//.test(v.url)&&v.url.includes('.glb'));
 if(!actual.length||actual.some(v=>v.sha256!==candidateSHA256))throw new Error('Actual candidate byte proof failed');
 if(report.errors.length)throw new Error('Browser errors');
 writeFileSync(`${output}/report.json`,JSON.stringify(report,null,2));console.log(JSON.stringify({captures:report.checks.length,candidateSHA256,errors:report.errors}));
}catch(e){report.errors.push(e.message);writeFileSync(`${output}/report.json`,JSON.stringify(report,null,2));throw e;}finally{await browser.close();}
