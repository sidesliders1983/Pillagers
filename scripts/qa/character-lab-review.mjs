// Independent production UI pass. JSON/Golden controls are used exactly as a
// user would; this script never injects a different fitting implementation.
import {createRequire} from 'node:module';
import {mkdirSync,readFileSync,writeFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,relative,isAbsolute,sep} from 'node:path';
import {loadTypeScript} from '../load-typescript.mjs';
import {publicFile} from '../characters/glb-inspection.mjs';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE??'playwright');
const {goldenCharacterDNA}=loadTypeScript(new URL('../../src/characters/GoldenCharacters.ts',import.meta.url));
const {defaultDNA,parseCharacterDNA}=loadTypeScript(new URL('../../src/characters/CharacterDNA.ts',import.meta.url));
const {universalHumanProfile}=loadTypeScript(new URL('../../src/characters/UniversalHumanProfile.ts',import.meta.url));
const {characterAssets}=loadTypeScript(new URL('../../src/characters/CharacterAssets.ts',import.meta.url));
const output=process.env.REVIEW_OUTPUT??'artifacts/appearance-pass/independent-production-ui';mkdirSync(output,{recursive:true});
const reported={seed:1885184954,sex:'male',age:20,traits:{physicality:.78,agility:.57,intelligence:.12,cunning:.2,temperament:.71},heritage:{scandinavian:.028440025880589824,angloSaxon:.23439964981313144,gaelic:.1594962292471368,finnic:.17366774106331118,sami:.17360313309252673,baltic:.23039322090330414}};
const cases=[{id:'default-1983',dna:defaultDNA()},{id:'reported-20yo',dna:reported},...['child','mixed','older','overweight'].map(id=>({id:`golden-${id}`,dna:goldenCharacterDNA(`golden_${id}_01`)}))];
for(const asset of characterAssets.filter(a=>!a.scope&&['hair','beard'].includes(a.type))){
 let found=false;for(let seed=0;seed<10000;seed++){const dna=parseCharacterDNA({...defaultDNA(),seed,age:32,morphology:{masculinity:.77,height:1.5}}),style=universalHumanProfile(dna).appearance[`${asset.type}Style`];if(style===asset.style){cases.push({id:`style-${asset.id.replace('/','-')}`,dna,expectedAssignedModule:asset.id});found=true;break;}}if(!found)throw new Error(`No profile assignment found for ${asset.id}`);
}
const report={timestamp:new Date().toISOString(),authority:'actual production UI without candidate or metadata overrides',plannedCases:cases,checks:[],errors:[],loadedAssets:[],loadedImplementation:[],visualApproval:'pending independent inspection'},loaded=new Map(),implementation=new Map();
if(process.argv.includes('--plan')){console.log(JSON.stringify({authority:report.authority,cases,devices:['desktop','mobile'],expectedCaptures:2*(cases.length+2)*3},null,2));process.exit(0);}
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const recordedAssets=()=>[...loaded.values()].map(entry=>{const path=new URL(entry.url).pathname;try{const file=publicFile(path);return {...entry,path,currentSha256:existsSync(file)?hash(readFileSync(file)):null};}catch(error){return {...entry,path,currentSha256:null,authorityError:error.message};}});
const recordedImplementation=()=>[...implementation.values()].map(entry=>{
 const path=new URL(entry.url).pathname;
 try{
  const decoded=decodeURIComponent(path);
  if(!/^\/assets\/[\w./-]+\.js$/.test(decoded)||decoded.split('/').some(segment=>segment==='.'||segment==='..')||decoded.includes('//'))throw new Error('Production bundle must resolve inside the dist/assets namespace.');
  const directory=resolve('dist'),file=resolve(directory,decoded.slice(1)),local=relative(directory,file);
  if(!local||local==='..'||local.startsWith(`..${sep}`)||isAbsolute(local))throw new Error('Production bundle resolved outside dist.');
  if(!existsSync(file))throw new Error('Production bundle is missing from the current dist.');
  return {...entry,path,file,currentSha256:hash(readFileSync(file))};
 }catch(error){return {...entry,path,currentSha256:null,authorityError:error.message};}
});
const browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-webgl']});
try{
 for(const mobile of [false,true]){
  const page=await browser.newPage({viewport:mobile?{width:390,height:844}:{width:1440,height:1100},isMobile:mobile,hasTouch:mobile});page.setDefaultTimeout(120000);
  page.on('pageerror',error=>report.errors.push(error.message));page.on('response',async response=>{if(response.status()>=400)report.errors.push(`${response.status()} ${response.url()}`);const path=new URL(response.url()).pathname,isAsset=path.endsWith('.glb'),isImplementation=path.startsWith('/assets/')&&path.endsWith('.js');if(isAsset||isImplementation)try{const bytes=await response.body();(isAsset?loaded:implementation).set(response.url(),{url:response.url(),sha256:hash(bytes),bytes:bytes.length});}catch(error){report.errors.push(error.message);}});
  await page.goto(`${process.env.PROTOTYPE_URL??'http://127.0.0.1:4175'}/character-lab`);const ready=()=>page.waitForFunction(()=>document.querySelector('#lab-preview')?.dataset.ready==='true');await ready();
  await page.locator('.lab-json > summary').click();
  for(const entry of cases){
   await page.locator('#lab-json').fill(JSON.stringify(entry.dna));await page.locator('[data-action="import"]').click();await ready();
   const dna=parseCharacterDNA(entry.dna),phenotype=universalHumanProfile(dna);
   for(const lod of entry.id==='default-1983'?[0,1,2]:[2]){
    await page.locator(`[data-action="lod${lod}"]`).click();await ready();await page.locator('[data-action="reset-view"]').click();
    await page.locator('#lab-preview').scrollIntoViewIfNeeded();
    for(const clip of ['idle','walk','run']){
     await page.locator(`[data-action="${clip}"]`).click();await page.waitForTimeout(350);
     const snapshot=JSON.parse(await page.locator('#lab-fit-metadata').textContent());
     const ids=snapshot.modules.map(module=>module.id);
     if(ids.some(id=>id.startsWith('garment/')))report.errors.push(`${entry.id}: retired clothing was assigned`);
     if(entry.expectedAssignedModule&&!ids.includes(entry.expectedAssignedModule))report.errors.push(`${entry.id}: missing profile-assigned module ${entry.expectedAssignedModule}`);
     if(phenotype.appearance.hairStyle!=='bald'&&!ids.includes(`hair/${phenotype.appearance.hairStyle}`))report.errors.push(`${entry.id}: missing hair ${phenotype.appearance.hairStyle}`);
     if(phenotype.appearance.beardStyle!=='none'&&!ids.includes(`beard/${phenotype.appearance.beardStyle}`))report.errors.push(`${entry.id}: missing beard ${phenotype.appearance.beardStyle}`);
     if(dna.age<18||dna.sex==='female')if(ids.some(id=>id.startsWith('beard/')))report.errors.push(`${entry.id}: ineligible beard for derived ${dna.sex}, age ${dna.age}`);
     if(await page.locator('#lab-status').evaluate(node=>node.classList.contains('is-error')))report.errors.push(`${entry.id}: ${await page.locator('#lab-status').textContent()}`);
     const path=`${output}/${mobile?'mobile':'desktop'}-${entry.id}-LOD${lod}-${clip}.png`;await page.locator('#lab-preview').screenshot({path});
     report.checks.push({case:entry.id,mobile,lod,clip,modules:ids,expectedAssignedModule:entry.expectedAssignedModule??null,expectedGarment,derivedSex:dna.sex,age:dna.age,screenshot:path,status:await page.locator('#lab-status').textContent()});
    }
   }
   console.log('UI CAPTURED',mobile?'mobile':'desktop',entry.id);
  }
  await page.close();
 }
 report.loadedAssets=recordedAssets();report.loadedImplementation=recordedImplementation();
 for(const asset of report.loadedAssets)if(asset.sha256!==asset.currentSha256)report.errors.push(`Production UI served a stale or changed asset: ${asset.path}`);
 if(!report.loadedImplementation.length)report.errors.push('No production JavaScript bundle was captured.');
 for(const bundle of report.loadedImplementation)if(bundle.sha256!==bundle.currentSha256)report.errors.push(`Production UI served a stale, missing or changed bundle: ${bundle.path}${bundle.authorityError?` (${bundle.authorityError})`:''}`);
 writeFileSync(`${output}/report.json`,JSON.stringify(report,null,2));
 if(report.errors.length)throw new Error(report.errors.join('\n'));console.log(JSON.stringify({captures:report.checks.length,loadedGLBs:report.loadedAssets.length,report:`${output}/report.json`}));
}catch(error){report.errors.push(error.message);report.loadedAssets=recordedAssets();report.loadedImplementation=recordedImplementation();writeFileSync(`${output}/report.json`,JSON.stringify(report,null,2));throw error;}finally{await browser.close();}
