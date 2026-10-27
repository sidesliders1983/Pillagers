import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { Group, PerspectiveCamera, Vector3 } from 'three';
import { loadDOMSource } from './load-dom-source.mjs';
const { RTSCameraController } = loadDOMSource('../src/camera/RTSCameraController.ts');

function fixture(action) {
    const dom = new JSDOM('<canvas></canvas>', { pretendToBeVisual: true });
    const names = ['window', 'document', 'AbortController', 'HTMLInputElement', 'HTMLSelectElement', 'HTMLTextAreaElement'];
    const previous = Object.fromEntries(names.map(name => [name, globalThis[name]]));
    for (const name of names) globalThis[name] = name === 'window' ? dom.window : dom.window[name];
    const canvas = document.querySelector('canvas');
    canvas.setPointerCapture = () => {};
    const camera = new PerspectiveCamera(45, 1.6, .1, 2000);
    const controller = new RTSCameraController(camera, canvas, 'pan');
    controller.setView({ position: [12, 10, 15], target: [0, 1, 0] });
    try { action({ dom, canvas, camera, controller }); }
    finally { controller.dispose(); dom.window.close(); Object.assign(globalThis, previous); }
}

test('the first wheel navigation intent hands off before the same native zoom, without restoring a prior view', () => {
    fixture(({ dom, canvas, camera, controller }) => {
        const before = camera.position.clone();
        let active = true;
        const release = controller.onNavigationIntent(() => { active = false; });
        canvas.dispatchEvent(new dom.window.WheelEvent('wheel', { deltaY: 120, cancelable: true }));
        assert.equal(active, false, 'First scroll must immediately release cinematic ownership');
        controller.update(.2);
        assert.ok(camera.position.distanceTo(new Vector3(0, 1, 0)) > before.distanceTo(new Vector3(0, 1, 0)),
            'That same wheel event zooms out from the current view');
        release();
        active = true;
        canvas.dispatchEvent(new dom.window.WheelEvent('wheel', { deltaY: -120, cancelable: true }));
        assert.equal(active, true, 'Released presentation listeners cannot receive later input');
    });
});


function pointer(dom, canvas, type, x, y, options = {}) {
    const event = new dom.window.MouseEvent(type, { bubbles: true, cancelable: true,
        clientX: x, clientY: y, button: options.button ?? 0 });
    for (const [name, value] of Object.entries({ pointerId: 1, pointerType: 'mouse', movementX: 0, movementY: 0, ...options }))
        Object.defineProperty(event, name, { value });
    canvas.dispatchEvent(event);
}

for (const gesture of ['pan', 'rotate', 'pinch', 'swipe', 'keyboard', 'escape', 'home', 'focus'])
    test('native ' + gesture + ' yields presentation ownership on its first meaningful input', () => {
        fixture(({ dom, canvas, camera, controller }) => {
            const before = camera.position.clone(), focus = controller.focus.clone();
            let active = true;
            controller.onNavigationIntent(() => { active = false; });
            if (gesture === 'pan' || gesture === 'rotate') {
                pointer(dom, canvas, 'pointerdown', 100, 100, { button: gesture === 'rotate' ? 2 : 0 });
                pointer(dom, canvas, 'pointermove', 135, 115, { movementX: 35, movementY: 15 });
            } else if (gesture === 'pinch' || gesture === 'swipe') {
                pointer(dom, canvas, 'pointerdown', 100, 100, { pointerType: 'touch' });
                if (gesture === 'pinch') pointer(dom, canvas, 'pointerdown', 200, 100, { pointerType: 'touch', pointerId: 2 });
                pointer(dom, canvas, 'pointermove', gesture === 'pinch' ? 240 : 140, 115,
                    { pointerType: 'touch', pointerId: gesture === 'pinch' ? 2 : 1 });
            } else if (gesture === 'keyboard' || gesture === 'escape') {
                dom.window.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: gesture === 'keyboard' ? 'w' : 'Escape' }));
            } else if (gesture === 'home') controller.home();
            else controller.focusAt({ x: 8, z: 12 });
            assert.equal(active, false, 'The native first gesture releases ownership');
            controller.update(.2);
            if (gesture !== 'escape') assert.ok(camera.position.distanceTo(before) > .001 || controller.focus.distanceTo(focus) > .001,
                'The same gesture still performs its native navigation');
        });
    });

test('UI scrolling and input editing do not count as camera input; authored presentation frames do not cancel themselves', () => {
    fixture(({ dom, camera, controller }) => {
        let intents = 0;
        controller.onNavigationIntent(() => { intents++; });
        const list = document.createElement('div'), input = document.createElement('input');
        document.body.append(list, input);
        list.dispatchEvent(new dom.window.WheelEvent('wheel', { deltaY: 120, bubbles: true }));
        input.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'w', bubbles: true }));
        controller.setView({ position: [5, 6, 8], target: [1, 1, 1] }, { presentation: true });
        assert.equal(intents, 0);
        assert.ok(camera.position.distanceTo(new Vector3(5, 6, 8)) < 1e-6);
    });
});


test('camera view preview applies existing water/terrain clearance and world bounds without moving the live camera', () => {
    fixture(({ camera, controller }) => {
        const bounds = { minX: -20, maxX: 20, minZ: -20, maxZ: 20 };
        const terrain = { bounds, spacing: 10, columns: 5, rows: 5, heights: Array(25).fill(2) };
        controller.setNavigationSurface(new Group(), new Vector3(0, 2, 0), bounds, () => 2,
            { terrain, waterLevel: 0 });
        controller.setView({ position: [12, 10, 15], target: [0, 3, 0] });
        const before = camera.position.clone(), focus = controller.focus.clone();
        const preview = controller.previewView({ position: [4, .2, 4], target: [0, 3, 0] });
        assert.ok(preview && preview.position[1] >= 4, 'Existing two-metre ground clearance applies');
        assert.equal(controller.previewView({ position: [30, 8, 0], target: [0, 3, 0] }), undefined);
        assert.ok(camera.position.equals(before));
        assert.ok(controller.focus.equals(focus));
    });
});
