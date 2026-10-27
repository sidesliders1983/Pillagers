import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { PerspectiveCamera, Vector3 } from 'three';
import { loadDOMSource } from './load-dom-source.mjs';
const { RTSCameraController } = loadDOMSource('../src/camera/RTSCameraController.ts');
const { WildlifeCamera } = loadDOMSource('../src/camera/WildlifeCamera.ts');
const target = { worldId: 'fixture', speciesId: 'moose', wildlifeInstanceId: 'moose:roaming:0' };
function fixture(action) {
    const dom = new JSDOM('<canvas></canvas>', { pretendToBeVisual: true });
    const names = ['window', 'document', 'AbortController', 'HTMLInputElement', 'HTMLSelectElement', 'HTMLTextAreaElement'];
    const previous = Object.fromEntries(names.map(name => [name, globalThis[name]]));
    for (const name of names) globalThis[name] = name === 'window' ? dom.window : dom.window[name];
    const canvas = document.querySelector('canvas');
    const camera = new PerspectiveCamera(45, 1.6, .1, 2000);
    const controller = new RTSCameraController(camera, canvas);
    controller.setView({ position: [10, 7, 12], target: [0, 1, 0] });
    const anchor = { ...target, position: [0, 0, 0], bounds: { min: [-1, 0, -.5], max: [1, 2, .5] },
        movement: 'ground', waterLevel: 0 };
    const orbit = new WildlifeCamera(camera, controller, () => anchor);
    try { action({ dom, canvas, camera, controller, anchor, orbit }); }
    finally { orbit.dispose(); controller.dispose(); dom.window.close(); Object.assign(globalThis, previous); }
}

test('a short orbit uses the current live anchor and completes at its last ordinary controllable view without restoring the start', () => {
    fixture(({ camera, controller, anchor, orbit }) => {
        const before = camera.position.clone();
        assert.equal(orbit.begin(target, false), true);
        assert.equal(controller.enabled, true, 'Native input must remain available throughout the orbit');
        const views = [];
        for (let frame = 0; frame < 140; frame++) {
            controller.update(.1); orbit.advance(.1);
            if (orbit.active) views.push(camera.position.clone());
        }
        assert.equal(orbit.active, false);
        assert.ok(views.length >= 80 && views.length <= 120);
        assert.ok(camera.position.distanceTo(before) > 1);
        assert.ok(controller.focus.distanceTo(new Vector3(0, 1, 0)) < .01);
        const last = camera.position.clone();
        controller.update(1); orbit.advance(1);
        assert.ok(camera.position.distanceTo(last) < 1e-6, 'Natural completion never snaps or continues animation');
    });
});


test('the first real wheel event ends an active orbit and zooms from that view with no later restore', () => {
    fixture(({ dom, canvas, camera, controller, orbit }) => {
        assert.equal(orbit.begin(target, false), true);
        for (let frame = 0; frame < 20; frame++) orbit.advance(.1);
        const last = camera.position.clone(), focus = controller.focus.clone();
        canvas.dispatchEvent(new dom.window.WheelEvent('wheel', { deltaY: 120, cancelable: true }));
        assert.equal(orbit.active, false);
        orbit.advance(1); controller.update(.2);
        assert.ok(camera.position.distanceTo(focus) > last.distanceTo(focus));
        assert.ok(controller.focus.distanceTo(focus) < 1e-6);
    });
});

test('reduced motion makes one short static focus without spinning, while an already paused world need not advance', () => {
    fixture(({ camera, controller, anchor, orbit }) => {
        const before = JSON.stringify(anchor);
        assert.equal(orbit.begin(target, true), true);
        for (let frame = 0; frame < 15; frame++) orbit.advance(.1);
        const staticEye = camera.position.clone();
        for (let frame = 0; frame < 15; frame++) orbit.advance(.1);
        assert.equal(orbit.active, false);
        assert.ok(camera.position.distanceTo(staticEye) < 1e-6);
        assert.equal(JSON.stringify(anchor), before);
        assert.equal(controller.enabled, true);
    });
});

test('an obstruction allows a contiguous partial arc, and moving beyond the bounded local focus ends without a chase', () => {
    fixture(({ camera, controller, anchor, orbit }) => {
        orbit.dispose();
        const partial = new WildlifeCamera(camera, controller, () => anchor, view => view.position[0] >= -1);
        try {
            assert.equal(partial.begin(target, false), true);
            assert.ok(partial.inspect().arcRadians > 0 && partial.inspect().arcRadians < Math.PI * 2);
            for (let frame = 0; frame < 70; frame++) {
                partial.advance(.1);
                assert.ok(camera.position.x >= -1, 'Camera never clips through the blocked sector');
            }
            const last = camera.position.clone();
            anchor.bounds.min[0] += 100; anchor.bounds.max[0] += 100;
            partial.advance(.1);
            assert.equal(partial.active, false);
            assert.ok(camera.position.equals(last));
        } finally { partial.dispose(); }
    });
});

test('unavailable exact identities and unsafe views never move the camera; replacement and disposal release one session', () => {
    fixture(({ camera, controller, anchor, orbit }) => {
        const before = camera.position.clone();
        assert.equal(orbit.begin({ ...target, wildlifeInstanceId: 'different-animal' }, false), false);
        assert.ok(camera.position.equals(before));
        assert.equal(orbit.begin(target, false), true);
        orbit.advance(.5);
        assert.equal(orbit.begin(target, true), true);
        assert.equal(orbit.inspect().elapsed, 0);
        orbit.dispose();
        assert.equal(orbit.active, false);
        assert.equal(orbit.begin(target, false), false);
        const unsafe = new WildlifeCamera(camera, controller, () => anchor, () => false);
        const held = camera.position.clone();
        assert.equal(unsafe.begin(target, false), false);
        assert.ok(camera.position.equals(held));
        unsafe.dispose();
    });
});


test('an in-progress orbit supplies the unchanged pre-cinematic camera for ordinary save capture', () => {
    fixture(({ camera, controller, orbit }) => {
        const before = { position: camera.position.toArray(), target: controller.focus.toArray() };
        assert.equal(orbit.begin(target, false), true);
        for (let frame = 0; frame < 30; frame++) orbit.advance(.1);
        assert.deepEqual(orbit.saveView, before, 'Transient frames must not replace a normal saved camera');
        orbit.cancel();
        assert.equal(orbit.saveView, undefined);
    });
});


test('a surfaced marine body is framed at the waterline rather than aiming below the sea', () => {
    fixture(({ controller, anchor, orbit }) => {
        anchor.movement = 'water'; anchor.waterLevel = 0;
        anchor.bounds.min[1] = -2; anchor.bounds.max[1] = .5;
        assert.equal(orbit.begin(target, false), true);
        for (let frame = 0; frame < 20; frame++) orbit.advance(.1);
        assert.ok(controller.focus.y >= .2, 'The focus stays on the currently visible surface part');
    });
});
