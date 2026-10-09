import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { loadTypeScript } from '../load-typescript.mjs';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ||
    'C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const { generateWorld } = loadTypeScript(new URL('../../src/world-generation/GenerateWorld.ts', import.meta.url));
const { parseWorld } = loadTypeScript(new URL('../../src/world-generation/WorldSave.ts', import.meta.url));
const { createBlueprintSurface } = loadTypeScript(new URL('../../src/world-generation/TerrainQueries.ts', import.meta.url));
const { blueprintMovement } = loadTypeScript(new URL('../../src/world/BlueprintMovement.ts', import.meta.url));
const { reviewSeeds } = loadTypeScript(new URL('../../src/world-generation/ReviewSeeds.ts', import.meta.url));
const output = process.env.QA_OUTPUT || 'scratch/world-generation-v01/review';
await mkdir(output, { recursive: true });
const hash = data => createHash('sha256').update(JSON.stringify(data)).digest('hex');
const batch = [];
for (const config of reviewSeeds) {
    const start = performance.now();
    const world = generateWorld(config);
    const generationMs = performance.now() - start;
    batch.push({ config: world.config, validation: world.validation, bounds: world.terrain.bounds,
        generationMs, heightRange: [Math.min(...world.terrain.heights), Math.max(...world.terrain.heights)],
        biomeCoverage: world.biomes.coverage, naturePlacements: world.placementPlan.length,
        terrainSha256: hash(world.terrain), placementSha256: hash(world.placementPlan),
        blueprintSha256: hash(world), replayIdentical: hash(world) === hash(generateWorld(config)) });
}
await writeFile(output + '/batch-validation.json', JSON.stringify({ results: batch }, null, 2) + '\n');
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1640, height: 1400 }, deviceScaleFactor: 1 });
page.setDefaultTimeout(90000);
const errors = [], captures = [], runs = [], regeneration = [];
console.log('Generating fixed validation fixtures and opening native Edge preview.');
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
page.on('response', response => { if (response.status() >= 400) errors.push(response.status() + ' ' + response.url()); });
try {
    await page.goto((process.env.QA_ORIGIN || 'http://127.0.0.1:5181') + '/environment-lab');
    const canvas = page.locator('canvas[data-ready=true]');
    await canvas.waitFor();
    await page.locator('#environment-pause').check();
    await page.locator('#environment-fog').uncheck();
    await page.addStyleTag({ content: '.environment-lab main{max-width:none;width:1536px;padding:0}' +
        '.environment-lab canvas{width:1536px!important;height:1024px!important;min-height:0!important}' });
    await page.selectOption('#environment-conifers', 'kaykit');
    await page.selectOption('#environment-light', 'sun20-front');
    await page.locator('#environment-fill').fill('1');
    await page.locator('#environment-fill').dispatchEvent('change');
    const capture = async file => {
        await page.waitForTimeout(1000);
        const bytes = await canvas.screenshot();
        await writeFile(output + '/' + file, bytes);
        captures.push({ file, sha256: createHash('sha256').update(bytes).digest('hex'),
            fixture: JSON.parse(await canvas.getAttribute('data-fixture')),
            world: JSON.parse(await canvas.getAttribute('data-world') || 'null'),
            metrics: JSON.parse(await canvas.getAttribute('data-metrics')) });
    };
    const sample = async (label, tier) => {
        await page.waitForTimeout(1500);
        const intervals = await page.evaluate(() => new Promise(resolve => {
            const intervals = []; let previous = performance.now(); const start = previous;
            const frame = now => { intervals.push(now-previous); previous=now;
                if(now-start>=4000) resolve(intervals); else requestAnimationFrame(frame); };
            requestAnimationFrame(frame);
        }));
        const sorted = [...intervals].sort((a,b) => a-b);
        runs.push({ label, tier, intervalsMs: intervals,
            medianMs: sorted[Math.floor(sorted.length*.5)], p95Ms: sorted[Math.floor(sorted.length*.95)],
            maximumMs: sorted.at(-1), fixture: JSON.parse(await canvas.getAttribute('data-fixture')),
            world: JSON.parse(await canvas.getAttribute('data-world') || 'null'),
            metrics: JSON.parse(await canvas.getAttribute('data-metrics')) });
    };
    const generate = async (seed, preset='fjord') => {
        const previous = JSON.parse(await canvas.getAttribute('data-world') || 'null')?.generations || 0;
        await page.locator('#world-seed').fill(String(seed));
        await page.selectOption('#world-preset', preset);
        await page.locator('#world-generate').click();
        await page.waitForFunction(count => {
            const data = document.querySelector('canvas').dataset.world;
            return data && JSON.parse(data).generations > count;
        }, previous);
        await page.locator('#world-generate').waitFor({ state: 'visible' });
    };
    await page.selectOption('#environment-camera', 'landscape');
    await capture('reference-landscape.png');
    for(const tier of ['standard','low']) {
        await page.selectOption('#environment-quality',tier);
        for(let repeat=0;repeat<3;repeat++) await sample('Reference Lab (one resident)',tier);
    }
    await page.selectOption('#environment-quality','standard');
    for (const config of reviewSeeds) {
        console.log('Capturing seed',config.seed,config.preset);
        await generate(config.seed, config.preset);
        assert.equal(JSON.parse(await canvas.getAttribute('data-world')).validation.accepted, true);
        for(const view of ['landscape','village']) {
            await page.selectOption('#environment-camera',view);
            await capture('seed-' + config.seed + '-' + view + '.png');
        }
    }
    await generate(17);
    await page.selectOption('#environment-camera','landscape');
    for (const overlay of ['biomes','walkability']) {
        await page.selectOption('#world-overlay',overlay);
        await capture('seed-17-' + overlay + '.png');
    }
    await page.selectOption('#world-overlay','none');
    await page.selectOption('#environment-light','night');
    await capture('seed-17-night.png');
    await page.selectOption('#environment-light','sun20-front');
    // Public export/import round trip through the visible file controls.
    const pending = page.waitForEvent('download');
    await page.locator('#world-export').click();
    const file = await pending;
    const saved = await readFile(await file.path(),'utf8');
    const world = parseWorld(saved);
    assert.deepEqual(world,generateWorld({seed:17}));
    await page.locator('#world-reference').click();
    assert.equal(await canvas.getAttribute('data-world'),null);
    await page.locator('#world-import').setInputFiles({name:'world.json',mimeType:'application/json',buffer:Buffer.from(saved)});
    await page.waitForFunction(() => document.querySelector('canvas').dataset.world);
    const future=JSON.parse(saved); future.blueprint.config.generatorVersion='fjordside-v99';
    await page.locator('#world-import').setInputFiles({name:'future.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(future))});
    await page.getByRole('status').filter({hasText:'Unsupported generator version'}).waitFor();
    assert.equal(JSON.parse(await canvas.getAttribute('data-world')).seed,17);
    console.log('Checking import, movement, costs and regeneration.');
    const movement=blueprintMovement(world),surface=createBlueprintSurface(world);
    await page.locator('#environment-pause').uncheck();
    const positions=await page.evaluate(() => new Promise(resolve => {
        const frames=[]; const start=performance.now();
        const timer=setInterval(() => {
            frames.push(JSON.parse(document.querySelector('canvas').dataset.referenceActors));
            if(performance.now()-start>=20000){clearInterval(timer);resolve(frames);}
        },100);
    }));
    await writeFile(output+'/movement-raw.json',JSON.stringify(positions));
    for(const frame of positions) {
        assert.equal(frame.length,10);
        for(const actor of frame) {
            assert.ok(movement.walkable(actor.x,actor.z),'Resident '+actor.id+' remains on traversable ground: '+JSON.stringify(actor));
            assert.ok(Math.abs(actor.y-surface.surfaceHeightAt(actor.x,actor.z))<.00001);
            for(const other of frame) if(actor.id<other.id) {
                assert.ok(Math.hypot(actor.x-other.x,actor.z-other.z)>=.9599,'Resident collision clearance');
            }
        }
    }
    const travel=positions[0].map((actor,index) => ({id:actor.id,
        maximumDisplacement:Math.max(...positions.map(frame=>Math.hypot(frame[index].x-actor.x,frame[index].z-actor.z)))}));
    assert.ok(travel.every(actor=>actor.maximumDisplacement>.2),'Every resident moves during the observation');
    await page.locator('#environment-pause').check();
    await writeFile(output+'/movement.json',JSON.stringify({seconds:20,travel,positions},null,2)+'\n');
    for(const seed of [17,91]) {
        await generate(seed);
        await page.selectOption('#environment-camera','landscape');
        for(const tier of ['standard','low']) {
            const previous=JSON.parse(await canvas.getAttribute('data-world')).generations;
            await page.selectOption('#environment-quality',tier);
            await page.waitForFunction(count => JSON.parse(document.querySelector('canvas').dataset.world).generations>count,previous);
            for(let repeat=0;repeat<3;repeat++) await sample('Generated '+seed+' (ten residents)',tier);
        }
    }
    for(let repeat=0;repeat<6;repeat++) {
        await generate(17);
        await page.waitForTimeout(1200);
        regeneration.push({...JSON.parse(await canvas.getAttribute('data-metrics')),
            visibleMaterials:JSON.parse(await canvas.getAttribute('data-scene-audit')).materials.length});
    }
    const first=regeneration[0],last=regeneration.at(-1);
    assert.equal(last.geometries,first.geometries);
    assert.equal(last.textures,first.textures);
    assert.equal(last.calls,first.calls);
    assert.equal(last.visibleMaterials,first.visibleMaterials);
    assert.deepEqual(errors,[]);
    const runtime=[];
    for(const path of execFileSync('git',['ls-files','--cached','--others','--exclude-standard','src'],{encoding:'utf8'}).trim().split(/\r?\n/)) {
        runtime.push({path,sha256:createHash('sha256').update(await readFile(path)).digest('hex')});
    }
    const hardware=execFileSync('powershell',['-NoProfile','-Command',
        'Get-CimInstance Win32_Processor | Select-Object Name; Get-CimInstance Win32_VideoController | Select-Object Name,DriverVersion'],{encoding:'utf8'}).trim();
    await writeFile(output+'/browser-review.json',JSON.stringify({browser:browser.version(),hardware,
        parentCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),runtime,
        captures,runs,regeneration,errors},null,2)+'\n');
    console.log({captures:captures.length,runs:runs.length,regeneration:regeneration.length,errors});
} finally { await browser.close(); }
