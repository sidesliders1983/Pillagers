import test from 'node:test';
import assert from 'node:assert/strict';
import { BufferGeometry, Float32BufferAttribute, Mesh, MeshBasicMaterial, DoubleSide,
    Matrix4, Raycaster, Vector3, Group, BoxGeometry } from 'three';
import { getBounds } from '@gltf-transform/functions';
import { terrainIO } from '../scripts/terrain-io.mjs';
import { load } from './load-source.mjs';
const { longshipDeckAnchors } = load('../src/fjord-play/LongshipDeck.ts');

test('every passenger anchor stands on the actual normalized source deck, below no seat or mast', async () => {
    const document = await (await terrainIO()).read('public/terrain/longship-drakkar.glb');
    const bounds = getBounds(document.getRoot().listScenes()[0]), meshes = [];
    try {
        for (const node of document.getRoot().listNodes()) for (const primitive of node.getMesh()?.listPrimitives() ?? []) {
            const geometry = new BufferGeometry().setAttribute('position',
                new Float32BufferAttribute(primitive.getAttribute('POSITION').getArray(), 3));
            geometry.setIndex(Array.from(primitive.getIndices().getArray()));
            geometry.applyMatrix4(new Matrix4().fromArray(node.getWorldMatrix()));
            geometry.translate(-(bounds.min[0] + bounds.max[0]) / 2, -bounds.min[1], -(bounds.min[2] + bounds.max[2]) / 2);
            const mesh = new Mesh(geometry, new MeshBasicMaterial({ side: DoubleSide }));
            mesh.updateMatrixWorld(); meshes.push(mesh);
        }
        for (const [x, y, z] of longshipDeckAnchors) {
            const hit = new Raycaster(new Vector3(x, y + 1, z), new Vector3(0, -1, 0)).intersectObjects(meshes)[0];
            assert.ok(hit, 'A real source surface supports each anchor');
            assert.ok(Math.abs(hit.point.y - y) < .005, 'Feet meet the deck instead of floating or intersecting a seat');
            assert.ok(hit.face.normal.y > .99);
        }
    } finally {
        for (const mesh of meshes) { mesh.geometry.dispose(); mesh.material.dispose(); }
    }
});

test('passengers follow one hull, retain actual roots, and detach before hull removal without releasing twice', async () => {
    const { FjordEntities } = load('../src/fjord-play/FjordEntities.ts');
    const released = [], animations = [];
    const models = {
        create: async entity => {
            const model = new Group(); model.add(new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial()));
            if (entity.kind === 'persona') model.rotation.x = Math.PI / 2;
            return model;
        },
        reconcile: async () => {}, boundsShape: () => 'same', release: model => {
            if (model.userData.canonical?.kind === 'longship')
                assert.equal(model.children.some(child => child.userData.canonical?.kind === 'persona'), false,
                    'The hull must never release another actor’s skeleton or appearance');
            released.push(model.uuid); return false;
        },
        animate: (model, clip) => animations.push(clip),
    };
    const layer = new FjordEntities(models);
    const transform = { x: 20, y: 0, z: 30, rotation: 0, scale: 1 };
    const human = { kind: 'persona', id: 'actual', selectionKey: 'persona:actual', asset: 'human',
        transform, status: { living: true, expedition: 'same-mission', aboardShip: 'same-ship', aboardAnchor: 0 } };
    const ship = { kind: 'longship', id: 'same-ship', selectionKey: 'longship:same-ship', asset: 'longship',
        transform, status: { living: true } };
    await layer.sync([human, ship]);
    const personRoot = layer.entries.get('persona:actual').model;
    const hull = layer.entries.get('longship:same-ship').model;
    assert.equal(personRoot.parent, hull);
    assert.deepEqual(personRoot.rotation.toArray().slice(0, 3), [0, 0, 0]);
    let detachments = 0;
    personRoot.addEventListener('removed', () => detachments++);
    await layer.sync([human, ship]);
    assert.equal(detachments, 0, 'An unchanged occupant remains attached across Core reconciliation');
    hull.position.x += 12;
    assert.equal(layer.describe().find(e => e.id === 'actual').position[0], 32 + longshipDeckAnchors[0][0]);
    layer.advance({ inspect: () => [{ key: human.selectionKey, x: 900, y: -20, z: 900,
        rotation: 2, state: 'Run', speed: 4 }] }, .1, true);
    assert.deepEqual(personRoot.position.toArray(), [...longshipDeckAnchors[0]]);
    assert.deepEqual(animations, [], 'An occupant has no animation clock or stale autonomous movement');
    await layer.sync([{ ...human, status: { living: true }, transform: { ...transform, x: 40 } }]);
    assert.equal(layer.entries.get('persona:actual').model, personRoot);
    assert.equal(personRoot.parent, layer.root);
    assert.equal(personRoot.position.x, 40);
    assert.deepEqual(personRoot.rotation.toArray().slice(0, 3), [0, transform.rotation, 0]);
    assert.equal(released.filter(id => id === hull.uuid).length, 1);
    assert.equal(released.includes(personRoot.uuid), false);
    layer.dispose();
    assert.equal(released.filter(id => id === personRoot.uuid).length, 1);
    const reversed = new FjordEntities(models);
    await reversed.sync([ship, human]);
    reversed.dispose();
    assert.equal(new Set(released).size, released.length);
});
