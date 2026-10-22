import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { load } from './load-source.mjs';
const { Group, Mesh, MeshStandardMaterial, BoxGeometry, Texture, Vector3 } = createRequire(import.meta.url)('three');
const { HomeGroundGlow } = load('../src/world/HomeGroundGlow.ts');

function house() {
    const root = new Group();
    root.userData.homeLightWindows = [{ position: [2, 2.5, 0], outward: [1, 0, 0] }];
    return root;
}

test('warm spill follows transformed window direction and terrain, and updates only its uniform during darkness', () => {
    const home = house(); home.position.set(20, 4, 10); home.rotation.y = Math.PI / 2;
    const heightAt = (x, z) => x * .03 + z * .01;
    const glow = new HomeGroundGlow(heightAt);
    glow.sync([home]); glow.setDarkness(.5);
    const geometry = glow.mesh.geometry, material = glow.mesh.material;
    assert.equal(glow.inspect().patches, 1); assert.equal(glow.inspect().drawCalls, 1);
    const vertices = geometry.getAttribute('position');
    for (let i = 0; i < vertices.count; i++) {
        assert.ok(Math.abs(vertices.getY(i) - heightAt(vertices.getX(i), vertices.getZ(i)) - .045) < 1e-6);
        assert.ok(vertices.getZ(i) < 8, 'Rotated outward window points to world -Z');
    }
    const indices = geometry.index, point = new Vector3(), b = new Vector3(), c = new Vector3();
    point.fromBufferAttribute(vertices, indices.getX(0)); b.fromBufferAttribute(vertices, indices.getX(1));
    c.fromBufferAttribute(vertices, indices.getX(2));
    assert.ok(b.sub(point).cross(c.sub(point)).y > 0, 'Ground-facing triangles face up');
    const version = material.version, positionArray = vertices.array;
    glow.sync([home]);
    for (let i = 0; i < 60; i++) glow.setDarkness(i / 60);
    assert.equal(glow.inspect().rebuilds, 1);
    assert.equal(material.version, version); assert.equal(vertices.array, positionArray);
    assert.equal(glow.mesh.castShadow, false); assert.equal(material.depthWrite, false);
    glow.setDarkness(0); assert.equal(glow.mesh.visible, false);
    glow.setDarkness(1); glow.sync([]); assert.equal(glow.mesh.visible, false);
    assert.equal(glow.inspect().patches, 0);
    glow.dispose();
});

test('hidden or mapped-only rival ground receives no spill, and visibility changes invalidate a stable home', () => {
    let visible = false;
    const glow = new HomeGroundGlow(() => 0, () => visible), home = house();
    glow.sync([home]); glow.setDarkness(1);
    assert.equal(glow.inspect().patches, 0); assert.equal(glow.mesh.geometry.index.count, 0);
    visible = true; glow.setVisibilityVersion('observed'); glow.sync([home]);
    assert.equal(glow.inspect().patches, 1);
    visible = false; glow.setVisibilityVersion('mapped'); glow.sync([home]);
    assert.equal(glow.inspect().patches, 0); assert.equal(glow.mesh.visible, false);
    let geometries = 0, materials = 0;
    glow.mesh.geometry.addEventListener('dispose', () => geometries++);
    glow.mesh.material.addEventListener('dispose', () => materials++);
    glow.dispose(); assert.equal(geometries, 1); assert.equal(materials, 1);
});

test('real entity occupancy and removal gate both the window and batched ground spill', async () => {
    const { FjordEntities } = load('../src/fjord-play/FjordEntities.ts');
    const geometry = new BoxGeometry(), source = new MeshStandardMaterial(), mask = new Texture();
    const models = { async create() { const root = new Group(), model = house(); model.name = 'homestead';
        model.add(new Mesh(geometry, source)); root.add(model); return root; },
        async reconcile(model, entity) { model.userData.canonical = entity.status; },
        release() { return false; }, boundsShape() { return ''; } };
    const layer = new FjordEntities(models, undefined, new Map([['homestead', mask]]));
    const terrain = { bounds: { minX: -30, minZ: -30, maxX: 30, maxZ: 30 }, spacing: 60,
        columns: 2, rows: 2, heights: [0, 0, 0, 0] };
    layer.setHomeGround({ terrain, waterLevel: -1 }); layer.setHomeDarkness(1);
    const entity = { id: 'home', kind: 'building', selectionKey: 'building:home', asset: 'homestead',
        transform: { x: 0, y: 0, z: 0, rotation: 0, scale: 1 }, status: { living: true, inhabited: true } };
    await layer.sync([entity]); assert.equal(layer.inspectHomeGround().patches, 1);
    await layer.sync([{ ...entity, status: { ...entity.status, inhabited: false } }]);
    assert.equal(layer.inspectHomeGround().patches, 0);
    await layer.sync([entity]); layer.setHomeGround({ terrain, waterLevel: -1 });
    assert.equal(layer.inspectHomeGround().patches, 1, 'Terrain replacement while paused retains glow');
    layer.setHomeGround({ terrain, waterLevel: 1 });
    assert.equal(layer.inspectHomeGround().patches, 0, 'Window spill cannot paint submerged terrain');
    layer.setHomeGround({ terrain, waterLevel: -1 });
    await layer.sync([]); assert.equal(layer.inspectHomeGround().patches, 0);
    layer.dispose(); geometry.dispose(); source.dispose(); mask.dispose();
});
