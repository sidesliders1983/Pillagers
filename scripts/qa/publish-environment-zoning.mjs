import {readFile,writeFile,copyFile,mkdir,readdir} from 'node:fs/promises';
const output='docs/qa/environment-zoning';
await mkdir(output,{recursive:true});
const batch=JSON.parse(await readFile('scratch/environment-zoning/batch.json','utf8'));
const browser=JSON.parse(await readFile('scratch/environment-zoning-browser/browser.json','utf8'));
const captures=JSON.parse(await readFile('scratch/environment-zoning-browser/comparisons.json','utf8'));
for(const name of await readdir('scratch/environment-zoning')) {
    if(name.endsWith('.png')||name==='batch.json') await copyFile('scratch/environment-zoning/'+name,output+'/'+name);
}
for(const name of await readdir('scratch/environment-zoning-browser')) {
    if(/\.(png|jpg|json)$/.test(name)) await copyFile('scratch/environment-zoning-browser/'+name,output+'/'+name);
}
const sum=key=>batch.results.reduce((n,r)=>n+r[key],0);
const avg=values=>values.reduce((a,b)=>a+b,0)/values.length;
const fixed=value=>value.toFixed(2);
const table=batch.results.map(r=> '| '+[r.seed,r.accepted?'PASS':'REJECTED',
    ...['grass','sand','mud','bedrock'].map(k=>(r.coverage[k]/(40401-r.coverage.water)*100).toFixed(1)+'%'),
    (r.forestSamples/(40401-r.coverage.water)*100).toFixed(1)+'%',
    (r.stages['environment-zoning']).toFixed(0)+' ms',fixed(r.saveBytes/1e6)+' MB'].join(' | ')+' |').join('\n');
const comparison=captures.rendererComparison.map(r=>r.variant+': mean of six reported windows '+
    fixed(avg(r.windows.map(w=>w.ms)))+' ms/frame, '+r.windows.at(-1).calls+' calls, '+
    r.windows.at(-1).triangles+' triangles (includes shadows), '+r.windows.at(-1).geometries+
    ' geometries, '+r.windows.at(-1).textures+' textures').join('\n\n');
const e=batch.results.find(r=>r.seed===18).examples;
const exampleRows=Object.entries(e).map(([name,p])=>'| '+[name,'('+p.x+', '+p.z+')',fixed(p.elevation),fixed(p.slope),p.primary,p.rockExposure,p.moisture,p.forestCover,p.snowRetentionPotential].join(' | ')+' |').join('\n');
const report='# Environment zoning v1 — #135 review\n\n'+
    'Measured '+batch.date+'. [Interactive comparison gallery](review.html). [Versioned contract](../../ENVIRONMENT-ZONING-V03C.md).\n\n'+
    '## Outcome\n\n'+
    'All ten fixed seeds replay identically and round-trip through save/load. Terrain, geology, coast, foundation layouts, player/rival selection and LOS evidence exactly match the same request without zoning. Placement clearance checks pass for all props against both sets of foundations and critical routes. Six seeds pass the inherited site criteria; four retain exactly the same rejection reasons. No thresholds were weakened. This is opt-in Environment Lab metadata, not production campaign adoption. The earlier real-campaign allocator limitation remains open.\n\n'+
    'The new substrate masks form broad grassland, bedrock and sheltered wetland regions. Forest cover is a separate continuous field visible even without trees. Narrow shore components follow the physical coast. All normal-climate snow values are zero. Rock does not imply blocked navigation.\n\n'+
    '## Fixed comparison set\n\n'+
    'Seeds were fixed before examining the zoning output; rejected seeds were not replaced. Percentages below are relative to land samples, and forest overlaps substrate.\n\n'+
    '| Seed | Existing site result | Grass | Sand | Mud | Bedrock | Forest ≥0.4 | Zoning stage | Full save |\n| --- | --- | --- | --- | --- | --- | --- | --- | --- |\n'+table+'\n\n'+
    '## Named transitions — seed 18\n\n'+
    '| Example | X,Z (m) | Elevation above sea (m) | Slope m/m | Ground | Rock | Moisture | Forest | Snow |\n| --- | --- | --- | --- | --- | --- | --- | --- | --- |\n'+exampleRows+'\n\n'+
    'The low cliff is much rockier than the gentle highland. Sheltered lowlands develop wet soil; the forest example has moist grass substrate instead of replacing soil with a forest texture. These are terrain-derived descriptive fields, not a physical climate/erosion simulation.\n\n'+
    '## Visual scope and limits\n\n'+
    'The gallery contains ten headless canonical maps each for primary ground, forest, moisture and rock; ten actual Lab oblique region renders; ten source-material shore views at normal distance; and all eight diagnostic views for seed 18. Shader/material blending is not part of this slice. Mud remains represented by the existing grass/soil material until #137. Forest density in rendered scenes still follows the existing asset budget, so the broad cover field is more extensive than the sparse visible trees. The old repeating texture pattern at normal distance is also outside this zoning slice.\n\n'+
    'Region boundaries deliberately expose the 4 m classification grid; continuous influence overlays interpolate smoothly. Tiny shore/water fragments remain to avoid modifying the physical coast. Seed 42 retains two nonshore components smaller than nine samples after the bounded cleanup; the other nine seeds have none. These are recorded rather than hiding or rerolling the seed.\n\n'+
    '## Cost and evidence boundaries\n\n'+
    batch.hardware.cpu+'; '+batch.hardware.cores+' logical cores; '+fixed(batch.hardware.totalMemoryBytes/2**30)+' GiB RAM; Node '+batch.node+'.\n\n'+
    'Paired headless totals: '+fixed(sum('baselineMs')/1000)+' s baseline → '+fixed(sum('generationMs')/1000)+' s zoned across ten seeds ('+fixed((sum('generationMs')/sum('baselineMs')-1)*100)+'% in this single ordered pass). The isolated zoning stage took '+Math.min(...batch.results.map(r=>r.stages['environment-zoning'])).toFixed(0)+'–'+Math.max(...batch.results.map(r=>r.stages['environment-zoning'])).toFixed(0)+' ms. Each candidate was then independently regenerated for the determinism check; that second generation is not included in these totals. No CPU tests were run concurrently with the timed batch. These are local observations, not a statistical speed claim. Generation still blocks the Lab synchronously for several seconds.\n\n'+
    'Saved zoning JSON adds '+fixed(Math.min(...batch.results.map(r=>r.environmentJsonBytes))/1e6)+'–'+fixed(Math.max(...batch.results.map(r=>r.environmentJsonBytes))/1e6)+' MB. Full saves remain below the existing 24 MB import limit. Ten numeric arrays plus 32-bit region IDs would occupy about 3.39 MB as a packed numerical payload; actual JavaScript arrays, strings and object overhead are additional. The batch records process memory observations, not peak or isolated retained heap. Renderer geometry/texture counts are observed allocations, not GPU byte measurements.\n\n'+
    'Paired renderer sample: headless Edge, Low quality, 1440×1000 viewport, seed 18, identical player camera and approved assets, fog off, paused waves/wind. Six reported windows per variant after settling:\n\n'+comparison+'\n\n'+
    'The separate functional browser run used a 1024×768 tablet viewport for source-material controls and kept four renderer-window summaries. Neither dataset stores individual frame times or all outliers. Tablet emulation is not physical iPad validation.\n\n'+
    '## Validation and reproduction\n\n'+
    'Public blueprint/query/save-load tests cover terrain preservation, cliff/highland contrast, a cold test fixture, zero normal-climate snow, nature consumption, conifer replacement and malformed region bounds/metadata. The batch additionally checks full deterministic output and every foundation/critical-route exclusion. Browser controls exercise eight overlays, explicit generation, export/import, legacy/reference fallback and tablet-sized UI. Browser errors: '+(browser.errors.length+captures.errors.length)+'.\n\n'+
    'An independent source-at-revision comparison against merged main ff7d01cf847009e37d9be6b731fd8fffe08f77fb also matched old generation and load exactly for fjord seed 17, first island generator seed 42 and v0.3e seed 18.\n\n'+
    'Run the measure, check, capture and publish scripts in scripts/qa. Measurement saves stay in ignored scratch; the committed batch contains hashes, counts, timings, examples and reasons. Browser comparisons import those exact saved candidates. Build/unit/asset checks are also required on the PR head. Owner visual approval remains separate from automated validation.\n';
await writeFile(output+'/report.md',report);
const image=(file,label)=>'<figure><a href="'+file+'"><img loading="lazy" src="'+file+'" alt="'+label+'"></a><figcaption>'+label+'</figcaption></figure>';
const sections=batch.results.map(r=>'<section id="seed-'+r.seed+'"><h2>Seed '+r.seed+' · '+(r.accepted?'site pair accepted':'same inherited site rejection')+'</h2><div class="grid">'+
    [['primary','Ground: grass / sand / mud / bedrock'],['forestCover','Forest cover · dark 0 → green 1'],['moisture','Moisture · dark 0 → blue 1'],['rockExposure','Rock exposure · dark 0 → bright 1']].map(([field,label])=>image(r.seed+'-'+field+'.png',label)).join('')+
    image(r.seed+'-oblique.jpg','Lab oblique · ground regions and boundaries')+image(r.seed+'-normal.jpg','Lab shore · existing source materials and approved assets')+'</div></section>').join('');
const diagnostic=browser.captures.map(file=>image(file,file.replace(/\.png$/,'').replaceAll('-',' '))).join('');
await writeFile(output+'/review.html','<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Environment zoning · #135 review</title><style>body{margin:auto;max-width:1500px;padding:24px;background:#142b29;color:#eee;font:16px/1.5 system-ui}a{color:#e7ca91}header{max-width:1000px}nav{display:flex;gap:14px;flex-wrap:wrap}section{border-top:1px solid #64766c;margin-top:30px;padding-top:16px}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}figure{margin:0;background:#203b39;padding:8px}img{width:100%;display:block}figcaption{padding:6px}@media(max-width:700px){.grid{grid-template-columns:1fr}}</style><header><h1>Environment zoning · #135</h1><p>Ten fixed seeds. Terrain, coast, reserves and visibility proof preserved. Ground and cover fields are stored in the blueprint; these colours are diagnostic. Source materials remain the existing assets.</p><p><a href="report.md">Measurements and limitations</a> · <a href="../../ENVIRONMENT-ZONING-V03C.md">Contract</a> · <a href="/environment-lab">Open Environment Lab</a></p><p>Ground: green grass, pale sand, brown mud, grey rock, blue water. Forest is an overlay. Normal climate snow potential is zero. Mud material blending follows in #137. Click a picture for full size.</p><nav>'+batch.seeds.map(seed=>'<a href="#seed-'+seed+'">Seed '+seed+'</a>').join('')+'<a href="#diagnostics">All overlays</a></nav></header>'+sections+'<section id="diagnostics"><h2>Seed 18 · controls and diagnostic views</h2><div class="grid">'+diagnostic+'</div></section><section><h2>Same camera · source-material comparison</h2><div class="grid">'+image('18-baseline-comparison.jpg','Baseline · before zoning')+image('18-zoned-comparison.jpg','Candidate · terrain-driven zoning')+'</div><p>No new terrain geometry or shader. See report for the measured renderer windows and their limits.</p></section></html>');
console.log('Published '+output+'/review.html');
