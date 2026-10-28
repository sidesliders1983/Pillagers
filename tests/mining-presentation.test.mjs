import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {JSDOM} from 'jsdom';
import {createRequire} from 'node:module';
const {PerspectiveCamera, Group, Mesh, BoxGeometry, MeshStandardMaterial, Texture} = createRequire(import.meta.url)('three');
const {MiningModelAsset} = load('../src/fjord-play/MiningModelAsset.ts');
import {loadDOMSource as load} from './load-dom-source.mjs';
const core = load('../src/simulation/SimulationCore.ts');
const {planOreSites} = load('../src/world-generation/OreSites.ts');
const {campaignIslandCatalog} = load('../src/fjord-play/BakedIslandCatalog.ts');
const {placeMiningModel, miningForecourtHeight} = load('../src/fjord-play/MiningPlacement.ts');
const {createBlueprintSurface} = load('../src/world-generation/TerrainQueries.ts');
const {MiningLayer} = load('../src/fjord-play/MiningLayer.ts');
const {MiningPanel, renderMining} = load('../src/fjord-play/MiningPanel.ts');
const entry = campaignIslandCatalog.entries.find(e => e.version === 'island-pool-v3' && e.seed === 18);
const original = JSON.parse(gunzipSync(readFileSync('public' + entry.path))).world;
const world = {...original, oreSites: planOreSites(original)}, worldId = 'mining-presentation';
const context = {world, worldId};
let initial = core.initializePhysicalMining(core.initializePhysicalDiscovery(core.createCampaign(32, {initialMaterials: 40}), world, worldId), world, worldId);
const site = initial.mining.sites[0];
function scout() {
    let state = core.applyCommand(initial, {type: 'CreateExplorationGroup'}, context);
    state = core.applyCommand(state, {type: 'SetExplorationMember', groupId: 'group-1', personaId: 'founder-2', included: true}, context);
    state = core.applyCommand(state, {type: 'StartExpedition', groupId: 'group-1'}, context);
    state = core.applyCommand(state, {type: 'ExploreArea', groupId: 'group-1', target: site.approach}, context);
    return core.applyCommand(state, {type: 'AdvanceTicks', ticks: 350}, context);
}

test('developed mine entrances stay on a level forecourt with their rear embedded in actual island slopes', () => {
    for (const entry of campaignIslandCatalog.entries.filter(entry => entry.version === 'island-pool-v3')) {
        const world = JSON.parse(gunzipSync(readFileSync('public' + entry.path))).world;
        const before = JSON.stringify(world), surface = createBlueprintSurface(world);
        for (const site of planOreSites(world).sites) {
            const placement = placeMiningModel(world, site), pad = placement.forecourt;
            assert.ok(placement.rearTerrainHeight > pad.height + .1, site.id + ': rear intersects the hillside');
            // The doorway is 1.45 m in front of the model origin, behind the projecting rails.
            const door = {x: placement.model.x + pad.front.x * 1.45, z: placement.model.z + pad.front.z * 1.45};
            for (const side of [-.7, 0, .7]) {
                const x = door.x + pad.right.x * side, z = door.z + pad.right.z * side;
                assert.ok(surface.surfaceHeightAt(x, z) <= pad.height + .25, site.id + ': doorway is not buried');
            }
            assert.ok(Math.abs(miningForecourtHeight(placement, pad.center, -100) - pad.height) < 1e-10);
            assert.equal(miningForecourtHeight(placement, {x: pad.center.x + 20, z: pad.center.z + 20}, 7), 7);
        }
        assert.equal(JSON.stringify(world), before, 'Placement never reshapes saved geography');
    }
});

test('unknown ore has no object, label, reserve or pick; known outcrops reuse bounded geometry and release it', () => {
    const layer = new MiningLayer();
    layer.sync(initial);
    assert.deepEqual(layer.inspect().sites, []);
    assert.doesNotMatch(renderMining(initial, site.id), /remaining|founder|Iron Ore/);
    const known = scout();
    const before = core.serializeState(known);
    layer.sync(known);
    assert.ok(layer.inspect().sites.includes(site.id));
    assert.equal(layer.inspect().trianglesPerSite, 60);
    assert.doesNotMatch(renderMining(known, site.id), new RegExp(`${site.initialUnits} Iron Ore remaining`));
    const camera = new PerspectiveCamera(45, 1, .1, 1000);
    camera.position.set(site.position.x, site.position.y + 8, site.position.z + 10);
    camera.lookAt(site.position.x, site.position.y + .65, site.position.z);
    camera.updateMatrixWorld();
    assert.equal(layer.pick(camera, 100, 100, {left: 0, top: 0, width: 200, height: 200}), site.id);
    const built = core.applyCommand(known,{type:'BuildMine',siteId:site.id},context);
    layer.sync(built, world);
    assert.equal(layer.inspect().developedSites,1);
    assert.equal(layer.inspect().maximumTrianglesPerSite,6769);
    const geometries = new Set(); layer.root.traverse(mesh => {if (mesh.geometry) geometries.add(mesh.geometry);});
    let released = 0; for (const geometry of geometries) geometry.addEventListener('dispose', () => released++);
    layer.dispose();
    assert.equal(released, 3);
    assert.equal(core.serializeState(known), before);
});

test('the Mining panel commits actual Core work/assignment commands and closes on campaign replacement', async () => {
    const dom = new JSDOM('<main><button id="scene">Scene</button></main>', {pretendToBeVisual: true});
    const saved = {};
    for (const key of ['window', 'document', 'Node', 'HTMLElement', 'Element', 'HTMLButtonElement', 'AbortController',
        'HTMLDetailsElement', 'HTMLOptionElement', 'HTMLSelectElement', 'HTMLInputElement']) {
        saved[key] = globalThis[key]; globalThis[key] = key === 'window' ? dom.window : dom.window[key];
    }
    let panel;
    try {
        const {GameplaySession} = load('../src/gameplay-lab/GameplaySession.ts');
        const session = new GameplaySession();
        session.loadJSON(core.serializeState(scout()));
        session.bindPhysicalWorld(world, worldId);
        let state = session.readSnapshot(), epoch = 1;
        panel = new MiningPanel(document.querySelector('main'), () => session.readSnapshot(), async commands => {
            session.commandBatch(commands);
            state = session.readSnapshot();
        }, () => epoch);
        document.querySelector('#scene').focus();
        panel.open(site.id);
        assert.match(document.body.textContent, /Unassessed rock/);
        const food = state.stocks.food, materials = state.stocks.materials;
        document.querySelector('[data-mine-develop]').click();
        await new Promise(resolve=>setImmediate(resolve));
        assert.equal(state.stocks.materials,materials-20);
        assert.ok(state.mining.sites.find(s=>s.id===site.id).mine);
        assert.match(document.body.textContent,/full productivity/);
        document.querySelector('[data-mine-assign="founder-1"]').click();
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(state.personas['founder-1'].occupation, 'miner');
        assert.equal(state.mining.workers['founder-1'].siteId, site.id);
        assert.equal(state.stocks.food, food);
        assert.match(document.body.textContent, /Traveling/);
        session.commandBatch([{type:'AssignOccupation',personaId:'founder-3',occupation:'miner'}]);
        panel.openForResident('founder-3');
        assert.match(document.body.textContent,/Choose a known site/);
        document.querySelector(`[data-mine-site="${site.id}"]`).click();
        await new Promise(resolve=>setImmediate(resolve));
        assert.equal(session.readSnapshot().mining.workers['founder-3'].siteId,site.id);
        const {SettlementPanel}=load('../src/play/SettlementPanel.ts');
        const legacy=document.createElement('section');
        legacy.innerHTML=new SettlementPanel().render(session.readSnapshot(),{kind:'persona',id:'founder-3'});
        assert.equal(legacy.querySelector('#occupation').value,'miner');
        assert.ok(legacy.querySelector('[data-mining-resident="founder-3"]'));

        document.querySelector('[data-mine-close]').click();
        assert.equal(document.activeElement.id, 'scene');
        panel.open(site.id); epoch++; panel.refresh();
        assert.equal(document.querySelector('[aria-label="Iron outcrop"]').hidden, true);
        panel.dispose(); panel = undefined;
        assert.equal(document.querySelector('[aria-label="Iron outcrop"]'), null);
    } finally {
        panel?.dispose(); dom.window.close();
        for (const [key, value] of Object.entries(saved)) {
            if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
        }
    }
});

test('a Mining campaign can replay its original founders before binding the new physical scene', () => {
    const {GameplaySession} = load('../src/gameplay-lab/GameplaySession.ts');
    const session = new GameplaySession();
    session.loadJSON(core.serializeState(scout()));
    const before = session.saveJSON();
    const replay = session.restartProposal();
    assert.equal(session.saveJSON(), before);
    const snapshot = replay.readSnapshot();
    assert.equal(snapshot.mining, undefined, 'The physical Mining extension is bound by the new scene');
    for (const id of initial.landing.founderIds) assert.deepEqual(snapshot.personas[id].dna, initial.personas[id].dna);
});

test('authored mine data loads once only for known development and releases shared resources on scene disposal', async () => {
    const bytes = readFileSync('public/game-assets/mining/mine.glb');
    let downloads = 0, geometryReleased = 0;
    const root = new Group(), geometry = new BoxGeometry();
    geometry.addEventListener('dispose', () => geometryReleased++);
    root.add(new Mesh(geometry, new MeshStandardMaterial()));
    const source = new MiningModelAsset('/', async () => {downloads++; return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length);}, async () => root);
    const layer = new MiningLayer(source);
    const known = scout(), built = core.applyCommand(known, {type: 'BuildMine', siteId: site.id}, context);
    layer.sync(initial, world); layer.sync(known, world);
    assert.equal(downloads, 0, 'Sighted bare outcrops do not request the mine asset');
    const before = core.serializeState(built);
    layer.sync(built, world); layer.sync(built, world);
    await source.prepare();
    assert.equal(downloads, 1);
    assert.equal(layer.inspect().asset.state, 'ready');
    assert.equal(layer.inspect().asset.estimatedTextureMiB, 8);
    assert.equal(layer.inspect().developedSites, 1);
    layer.setWinterWeight(1);
    assert.equal(layer.inspect().winterLights, 1);
    assert.equal(layer.inspect().shadowLights, 0);
    layer.setWinterWeight(0);
    assert.equal(layer.inspect().winterLights, 0);
    layer.sync(initial, world);
    assert.equal(layer.root.children.length, 0, 'An old load never displays unknown ore in a replacement campaign');
    assert.equal(geometryReleased, 0, 'Template remains shared until its scene owner is disposed');
    layer.dispose(); layer.dispose(); layer.sync(built, world);
    assert.equal(geometryReleased, 1);
    assert.equal(layer.root.children.length, 0, 'A disposed layer cannot be resurrected');
    assert.equal(core.serializeState(built), before);
});

test('late or failed mine decoding cannot leak resources or leave a disposed scene visible', async () => {
    const bytes = readFileSync('public/game-assets/mining/mine.glb');
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length);
    let start, finish;
    const started = new Promise(resolve => start = resolve);
    const decoded = new Promise(resolve => finish = resolve);
    const root = new Group(), geometry = new BoxGeometry(), texture = new Texture();
    let geometries = 0, materials = 0, textures = 0, bitmaps = 0;
    texture.image = {close: () => bitmaps++};
    const material = new MeshStandardMaterial({map: texture});
    geometry.addEventListener('dispose', () => geometries++);
    material.addEventListener('dispose', () => materials++);
    texture.addEventListener('dispose', () => textures++);
    root.add(new Mesh(geometry, material), new Mesh(geometry, material));
    const source = new MiningModelAsset('/', async () => buffer, async () => {start(); return decoded;});
    const pending = source.prepare();
    await started;
    source.dispose(); finish(root);
    assert.equal(await pending, undefined);
    assert.deepEqual([geometries, materials, textures, bitmaps], [1,1,1,1]);
    assert.equal(source.inspect().state, 'disposed');
    let corruptDecoded = false;
    const corrupt = new MiningModelAsset('/', async () => new ArrayBuffer(12), async () => {corruptDecoded = true; return root;});
    assert.equal(await corrupt.prepare(), undefined);
    assert.equal(corrupt.inspect().state, 'failed');
    assert.equal(corruptDecoded, false, 'Invalid asset bytes never reach the decoder');
    corrupt.dispose();
});

test('wet lowland dressing follows discovery and owns bounded presentation resources without changing Core', () => {
    const {WetLowlandLayer} = load('../src/fjord-play/WetLowlandLayer.ts');
    const {planMiningSites} = load('../src/world-generation/OreSites.ts');
    const {planRoute} = load('../src/world-generation/LandRoutes.ts');
    const {routeLength} = load('../src/simulation/SpatialExpeditions.ts');
    const entry = campaignIslandCatalog.entries.find(e => e.version === 'island-pool-v3' && e.seed === 101);
    const source = JSON.parse(gunzipSync(readFileSync('public' + entry.path))).world;
    const world = {...source, oreSites: planMiningSites(source)}, worldId = 'wet-presentation';
    const context = {world, worldId}, bog = world.oreSites.sites.find(site => site.appearance === 'bog-iron');
    let state = core.initializePhysicalMining(core.initializePhysicalDiscovery(core.createCampaign(32), world, worldId), world, worldId);
    const layer = new WetLowlandLayer();
    layer.sync(state, world);
    assert.equal(layer.inspect().cells, 8, 'Only the eight wet cells in the founding discovery mask are shown');
    state = core.applyCommand(state, {type: 'CreateExplorationGroup'}, context);
    state = core.applyCommand(state, {type: 'SetExplorationMember', groupId: 'group-1', personaId: 'founder-2', included: true}, context);
    state = core.applyCommand(state, {type: 'StartExpedition', groupId: 'group-1'}, context);
    state = core.applyCommand(state, {type: 'ExploreArea', groupId: 'group-1', target: bog.approach}, context);
    const distance = routeLength(planRoute(context, bog.approach, world.settlement.center, true).route);
    state = core.applyCommand(state, {type: 'AdvanceTicks', ticks: Math.ceil(distance / 2) + 10}, context);
    const body = renderMining(state, bog.id);
    assert.match(body, /Unassessed deposit/);
    assert.doesNotMatch(body, /Unassessed rock|Build mine/);
    const before = core.serializeState(state);
    layer.sync(state, world);
    assert.ok(layer.inspect().cells > 8 && layer.inspect().cells <= 64);
    assert.ok(layer.inspect().reedInstances <= 128);
    assert.ok(layer.inspect().triangles <= 12288);
    assert.equal(layer.inspect().drawCalls, 3);
    assert.ok(layer.inspect().waterPatches > 0);
    const ground = layer.root.children.find(mesh => mesh.name === 'Wet peat bed');
    const positions = ground.geometry.getAttribute('position'), uv = ground.geometry.getAttribute('uv');
    const coordinates = new Map();
    for (let i = 0; i < positions.count; i++) {
        const key = positions.getX(i) + ':' + positions.getZ(i), value = [uv.getX(i),uv.getY(i)];
        if (coordinates.has(key)) assert.deepEqual(value,coordinates.get(key),'Adjacent ground triangles share continuous texture coordinates');
        coordinates.set(key,value);
    }
    assert.doesNotMatch(JSON.stringify(layer.inspect()), /bog-iron|initialUnits|remainingUnits/);
    const geometries = new Set(); layer.root.traverse(mesh => {if (mesh.geometry) geometries.add(mesh.geometry);});
    let released = 0; geometries.forEach(g => g.addEventListener('dispose', () => released++));
    layer.dispose(); layer.dispose(); layer.sync(state, world);
    assert.equal(released, geometries.size);
    assert.equal(layer.root.children.length, 0);
    assert.equal(core.serializeState(state), before);
});

test('a Miner stays visible outside, works unseen in a developed mine, and reappears on recall', async () => {
    const {FjordEntities}=load('../src/fjord-play/FjordEntities.ts');
    const {createFjordLayout,projectFjordSettlement,geographyIdentity}=load('../src/fjord-play/FjordProjection.ts');
    const models={
        async create() {const root=new Group();root.add(new Mesh(new BoxGeometry(.6,1.5,.6),new MeshStandardMaterial()));return root;},
        async reconcile() {},boundsShape:()=> 'fixed',pace:()=>1,animate() {},
        release(root) {root.traverse(node=>{node.geometry?.dispose();node.material?.dispose();});return true;},
    };
    const {adoptCampaignIsland}=load('../src/fjord-play/CampaignIsland.ts');
    const payload=JSON.parse(gunzipSync(readFileSync('public'+entry.path)));
    adoptCampaignIsland(0,world,payload.plan);
    const layer=new FjordEntities(models),layout=createFjordLayout(world,undefined,0);
    const physicalId=geographyIdentity(world),bound={world,worldId:physicalId};
    let state=core.initializePhysicalMining(core.initializePhysicalDiscovery(core.createCampaign(0,{initialMaterials:40}),world,physicalId),world,physicalId);
    for(const command of [{type:'CreateExplorationGroup'},
        {type:'SetExplorationMember',groupId:'group-1',personaId:'founder-2',included:true},
        {type:'StartExpedition',groupId:'group-1'},
        {type:'ExploreArea',groupId:'group-1',target:site.approach},{type:'AdvanceTicks',ticks:350},
        {type:'AssignOccupation',personaId:'founder-1',occupation:'miner'}]) state=core.applyCommand(state,command,bound);
    state=core.applyCommand(state,{type:'AssignMiner',personaId:'founder-1',siteId:site.id},bound);
    const update=async()=>{
        layer.prepareMining(state,world,.5);
        await layer.sync(projectFjordSettlement(state,world,layout).entities.filter(e=>e.kind==='persona'&&e.id==='founder-1'));
        layer.advance({inspect:()=>[]},.6,true);
    };
    try {
        await update();assert.equal(layer.performanceCounts().renderedResidents,1,'Traveling stays visible');
        state=core.applyCommand(state,{type:'AdvanceTicks',ticks:250},bound);
        await update();assert.equal(layer.performanceCounts().renderedResidents,1,'Natural outcrop work stays outdoors');
        state=core.applyCommand(state,{type:'BuildMine',siteId:site.id},bound);
        const before=core.serializeState(state);
        await update();assert.equal(layer.performanceCounts().renderedResidents,0,'Developed-mine work is inside');
        assert.equal(layer.humanPositions().length,0);
        assert.equal(layer.productionAnchors().length,0,'No floating producer anchor remains over an invisible person');
        assert.equal(core.serializeState(state),before);
        state=core.applyCommand(core.reconstructState(before),{type:'RecallMiner',personaId:'founder-1'},bound);
        await update();assert.equal(layer.performanceCounts().renderedResidents,1,'The returning Miner comes outside');
    } finally {layer.dispose();}
});


test('discovered flat marsh ground carries water above the peat while raised banks stay dry', () => {
    const {WetLowlandLayer} = load('../src/fjord-play/WetLowlandLayer.ts');
    const save = JSON.parse(readFileSync('docs/qa/mining-223/bog-campaign.json', 'utf8'));
    const entry = campaignIslandCatalog.entries.find(e => e.version === 'island-pool-v3' && e.seed === 101);
    const source = JSON.parse(gunzipSync(readFileSync('public' + entry.path))).world;
    const world = {...source, oreSites: save.fjord.oreSites};
    const state = core.reconstructState(JSON.stringify(save.fjord.campaign));
    const before = core.serializeState(state), surface = createBlueprintSurface(world);
    const layer = new WetLowlandLayer();
    try {
        layer.sync(state, world);
        const water = layer.root.children.find(mesh => mesh.name === 'Shallow bog water');
        const positions = water.geometry.getAttribute('position');
        const coverage = water.geometry.getAttribute('wetCoverage');
        const depths = water.geometry.getAttribute('waterDepth');
        let flatGround = 0, coveredFlatGround = 0, dryBanks = 0;
        for (let i = 0; i < positions.count; i++) {
            const wet = coverage.getX(i), depth = depths.getX(i);
            if (wet >= .7 && surface.slopeAt(positions.getX(i), positions.getZ(i)) <= .08) {
                flatGround++;
                if (depth >= .08) coveredFlatGround++;
            }
            if (wet > .08 && depth <= 0) dryBanks++;
        }
        assert.ok(flatGround > 100, 'The genuine scouted fixture contains a substantial flat marsh bed');
        assert.ok(coveredFlatGround / flatGround >= .7,
            'Water must visibly cover most flat peat, not only the lowest corner: ' + coveredFlatGround + '/' + flatGround);
        assert.ok(dryBanks > 0, 'Ground rising above each horizontal pool stays dry');
        assert.equal(layer.inspect().drawCalls, 3, 'Broader water uses the same bounded rendering budget');
        assert.equal(core.serializeState(state), before, 'Water presentation changes no saved geography or gameplay');
    } finally {layer.dispose();}
});


test('a discovered marsh combines taller rooted procedural grass with shared Cattails without changing Core', async () => {
    const {WetLowlandLayer} = load('../src/fjord-play/WetLowlandLayer.ts');
    const {WetlandModelAsset} = load('../src/fjord-play/WetlandModelAsset.ts');
    const {discoveryAt, inspectClanDiscovery} = load('../src/simulation/ClanDiscovery.ts');
    const {Matrix4, Vector3, Quaternion} = createRequire(import.meta.url)('three');
    const save = JSON.parse(readFileSync('docs/qa/mining-223/bog-campaign.json', 'utf8'));
    const entry = campaignIslandCatalog.entries.find(e => e.version === 'island-pool-v3' && e.seed === 101);
    const world = {...JSON.parse(gunzipSync(readFileSync('public' + entry.path))).world, oreSites: save.fjord.oreSites};
    const state = core.reconstructState(JSON.stringify(save.fjord.campaign)), before = core.serializeState(state);
    const bytes = readFileSync('public/game-assets/wetlands/cattail.glb');
    let downloads = 0;
    const source = new WetlandModelAsset('/', async () => {
        downloads++; return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    }, async () => {
        const root = new Group();
        root.add(new Mesh(new BoxGeometry(.2, 1, .1).translate(0, .5, 0), new MeshStandardMaterial()));
        return root;
    });
    const layer = new WetLowlandLayer(undefined, '/', source);
    try {
        layer.sync(core.createCampaign(0), world);
        assert.equal(downloads, 0, 'Unknown wetlands load no decorative model');
        layer.sync(state, world);
        await source.prepare();
        assert.equal(downloads, 1);
        assert.ok(layer.inspect().grassTufts > 0 && layer.inspect().grassTufts <= 256);
        assert.ok(layer.inspect().reedInstances > 0 && layer.inspect().reedInstances <= 32);
        assert.equal(layer.inspect().drawCalls, 4);
        assert.ok(layer.inspect().triangles <= 30000);
        const grass = layer.root.getObjectByName('Tall marsh grass');
        const cattails = layer.root.getObjectByName('Marsh Cattails');
        const matrix = new Matrix4(), position = new Vector3(), rotation = new Quaternion(), scale = new Vector3();
        const known = inspectClanDiscovery(state.discovery, state.clan.id), surface = createBlueprintSurface(world);
        for (const mesh of [grass, cattails]) for (let i = 0; i < mesh.count; i++) {
            mesh.getMatrixAt(i, matrix); matrix.decompose(position, rotation, scale);
            assert.notEqual(discoveryAt(known, position.x, position.z), 'unknown');
            assert.ok(Math.abs(position.y - surface.surfaceHeightAt(position.x, position.z)) <= .035,
                'Plant roots follow the real peat bed instead of floating on the water');
            if (mesh === grass) assert.ok(scale.y >= .85 && scale.y <= 1.2,
                'Marsh grass is substantially taller than the ordinary 0.4 m grass');
        }
        layer.setTime(3);
        assert.equal(grass.material.uniforms.time.value, 3);
        layer.setTime(3);
        assert.equal(grass.material.uniforms.time.value, 3, 'The existing paused clock holds grass wind');
        assert.equal(core.serializeState(state), before);
    } finally {layer.dispose();}
    assert.equal(layer.root.children.length, 0);
    assert.equal(source.inspect().state, 'disposed');
});
