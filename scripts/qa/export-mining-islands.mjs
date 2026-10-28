import ts from 'typescript';
import {readFileSync} from 'node:fs';
import {spawn, execFileSync} from 'node:child_process';
import {readFile, writeFile, mkdir, copyFile, rename} from 'node:fs/promises';
import {resolve, dirname, relative} from 'node:path';
import {createHash} from 'node:crypto';
import {campaignIslandInputs} from '../campaign-island-inputs.mjs';
const output = resolve(process.argv[2] ?? 'scratch/mining-223/new-islands-v4');
const sha256 = data => createHash('sha256').update(data).digest('hex');
function executionInputs() {
    const files = new Set();
    function visit(file) {
        const path = resolve(file);
        if (files.has(path)) return;
        files.add(path);
        for (const {fileName} of ts.preProcessFile(readFileSync(path, 'utf8')).importedFiles)
            if (fileName.startsWith('.')) visit(resolve(dirname(path), fileName + '.ts'));
    }
    for (const file of ['world-generation/GenerateWorld','fjord-play/CampaignIsland','world-generation/LandRoutes',
        'simulation/SpatialExpeditions','world/WorldAttachments','fjord-play/FjordProjection',
        'fjord-play/RivalSettlement','simulation/SimulationCore']) visit('src/' + file + '.ts');
    return Object.fromEntries([...files].sort().map(path => [relative('.', path).replaceAll('\\', '/'), sha256(readFileSync(path))]));
}
const protocol = {version: 4, qaOnly: true, target: 12, start: 256, end: 1023,
    sourceSelectionProtocol: '06e99adfa99b518d4cb447864e75f73270f470921fdb998d6ce71c080fe2e5e5',
    seeds: [296,299,306,327,329,341,351,352,360,361,369,380],
    existingPool: [18,7,15,79,88,101,112,168,195,227], concurrency: 2,
    timeoutMs: 120000, maxHeapMiB: 768, generatorInputs: campaignIslandInputs(), executionInputs: executionInputs(),
    miningTrial: {version: 2, unitsPerYear: 8, mineCostMaterials: 20, outcropProductivityBps: 5000},
    accessProbe: 'Real paid scout, canonical intermediate destinations when one long A* exceeds its existing limit, actual sighting and home return; separate unchanged founding cohort for the Mining proof.',
    pierSha256: sha256(readFileSync('public/terrain/jetty-pier.glb')),
    routeProbeSha256: sha256(await readFile(new URL('./mining-route-probe.mjs', import.meta.url))),
    candidateRunnerSha256: sha256(await readFile(new URL('./mining-island-candidate.mjs', import.meta.url))),
    coordinatorSha256: sha256(await readFile(new URL(import.meta.url)))};
const protocolSha256 = sha256(JSON.stringify(protocol));
await mkdir(output + '/results', {recursive: true});
await mkdir(output + '/exports', {recursive: true});
let manifest;
try {manifest = JSON.parse(await readFile(output + '/manifest.json', 'utf8'));}
catch (error) {if (error.code !== 'ENOENT') throw error;}
if (manifest && manifest.protocolSha256 !== protocolSha256) throw new Error('Sources changed; choose a fresh output directory.');
manifest ??= {...protocol, protocolSha256,
    baseCommit: execFileSync('git', ['rev-parse','HEAD'], {encoding: 'utf8'}).trim(),
    branch: execFileSync('git', ['branch','--show-current'], {encoding: 'utf8'}).trim(),
    localChanges: execFileSync('git', ['status','--short'], {encoding: 'utf8'}),
    node: process.version, startedAt: new Date().toISOString(), rows: []};
const completed = new Map();
for (let seed = protocol.start; seed <= protocol.end; seed++) {
    try {const row = JSON.parse(await readFile(output + '/results/' + seed + '.json', 'utf8'));
        if (row.protocolSha256 !== protocolSha256) throw new Error('Result hash mismatch.');
        completed.set(seed, row);
    } catch (error) {if (error.code !== 'ENOENT') throw error;}
}
let next = 0;
const successes = () => [...completed.values()].filter(r => r.status === 'qualified-export').sort((a,b) => a.seed-b.seed);
let saveQueue = Promise.resolve();
function save() {
    saveQueue = saveQueue.then(async () => {
        const selected = successes().slice(0, protocol.target);
        manifest.completed = completed.size;
        manifest.selected = selected.map(row => ({seed: row.seed, ...row.export}));
        manifest.status = selected.length === protocol.target ? 'complete' : 'running';
        manifest.updatedAt = new Date().toISOString();
        await writeFile(output+'/manifest.json.tmp', JSON.stringify(manifest, null, 2));
        await rename(output+'/manifest.json.tmp', output+'/manifest.json');
    });
    return saveQueue;
}
async function worker() {
    while (successes().length < protocol.target && next < protocol.seeds.length) {
        const seed = protocol.seeds[next++];
        if (completed.has(seed)) continue;
        const row = await new Promise(resolveRow => {
            const child = spawn(process.execPath, ['--max-old-space-size=768', 'scripts/qa/mining-island-candidate.mjs', String(seed), output],
                {windowsHide: true, stdio: ['ignore','pipe','pipe']});
            let stdout='', stderr='', timedOut=false;
            const timer = setTimeout(() => {timedOut=true; child.kill();}, protocol.timeoutMs);
            child.stdout.on('data', data => {stdout+=data;});
            child.stderr.on('data', data => {stderr=(stderr+data).slice(-8000);});
            child.on('error', error => {stderr+=error.message;});
            child.on('close', code => {
                clearTimeout(timer);
                if (timedOut) return resolveRow({seed,status:'resource-limited',reasons:['Per-seed time budget exceeded.']});
                try {if(code!==0) throw new Error('Exit '+code+': '+stderr); resolveRow(JSON.parse(stdout));}
                catch(error) {resolveRow({seed,status:'technical-failure',reasons:[error.message]});}
            });
        });
        if (row.status === 'qualified-export' && row.pierSha256 !== protocol.pierSha256)
            throw new Error('Runtime pier changed during the run.');
        row.protocolSha256 = protocolSha256;
        await writeFile(output+'/results/'+seed+'.json', JSON.stringify(row,null,2));
        completed.set(seed,row);
        await save();
        if (row.status==='qualified-export' || completed.size%10===0)
            console.log(JSON.stringify({tested:completed.size, qualified:successes().length, seed, status:row.status}));
    }
}
// Freeze executable sources before the first measured candidate.
for (const path of [...Object.keys(protocol.executionInputs), 'pnpm-lock.yaml','package.json',
    'scripts/load-typescript.mjs','scripts/terrain-io.mjs','scripts/qa/mining-route-probe.mjs',
    'scripts/qa/mining-island-candidate.mjs','scripts/qa/export-mining-islands.mjs']) {
    await mkdir(dirname(output+'/frozen-source/'+path), {recursive: true});
    await copyFile(path, output+'/frozen-source/'+path);
}
await save();
await Promise.all([worker(),worker()]);
await save();
for (const row of successes().slice(0,protocol.target))
    await copyFile(output+'/candidates/'+row.export.filename, output+'/exports/'+row.export.filename);
if (manifest.status !== 'complete') {manifest.status='resource-limited'; await writeFile(output+'/manifest.json',JSON.stringify(manifest,null,2));}
console.log(JSON.stringify({output,status:manifest.status,selected:manifest.selected.map(r=>r.seed),tested:completed.size}));
