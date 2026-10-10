import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { Raycaster, Vector3 } from 'three';

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

test('exported tent has an open entrance and usable hollow interior', async () => {
    const tent = await loadTent();
    const hit = (origin, direction) => new Raycaster(new Vector3(...origin),
        new Vector3(...direction)).intersectObject(tent, true)[0];
    // Canonical metres, Y-up and front +Z. These interior points are acceptance
    // probes, independent of how the generated shell is prepared.
    for (const y of [.6, 1, 1.4]) {
        const back = hit([0, y, 3], [0, 0, -1]);
        assert.ok(back && back.point.z < -.6, `Entrance is capped at height ${y}`);
    }
    const floor = hit([0, 1, 0], [0, -1, 0]);
    assert.ok(floor && floor.point.y >= 0 && floor.point.y < .25,
        'The interior has a low floor rather than a filled volume');
    const roof = hit([0, .6, 0], [0, 1, 0]);
    assert.ok(roof && roof.point.y > 1.7, 'There is headroom inside the roof');
    for (const sign of [-1, 1]) {
        const side = hit([0, .6, 0], [sign, 0, 0]);
        assert.ok(side && Math.abs(side.point.x) > .6, 'Interior space extends to both sides');
    }
});
