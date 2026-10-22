import test from 'node:test';
import assert from 'node:assert/strict';
import { BoxGeometry, Group, Mesh, MeshBasicMaterial, PerspectiveCamera, Vector3 } from 'three';
import { load } from './load-source.mjs';

const { FjordEntities } = load('../src/fjord-play/FjordEntities.ts');
const ship = { kind: 'longship', id: 'ship', selectionKey: 'longship:ship', asset: 'longship',
    transform: { x: 0, y: 0, z: 0, rotation: .7, scale: 1 }, status: {} };
const models = {
    async create(entity) {
        const root = new Group();
        const mesh = new Mesh(new BoxGeometry(entity.kind === 'longship' ? 2 : 15,
            entity.kind === 'longship' ? 1 : 20, 10), new MeshBasicMaterial());
        root.add(mesh);
        return root;
    },
    async reconcile() {}, boundsShape: () => 'fixed',
    release(root) { root.traverse(node => { node.geometry?.dispose(); node.material?.dispose(); }); },
};
function screenBounds(layer, camera, viewport) {
    const bounds = layer.bounds(ship.selectionKey), points = [];
    for (const x of [bounds.min.x, bounds.max.x])
        for (const y of [bounds.min.y, bounds.max.y])
            for (const z of [bounds.min.z, bounds.max.z]) {
                const point = new Vector3(x, y, z).project(camera);
                points.push({ x: viewport.left + (point.x + 1) * viewport.width / 2,
                    y: viewport.top + (1 - point.y) * viewport.height / 2 });
            }
    return { left: Math.min(...points.map(p => p.x)), right: Math.max(...points.map(p => p.x)),
        y: (Math.min(...points.map(p => p.y)) + Math.max(...points.map(p => p.y))) / 2 };
}

test('ship destination snapping accepts nearby water in CSS pixels on mouse and touch at different zooms', async () => {
    const layer = new FjordEntities(models);
    try {
        await layer.sync([ship]);
        for (const width of [390, 1100]) for (const distance of [40, 240]) {
            const viewport = { left: 73, top: 45, width, height: 600 };
            const camera = new PerspectiveCamera(45, width / 600, .1, 1000);
            camera.position.set(0, distance, distance);
            camera.lookAt(0, 0, 0);
            camera.updateMatrixWorld(true);
            const bounds = screenBounds(layer, camera, viewport);
            for (const pointer of ['mouse', 'touch']) {
                const pick = x => layer.pick(camera, x, bounds.y, viewport, pointer, 'longship');
                assert.equal(layer.pick(camera, bounds.left - 12, bounds.y, viewport, pointer), null,
                    'The regression point misses the actual hull triangles');
                assert.equal(pick(bounds.left - 12)?.id, ship.id, 'Nearby water snaps to the ship');
                assert.equal(pick(bounds.right + 12)?.id, ship.id);
                assert.equal(pick(bounds.left - 65), null, 'Distant water stays a water destination');
            }
        }
        layer.entries.get(ship.selectionKey).model.visible = false;
        const camera = new PerspectiveCamera(45, 1, .1, 1000);
        camera.position.set(0, 40, 40); camera.lookAt(0, 0, 0); camera.updateMatrixWorld(true);
        assert.equal(layer.pick(camera, 300, 300, { left: 0, top: 0, width: 600, height: 600 },
            'mouse', 'longship'), null, 'Hidden ships cannot acquire a snap target');
    } finally { layer.dispose(); }
});

test('ship snapping cannot select a hull through a nearer building', async () => {
    const layer = new FjordEntities(models);
    try {
        await layer.sync([ship, { kind: 'building', id: 'home', selectionKey: 'building:home',
            asset: 'house', transform: { ...ship.transform, y: 8, z: 8 }, status: {} }]);
        const camera = new PerspectiveCamera(45, 1, .1, 1000);
        camera.position.set(0, 40, 40); camera.lookAt(0, 0, 0); camera.updateMatrixWorld(true);
        const viewport = { left: 0, top: 0, width: 600, height: 600 };
        assert.equal(layer.pick(camera, 300, 300, viewport, 'mouse')?.id, 'home');
        assert.equal(layer.pick(camera, 300, 300, viewport, 'mouse', 'longship'), null);
    } finally { layer.dispose(); }
});
