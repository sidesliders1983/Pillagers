import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load-source.mjs';
const core = load('../src/simulation/SimulationCore.ts');
const { generateWorld } = load('../src/world-generation/GenerateWorld.ts');

test('Fjord founding projection presents canonical households, ten residents, cattle and ship without mutating gameplay', () => {
    const { createFjordLayout, projectFjordSettlement } = load('../src/fjord-play/FjordProjection.ts');
    const state = core.createCampaign(32);
    const before = core.serializeState(state);
    const world = generateWorld({ seed: 32, conifers: 'ez-tree' });
    const layout = createFjordLayout(world);
    const view = projectFjordSettlement(state, world, layout);
    const count = kind => view.entities.filter(e => e.kind === kind).length;
    assert.equal(count('persona'), 10);
    assert.equal(count('cattle'), 3);
    assert.equal(count('longship'), 1);
    assert.equal(count('building'), 0);
    assert.ok(view.entities.every(e=>e.transform), 'all founding identities must have a safe visible position');
    assert.equal(count('household'), Object.values(state.households).filter(h => h.memberIds.length).length);
    assert.equal(core.serializeState(state), before);
    assert.deepEqual(projectFjordSettlement(state, world, layout), view);
    assert.deepEqual(projectFjordSettlement(core.reconstructState(before), world, view.layout), view);
    assert.equal(new Set(view.entities.map(e => e.selectionKey)).size, view.entities.length);
});

test('physical building placement survives household moves, vacancy, upgrades and Farmyard changes', () => {
    const { createFjordLayout, projectFjordSettlement } = load('../src/fjord-play/FjordProjection.ts');
    let state = core.createCampaign(32, { initialMaterials: 500, foundingCoupleChanceBps: 0 });
    const world = generateWorld({ seed: 32 });
    let view = projectFjordSettlement(state, world, createFjordLayout(world));
    state = core.applyCommand(state, { type: 'AssignOccupation', personaId: 'founder-1', occupation: 'farmer' });
    state = core.applyCommand(state, { type: 'BuildHouse', householdId: 'founder-1' });
    view = projectFjordSettlement(state, world, view.layout);
    const original = view.entities.find(e => e.kind === 'building' && e.id === 'house-1');
    assert.ok(original, 'the canonical house must replace its household tent');
    assert.equal(original.status.farmyard, true);
    assert.equal(view.entities.some(e => e.kind === 'household' && e.id === 'founder-1'), false);
    state = core.applyCommand(state, { type: 'SpecializeBuilding', buildingId: 'house-1', occupation: 'farmer' });
    state = core.applyCommand(state, { type: 'UpgradeBuilding', buildingId: 'house-1' });
    state = core.applyCommand(state, { type: 'AssignCattle', cattleId: 'cattle-1', farmyardId: 'house-1' });
    view = projectFjordSettlement(state, world, view.layout);
    const upgraded = view.entities.find(e => e.kind === 'building' && e.id === 'house-1');
    assert.equal(upgraded.status.level, 1);
    assert.deepEqual(upgraded.transform, original.transform);
    assert.equal(view.entities.find(e => e.id === 'cattle-1').status.assignment, 'house-1');
    state = core.applyCommand(state, { type: 'AssignResidence', householdId: 'founder-1', residenceId: null });
    state = core.applyCommand(state, { type: 'AssignResidence', householdId: 'founder-2', residenceId: 'house-1' });
    view = projectFjordSettlement(state, world, view.layout);
    const moved = view.entities.find(e => e.kind === 'building' && e.id === 'house-1');
    assert.deepEqual(moved.transform, original.transform);
    assert.equal(moved.status.farmyard, false);
    assert.equal(view.entities.find(e => e.id === 'cattle-1').status.assignment, null);
    assert.deepEqual(projectFjordSettlement(core.reconstructState(core.serializeState(state)), world, view.layout), view);
});


test('Fjord campaign export preserves exact geography, layout and canonical replay across refresh and legacy import', () => {
    const { FjordCampaign } = load('../src/fjord-play/FjordCampaign.ts');
    const { GameplaySession } = load('../src/gameplay-lab/GameplaySession.ts');
    const session = new GameplaySession(32);
    const adapter = new FjordCampaign(session);
    const before = adapter.project();
    const exported = adapter.exportJSON();
    const restoredSession = new GameplaySession(17);
    const restored = new FjordCampaign(restoredSession);
    restored.importJSON(exported);
    assert.equal(restoredSession.saveJSON(), session.saveJSON());
    assert.deepEqual(restored.project(), before);
    assert.deepEqual(restored.blueprint, adapter.blueprint);
    for (let i = 0; i < 3; i++) {
        const plain = core.applyCommand(session.snapshot(), { type: 'AdvanceWinter' });
        session.command({ type: 'AdvanceWinter' });
        restoredSession.command({ type: 'AdvanceWinter' });
        adapter.project(); restored.project();
        assert.equal(session.saveJSON(), core.serializeState(plain));
        assert.equal(restoredSession.saveJSON(), session.saveJSON());
    }
    restored.importJSON(session.saveJSON());
    assert.equal(restoredSession.saveJSON(), session.saveJSON());
    const broken = JSON.parse(exported);
    broken.blueprint.config.seed = 17;
    const stable = restored.exportJSON();
    assert.throws(() => restored.importJSON(JSON.stringify(broken)), /identity|seed|match/i);
    assert.equal(restored.exportJSON(), stable, 'failed imports must be atomic');
});

test('Fjord layout rejects submerged and overlapping imports atomically; restart preserves geography', () => {
    const { FjordCampaign } = load('../src/fjord-play/FjordCampaign.ts');
    const { GameplaySession } = load('../src/gameplay-lab/GameplaySession.ts');
    const adapter = new FjordCampaign(new GameplaySession(32));
    const saved = adapter.exportJSON();
    const plots = Object.keys(JSON.parse(saved).layout.plots);
    for (const corrupt of [s => { s.layout.plots[plots[0]].y = -100; },
        s => { s.layout.plots[plots[1]] = s.layout.plots[plots[0]]; }]) {
        const invalid = JSON.parse(saved); corrupt(invalid);
        assert.throws(() => adapter.importJSON(JSON.stringify(invalid)), /layout|plot|support/i);
        assert.equal(adapter.exportJSON(), saved);
    }
    adapter.session.command({ type: 'AdvanceWinter' });
    adapter.restart(true);
    const restarted=JSON.parse(adapter.exportJSON()), original=JSON.parse(saved);
    assert.deepEqual(restarted.blueprint,original.blueprint);
    assert.deepEqual(restarted.layout,original.layout);
    assert.deepEqual(Object.values(restarted.campaign.personas).map(p=>p.dna),
        Object.values(original.campaign.personas).map(p=>p.dna));
});

test('Fjord parcels are dry, flat and disjoint; incremental building changes never move another parcel', () => {
    const { createFjordLayout, projectFjordSettlement } = load('../src/fjord-play/FjordProjection.ts');
    const { createBlueprintSurface } = load('../src/world-generation/TerrainQueries.ts');
    for (const seed of [17,32,91]) {
        let state = core.createCampaign(seed, { initialMaterials: 500, foundingCoupleChanceBps: 0 });
        const world = generateWorld({ seed });
        const surface = createBlueprintSurface(world);
        const before = projectFjordSettlement(state,world,createFjordLayout(world));
        const plots = Object.values(before.layout.plots);
        assert.equal(plots.length, 10);
        for (let i=0; i<plots.length; i++) {
            const p=plots[i], heights=[];
            for (const u of [-1,0,1]) for (const v of [-1,0,1]) {
                const x=p.x+u*p.halfWidth,z=p.z+v*p.halfDepth;
                const h=surface.surfaceHeightAt(x,z); heights.push(h);
                assert.ok(h>world.waterLevel+.25);
                assert.ok(surface.slopeAt(x,z)<=.12);
            }
            assert.ok(Math.max(...heights)-Math.min(...heights)<.15);
            for (const q of plots.slice(i+1)) assert.ok(Math.abs(p.x-q.x)>p.halfWidth+q.halfWidth ||
                Math.abs(p.z-q.z)>p.halfDepth+q.halfDepth);
        }
        state=core.applyCommand(state,{type:'BuildHouse',householdId:'founder-1'});
        const after=projectFjordSettlement(state,world,before.layout);
        assert.deepEqual(after.entities.find(e=>e.id==='house-1').transform, before.layout.plots['household:founder-1']);
        for (const [key,p] of Object.entries(before.layout.plots)) if (key!=='household:founder-1')
            assert.deepEqual(after.layout.plots[key],p);
    }
});
test('canonical death, slaughter, salvage and dwelling levels drive the active Fjord scene', () => {
    const { createFjordLayout, projectFjordSettlement } = load('../src/fjord-play/FjordProjection.ts');
    let state=core.createCampaign(32,{initialMaterials:1000},{mortalityBands:[{minAge:0,chanceBps:10000}]},{enabled:false});
    const world=generateWorld({seed:32});
    let view=projectFjordSettlement(state,world,createFjordLayout(world));
    state=core.applyCommand(state,{type:'BuildHouse',householdId:'founder-1'});
    state=core.applyCommand(state,{type:'SpecializeBuilding',buildingId:'house-1',occupation:'woodworker'});
    view=projectFjordSettlement(state,world,view.layout);
    const transform=view.entities.find(e=>e.id==='house-1').transform;
    for (const asset of ['homestead','longhouse','greatHall']) {
        state=core.applyCommand(state,{type:'UpgradeBuilding',buildingId:'house-1'});
        view=projectFjordSettlement(state,world,view.layout);
        const house=view.entities.find(e=>e.id==='house-1');
        assert.equal(house.asset,asset);assert.deepEqual(house.transform,transform);
    }
    state=core.applyCommand(state,{type:'SlaughterCattle',cattleId:'cattle-1'});
    state=core.applyCommand(state,{type:'SalvageLongship',longshipId:'founding-longship'});
    state=core.applyCommand(state,{type:'AdvanceWinter'});
    const canonical=core.serializeState(state);
    view=projectFjordSettlement(state,world,view.layout);
    assert.equal(view.entities.filter(e=>e.kind==='persona'||e.kind==='household'||e.kind==='longship').length,0);
    assert.ok(!view.entities.some(e=>e.id==='cattle-1'));
    assert.equal(view.entities.find(e=>e.id==='house-1').status.level,3);
    assert.equal(Object.values(state.personas).filter(p=>p.deathWinter!==null).length,10);
    assert.equal(core.serializeState(state),canonical);
    state=core.applyCommand(state,{type:'SalvageBuilding',buildingId:'house-1'});
    assert.ok(!projectFjordSettlement(state,world,view.layout).entities.some(e=>e.id==='house-1'));
});

test('a bound source mooring survives subsequent asset resolution and exact saved imports', () => {
    const { FjordCampaign }=load('../src/fjord-play/FjordCampaign.ts');
    const { GameplaySession }=load('../src/gameplay-lab/GameplaySession.ts');
    const campaign=new FjordCampaign(new GameplaySession(32));
    const source={x:10,y:-.05,z:-9,rotation:1.2,scale:1};
    campaign.setMooring(source);
    campaign.setMooring({x:99,y:0,z:99,rotation:0,scale:1});
    const saved=campaign.exportJSON();
    const restored=new FjordCampaign(new GameplaySession(17));restored.importJSON(saved);
    assert.deepEqual(restored.project().entities.find(e=>e.kind==='longship').transform,source);
    assert.equal(restored.exportJSON(),saved);
});

test('tent households retain grass; only canonical permanent houses create soil and salvage restores grass', () => {
    const { createFjordLayout, projectFjordSettlement } = load('../src/fjord-play/FjordProjection.ts');
    let state = core.createCampaign(32, { initialMaterials: 100 });
    const world = generateWorld({ seed: 32 });
    const geography = JSON.stringify(world);
    let view = projectFjordSettlement(state, world, createFjordLayout(world));
    assert.deepEqual(view.ground, { plots: [], paths: [] });
    state = core.applyCommand(state, { type: 'BuildHouse', householdId: 'founder-1' });
    view = projectFjordSettlement(state, world, view.layout);
    assert.deepEqual(view.ground.plots.map(p => p.id), ['house-1']);
    assert.equal(view.ground.paths.length, 0);
    assert.deepEqual(view.ground.plots[0].plot, view.entities.find(e => e.kind === 'building').plot);
    state = core.applyCommand(state, { type: 'SalvageBuilding', buildingId: 'house-1' });
    view = projectFjordSettlement(state, world, view.layout);
    assert.deepEqual(view.ground, { plots: [], paths: [] });
    assert.equal(JSON.stringify(world), geography, 'visual wear must never mutate saved geography');
});


test('permanent houses receive connected dry walking paths without routing through tent parcels', () => {
    const { createFjordLayout, projectFjordSettlement } = load('../src/fjord-play/FjordProjection.ts');
    const { createBlueprintSurface } = load('../src/world-generation/TerrainQueries.ts');
    let state = core.createCampaign(32, { initialMaterials: 500, foundingCoupleChanceBps: 0 });
    const world = generateWorld({ seed: 32 });
    const surface = createBlueprintSurface(world);
    let view = projectFjordSettlement(state, world, createFjordLayout(world));
    for (const id of ['founder-1', 'founder-2', 'founder-3'])
        state = core.applyCommand(state, { type: 'BuildHouse', householdId: id });
    view = projectFjordSettlement(state, world, view.layout);
    assert.equal(view.ground.plots.length, 3);
    assert.equal(view.ground.paths.length, 2, 'three houses need two connecting paths');
    const connected = new Set(view.ground.paths.flatMap(p => [p.from, p.to]));
    assert.deepEqual([...connected].sort(), ['house-1', 'house-2', 'house-3']);
    for (const path of view.ground.paths) {
        assert.ok(path.points.length >= 2);
        for (const p of path.points) {
            assert.ok(surface.surfaceHeightAt(p.x, p.z) >= world.waterLevel + .2);
            assert.ok(surface.slopeAt(p.x, p.z) <= .55);
            for (const tent of view.entities.filter(e => e.kind === 'household'))
                assert.ok(Math.abs(p.x-tent.plot.x) > tent.plot.halfWidth ||
                    Math.abs(p.z-tent.plot.z) > tent.plot.halfDepth);
        }
    }
    assert.deepEqual(projectFjordSettlement(core.reconstructState(core.serializeState(state)), world, view.layout).ground, view.ground);
});


test('presentation consumers cannot overwrite the next canonical ground projection', () => {
    const { createFjordLayout, projectFjordSettlement } = load('../src/fjord-play/FjordProjection.ts');
    let state = core.createCampaign(32, { initialMaterials: 100 });
    const world = generateWorld({ seed: 32 });
    let view = projectFjordSettlement(state, world, createFjordLayout(world));
    state = core.applyCommand(state, { type: 'BuildHouse', householdId: 'founder-1' });
    view = projectFjordSettlement(state, world, view.layout);
    const original = structuredClone(view.ground);
    view.ground.plots[0].plot.x = 1000;
    view.ground.plots.push({ id: 'not-a-canonical-house', plot: view.ground.plots[0].plot });
    assert.deepEqual(projectFjordSettlement(state, world, view.layout).ground, original);
});
