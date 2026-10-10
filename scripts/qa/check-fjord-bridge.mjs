import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { loadTypeScript } from '../load-typescript.mjs';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ||
    'C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const core = loadTypeScript(new URL('../../src/simulation/SimulationCore.ts',import.meta.url));
const origin = process.env.QA_ORIGIN || 'http://127.0.0.1:5180';
const output = process.env.QA_OUTPUT || 'docs/qa/simulation-fjord-bridge';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await context.newPage();
page.setDefaultTimeout(120000);
const errors = [], checks = [], evidence = {};
page.on('pageerror', error => errors.push(error.message));
const click = name => page.getByRole('button',{ name,exact:true }).click({noWaitAfter:true});
const rendered = () => page.locator('#fjord-canvas').getAttribute('data-rendered').then(JSON.parse);
const projected = () => page.locator('#fjord-canvas').getAttribute('data-entities').then(JSON.parse);
const exportFjord = async () => {
    const [download] = await Promise.all([page.waitForEvent('download'),click('Export Fjord campaign')]);
    return JSON.parse(await readFile(await download.path(),'utf8'));
};
const importCore = async state => {
    await page.locator('#fjord-import').setInputFiles({name:'campaign.json',mimeType:'application/json',buffer:Buffer.from(core.serializeState(state))});
    await page.locator('#fjord-notice').filter({hasText:'Campaign imported, paused.'}).waitFor();
};
try {
    const started = Date.now();
    await page.goto(origin + '/fjord-play', { waitUntil: 'domcontentloaded' });
    await page.locator('#fjord-canvas[data-ready="true"]').waitFor();
    evidence.readyMilliseconds = Date.now()-started;
    const initial = await rendered();
    for (const [kind,count] of [['persona',10],['cattle',3],['longship',1],['household',7],['building',0]])
        assert.equal(initial.filter(e=>e.kind===kind).length,count);
    assert.ok(initial.every(e=>!e.placeholder),'prepared source assets should load in the complete local checkout');
    assert.equal(JSON.parse(await page.locator('#fjord-canvas').getAttribute('data-environment')).buildings,0);
    assert.ok(initial.filter(e=>e.kind==='persona').every(e=>Math.abs(e.bounds.max[1]-e.bounds.min[1]-1.8)<.01), JSON.stringify(initial.filter(e=>e.kind==='persona')));
    assert.equal(JSON.parse(await page.locator('#fjord-canvas').getAttribute('data-ground')).soilSamples,0,
        'tent-only founding settlement must have grass with no prototype soil or paths');
    checks.push('Actual rendered founding IDs: 10 source humans, 7 household tents, 3 source cattle and 1 real longship; no prototype gameplay homes');
    await page.screenshot({path:output+'/founding-desktop.png'});
    console.log('Founding source assets verified');
    await page.getByText('Settlement identities',{exact:true}).click();
    const resident=page.locator('#fjord-identities button[data-kind="persona"]').first();
    const residentName=await resident.innerText();
    await resident.click();
    assert.match(await page.locator('#fjord-selected').innerText(),new RegExp(residentName));
    await page.getByText('Settlement identities',{exact:true}).click();
    checks.push('Canonical identity list selection displays the selected resident and is persisted with the campaign');
    await page.getByText('Campaign',{exact:true}).click();
    const saved = await exportFjord();
    assert.equal(saved.layout.mooringResolved,true);
    const ship = initial.find(e=>e.kind==='longship');
    assert.deepEqual(ship.position,[saved.layout.mooring.x,saved.layout.mooring.y,saved.layout.mooring.z]);
    await page.reload({waitUntil:'domcontentloaded'});
    await page.locator('#fjord-canvas[data-ready="true"]').waitFor();
    await page.getByText('Campaign',{exact:true}).click();
    assert.deepEqual(await exportFjord(),saved,'refresh must preserve the complete campaign, geography and metric layout');
    checks.push('Exact refresh/export round trip and persisted coastal mooring');
    const reloaded=await rendered();
    await click('+1 Winter');
    await page.locator('#fjord-winter').filter({hasText:'801'}).waitFor();
    const afterWinter=await rendered();
    for (const entity of reloaded) {
        const current=afterWinter.find(e=>e.key===entity.key);
        if (current) {assert.deepEqual(current.position,entity.position);
            assert.equal(current.renderId,entity.renderId,'unchanged source instances are retained');}
    }
    checks.push('Winter updates preserve surviving founding transforms');
    await click('Restart with same founders');
    await page.locator('#fjord-winter').filter({hasText:'800'}).waitFor();
    const restarted=await exportFjord();
    assert.deepEqual(restarted.blueprint,saved.blueprint);
    assert.deepEqual(restarted.layout,saved.layout);
    let state=core.createCampaign(32,{initialMaterials:500,foundingCoupleChanceBps:0});
    for (const command of [
        {type:'AssignOccupation',personaId:'founder-1',occupation:'farmer'},
        {type:'BuildHouse',householdId:'founder-1'},
        {type:'AssignCattle',cattleId:'cattle-1',farmyardId:'house-1'},
        {type:'BuildHouse',householdId:'founder-2'},
        {type:'SpecializeBuilding',buildingId:'house-2',occupation:'woodworker'},
        {type:'UpgradeBuilding',buildingId:'house-2'},
    ]) state=core.applyCommand(state,command);
    await importCore(state);
    const ground=JSON.parse(await page.locator('#fjord-canvas').getAttribute('data-ground'));
    assert.deepEqual(ground.plots,['house-1','house-2']);
    assert.equal(ground.paths.length,1);
    assert.ok(ground.soilSamples>0);
    checks.push('Founding tents have grass only; canonical construction adds soil and a dry path connecting the two permanent homes');
    const houses=await rendered(),house=houses.find(e=>e.id==='house-1' && e.kind==='building');
    assert.equal(house.farmyard,true);
    assert.equal(houses.find(e=>e.id==='house-2' && e.kind==='building').level,1);
    const parcels=(await projected()).filter(e=>e.kind==='building');
    for (const parcel of parcels) {
        const mesh=houses.find(e=>e.key===parcel.selectionKey);
        assert.ok(mesh.bounds.max[0]-mesh.bounds.min[0]<=parcel.plot.halfWidth*2+.01);
        assert.ok(mesh.bounds.max[2]-mesh.bounds.min[2]<=parcel.plot.halfDepth*2+.01);
    }
    assert.equal(houses.find(e=>e.id==='cattle-1').assignment,'house-1');
    await page.getByText('Campaign',{exact:true}).click();
    await page.screenshot({path:output+'/canonical-houses-farmyard.png'});
    await page.getByText('Campaign',{exact:true}).click();
    const built=await exportFjord();
    await click('Save locally');
    await click('+1 Winter');
    await click('Load locally');
    await page.locator('#fjord-notice').filter({hasText:'Shared campaign loaded, paused.'}).waitFor();
    assert.deepEqual(await exportFjord(),built);
    checks.push('Canonical construction, level-1 home, active authored Farmyard, cattle assignment, source footprint fit and exact local save/load');
    state=core.applyCommand(state,{type:'AssignResidence',householdId:'founder-1',residenceId:null});
    state=core.applyCommand(state,{type:'AssignResidence',householdId:'founder-3',residenceId:'house-1'});
    await importCore(state);
    const moved=await rendered();
    assert.deepEqual(moved.find(e=>e.key===house.key).position,house.position);
    assert.equal(moved.find(e=>e.key===house.key).farmyard,false);
    assert.equal(moved.find(e=>e.id==='cattle-1').assignment,null);
    checks.push('Household transfer retains physical building; last-farmer departure deactivates Farmyard and unassigns cattle');
    state=core.applyCommand(state,{type:'SalvageBuilding',buildingId:'house-1'});
    state=core.applyCommand(state,{type:'SlaughterCattle',cattleId:'cattle-1'});
    state=core.applyCommand(state,{type:'SalvageLongship',longshipId:'founding-longship'});
    await importCore(state);
    const removed=await rendered();
    assert.ok(!removed.some(e=>e.key==='building:house-1'||e.key==='cattle:cattle-1'||e.kind==='longship'));
    checks.push('Salvage and slaughter remove actual rendered identities');
    await page.setViewportSize({width:1024,height:768});
    await page.screenshot({path:output+'/ipad-viewport.png'});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    const canvasBox=await page.locator('#fjord-canvas').boundingBox();
    assert.ok(canvasBox.height>=768*.6);
    checks.push('iPad-sized viewport retains canvas area and collapsible diagnostics without horizontal overflow (Chromium emulation, not physical Safari)');
    evidence.founding=initial;
    evidence.houseScene=houses;
    console.log('Campaign and canonical update checks verified');
    // Fault injection at the HTTP asset boundary, not internal simulation stubs.
    const missing=await browser.newPage({viewport:{width:1024,height:768}});
    missing.setDefaultTimeout(120000);
    const missingErrors=[];missing.on('pageerror',e=>missingErrors.push(e.message));
    await missing.route(/\.(glb|png|webp|jpg)(\?|$)|\/manifest\.json/,route=>route.abort());
    await missing.goto(origin+'/fjord-play',{waitUntil:'domcontentloaded'});
    await missing.locator('#fjord-canvas[data-ready="true"]').waitFor();
    const fallback=JSON.parse(await missing.locator('#fjord-canvas').getAttribute('data-rendered'));
    assert.equal(fallback.filter(e=>e.kind==='persona').length,10);
    assert.equal(fallback.filter(e=>e.kind==='cattle').length,3);
    assert.equal(fallback.filter(e=>e.kind==='longship').length,1);
    assert.ok(fallback.every(e=>e.placeholder));
    await missing.getByRole('button',{name:'+1 Winter',exact:true}).click({noWaitAfter:true});
    await missing.locator('#fjord-winter').filter({hasText:'801'}).waitFor();
    assert.deepEqual(missingErrors,[]);
    await missing.screenshot({path:output+'/missing-assets-fallback.png'});
    await missing.close();
    console.log('Missing asset fallbacks verified');
    checks.push('All GLB/images/manifests unavailable: explicit metric placeholders remain visible and Winter commands still work, no unhandled errors');
    for (const route of ['/play','/gameplay-lab']) {
        const legacy=await context.newPage();legacy.setDefaultTimeout(120000);
        legacy.on('pageerror',error=>errors.push(error.message));
        await legacy.goto(origin+route,{waitUntil:'domcontentloaded'});
        await legacy.getByRole('link',{name:'3D Fjord',exact:true}).waitFor();
        if (route==='/play') await legacy.locator('#play-settings > summary').click();
        await legacy.getByRole('button',{name:'Load locally',exact:true}).click();
        await legacy.locator('[role="status"]').filter({hasText:'loaded'}).waitFor();
        assert.match(await legacy.locator('header').innerText(),/800/);
        assert.match(await legacy.locator('header').innerText(),new RegExp('Materials '+built.campaign.stocks.materials));
        await legacy.getByRole('button',{name:'+1 Winter',exact:true}).click();
        assert.match(await legacy.locator('header').innerText(),/801/);
        await legacy.close();
    }
    checks.push('Existing /play and /gameplay-lab load the shared plain canonical save and advance the same campaign');
    assert.deepEqual(errors,[]);
    await writeFile(output+'/browser.json',JSON.stringify({origin,checks,errors,evidence,
        renderer:'Chromium / SwiftShader / Low / DPR 1',physicalIPadVerified:false},null,2));
    console.log(JSON.stringify({checks:checks.length,errors}));
} finally { await browser.close(); }