import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PerspectiveCamera } from 'three';
import { load } from './load-source.mjs';

const { RTSCameraController } = load('../src/camera/RTSCameraController.ts');

class PointerCanvas extends EventTarget {
    setPointerCapture() {}
    getBoundingClientRect() {
        return { left: 0, top: 0, width: 800, height: 600 };
    }
}

function dispatch(target, kind, properties = {}) {
    const event = new Event(kind, { cancelable: true });
    Object.assign(event, { pointerId: 1, pointerType: 'mouse',
        clientX: 400, clientY: 300, movementX: 0, movementY: 0, button: 0, ...properties });
    target.dispatchEvent(event);
}

function fixture() {
    const oldWindow = globalThis.window;
    globalThis.window = new EventTarget();
    const canvas = new PointerCanvas();
    const camera = new PerspectiveCamera(45, 800 / 600, .1, 400);
    const controller = new RTSCameraController(camera, canvas, 'pan');
    return {
        canvas, camera, controller,
        close() {
            controller.dispose();
            if (oldWindow === undefined) delete globalThis.window;
            else globalThis.window = oldWindow;
        },
    };
}

test('desktop left-click selection does not pan or navigate when consumed, even on empty ground', () => {
    const { canvas, controller, close } = fixture();
    try {
        const originalFocus = controller.focus.clone();
        const calls = [];
        controller.setSelectionHandler((x, y, type) => {
            calls.push({ x, y, type });
            return true; // Fjordplay consumes both selected and empty desktop mouse clicks.
        });
        dispatch(canvas, 'pointerdown', { clientX: 430, clientY: 315 });
        dispatch(canvas, 'pointermove', { clientX: 434, clientY: 316, movementX: 4, movementY: 1 });
        controller.update(.2);
        assert.ok(controller.focus.distanceTo(originalFocus) < 1e-8,
            'subthreshold pointer jitter must not pan');
        dispatch(canvas, 'pointerup', { clientX: 434, clientY: 316 });
        controller.update(1);
        assert.deepEqual(calls, [{ x: 434, y: 316, type: 'mouse' }]);
        assert.ok(controller.focus.distanceTo(originalFocus) < 1e-8,
            'a consumed empty click must not reframe the camera');
    } finally {
        close();
    }
});

test('desktop left-drag pans only after threshold, never clicks or orbits', () => {
    const { canvas, controller, close } = fixture();
    try {
        const focus = controller.focus.clone(), yaw = controller.yaw;
        let selections = 0;
        controller.setSelectionHandler(() => { selections++; return true; });
        dispatch(canvas, 'pointerdown');
        dispatch(canvas, 'pointermove', { clientX: 405, movementX: 5 });
        controller.update(.3);
        assert.ok(controller.focus.distanceTo(focus) < 1e-8);
        dispatch(canvas, 'pointermove', { clientX: 419, movementX: 14 });
        dispatch(canvas, 'pointermove', { clientX: 432, movementX: 13 });
        dispatch(canvas, 'pointerup', { clientX: 432 });
        controller.update(1);
        assert.ok(controller.focus.distanceTo(focus) > .1, 'drag pans the world');
        assert.equal(controller.yaw, yaw, 'left-drag must not orbit');
        assert.equal(selections, 0, 'drag release must not select an entity');
    } finally {
        close();
    }
});

test('right-drag continues to orbit, wheel zooms and neither selects', () => {
    const { canvas, controller, close } = fixture();
    try {
        const yaw = controller.yaw, focus = controller.focus.clone(), zoom = controller.zoom;
        let selections = 0;
        controller.setSelectionHandler(() => { selections++; return true; });
        dispatch(canvas, 'pointerdown', { button: 2 });
        dispatch(canvas, 'pointermove', { movementX: 20, movementY: -10, button: 2 });
        dispatch(canvas, 'pointerup', { button: 2 });
        controller.update(1);
        assert.notEqual(controller.yaw, yaw);
        assert.ok(controller.focus.distanceTo(focus) < 1e-8);
        const wheel = new Event('wheel', { cancelable: true });
        Object.assign(wheel, { deltaY: -200 });
        canvas.dispatchEvent(wheel);
        controller.update(1);
        assert.notEqual(controller.zoom, zoom);
        assert.equal(selections, 0);
    } finally {
        close();
    }
});

test('touch tap on empty ground still follows existing navigation fallback', () => {
    const { canvas, controller, close } = fixture();
    try {
        let pointerType = null;
        controller.setSelectionHandler((_x, _y, type) => { pointerType = type; return false; });
        const previous = controller.desired.clone();
        dispatch(canvas, 'pointerdown', { pointerType: 'touch', clientX: 550, clientY: 330 });
        dispatch(canvas, 'pointerup', { pointerType: 'touch', clientX: 550, clientY: 330 });
        assert.equal(pointerType, 'touch');
        assert.ok(controller.desired.distanceTo(previous) > .01,
            'touch navigation on empty terrain remains available');
    } finally {
        close();
    }
});
