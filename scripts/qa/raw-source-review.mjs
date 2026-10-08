import {createRequire} from 'node:module';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
const source=process.env.REVIEW_RAW_FILE,sha=process.env.REVIEW_RAW_SHA?.toLowerCase(),triangles=Number(process.env.REVIEW_RAW_TRIANGLES);
if(!source||!existsSync(source))throw new Error('Explicit immutable REVIEW_RAW_FILE must exist; public fallback is forbidden');
if(!/^[a-f0-9]{64}$/.test(sha??'')||!Number.isInteger(triangles)||triangles<1)throw new Error('Explicit REVIEW_RAW_SHA and REVIEW_RAW_TRIANGLES required');
const bytes=readFileSync(source),hash=buffer=>createHash('sha256').update(buffer).digest('hex');
if(hash(bytes)!==sha)throw new Error(`Immutable source hash mismatch: ${hash(bytes)}`);
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE??'playwright');
const output=process.env.REVIEW_OUTPUT??'artifacts/appearance-pass/agent-d/raw-source';mkdirSync(output,{recursive:true});
const base=process.env.REVIEW_URL??'http://127.0.0.1:4176',url=`${base}/__qa_raw_source__/${sha}.glb`,report={timestamp:new Date().toISOString(),source:resolve(source),expectedSHA256:sha,expectedTriangles:triangles,sourceAxisViews:true,fitApplied:false,checks:[],errors:[],loaded:[],visualApproval:'pending independent pixel inspection'};
const browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-webgl']});let served=0,matchedResponse=0;
try{
 const page=await browser.newPage({viewport:{width:640,height:774}});page.setDefaultTimeout(120000);await page.routeWebSocket('**/*',socket=>socket.onMessage(()=>{}));
 page.on('pageerror',e=>report.errors.push(e.message));
 await page.route('**/*.glb*',route=>{if(route.request().url()!==url){report.errors.push(`Unexpected GLB URL: ${route.request().url()}`);return route.abort('failed');}served++;return route.fulfill({body:bytes,contentType:'model/gltf-binary'});});
 const responsePromise=page.waitForResponse(response=>response.url()===url).then(response=>({response}),error=>({error}));
 await page.goto(`${base}/scripts/qa/raw-source-review.html`);await page.waitForFunction(()=>window.ready);
 // Handle rejection immediately: a fast triangle mismatch can precede response
 // hashing, and must still produce a rejected-evidence report before exiting.
 const loadPromise=page.evaluate(input=>window.rawReview.load(input),{url,sha256:sha,triangles,label:process.env.REVIEW_RAW_LABEL??source}).then(proof=>({proof}),error=>({error}));
 const responseResult=await responsePromise;if(responseResult.error)throw responseResult.error;
 const response=responseResult.response,actualBytes=await response.body();
 if(!response.ok()||hash(actualBytes)!==sha)throw new Error(`Actual browser response mismatch: ${hash(actualBytes)}`);
 matchedResponse++;report.loaded.push({url,sha256:hash(actualBytes),bytes:actualBytes.length});const loadResult=await loadPromise;if(loadResult.error)throw loadResult.error;report.proof=loadResult.proof;
 if(served!==1||matchedResponse!==1||report.proof.sha256!==sha||report.proof.triangles!==triangles)throw new Error('Source evidence integrity failure');
 for(const mode of (process.env.REVIEW_RAW_MODES??'original,neutral-front,neutral-double').split(','))for(const angle of (process.env.REVIEW_ANGLES??'front,side,back,top,three,opposite').split(',')){
  const check=await page.evaluate(args=>window.rawReview.sample(...args),[angle,mode]),screenshot=`${output}/${mode}-${angle}.png`;await page.screenshot({path:screenshot});report.checks.push({...check,screenshot});
 }
 if(report.errors.length)throw new Error('Browser raw-source errors');
 if(hash(readFileSync(source))!==sha)throw new Error('Immutable source changed during capture');
 report.served=served;report.matchedResponses=matchedResponse;writeFileSync(`${output}/report.json`,JSON.stringify(report,null,2));console.log(JSON.stringify({captures:report.checks.length,sha256:sha,triangles:report.proof.triangles,served,matchedResponse}));
}catch(error){report.errors.push(error.message);report.served=served;report.matchedResponses=matchedResponse;writeFileSync(`${output}/report.json`,JSON.stringify(report,null,2));throw error;}finally{await browser.close();}
