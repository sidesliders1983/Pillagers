// Test-only source/fit diagnosis. Body hiding and DoubleSide never enter Lab.
import {createRequire} from 'node:module';
import {mkdirSync,writeFileSync,readFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE??'playwright');
const readJSON=path=>JSON.parse(readFileSync(path,'utf8').replace(/^\uFEFF/,''));
const output=process.env.REVIEW_OUTPUT??'artifacts/appearance-pass/agent-d/module-surface-diagnostic';mkdirSync(output,{recursive:true});
const ids=(process.env.REVIEW_FILTER??'hair/bun,hair/braid').split(','),root=process.env.REVIEW_CANDIDATES,candidateMap=process.env.REVIEW_CANDIDATE_MAP?readJSON(process.env.REVIEW_CANDIDATE_MAP):{},ratios=(process.env.REVIEW_RATIOS??'1').split(',').map(Number),profile=process.env.REVIEW_PROFILE??'golden_neutral_01',report={timestamp:new Date().toISOString(),checks:[],errors:[],loaded:[]};
const browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-webgl']});
try{
 const page=await browser.newPage({viewport:{width:640,height:720}});page.setDefaultTimeout(120000);await page.routeWebSocket('**/*',socket=>socket.onMessage(()=>{}));page.on('pageerror',e=>report.errors.push(e.message));
 page.on('response',async response=>{const path=new URL(response.url()).pathname;if(!path.endsWith('.glb')&&!path.startsWith('/src/'))return;const bytes=await response.body();report.loaded.push({url:response.url(),sha256:createHash('sha256').update(bytes).digest('hex')});});
 if(root||process.env.REVIEW_CANDIDATE_MAP)await page.route(/\/(appearance|clothing)\/.*\.glb/,route=>{const parts=new URL(route.request().url()).pathname.split('/'),kind=parts[1]==='clothing'?'garment':parts[2]==='beards'?'beard':'hair',id=`${kind}/${parts.at(-2)}`,file=candidateMap[id]??`${root}/${id}/${parts.at(-1)}`;if(!existsSync(file)){report.errors.push(`Required candidate missing: ${file}`);return route.abort('failed');}return route.fulfill({body:readFileSync(file),contentType:'model/gltf-binary'});});
 await page.goto('http://127.0.0.1:4176/scripts/qa/appearance-review.html');await page.waitForFunction(()=>window.ready);await page.evaluate(ids=>window.review.overrideFrames(ids,'canonical'),ids);
 if(process.env.REVIEW_METADATA_JSON)await page.evaluate(patches=>window.review.overrideMetadata(patches),readJSON(process.env.REVIEW_METADATA_JSON));
 for(const id of ids)for(const ratio of ratios)for(const doubleSided of [false,true]){
  const start=await page.evaluate(args=>window.review.load(...args),[id,profile,2,ratio]);await page.evaluate(doubleSided=>window.review.moduleDiagnostic({hideBody:true,doubleSided,neutral:true}),doubleSided);
  for(const angle of (process.env.REVIEW_ANGLES?.split(',')??['front','side','back','top'])){const result=await page.evaluate(angle=>window.review.sample(angle,'Idle',0),angle),screenshot=`${output}/${id.replace('/','-')}-ratio${ratio}-${doubleSided?'DoubleSide':'FrontSide'}-${angle}.png`;await page.screenshot({path:screenshot});report.checks.push({id,profile,ratio,doubleSided,angle,effectiveMetadata:start.effectiveMetadata,...result,screenshot});}
 }
 writeFileSync(`${output}/report.json`,JSON.stringify(report,null,2));console.log(JSON.stringify({captures:report.checks.length,errors:report.errors}));
}catch(error){report.errors.push(error.message);writeFileSync(`${output}/report.json`,JSON.stringify(report,null,2));throw error;}finally{await browser.close();}
