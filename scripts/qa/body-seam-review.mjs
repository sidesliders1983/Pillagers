import {createRequire} from 'node:module';
import {mkdirSync,writeFileSync} from 'node:fs';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE??'playwright');
const output='artifacts/appearance-pass/agent-d/body-seam-diagnostic';mkdirSync(output,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-webgl']});const report={checks:[],errors:[]};
try{
 const page=await browser.newPage({viewport:{width:640,height:720}});page.setDefaultTimeout(120000);await page.routeWebSocket('**/*',socket=>socket.onMessage(()=>{}));page.on('pageerror',e=>report.errors.push(e.message));
 await page.goto('http://127.0.0.1:4176/scripts/qa/appearance-review.html');await page.waitForFunction(()=>window.ready);
 for(const profile of ['neutral','older','child'])for(const lod of [0,1,2])for(const doubleSided of [false,true]){
  await page.evaluate(args=>window.review.load(...args),['body/universal-human',`golden_${profile}_01`,lod,1]);await page.evaluate(double=>window.review.bodyDiagnostic(double),doubleSided);
  for(const clip of ['Idle','Walk','Run'])for(const phase of clip==='Idle'?[0]:[.125,.375,.625])for(const angle of clip==='Idle'?['front','side','back']:['front','side']){
   await page.evaluate(args=>window.review.sample(...args),[angle,clip,phase]);const seams=await page.evaluate(()=>window.review.seamDiagnostic());
   const screenshot=`${output}/${profile}-LOD${lod}-${doubleSided?'DoubleSide':'FrontSide'}-${clip}-${phase}-${angle}.png`;await page.screenshot({path:screenshot});report.checks.push({profile,lod,doubleSided,clip,phase,angle,seams,screenshot});
  }
 }
 writeFileSync(`${output}/report.json`,JSON.stringify(report,null,2));console.log(JSON.stringify({checks:report.checks.length,errors:report.errors,maxGap:Math.max(...report.checks.flatMap(c=>c.seams.map(s=>s.maxGap)))}));
}finally{await browser.close();}
