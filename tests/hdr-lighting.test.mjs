import test from 'node:test';
import assert from 'node:assert/strict';
import { Scene, Texture, Vector3 } from 'three';
import { JSDOM } from 'jsdom';
import { loadDOMSource as load } from './load-dom-source.mjs';

function deferred() {
    let resolve, reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
}
function target() {
    const texture = new Texture();
    let disposed = 0;
    return { texture, dispose() { disposed++; texture.dispose(); }, get disposed() { return disposed; } };
}

test('the in-game quality checkbox lazily enables the existing HDR and releases it when switched off', async () => {
    const { fjordHeaderHTML } = load('../src/fjord-play/FjordHeader.ts');
    const { FjordHdrLighting } = load('../src/fjord-play/FjordHdrLighting.ts');
    const dom = new JSDOM(fjordHeaderHTML());
    const input = dom.window.document.querySelector('#fjord-hdr');
    const status = dom.window.document.querySelector('#fjord-hdr-status');
    assert.ok(input, 'HDR belongs beside Quality in the live game menu');
    assert.equal(input.checked, false, 'HDR remains opt-in');
    const scene = new Scene(), background = scene.background;
    const oldIntensity = scene.environmentIntensity, oldRotation = scene.environmentRotation.clone();
    const pending = deferred(), resource = target();
    let requests = 0;
    const control = new FjordHdrLighting(scene, input, status, () => { requests++; return pending.promise; });
    try {
        assert.equal(requests, 0);
        input.checked = true;
        input.dispatchEvent(new dom.window.Event('change'));
        await Promise.resolve();
        assert.equal(requests, 1);
        assert.match(status.textContent, /loading/i);
        control.update(new Vector3(0, 1, 0), 0);
        pending.resolve(resource);
        await control.ready;
        assert.equal(scene.environment, resource.texture);
        assert.equal(scene.environmentIntensity, .15);
        assert.equal(scene.background, background);
        assert.match(status.textContent, /enabled/i);
        control.update(new Vector3(0, 1, 0), 1);
        assert.equal(scene.environment, null, 'A daylight source cannot illuminate night');
        assert.equal(input.checked, true, 'Night preserves the user preference');
        control.update(new Vector3(1, 1, 0), 0);
        assert.equal(scene.environment, resource.texture);
        assert.equal(requests, 1, 'Night/day changes reuse one current target');
        input.checked = false;
        input.dispatchEvent(new dom.window.Event('change'));
        await control.ready;
        assert.equal(scene.environment, null);
        assert.equal(scene.environmentIntensity, oldIntensity);
        assert.deepEqual(scene.environmentRotation, oldRotation);
        assert.equal(resource.disposed, 1, 'Turning HDR off releases its graphics allocation');
    } finally { control.dispose(); dom.window.close(); }
    assert.equal(resource.disposed, 1);
});


function controls(loadAsset) {
    const { FjordHdrLighting } = load('../src/fjord-play/FjordHdrLighting.ts');
    const dom = new JSDOM('<input type="checkbox"><small role="status"></small>');
    const input = dom.window.document.querySelector('input');
    const status = dom.window.document.querySelector('small'), scene = new Scene();
    const control = new FjordHdrLighting(scene, input, status, loadAsset);
    const toggle = enabled => {
        input.checked = enabled;
        input.dispatchEvent(new dom.window.Event('change'));
        return control.ready;
    };
    return { dom, input, status, scene, control, toggle };
}

test('late HDR loads cannot re-enable a disabled, replaced or disposed scene', async () => {
    const loads = [], signals = [];
    const owner = controls(signal => { const task = deferred(); loads.push(task); signals.push(signal); return task.promise; });
    try {
        const firstReady = owner.toggle(true);
        await Promise.resolve();
        await owner.toggle(false);
        assert.equal(signals[0].aborted, true);
        const nextReady = owner.toggle(true);
        await Promise.resolve();
        const obsolete = target(), current = target();
        loads[0].resolve(obsolete);
        await firstReady;
        assert.equal(obsolete.disposed, 1);
        assert.equal(owner.scene.environment, null);
        loads[1].resolve(current);
        await nextReady;
        assert.equal(owner.scene.environment, current.texture);
        owner.control.suspend();
        assert.equal(owner.input.checked, true);
        assert.equal(current.disposed, 1);
        assert.equal(owner.scene.environment, null);
        owner.control.resume();
        const restoredReady = owner.control.ready;
        await Promise.resolve();
        assert.equal(loads.length, 3, 'Context restoration rebuilds one valid environment');
        owner.control.dispose();
        const late = target();
        loads[2].resolve(late);
        await restoredReady;
        assert.equal(late.disposed, 1);
        assert.equal(owner.scene.environment, null);
        await owner.toggle(false); await owner.toggle(true);
        assert.equal(loads.length, 3, 'Disposed controls have no surviving DOM listener');
    } finally { owner.control.dispose(); owner.dom.window.close(); }
});

test('an unavailable HDR keeps ordinary lighting and does not retry every render frame', async () => {
    let requests = 0;
    const resource = target();
    const owner = controls(async () => {
        if (++requests === 1) throw new Error('Unavailable fixture');
        return resource;
    });
    try {
        await owner.toggle(true);
        assert.equal(owner.scene.environment, null);
        assert.match(owner.status.textContent, /unavailable/i);
        for (let frame = 0; frame < 120; frame++) owner.control.update(new Vector3(1, 1, 0), 0);
        assert.equal(requests, 1);
        await owner.toggle(false); await owner.toggle(true);
        assert.equal(requests, 2);
        assert.equal(owner.scene.environment, resource.texture);
    } finally { owner.control.dispose(); owner.dom.window.close(); }
    assert.equal(resource.disposed, 1);
});

test('repeated quality toggles retain at most one HDR target and release every target once', async () => {
    const resources = [];
    const owner = controls(async () => { const resource = target(); resources.push(resource); return resource; });
    try {
        for (let iteration = 0; iteration < 20; iteration++) {
            await owner.toggle(true);
            assert.equal(resources.filter(resource => resource.disposed === 0).length, 1);
            owner.control.update(new Vector3(1, 1, 0), .5);
            assert.equal(owner.scene.environmentIntensity, .075);
            await owner.toggle(false);
            assert.equal(resources.filter(resource => resource.disposed === 0).length, 0);
        }
        assert.ok(resources.every(resource => resource.disposed === 1));
    } finally { owner.control.dispose(); owner.dom.window.close(); }
});

test('the earlier source-locked HDR still decodes with the native loader at its original 1K resolution', async () => {
    const { readFile } = await import('node:fs/promises');
    const { createHash } = await import('node:crypto');
    const { HDRLoader } = await import('three/addons/loaders/HDRLoader.js');
    const bytes = await readFile(new URL('../public/lighting/lonely-road/lonely_road_afternoon_puresky_1k.hdr', import.meta.url));
    assert.equal(createHash('sha256').update(bytes).digest('hex'),
        '162e8a4a42db3b26c8a5e4558db5355df156212a55127577725692f683106fa4');
    const decoded = new HDRLoader().parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    assert.equal(decoded.width, 1024); assert.equal(decoded.height, 512);
    assert.equal(decoded.data.length, 1024 * 512 * 4);
});
