import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { Box3, Raycaster, Vector3 } from 'three';

const file = new URL('../public/scenery/meshy-tent-v1/tent.glb', import.meta.url);

async function loadTent() {
    // Node has no browser image decoder. Geometry and authored material sidedness
    // still pass through the same GLTFLoader used by the Fjord.
    globalThis.self ??= globalThis;
    globalThis.createImageBitmap ??= async () => ({ width: 1024, height: 1024, close() {} });
    const bytes = await readFile(file);
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const { scene } = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(buffer, '');
    scene.updateMatrixWorld(true);
    return scene;
}

test('exported tent has an open entrance and hollow interior at the compact campsite scale', async () => {
    const tent = await loadTent();
    const hit = (origin, direction) => new Raycaster(new Vector3(...origin),
        new Vector3(...direction)).intersectObject(tent, true)[0];
    // Canonical metres, Y-up and front +Z. These interior points are acceptance
    // probes, independent of how the generated shell is prepared.
    for (const y of [.25, .5, .8]) {
        const back = hit([0, y, 1.5], [0, 0, -1]);
        assert.ok(back && back.point.z < -.3, `Entrance is capped at height ${y}`);
    }
    const floor = hit([0, .5, 0], [0, -1, 0]);
    assert.ok(floor && floor.point.y >= 0 && floor.point.y < .1,
        'The interior has a low floor rather than a filled volume');
    const roof = hit([0, .3, 0], [0, 1, 0]);
    assert.ok(roof && roof.point.y > 1, 'The compact tent has an open interior below its roof');
    for (const sign of [-1, 1]) {
        const side = hit([0, .3, 0], [sign, 0, 0]);
        assert.ok(side && Math.abs(side.point.x) > .3, 'Interior space extends to both sides');
    }
});

test('exported tent is about 1.5m tall and no ground dimension exceeds 2m', async () => {
    const tent = await loadTent();
    const size = new Box3().setFromObject(tent).getSize(new Vector3());
    assert.ok(Math.abs(size.y - 1.5) < .01, `Tent height is ${size.y}m`);
    assert.ok(Math.max(size.x, size.z) <= 2,
        `Tent footprint is ${size.x}m by ${size.z}m`);
});
