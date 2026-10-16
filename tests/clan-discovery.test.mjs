import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTypeScript } from '../scripts/load-typescript.mjs';
const discovery = loadTypeScript(new URL('../src/simulation/ClanDiscovery.ts', import.meta.url));

// A continuous 12 m ridge separates two flat coastal compartments.
const landscape = {
    waterLevel: -1,
    terrain: { bounds: { minX: 0, maxX: 64, minZ: 0, maxZ: 32 }, spacing: 8,
        columns: 9, rows: 5,
        heights: Array.from({ length: 45 }, (_, index) => index % 9 === 4 ? 12 : 0) },
};

test('founding observation maps its own ground but cannot see through a continuous ridge', () => {
    const state = discovery.createClanDiscovery(landscape, 'fixture-world-v1', 'home',
        [{ id: 'middle-place', kind: 'settlement', x: 4, z: 16 }], 800500);
    const view = discovery.inspectClanDiscovery(state, 'home');
    assert.equal(discovery.discoveryAt(view, 4, 16), 'visible');
    assert.equal(discovery.discoveryAt(view, 60, 16), 'unknown');
    assert.equal(discovery.discoveryAt(view, -1, 16), 'unknown');
    assert.equal(JSON.stringify(view).includes('middle-place'), false);
});

test('Core persists clan discovery and rejects invalid masks, future observations and world metadata', () => {
    const core = loadTypeScript(new URL('../src/simulation/SimulationCore.ts', import.meta.url));
    const original = core.createFixtureClan(32);
    original.discovery = discovery.createClanDiscovery(landscape, 'fixture-world-v1', 'fixture',
        [{ id: 'middle-place', kind: 'settlement', x: 4, z: 16 }], 800000);
    assert.deepEqual(core.reconstructState(core.serializeState(original)), original);
    for (const alter of [
        state => state.discovery.version = 9,
        state => state.discovery.worldId = '',
        state => state.discovery.clans.fixture.visible = 'ff',
        state => state.discovery.clans.fixture.explored = 'zz'.repeat(4),
        state => state.discovery.clans.fixture.observedAt = 800001,
        state => state.discovery.policy.cellSize = 0,
        state => state.discovery.grid.rows = 1000000,
        state => state.discovery.clans.fixture.explored = '00'.repeat(4),
    ]) {
        const corrupt = structuredClone(original);
        alter(corrupt);
        assert.throws(() => core.reconstructState(JSON.stringify(corrupt)), /discovery/i);
    }
});

test('confirmed observations persist separately for each clan and expose no hidden or stale enemy markers', () => {
    const home = [{ id: 'home', kind: 'settlement', x: 4, z: 16 }];
    const initial = discovery.createClanDiscovery(landscape, 'fixture-world-v1', 'home', home, 800500);
    const arrived = discovery.commitClanObservation(initial, landscape, 'fixture-world-v1', 'home',
        [...home, { id: 'scouts', kind: 'expedition', x: 60, z: 16 }], 800510);
    const markers = [
        { id: 'local', clanId: 'home', kind: 'persona', label: 'Liv', x: 4, y: 0, z: 16 },
        { id: 'rival', clanId: 'enemy', kind: 'persona', label: 'Unobserved name', x: 60, y: 0, z: 16,
            stocks: { food: 999 }, dna: { private: true } },
    ];
    const visible = discovery.inspectClanDiscovery(arrived, 'home');
    assert.deepEqual(discovery.projectDiscoveryEntities(visible, 'home', markers).map(m => m.id), ['local', 'rival']);
    assert.equal(JSON.stringify(discovery.projectDiscoveryEntities(visible, 'home', markers)).includes('stocks'), false);
    assert.equal(JSON.stringify(discovery.projectDiscoveryEntities(visible, 'home', markers)).includes('dna'), false);
    const departed = discovery.commitClanObservation(arrived, landscape, 'fixture-world-v1', 'home', home, 800520);
    const view = discovery.inspectClanDiscovery(departed, 'home');
    assert.equal(discovery.discoveryAt(view, 60, 16), 'mapped');
    assert.deepEqual(discovery.projectDiscoveryEntities(view, 'home', markers).map(m => m.id), ['local']);
    assert.equal(discovery.discoveryAt(discovery.inspectClanDiscovery(departed, 'enemy'), 60, 16), 'unknown');
    assert.equal(discovery.discoveryAt(discovery.inspectClanDiscovery(initial, 'home'), 60, 16), 'unknown');
    assert.throws(() => discovery.commitClanObservation(initial, landscape, 'another-world', 'home', home, 800520), /world/i);
    assert.deepEqual(discovery.commitClanObservation(initial, landscape, 'fixture-world-v1', 'home', home, 800520),
        discovery.commitClanObservation(initial, landscape, 'fixture-world-v1', 'home', home, 800520));
});

test('binding a physical founding world changes only discovery and preserves headless time/RNG/old saves', () => {
    const core = loadTypeScript(new URL('../src/simulation/SimulationCore.ts', import.meta.url));
    const original = core.createCampaign(32);
    const world = { ...landscape, settlement: { center: { x: 4, z: 16 }, harbor: { x: 4, z: 8 } } };
    const bound = core.initializePhysicalDiscovery(original, world, 'fixture-world-v1');
    const { discovery: mask, ...rest } = bound;
    assert.deepEqual(rest, original);
    assert.equal(discovery.discoveryAt(discovery.inspectClanDiscovery(mask, original.clan.id), 60, 16), 'unknown');
    const step = state => core.applyCommand(state, { type: 'AdvanceTicks', ticks: 27 });
    const advanced = step(core.reconstructState(core.serializeState(bound)));
    const { discovery: advancedMask, ...advancedDomestic } = advanced;
    assert.deepEqual(advancedDomestic, step(original));
    assert.deepEqual(advancedMask, mask);
    assert.deepEqual(core.reconstructState(core.serializeState(original)), original);
    assert.throws(() => core.initializePhysicalDiscovery(bound, world, 'other-world'), /discovery|world/i);
});

test('the player discovery read model is immutable and contains only the requested clan', () => {
    const state = discovery.createClanDiscovery(landscape, 'fixture-world-v1', 'home',
        [{ id: 'home', kind: 'settlement', x: 4, z: 16 }], 800500);
    const withEnemy = discovery.commitClanObservation(state, landscape, 'fixture-world-v1', 'enemy',
        [{ id: 'enemy-site', kind: 'settlement', x: 60, z: 16 }], 800510);
    const view = discovery.inspectClanDiscovery(withEnemy, 'home');
    assert.ok(Object.isFrozen(view));
    assert.ok(Object.isFrozen(view.grid.bounds));
    assert.equal(JSON.stringify(view).includes('enemy'), false);
    assert.equal(discovery.discoveryAt(view, 60, 16), 'unknown');
    assert.throws(() => { view.grid.bounds.minX = -100; }, TypeError);
});

test('a saved physical campaign cannot substitute an enemy mask for its own clan', () => {
    const core = loadTypeScript(new URL('../src/simulation/SimulationCore.ts', import.meta.url));
    const state = core.createFixtureClan(32);
    state.discovery = discovery.createClanDiscovery(landscape, 'fixture-world-v1', 'enemy',
        [{ id: 'enemy-site', kind: 'settlement', x: 60, z: 16 }], 800000);
    assert.throws(() => core.reconstructState(JSON.stringify(state)), /discovery/i);
});

test('rebinding cannot accept another terrain extent under an existing identity', () => {
    const core = loadTypeScript(new URL('../src/simulation/SimulationCore.ts', import.meta.url));
    const world = { ...landscape, settlement: { center: { x: 4, z: 16 }, harbor: null } };
    const state = core.initializePhysicalDiscovery(core.createFixtureClan(32), world, 'fixture-world-v1');
    const changed = { ...world, terrain: { ...world.terrain,
        bounds: { ...world.terrain.bounds, maxX: 72 } } };
    assert.throws(() => core.initializePhysicalDiscovery(state, changed, 'fixture-world-v1'), /discovery|world/i);
});

test('the real Fjord session keeps old campaigns untouched and round-trips opted-in knowledge atomically', async () => {
    const { readFile } = await import('node:fs/promises');
    const { SharedSettlement } = loadTypeScript(new URL('../src/play/SharedSettlement.ts', import.meta.url));
    const text = await readFile(new URL('../docs/qa/fjord-runtime-performance/fixtures/developed-810.json', import.meta.url), 'utf8');
    const campaign = SharedSettlement.restore(text, 'fjord');
    const original = campaign.session.snapshot();
    const published = campaign.session.book.snapshot();
    assert.equal(original.discovery, undefined);
    campaign.fjord.enableDiscovery();
    const bound = campaign.session.snapshot();
    const { discovery: mask, ...domestic } = bound;
    assert.deepEqual(domestic, original);
    assert.deepEqual(campaign.session.book.snapshot(), published);
    const checkpoint = campaign.persist();
    const loaded = SharedSettlement.restore(checkpoint, 'fjord');
    assert.deepEqual(loaded.session.snapshot(), bound);
    assert.deepEqual(loaded.session.book.snapshot(), published);
    assert.deepEqual(loaded.fjord.readProjection().entities, campaign.fjord.readProjection().entities);
    for (const corrupt of [
        saved => saved.fjord.campaign.discovery.worldId = 'another-physical-world',
        saved => saved.fjord.campaign.discovery.grid.bounds.minX -= 8,
    ]) {
        const saved = JSON.parse(checkpoint);
        corrupt(saved);
        // The optional narrative envelope has its own full-state integrity guard.
        // Omit it here to exercise geography rejection independently of that guard.
        delete saved.fjord.narrative;
        assert.throws(() => loaded.importJSON(JSON.stringify(saved.fjord)), /discovery/i);
        assert.deepEqual(loaded.session.snapshot(), bound);
    }
});
