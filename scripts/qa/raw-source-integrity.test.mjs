// Bounded negative smoke: explicit immutable input supplied via REVIEW_RAW_*.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
const {REVIEW_RAW_FILE:file,REVIEW_RAW_SHA:sha,REVIEW_RAW_TRIANGLES:triangles}=process.env;
assert.ok(file&&sha&&triangles,'Provide a valid immutable raw source for the negative smoke');
const output=process.env.REVIEW_OUTPUT??'artifacts/appearance-pass/agent-d/raw-integrity-negative';mkdirSync(output,{recursive:true});
const cases=[{name:'missing-source',patch:{REVIEW_RAW_FILE:`${file}.missing`},error:/must exist/},
 {name:'wrong-sha',patch:{REVIEW_RAW_SHA:'0'.repeat(64)},error:/source hash mismatch/},
 {name:'wrong-triangles',patch:{REVIEW_RAW_TRIANGLES:String(Number(triangles)+1)},error:/triangle mismatch/}];
const checks=[];
for(const check of cases){const result=spawnSync(process.execPath,['scripts/qa/raw-source-review.mjs'],{env:{...process.env,...check.patch,REVIEW_OUTPUT:`${output}/${check.name}`},encoding:'utf8',timeout:180000});
 const error=result.stderr??'';assert.notEqual(result.status,0,`${check.name} must hard abort`);assert.match(error,check.error);
 let captures=0;if(check.name==='wrong-triangles'){const report=JSON.parse(readFileSync(`${output}/${check.name}/report.json`));captures=report.checks.length;assert.equal(captures,0,'No unmatched source screenshots may be saved');}
 checks.push({case:check.name,hardAborted:true,captures,errorMatched:check.error.source});}
writeFileSync(`${output}/report.json`,JSON.stringify({timestamp:new Date().toISOString(),checks,pass:true},null,2));
console.log('Raw-source missing-file, wrong-SHA and parsed-triangle mismatch all hard-abort; zero untrusted snapshots.');
