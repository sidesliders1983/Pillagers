import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { load } from './load-source.mjs';

const { createCampaignIsland, campaignIslandPlan, islandRecipe, adoptCampaignIsland } =
    load('../src/fjord-play/CampaignIsland.ts');
const { SharedSettlement, inspectSettlementSave } = load('../src/play/SharedSettlement.ts');
const { createBlueprintSurface } = load('../src/world-generation/TerrainQueries.ts');
const { natureNavigation } = load('../src/world-generation/PlanNature.ts');
const { createNatureFromPlan } = load('../src/world/KayKitNature.ts');
const { createVillageNatureResolver } = load('../src/world/VillageNatureModels.ts');
const { NatureWind } = load('../src/world/NatureWind.ts');
const { Box3, BoxGeometry, Group, InstancedMesh, Matrix4, Mesh, MeshStandardMaterial, Vector3 } =
    createRequire(import.meta.url)('three');
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const tree = p => /conifer|deciduous/.test(p.assetId);
const oldHashes = new Map([
    [17, '49403b70494f860507dee3c7d7d2798b38ced1edfb5643393633b2a2f36c6eba'],
    [32, '60a7d74db1afcadeadb7a76385d8872b622cae57044f3f4c9b577fd27645cef6']
]);

test('v1 campaign geography replays the exact merged-main fingerprint on both curated islands', () => {
    for (const [seed, expected] of oldHashes) {
        const world = createCampaignIsland(seed, islandRecipe(seed, 'island-pool-v1'));
        assert.equal(digest(world), expected, 'Saved terrain, nature, biome and navigation bytes stay pinned');
    }
});

test('v2 groups trees near each village without raising asset quotas or changing terrain/foundations', () => {
    for (const seed of [17, 32]) {
        const old = createCampaignIsland(seed, islandRecipe(seed, 'island-pool-v1'));
        const world = createCampaignIsland(seed), plan = campaignIslandPlan(world);
        assert.equal(plan.recipe.version, 'island-pool-v2');
        assert.notEqual(world, old);
        for (const key of ['terrain', 'coast', 'environment', 'biomes', 'settlement', 'rivalSite'])
            assert.equal(digest(world[key]), digest(old[key]), key);
        assert.deepEqual(plan.plots, campaignIslandPlan(old).plots);
        assert.deepEqual(plan.berth, campaignIslandPlan(old).berth);
        const byAsset = placements => placements.reduce((counts, p) => {
            counts[p.assetId] = (counts[p.assetId] ?? 0) + 1;
            return counts;
        }, {});
        assert.deepEqual(byAsset(world.placementPlan), byAsset(old.placementPlan));
        const local = w => w.placementPlan.filter(p => tree(p) &&
            Math.hypot(p.x - plan.center.x, p.z - plan.center.z) < 65).length;
        assert.ok(local(world) >= local(old) + 5, 'At least five additional trees within 65 m: ' + local(old) + ' → ' + local(world));
        const surface = createBlueprintSurface(world);
        for (const p of world.placementPlan.filter(tree)) {
            assert.ok(p.y > world.waterLevel + .4);
            assert.equal(p.y, surface.surfaceHeightAt(p.x, p.z));
            for (const plot of plan.plots) {
                const distance = Math.hypot(Math.max(0, Math.abs(p.x - plot.x) - plot.halfWidth),
                    Math.max(0, Math.abs(p.z - plot.z) - plot.halfDepth));
                assert.ok(distance >= p.clearance + .6, 'All future upgraded home parcels remain available');
            }
            const col = Math.round(p.x - world.navigation.bounds.minX);
            const row = Math.round(p.z - world.navigation.bounds.minZ);
            assert.equal(world.navigation.cells[row * world.navigation.columns + col], false,
                'Every visible trunk is a real canonical obstacle and work target');
        }
        assert.ok(plan.access.campRoute > 0 && plan.access.rivalRoute > 0);
    }
});

test('both recipe versions round-trip and coexist in caches, workers, restores and same-founder restarts', () => {
    for (const version of ['island-pool-v1', 'island-pool-v2']) {
        const owner = new SharedSettlement(17, 123, true, version, 'summer-800-v1');
        const original = owner.fjord.blueprint;
        const snapshot = owner.persist();
        const metadata = inspectSettlementSave(snapshot);
        assert.equal(metadata.island.version, version);
        const plan = campaignIslandPlan(original), clone = structuredClone(original);
        adoptCampaignIsland(17, clone, structuredClone(plan), metadata.island);
        assert.equal(createCampaignIsland(17, metadata.island), clone);
        const restored = SharedSettlement.restore(snapshot, 'fjord');
        assert.equal(restored.persist(), snapshot);
        assert.equal(digest(restored.fjord.blueprint), digest(original));
        restored.restart(true);
        assert.equal(campaignIslandPlan(restored.fjord.blueprint).recipe.version, version);
        assert.equal(digest(restored.fjord.blueprint), digest(original));
        const damaged = JSON.parse(snapshot);
        damaged.fjord.island.version = 'island-pool-v999';
        assert.throws(() => inspectSettlementSave(JSON.stringify(damaged)), /recipe version/);
        assert.throws(() => owner.importJSON(JSON.stringify(damaged.fjord)), /recipe version/);
        assert.equal(owner.persist(), snapshot, 'Rejected versions cannot partially change a campaign');
    }
    assert.equal(campaignIslandPlan(createCampaignIsland(17)).recipe.version, 'island-pool-v2');
});

test('recipe choice and scenery do not change ordinary gameplay commands or Core RNG', () => {
    const versions = ['island-pool-v1', 'island-pool-v2'].map(version =>
        new SharedSettlement(32, 123, true, version, 'summer-800-v1'));
    const same = () => assert.equal(versions[0].session.saveJSON(), versions[1].session.saveJSON());
    same();
    const homes = Object.keys(versions[0].session.readSnapshot().households).slice(0, 2);
    for (const command of [{ type: 'SalvageLongship', longshipId: 'founding-longship' },
        ...homes.map(householdId => ({ type: 'BuildHouse', householdId })),
        { type: 'AdvanceTicks', ticks: 12 }]) {
        for (const owner of versions) owner.command(command);
        same();
    }
});

test('nature navigation carves current placements from a clean field rather than retaining moved-tree blockers', () => {
    const nav = { bounds: { minX: 0, maxX: 12, minZ: 0, maxZ: 12 }, columns: 13,
        rows: 13, spacing: 1, cells: Array(169).fill(true) };
    const placement = x => ({ assetId: 'kaykit-conifer-c', x, z: 6, clearance: 1 });
    const before = natureNavigation(nav, [placement(3)]), after = natureNavigation(nav, [placement(9)]);
    assert.equal(before.cells[6 * 13 + 3], false);
    assert.equal(after.cells[6 * 13 + 3], true);
    assert.equal(after.cells[6 * 13 + 9], false);
    assert.ok(nav.cells.every(Boolean), 'The underlying foundation navigation remains immutable');
});

test('tree variation stays inside canonical source bounds and preserves shared primitives, anchors and materials', () => {
    const geometry = new BoxGeometry(2, 4, 2), leaf = new MeshStandardMaterial({ name: 'leaves' });
    const branches = new MeshStandardMaterial({ name: 'branches' });
    const model = new Group();
    for (const material of [leaf, branches]) {
        const mesh = new Mesh(geometry, material);
        mesh.position.y = 2;
        model.add(mesh);
    }
    const assets = { get: () => model.clone(true) };
    const plan = [4, 10, 16].map(x => ({ assetId: 'kaykit-conifer-a', x, y: 5, z: 4,
        rotation: .4, scale: 1, clearance: 4 }));
    const before = JSON.stringify(plan);
    const fixed = createNatureFromPlan(assets, plan, 17), varied = createNatureFromPlan(assets, plan, 17, undefined, true);
    const colored = varied.children.find(mesh => mesh.material === leaf && mesh.count);
    assert.equal(colored.geometry, geometry);
    assert.ok(colored.instanceColor);
    assert.deepEqual(colored.userData.sourceAnchors, plan.map(({ x, z }) => ({ x, z })));
    const matrix = new Matrix4(), fixedBox = new Box3(), variedBox = new Box3();
    geometry.computeBoundingBox();
    for (let i = 0; i < plan.length; i++) {
        fixed.children.find(mesh => mesh.material === leaf && mesh.count).getMatrixAt(i, matrix);
        fixedBox.copy(geometry.boundingBox).applyMatrix4(matrix);
        colored.getMatrixAt(i, matrix);
        variedBox.copy(geometry.boundingBox).applyMatrix4(matrix);
        assert.ok(fixedBox.expandByScalar(.00001).containsBox(variedBox));
    }
    const wind = new NatureWind(varied, true);
    const shader = { uniforms: {}, vertexShader: 'void main() {\n#include <project_vertex>\n}', fragmentShader: '' };
    colored.material.onBeforeCompile(shader);
    assert.match(shader.vertexShader, /instanceMatrix\[3\].xz/);
    wind.update(12);
    assert.equal(shader.uniforms.uTime.value, 12);
    assert.notEqual(colored.material, leaf);
    assert.equal(varied.children.find(mesh => mesh.material === branches).material, branches);
    assert.equal(leaf.color.getHex(), 0xffffff);
    assert.equal(JSON.stringify(plan), before);
    wind.dispose();
    for (const root of [fixed, varied]) root.traverse(mesh => { if (mesh instanceof InstancedMesh) mesh.dispose(); });
    geometry.dispose(); leaf.dispose(); branches.dispose();
});


test('v2 birch/sapling reuse registered models within canonical role extents and fall back on missing sources', () => {
    const geometry = new BoxGeometry(8, 20, 8), material = new MeshStandardMaterial();
    const source = new Group(), mesh = new Mesh(geometry, material);
    mesh.position.y = 10;
    source.add(mesh);
    const assets = { has: () => true, get: () => source.clone(true) };
    const fallback = new Group();
    const resolve = createVillageNatureResolver(assets, () => fallback);
    for (const [id, height, radius] of [['kaykit-deciduous-a', 4.929624, 2.807897],
        ['kaykit-conifer-c', 5.274395, 2.349842]]) {
        const model = resolve(id);
        assert.equal(model, resolve(id), 'Measured model wrapper is cached');
        assert.equal(model.children[0].geometry, geometry);
        assert.equal(model.children[0].material, material);
        const bounds = new Box3().setFromObject(model);
        assert.ok(bounds.min.y >= -.00001 && bounds.max.y <= height);
        assert.ok(Math.hypot(bounds.max.x, bounds.max.z) <= radius);
    }
    assert.equal(resolve('kaykit-conifer-a'), fallback);
    assert.equal(createVillageNatureResolver({ ...assets, has: () => false }, () => fallback)
        ('kaykit-deciduous-a'), fallback);
    const placeholder = source.clone(true);
    placeholder.userData.placeholder = true;
    assert.equal(createVillageNatureResolver({ ...assets, get: () => placeholder }, () => fallback)
        ('kaykit-conifer-c'), fallback);
    assert.deepEqual(source.scale.toArray(), [1, 1, 1]);
    geometry.dispose(); material.dispose();
});
