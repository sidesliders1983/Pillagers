import test from 'node:test';
import assert from 'node:assert/strict';
import { PerspectiveCamera, Vector3 } from 'three';
import { JSDOM } from 'jsdom';
import { loadDOMSource } from './load-dom-source.mjs';
const { WeddingCamera } = loadDOMSource('../src/fjord-play/WeddingCamera.ts');
const { RTSCameraController } = loadDOMSource('../src/camera/RTSCameraController.ts');
const { culturalVisibility } = loadDOMSource('../src/fjord-play/CulturalVisibility.ts');

test('a directed wedding survives its real portrait shot even when the fire is offscreen, while fog and hidden pages remain authoritative', () => {
    const dom = new JSDOM('<canvas></canvas>');
    const previous = { window: globalThis.window, document: globalThis.document, AbortController: globalThis.AbortController };
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.AbortController = dom.window.AbortController;
    try {
        for (const [width, height] of [[390, 844], [844, 390], [1280, 720]]) {
            const camera = new PerspectiveCamera(45, width / height, .1, 2000);
            const control = new RTSCameraController(camera, document.querySelector('canvas'), 'pan');
            control.setView({ position: [10, 15, -20], target: [0, 1, 0] });
            const director = new WeddingCamera(camera, control, () => true);
            const frame = { id: 'accepted-wedding', phase: 'gathering', position: { x: 0, y: 0, z: 0 },
                wedding: { elapsed: 0, duration: 30.041 } };
            const point = { x: 0, y: 1, z: 0 };
            try {
                assert.equal(director.begin(frame), true);
                director.update(frame, new Vector3(0, 1.1, -8), false);
                camera.updateMatrixWorld();
                const projected = new Vector3(point.x, point.y, point.z).project(camera);
                if (width < height) {
                    assert.ok(Math.abs(projected.x) > 1.1, 'The native portrait shot reproduces the campfire-frustum regression');
                    assert.equal(culturalVisibility(point, camera, { hidden: false, known: true, directedWedding: false }), false,
                        'Ordinary offscreen gatherings retain their existing suspension policy');
                }
                const policy = { hidden: false, known: true, directedWedding: director.active };
                assert.equal(culturalVisibility(point, camera, policy), true,
                    'The directed wedding must not cancel its own composition at ' + width + ' x ' + height);
                assert.equal(culturalVisibility(point, camera, { ...policy, hidden: true }), false);
                assert.equal(culturalVisibility(point, camera, { ...policy, known: false }), false);
                director.restore();
                assert.equal(director.active, false);
                assert.equal(control.enabled, true);
            } finally { director.dispose(); control.dispose(); }
        }
    } finally { Object.assign(globalThis, previous); dom.window.close(); }
});
