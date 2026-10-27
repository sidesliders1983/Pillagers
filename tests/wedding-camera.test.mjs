import test from 'node:test';
import assert from 'node:assert/strict';
import { PerspectiveCamera, Vector3 } from 'three';
import { JSDOM } from 'jsdom';
import { loadDOMSource } from './load-dom-source.mjs';
const { WeddingCamera } = loadDOMSource('../src/fjord-play/WeddingCamera.ts');
const { RTSCameraController } = loadDOMSource('../src/camera/RTSCameraController.ts');

test('the real camera controller keeps shots local and restores its exact view/input after Skip or disposal', () => {
    const dom = new JSDOM('<canvas></canvas>');
    const previous = { window: globalThis.window, document: globalThis.document, AbortController: globalThis.AbortController };
    globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.AbortController = dom.window.AbortController;
    try {
        const camera = new PerspectiveCamera(45, 2.1, .1, 2000);
        const control = new RTSCameraController(camera, document.querySelector('canvas'), 'pan');
        control.setView({ position: [10, 15, -20], target: [0, 1, 0] });
        const before = { position: camera.position.toArray(), target: control.focus.toArray() };
        const director = new WeddingCamera(camera, control, point => Math.hypot(point.x, point.z) < 32);
        const frame = { id: 'accepted-8', phase: 'gathering', position: { x: 0, y: 0, z: 0 },
            wedding: { elapsed: 0, duration: 30.015 } };
        assert.equal(director.begin(frame), true);
        assert.equal(control.enabled, false);
        for (const elapsed of [0, 5, 15, 28]) {
            director.update({ ...frame, wedding: { ...frame.wedding, elapsed } }, new Vector3(0, 1, -6), false);
            assert.ok(Math.hypot(camera.position.x, camera.position.z) < 32);
            assert.ok(camera.position.toArray().every(Number.isFinite));
        }
        director.restore(); director.restore();
        assert.equal(control.enabled, true);
        assert.ok(camera.position.distanceTo(new Vector3().fromArray(before.position)) < 1e-6);
        assert.ok(control.focus.distanceTo(new Vector3().fromArray(before.target)) < 1e-6);
        assert.equal(director.begin(frame), true);
        director.dispose();
        assert.equal(control.enabled, true);
        const unavailable = new WeddingCamera(camera, control, () => false);
        assert.equal(unavailable.begin(frame), false);
        assert.equal(control.enabled, true);
        assert.ok(camera.position.distanceTo(new Vector3().fromArray(before.position)) < 1e-6);
        unavailable.dispose();
        control.dispose();
    } finally { Object.assign(globalThis, previous); dom.window.close(); }
});
