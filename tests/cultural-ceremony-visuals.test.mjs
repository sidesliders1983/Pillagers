import test from 'node:test';
import assert from 'node:assert/strict';
import { Scene, Box3, PerspectiveCamera } from 'three';
import { JSDOM } from 'jsdom';
import { loadDOMSource } from './load-dom-source.mjs';

const { CulturalCeremonyVisuals } = loadDOMSource('../src/fjord-play/CulturalCeremonyVisuals.ts');
const wedding = {
    id: 'event-40', occasion: 'wedding', phase: 'gathering',
    position: { x: 30, y: 4, z: -15 }, visible: true,
    spouseIds: ['persona-a', 'persona-b'],
};

test('a fire-backed active ceremony adds bounded temporary decoration inside the existing campfire exclusion', () => {
    const scene = new Scene();
    const visuals = new CulturalCeremonyVisuals(scene);
    assert.equal(scene.children.length, 1);
    assert.equal(scene.children[0].visible, false);
    visuals.update(wedding, { active: true, fireLit: true, spouses: [] });
    const meshes = [], lights = [];
    scene.traverse(node => {
        if (node.isMesh) meshes.push(node);
        if (node.isLight) lights.push(node);
    });
    assert.equal(meshes.length, 1);
    assert.equal(scene.children[0].visible, true);
    assert.equal(meshes[0].castShadow, false);
    assert.equal(meshes[0].material.map, null);
    let triangles = 0;
    for (const mesh of meshes) {
        triangles += (mesh.geometry.index?.count ?? mesh.geometry.attributes.position.count) / 3;
        const position = mesh.geometry.attributes.position;
        for (let vertex = 0; vertex < position.count; vertex++)
            assert.ok(Math.hypot(position.getX(vertex), position.getZ(vertex)) <= 4.4,
                'Decoration must not create an unmodelled obstacle in the residents\' walking ring');
    }
    assert.ok(triangles > 200 && triangles <= 2000);
    const bounds = new Box3().setFromObject(scene.children[0]);
    assert.ok(bounds.max.y > wedding.position.y + 3);
    assert.equal(lights.length, 0);
    visuals.dispose();
    assert.equal(scene.children.length, 0);
});

function withDOM(action) {
    const dom = new JSDOM('<main></main>');
    const previous = new Map();
    for (const name of ['window', 'document', 'Node', 'Element', 'HTMLElement', 'HTMLInputElement',
        'HTMLSelectElement', 'HTMLOptionElement', 'HTMLDetailsElement']) {
        previous.set(name, globalThis[name]);
        globalThis[name] = name === 'window' ? dom.window : dom.window[name];
    }
    try { action(dom.window.document); }
    finally {
        for (const [name, value] of previous) globalThis[name] = value;
        dom.window.close();
    }
}

test('the shared label adapter can name the real wedding role without interpreting names as markup', () => {
    withDOM(document => {
        const { SelectionLabels } = loadDOMSource('../src/fjord-play/SelectionLabels.ts');
        const labels = document.createElement('div');
        const leaders = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        const adapter = new SelectionLabels(labels, leaders);
        adapter.sync([{ selectionKey: 'persona-a', role: 'partner', roleLabel: 'Wedding',
            label: '<img src=x onerror=bad()> & Áilu', anchor: [0, 2, 0], color: '#ebcb7e' }]);
        assert.equal(labels.textContent, 'Wedding · <img src=x onerror=bad()> & Áilu');
        assert.equal(labels.querySelector('img'), null);
        adapter.sync([{ selectionKey: 'persona-a', role: 'partner',
            label: 'Áilu', anchor: [0, 2, 0], color: '#ebcb7e' }]);
        assert.equal(labels.textContent, 'Partner · Áilu', 'Existing selection labels retain their role wording');
    });
});

test('only the two actual visible spouses receive readable Wedding labels at their real world anchors', () => {
    withDOM(document => {
        const scene = new Scene();
        const host = document.querySelector('main');
        const visuals = new CulturalCeremonyVisuals(scene, host);
        const camera = new PerspectiveCamera(50, 390 / 800, .1, 100);
        camera.position.set(30, 9, 5);
        camera.lookAt(30, 5, -15);
        camera.updateMatrixWorld();
        const spouses = [
            { id: 'unrelated', name: 'Not the couple', position: { x: 30, y: 6, z: -12 }, visible: true },
            { id: 'persona-a', name: 'Thorrik Hakonarson', position: { x: 28, y: 6, z: -12 }, visible: true },
            { id: 'persona-b', name: 'Leofhild <img src=x>', position: { x: 32, y: 6, z: -12 }, visible: true },
        ];
        const state = { active: true, fireLit: true, spouses, camera, width: 390, height: 800 };
        visuals.update(wedding, state);
        const layer = host.querySelector('.fjord-ceremony-labels');
        assert.ok(layer, 'Ceremony owns a separate bounded label layer rather than replacing selection labels');
        assert.equal(layer.children.length, 2);
        assert.deepEqual([...layer.children].map(element => element.textContent), [
            'Wedding · Thorrik Hakonarson', 'Wedding · Leofhild <img src=x>',
        ]);
        assert.equal(layer.querySelector('img'), null);
        assert.equal(layer.textContent.includes('Not the couple'), false);
        assert.ok([...layer.children].every(element => !element.hidden));
        const elements = [...layer.children];
        visuals.update(wedding, { ...state, spouses: spouses.map(person => ({ ...person,
            position: { ...person.position, x: person.position.x + .2 } })) });
        assert.ok(elements.every((element, index) => layer.children[index] === element));
        visuals.dispose();
        assert.equal(host.children.length, 0);
    });
});

test('suspended, hidden and extinguished ceremonies hide all decoration and never create another render owner', () => {
    withDOM(document => {
        const scene = new Scene();
        const host = document.querySelector('main');
        const visuals = new CulturalCeremonyVisuals(scene, host);
        const active = { active: true, fireLit: true, spouses: [] };
        for (const state of [{ ...active, active: false }, { ...active, fireLit: false }]) {
            visuals.update(wedding, state);
            assert.equal(scene.children[0].visible, false);
            assert.equal(scene.children[0].children.length, 0, 'Unqualified events do not prepare mesh resources');
        }
        visuals.update(wedding, active);
        const firstMesh = scene.children[0].children[0];
        for (const [frame, state] of [[wedding, { ...active, active: false }],
            [wedding, { ...active, fireLit: false }], [{ ...wedding, visible: false }, active],
            [{ ...wedding, phase: 'ended' }, active], [null, active]]) {
            visuals.update(frame, state);
            assert.equal(scene.children[0].visible, false);
            assert.equal(host.querySelector('.fjord-ceremony-labels').hidden, true);
        }
        visuals.update({ ...wedding, occasion: 'communal_ceremony', spouseIds: [] }, active);
        assert.equal(scene.children[0].visible, true);
        assert.equal(scene.children[0].children.length, 1);
        assert.ok(scene.children[0].children[0] === firstMesh);
        visuals.update(wedding, active);
        assert.ok(scene.children[0].children[0] === firstMesh);
        visuals.dispose();
    });
});

test('scene disposal releases both cached occasion geometries, its shared material and detached graph exactly once', () => {
    const scene = new Scene();
    const visuals = new CulturalCeremonyVisuals(scene);
    const state = { active: true, fireLit: true, spouses: [] };
    visuals.update(wedding, state);
    const graph = scene.children[0], mesh = graph.children[0];
    const weddingGeometry = mesh.geometry;
    const material = mesh.material;
    visuals.update({ ...wedding, occasion: 'communal_ceremony', spouseIds: [] }, state);
    const communalGeometry = mesh.geometry;
    const triangles = geometry => (geometry.index?.count ?? geometry.attributes.position.count) / 3;
    assert.ok(triangles(weddingGeometry) + triangles(communalGeometry) <= 2000,
        'Both bounded cached variants together stay within the full decoration geometry budget');
    assert.equal(mesh.geometry.groups.length, 0);
    assert.equal(Array.isArray(material), false);
    let geometryDisposals = 0, materialDisposals = 0;
    weddingGeometry.addEventListener('dispose', () => geometryDisposals++);
    communalGeometry.addEventListener('dispose', () => geometryDisposals++);
    material.addEventListener('dispose', () => materialDisposals++);
    visuals.dispose();
    visuals.dispose();
    assert.equal(geometryDisposals, 2);
    assert.equal(materialDisposals, 1);
    assert.equal(scene.children.length, 0);
    assert.equal(graph.children.length, 0, 'Detached ownership must not retain its disposed mesh buffers');
    visuals.update(wedding, state);
    assert.equal(scene.children.length, 0);
});

test('camera clipping and real visibility hide spouse labels rather than revealing absent people', () => {
    withDOM(document => {
        const host = document.querySelector('main');
        const visuals = new CulturalCeremonyVisuals(new Scene(), host);
        const camera = new PerspectiveCamera(50, 390 / 800, .1, 100);
        camera.position.set(30, 9, 5);
        camera.lookAt(30, 5, -15);
        camera.updateMatrixWorld();
        const state = { active: true, fireLit: true, camera, width: 390, height: 800, spouses: [
            { id: 'persona-a', name: 'Áilu', position: { x: 30, y: 6, z: 20 }, visible: true },
            { id: 'persona-b', name: 'Leofhild', position: { x: 32, y: 6, z: -12 }, visible: true },
        ] };
        visuals.update(wedding, state);
        const labels = host.querySelector('.fjord-ceremony-labels');
        assert.equal(labels.children.length, 2);
        assert.equal(labels.children[0].hidden, true, 'Behind-camera anchors must not leak screen labels');
        assert.equal(labels.children[1].hidden, false);
        visuals.update(wedding, { ...state, spouses: state.spouses.map(person => ({ ...person, visible: false })) });
        assert.equal(labels.children.length, 0);
        assert.equal(labels.hidden, true);
        visuals.dispose();
    });
});

test('presentation input and its real spouse anchors remain unchanged across scene updates', () => {
    const scene = new Scene();
    const visuals = new CulturalCeremonyVisuals(scene);
    const frame = structuredClone(wedding);
    const state = { active: true, fireLit: true, spouses: [
        { id: 'persona-a', name: 'Áilu', position: { x: 28, y: 6, z: -12 }, visible: true },
        { id: 'persona-b', name: 'Leofhild', position: { x: 32, y: 6, z: -12 }, visible: true },
    ] };
    const before = JSON.stringify({ frame, state });
    for (let index = 0; index < 100; index++) visuals.update(frame, state);
    assert.equal(JSON.stringify({ frame, state }), before);
    const mesh = scene.children[0].children[0];
    assert.equal(mesh.geometry.groups.length, 0);
    visuals.dispose();
});

test('a foreground paused frame keeps its static ceremony without advancing the supplied phase or position', () => {
    const scene = new Scene();
    const visuals = new CulturalCeremonyVisuals(scene);
    const pausedFrame = Object.freeze({ ...wedding, phaseElapsedSeconds: 2,
        position: Object.freeze({ ...wedding.position }) });
    const state = { active: true, fireLit: true, spouses: [] };
    const before = JSON.stringify(pausedFrame);
    visuals.update(pausedFrame, state);
    assert.equal(scene.children[0].visible, true,
        'The foreground ceremony remains visible while its unchanged simulation frame is paused');
    const mesh = scene.children[0].children[0], geometry = mesh.geometry;
    const position = scene.children[0].position.toArray();
    for (let frame = 0; frame < 100; frame++) visuals.update(pausedFrame, state);
    assert.equal(scene.children[0].visible, true);
    assert.ok(scene.children[0].children[0] === mesh);
    assert.ok(mesh.geometry === geometry);
    assert.deepEqual(scene.children[0].position.toArray(), position);
    assert.equal(JSON.stringify(pausedFrame), before);
    visuals.dispose();
});

test('communal standards and garland remain behind the campfire inside its existing clearance', () => {
    const scene = new Scene();
    const visuals = new CulturalCeremonyVisuals(scene);
    const frame = { ...wedding, occasion: 'communal_ceremony', spouseIds: [] };
    visuals.update(frame, { active: true, fireLit: true, spouses: [] });
    const graph = scene.children[0], mesh = graph.children[0];
    const bounds = new Box3().setFromObject(graph);
    assert.ok(bounds.max.z <= frame.position.z - 3,
        'The whole communal decoration stays on the rear plane, clear of the fire center');
    assert.ok(bounds.min.x < frame.position.x - 2 && bounds.max.x > frame.position.x + 2,
        'The rear garland still spans both standards');
    const positions = mesh.geometry.attributes.position;
    for (let vertex = 0; vertex < positions.count; vertex++)
        assert.ok(Math.hypot(positions.getX(vertex), positions.getZ(vertex)) <= 4.4,
            'Moving decoration behind the fire must preserve its existing obstacle clearance');
    assert.equal(graph.children.length, 1);
    assert.equal(Array.isArray(mesh.material), false);
    assert.equal((mesh.geometry.index?.count ?? positions.count) / 3, 616,
        'The placement refinement adds no geometry');
    visuals.dispose();
});