import assert from 'node:assert/strict';
import {readFileSync, writeFileSync, mkdirSync, copyFileSync, readdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
const output = resolve(process.argv[2] ?? 'scratch/mining-223/new-islands-v4');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const read = file => JSON.parse(readFileSync(resolve(output,file)));
const manifest = read('manifest.json');
for (const [file, hash] of Object.entries(manifest.executionInputs)) assert.equal(sha256(readFileSync(file)), hash, file);
assert.equal(sha256(readFileSync('scripts/qa/mining-island-candidate.mjs')), manifest.candidateRunnerSha256);
manifest.recoveries ??= [];
for (const seed of manifest.seeds) {
    const previous = read('results/' + seed + '.json');
    if (previous.status !== 'resource-limited') continue;
    const attemptDirectory = resolve(output,'attempts',String(seed)); mkdirSync(attemptDirectory,{recursive:true});
    const attempt = readdirSync(attemptDirectory).length + 1;
    copyFileSync(resolve(output,'results',seed + '.json'),resolve(attemptDirectory,attempt + '.json'));
    const row = await new Promise(resolveRow => {
        const child = spawn(process.execPath,['--max-old-space-size=' + manifest.maxHeapMiB,
            'scripts/qa/mining-island-candidate.mjs',String(seed),output], {windowsHide:true,stdio:['ignore','pipe','pipe']});
        let stdout = '', stderr = '', timedOut = false;
        const timer = setTimeout(() => {timedOut = true; child.kill();},manifest.timeoutMs);
        child.stdout.on('data',data => stdout += data);
        child.stderr.on('data',data => stderr = (stderr + data).slice(-8000));
        child.on('error',error => stderr += error.message);
        child.on('close',code => {
            clearTimeout(timer);
            if (timedOut) return resolveRow({seed,status:'resource-limited',reasons:['Per-seed time budget exceeded.']});
            try {assert.equal(code,0,stderr); resolveRow(JSON.parse(stdout));}
            catch(error) {resolveRow({seed,status:'technical-failure',reasons:[error.message]});}
        });
    });
    row.protocolSha256 = manifest.protocolSha256;
    row.recoveryAttempt = attempt + 1;
    writeFileSync(resolve(output,'results',seed + '.json'),JSON.stringify(row,null,2));
    manifest.recoveries.push({seed,previous:previous.status,status:row.status,attempt:attempt+1,
        runnerSha256:sha256(readFileSync(new URL(import.meta.url))),concurrency:1,
        timeoutMs:manifest.timeoutMs,maxHeapMiB:manifest.maxHeapMiB});
    console.log(JSON.stringify({seed,status:row.status,attempt:attempt+1}));
}
const rows = readdirSync(resolve(output,'results')).map(file => read('results/' + file));
manifest.selected = rows.filter(row => row.status === 'qualified-export').sort((a,b) => a.seed-b.seed)
    .map(row => ({seed:row.seed,...row.export}));
for (const row of manifest.selected) copyFileSync(resolve(output,'candidates',row.filename),resolve(output,'exports',row.filename));
manifest.status = manifest.selected.length === manifest.target ? 'complete' : 'resource-limited';
manifest.updatedAt = new Date().toISOString();
copyFileSync(new URL(import.meta.url),resolve(output,'frozen-source/scripts/qa/retry-mining-resource-limited.mjs'));
writeFileSync(resolve(output,'manifest.json'),JSON.stringify(manifest,null,2));
console.log(JSON.stringify({status:manifest.status,selected:manifest.selected.length}));
