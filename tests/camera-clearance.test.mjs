import test from 'node:test';
import assert from 'node:assert/strict';
import { PerspectiveCamera, Object3D, Vector3 } from 'three';
import { load } from './load-source.mjs';
const { solveCameraClearance } = load('../src/camera/CameraClearance.ts');
const { RTSCameraController } = load('../src/camera/RTSCameraController.ts');
const { createBlueprintSurface } = load('../src/world-generation/TerrainQueries.ts');

function field(height) {
    const bounds = { minX: -10, maxX: 10, minZ: -10, maxZ: 10 };
    const terrain = { bounds, spacing: 2, columns: 11, rows: 11,
        heights: Array.from({ length: 121 }, (_, i) => height(-10 + i % 11 * 2, -10 + Math.floor(i / 11) * 2)) };
    return { terrain, ...createBlueprintSurface({ terrain, waterLevel: 0 }) };
}

function checkBoom(focus, eye, surface, start = 3) {
    const horizontal = Math.hypot(eye.x - focus.x, eye.z - focus.z);
    for (let i = 0; i <= 2000; i++) {
        const t = i / 2000;
        if (t * horizontal < start) continue;
        const x = focus.x + (eye.x - focus.x) * t;
        const z = focus.z + (eye.z - focus.z) * t;
        const y = focus.y + (eye.y - focus.y) * t;
        assert.ok(y >= Math.max(0, surface.surfaceHeightAt(x, z)) + .3499,
            'Camera boom crosses terrain at ' + JSON.stringify({ x, y, z }));
    }
}

test('a ridge between an above-ground eye and focus lifts the eye without moving the requested orbit', () => {
    const surface = field((_x, z) => z === 4 || z === 6 ? 12 : 0);
    const focus = { x: 0, y: 0, z: 0 }, eye = { x: 0, y: 10, z: 10 };
    const original = JSON.stringify({ focus, eye });
    const result = solveCameraClearance({ focus, eye, heightAt: surface.surfaceHeightAt,
        grid: surface.terrain, maximumHeight: 12, waterLevel: 0 });
    assert.ok(result.eyeY > 20, 'Endpoint-only clearance would miss this intervening ridge.');
    checkBoom(focus, { ...eye, y: result.eyeY }, surface);
    assert.equal(JSON.stringify({ focus, eye }), original);
    assert.ok(result.samples <= 512);
});


test('grazing a canonical triangle edge cannot slip between regular boom samples', () => {
    const surface = field((x, z) => x === 2 && z === 2 ? 2000 : 0);
    const focus = { x: -4.13, y: 0, z: 3.99 }, eye = { x: 8.19, y: 1, z: 3.99 };
    assert.ok(surface.surfaceHeightAt(2, 3.99) > 9, 'Fixture crosses a narrow triangle tip.');
    const result = solveCameraClearance({ focus, eye, heightAt: surface.surfaceHeightAt,
        grid: surface.terrain, maximumHeight: 2000, waterLevel: 0 });
    checkBoom(focus, { ...eye, y: result.eyeY }, surface);
});


test('collision escape is immediate and downward recovery depends on time rather than frame rate', () => {
    const ridge = field((_x, z) => z === 4 || z === 6 ? 12 : 0), flat = field(() => 0);
    const focus = { x: 0, y: 0, z: 0 }, eye = { x: 0, y: 10, z: 10 };
    const request = { focus, eye, heightAt: ridge.surfaceHeightAt, grid: ridge.terrain,
        maximumHeight: 12, waterLevel: 0 };
    const escape = solveCameraClearance({ ...request, previousLift: 0, deltaSeconds: .00001 });
    checkBoom(focus, { ...eye, y: escape.eyeY }, ridge);
    const clear = { ...request, heightAt: flat.surfaceHeightAt, maximumHeight: 0 };
    const recovery = solveCameraClearance({ ...clear, previousLift: escape.lift, deltaSeconds: 1 / 60 });
    assert.ok(recovery.lift > 0 && recovery.lift < escape.lift, 'No snap down after leaving the ridge.');
    const after = frames => {
        let previousLift = escape.lift;
        for (let i = 0; i < frames; i++) previousLift = solveCameraClearance({
            ...clear, previousLift, deltaSeconds: 1 / frames }).lift;
        return previousLift;
    };
    assert.ok(Math.abs(after(30) - after(60)) < 1e-9);
    assert.ok(after(60) < escape.lift / 10, 'Lift settles back toward the original requested orbit.');
    assert.equal(solveCameraClearance({ ...clear, previousLift: escape.lift, deltaSeconds: 0 }).lift, escape.lift);
});


test('camera clearance protects the near-plane footprint beside a steep slope', () => {
    const surface = field(x => x * 30);
    const focus = { x: -4, y: 0, z: 0 }, eye = { x: 0, y: 2, z: 0 };
    const result = solveCameraClearance({ focus, eye, heightAt: surface.surfaceHeightAt,
        grid: surface.terrain, maximumHeight: 300, waterLevel: 0, nearRadius: .2 });
    assert.ok(result.eyeY >= 8 - 1e-9, 'The near-plane edge needs clearance too, not only its center.');
});


function cameraFixture() {
    const previousWindow = globalThis.window;
    globalThis.window = new EventTarget();
    const canvas = new EventTarget();
    canvas.setPointerCapture = () => {};
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 600 });
    const camera = new PerspectiveCamera(45, 4 / 3, .1, 2000);
    const controller = new RTSCameraController(camera, canvas, 'pan');
    return { camera, canvas, controller, close() {
        controller.dispose();
        if (previousWindow === undefined) delete globalThis.window;
        else globalThis.window = previousWindow;
    } };
}

test('the real RTS controller applies terrain safety immediately to an authored setView pose', () => {
    const surface = field((_x, z) => z === 4 || z === 6 ? 12 : 0);
    const fixture = cameraFixture();
    try {
        const { camera, controller } = fixture;
        controller.setNavigationSurface(new Object3D(), new Vector3(), surface.bounds,
            surface.surfaceHeightAt, { terrain: surface.terrain, waterLevel: 0 });
        controller.setView({ position: [0, 10, 10], target: [0, 0, 0] });
        assert.ok(camera.position.y > 20);
        assert.equal(camera.position.x, 0);
        assert.ok(Math.abs(camera.position.z - 10) < 1e-9);
        assert.deepEqual(controller.focus.toArray(), [0, 0, 0]);
        checkBoom(controller.focus, camera.position, surface);
    } finally { fixture.close(); }
});


test('invalid camera poses are rejected before mutation and unavailable terrain uses a finite conservative ceiling', () => {
    const flat = field(() => 0);
    const request = { focus: { x: 0, y: 0, z: 0 }, eye: { x: 0, y: 10, z: 10 },
        heightAt: flat.surfaceHeightAt, grid: flat.terrain, maximumHeight: 25, waterLevel: 0 };
    assert.throws(() => solveCameraClearance({ ...request, eye: { x: NaN, y: 1, z: 2 } }), RangeError);
    assert.throws(() => solveCameraClearance({ ...request, settings: { nearTarget: 0 } }), RangeError);
    assert.throws(() => solveCameraClearance({ ...request, eye: { x: 1e308, y: 1, z: 0 },
        maximumHeight: 1e308, heightAt: () => 1e308 }), RangeError);
    const unavailable = solveCameraClearance({ ...request, heightAt: () => NaN });
    assert.ok(Number.isFinite(unavailable.eyeY));
    assert.ok(unavailable.invalidSamples > 0 && unavailable.conservative);
    assert.ok(unavailable.eyeY >= 27);
    const fixture = cameraFixture();
    try {
        const before = fixture.camera.position.toArray();
        assert.throws(() => fixture.controller.setView({ position: [NaN, 1, 2], target: [0, 0, 0] }), RangeError);
        assert.deepEqual(fixture.camera.position.toArray(), before);
    } finally { fixture.close(); }
});


test('authored low review poses retain their explicit clearance and Home restores the gameplay margin', () => {
    const flat = field(() => 0), fixture = cameraFixture();
    try {
        const { camera, controller } = fixture;
        controller.setNavigationSurface(new Object3D(), new Vector3(), flat.bounds,
            flat.surfaceHeightAt, { terrain: flat.terrain, waterLevel: 0 });
        controller.setView({ position: [0, .6, .65], target: [0, .6, 0] }, { groundClearance: .2 });
        assert.ok(Math.abs(camera.position.y - .6) < 1e-9, 'Tent-interior review stays at the authored eye height.');
        controller.home();
        controller.update(1);
        assert.ok(controller.inspectClearance().groundClearance >= 2);
    } finally { fixture.close(); }
});


test('flat land, sea and bounded emergency fallback keep finite predictable clearance', () => {
    const flat = field(() => -7);
    const request = { focus: { x: 0, y: 0, z: 0 }, eye: { x: 0, y: 10, z: 10 },
        heightAt: flat.surfaceHeightAt, grid: flat.terrain, maximumHeight: 0, waterLevel: 0 };
    assert.equal(solveCameraClearance(request).eyeY, 10, 'Flat shore leaves the requested camera unchanged.');
    const below = solveCameraClearance({ ...request, eye: { x: 0, y: -3, z: 10 } });
    assert.ok(below.eyeY >= 2, 'Sea level remains a physical floor.');
    const vertical = solveCameraClearance({ ...request, eye: { x: 0, y: -3, z: 0 } });
    assert.ok(vertical.eyeY >= 2 && Number.isFinite(vertical.minimumBoomClearance));
    const bounded = solveCameraClearance({ ...request, eye: { x: 900, y: 10, z: 900 },
        settings: { maxSamples: 8 }, maximumHeight: 20 });
    assert.ok(bounded.samples <= 8 && bounded.conservative && Number.isFinite(bounded.eyeY));
    assert.ok(bounded.minimumBoomClearance >= .35 - 1e-8);
});

test('orbiting away from a ridge recovers without changing requested zoom or focus; rebinding clears stale lift', () => {
    const ridge = field((_x, z) => z === 4 || z === 6 ? 12 : 0), flat = field(() => 0);
    const fixture = cameraFixture();
    try {
        const { controller, canvas } = fixture;
        controller.setNavigationSurface(new Object3D(), new Vector3(), ridge.bounds,
            ridge.surfaceHeightAt, { terrain: ridge.terrain, waterLevel: 0 });
        controller.setView({ position: [0, 10, 10], target: [0, 0, 0] });
        const before = controller.inspectClearance();
        const send = (type, properties) => {
            const event = new Event(type, { cancelable: true });
            Object.assign(event, { pointerId: 1, pointerType: 'mouse', clientX: 400, clientY: 300,
                movementX: 0, movementY: 0, button: 2, ...properties });
            canvas.dispatchEvent(event);
        };
        send('pointerdown');
        send('pointermove', { movementX: Math.PI / .006 });
        send('pointerup');
        for (let i = 0; i < 120; i++) controller.update(1 / 60);
        const after = controller.inspectClearance();
        assert.ok(after.lift < before.lift / 100);
        assert.equal(after.requestedZoom, before.requestedZoom);
        assert.deepEqual(after.focus, before.focus);
        controller.setNavigationSurface(new Object3D(), new Vector3(), flat.bounds,
            flat.surfaceHeightAt, { terrain: flat.terrain, waterLevel: 0 });
        controller.setView({ position: [0, 10, 10], target: [0, 0, 0] });
        assert.equal(controller.inspectClearance().lift, 0);
    } finally { fixture.close(); }
});


test('panning across a ridge keeps the interpolated navigation focus on canonical ground', () => {
    const surface = field((x, _z) => x === 0 || x === 2 ? 20 : 0), fixture = cameraFixture();
    try {
        const { controller, canvas } = fixture;
        controller.setNavigationSurface(new Object3D(), new Vector3(-4, 0, 0), surface.bounds,
            surface.surfaceHeightAt, { terrain: surface.terrain, waterLevel: 0 });
        controller.setView({ position: [-4, 12, 12], target: [-4, 0, 0] });
        const send = (type, properties) => {
            const event = new Event(type, { cancelable: true });
            Object.assign(event, { pointerId: 1, pointerType: 'mouse', clientX: 400, clientY: 300,
                movementX: 0, movementY: 0, button: 0, ...properties });
            canvas.dispatchEvent(event);
        };
        send('pointerdown');
        send('pointermove', { clientX: 100, movementX: -300 });
        send('pointerup', { clientX: 100 });
        controller.update(.1);
        assert.ok(controller.focus.y >= surface.surfaceHeightAt(controller.focus.x, controller.focus.z),
            'Focus interpolation must not tunnel through the hill between valid navigation endpoints.');
    } finally { fixture.close(); }
});
