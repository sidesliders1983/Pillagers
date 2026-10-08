import {createRequire} from 'node:module';
import {mkdirSync,writeFileSync,readFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {runtimeTriangleBudget} from './qa/fitted-geometry-audit.mjs';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE??'playwright');
const readJSON=path=>JSON.parse(readFileSync(path,'utf8').replace(/^\uFEFF/,''));
const output=process.env.REVIEW_OUTPUT??'artifacts/appearance-pass/independent-baseline';mkdirSync(output,{recursive:true});
const full=process.env.REVIEW_MATRIX==='full',loaded=new Map(),implementation=new Map(),hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const overrides={candidateDirectory:process.env.REVIEW_CANDIDATES??null,candidateMap:process.env.REVIEW_CANDIDATE_MAP??null,
 canonicalIds:process.env.REVIEW_CANONICAL_IDS?.split(',')??[],metadataFile:process.env.REVIEW_METADATA_JSON??null};
const publicAssets=!overrides.candidateDirectory&&!overrides.candidateMap&&!overrides.canonicalIds.length&&!overrides.metadataFile;
if(process.env.REVIEW_REQUIRE_PUBLIC==='1'&&!publicAssets)throw new Error('Final public review refuses candidate, frame or metadata overrides. Clear REVIEW_CANDIDATES, REVIEW_CANDIDATE_MAP, REVIEW_CANONICAL_IDS and REVIEW_METADATA_JSON.');
const report={timestamp:new Date().toISOString(),mode:full?'matrix':'targeted',authority:publicAssets?'actual public registry and assets':'private candidate or metadata overrides',overrides,errors:[],checks:[],skipped:[],loadedAssets:[],loadedImplementation:[],visualApproval:'pending independent inspection'};
const browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-webgl']});
try{
 const page=await browser.newPage({viewport:{width:full?320:640,height:full?360:720}});page.setDefaultTimeout(120000);
 // Pin the implementation loaded at navigation. Vite HMR reloads during a
 // different asset's authoring would otherwise reset the review mid-matrix.
 await page.routeWebSocket('**/*',socket=>{socket.onMessage(()=>{});});
 page.on('pageerror',error=>report.errors.push(error.message));
 page.on('response',async response=>{const pathname=new URL(response.url()).pathname,isAsset=pathname.endsWith('.glb'),isImplementation=pathname.startsWith('/src/')||(pathname.startsWith('/scripts/qa/')&&/\.m?js$/.test(pathname));if(!isAsset&&!isImplementation)return;try{const bytes=await response.body();(isAsset?loaded:implementation).set(response.url(),{url:response.url(),sha256:hash(bytes),bytes:bytes.length});}catch(error){report.errors.push(`Hash capture: ${error.message}`);}});
 const candidateMap=process.env.REVIEW_CANDIDATE_MAP?readJSON(process.env.REVIEW_CANDIDATE_MAP):{};
 if(process.env.REVIEW_CANDIDATES||process.env.REVIEW_CANDIDATE_MAP)await page.route(/\/(appearance|clothing)\/.*\.glb/,route=>{
  const path=new URL(route.request().url()).pathname,parts=path.split('/'),kind=parts[1]==='clothing'?'garment':parts[2]==='beards'?'beard':'hair',style=parts.at(-2),file=`${process.env.REVIEW_CANDIDATES}/${kind}/${style}/${parts.at(-1)}`;
  const candidate=candidateMap[`${kind}/${style}`]??file;
  if(!existsSync(candidate)){report.errors.push(`Required candidate missing: ${candidate} for ${path}`);return route.abort('failed');}
  return route.fulfill({body:readFileSync(candidate),contentType:'model/gltf-binary'});
 });
 await page.goto(`${process.env.REVIEW_URL??'http://127.0.0.1:4176'}/scripts/qa/appearance-review.html`);await page.waitForFunction(()=>window.ready);
 if(process.env.REVIEW_CANONICAL_IDS)await page.evaluate(ids=>window.review.overrideFrames(ids,'canonical'),process.env.REVIEW_CANONICAL_IDS.split(','));
 if(process.env.REVIEW_METADATA_JSON)await page.evaluate(patches=>window.review.overrideMetadata(patches),readJSON(process.env.REVIEW_METADATA_JSON));
 if(full)await page.evaluate(()=>window.review.size(320,360));
 const assets=await page.evaluate(()=>window.review.assets),profiles=await page.evaluate(()=>window.review.profiles);
 const selectedProfiles=process.env.REVIEW_PROFILES?.split(',').map(p=>p.startsWith('golden_')?p:`golden_${p}_01`)??(full?profiles.map(p=>p.id):['golden_neutral_01']);
 const lods=(process.env.REVIEW_LODS??(full?'0,1,2':'2')).split(',').map(Number);
 const clips=(process.env.REVIEW_CLIPS??(full?'Idle,Walk,Run':'Idle')).split(',');
 const phases=(process.env.REVIEW_PHASES??(full?'0.125,0.375,0.625':'0')).split(',').map(Number);
 for(const asset of assets){
  if(process.env.REVIEW_FILTER&&!process.env.REVIEW_FILTER.split(',').some(filter=>asset.id.includes(filter)))continue;
  const ratios=(process.env.REVIEW_RATIOS??'1').split(',').map(Number);
  for(const profile of selectedProfiles)for(const lod of lods)for(const ratio of ratios){
   const start=await page.evaluate(async args=>window.review.load(...args),[asset.id,profile,lod,ratio]);
   if(start.skipped){report.skipped.push({id:asset.id,profile,lod,ratio,...start});continue;}
   const dir=`${output}/${asset.id.replace('/','-')}/LOD${lod}/ratio-${ratio}`;mkdirSync(dir,{recursive:true});
   for(const clip of clips)for(const phase of clip==='Idle'?[0]:phases){
    const angles=process.env.REVIEW_ANGLES?.split(',')??(clip==='Idle'?(asset.type==='garment'?['front','side','back']:['front','side','back','top']):['front','side']);
    for(const angle of angles){
     const result=await page.evaluate(args=>window.review.sample(...args),[angle,clip,phase]);
     const filename=`${profile}-${clip}-${phase}-${angle}.png`,path=`${dir}/${filename}`;
     await page.screenshot({path});
     const violations=[];if(!result.modulePresent)violations.push('Missing equipped module');if(!result.finite)violations.push('Non-finite geometry');if(!result.bodyIndicesUnchanged)violations.push('Body triangles removed');
     const fittedTriangleBudget=runtimeTriangleBudget(asset);
     if(result.triangles>fittedTriangleBudget)violations.push(`Fitted runtime triangles ${result.triangles} exceed ${fittedTriangleBudget}`);
     if(result.unusedFittedAttributeRows)violations.push(`Unused fitted attribute rows: ${result.unusedFittedAttributeRows}`);
     if(result.missingFittedAttributeRows)violations.push(`Missing fitted attribute rows: ${result.missingFittedAttributeRows}`);
     if(result.invalidFittedIndexEntries)violations.push(`Invalid fitted index entries: ${result.invalidFittedIndexEntries}`);
     if(result.nonFinitePosedModuleRows)violations.push(`Non-finite posed module rows: ${result.nonFinitePosedModuleRows}`);
     if(result.degeneratePosedModuleTriangles)violations.push(`Collapsed posed module triangles: ${result.degeneratePosedModuleTriangles}`);
     if(result.materials>asset.budgets.materials)violations.push(`Runtime materials ${result.materials} exceed ${asset.budgets.materials}`);
     if(result.fitRevision!==start.fitRevision)violations.push('Animation changed fit revision');
     report.checks.push({id:asset.id,profile,lod,ratio,clip,phase,angle,screenshot:path,...result,fittedTriangleBudget,effectiveMetadata:start.effectiveMetadata,violations});
    }
   }
  }
  console.log('CAPTURED',asset.id,report.checks.length);writeFileSync(`${output}/report.json`,JSON.stringify(report,null,2));
 }
 report.loadedAssets=[...loaded.values()].map(entry=>{const path=new URL(entry.url).pathname,local=resolve('public',path.slice(1));return {...entry,path,currentSha256:existsSync(local)?hash(readFileSync(local)):null};});
 report.loadedImplementation=[...implementation.values()];
 if(!process.env.REVIEW_CANDIDATES&&!process.env.REVIEW_CANDIDATE_MAP)for(const asset of report.loadedAssets)if(asset.sha256!==asset.currentSha256)report.errors.push(`Asset changed during capture: ${asset.path}`);
 writeFileSync(`${output}/report.json`,JSON.stringify(report,null,2));
 const failures=report.checks.filter(c=>c.violations.length);console.log(JSON.stringify({captures:report.checks.length,eligibilitySkips:report.skipped.length,failures:failures.length,pageErrors:report.errors.length,report:`${output}/report.json`}));
 if((failures.length||report.errors.length)&&!process.env.REVIEW_ALLOW_PENDING)throw new Error('Browser structural checks failed. Screenshots still require independent visual inspection.');
}catch(error){report.errors.push(error.message);report.loadedAssets=[...loaded.values()];report.loadedImplementation=[...implementation.values()];writeFileSync(`${output}/report.json`,JSON.stringify(report,null,2));throw error;}finally{await browser.close();}
