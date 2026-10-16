import * as THREE from 'three';
import { DiscoveryFog } from '/src/fjord-play/DiscoveryFog.ts';
import { createBlueprintSurface, terrainTriangles } from '/src/world-generation/TerrainQueries.ts';
import { createClanDiscovery, commitClanObservation, inspectClanDiscovery, projectDiscoveryEntities } from '/src/simulation/ClanDiscovery.ts';
const query = new URLSearchParams(location.search);
const fixture = await (await fetch('/artifacts/clan-discovery/world-' + (query.get('seed') || 18) + '.json')).json();
const canvas = document.querySelector('canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
const scene = new THREE.Scene();
scene.background = new THREE.Color('#b6c5cb');
const camera = new THREE.PerspectiveCamera(45, 1, .1, 4000);
const surface = createBlueprintSurface(fixture);
const positions = [], colours = [];
const { terrain, waterLevel } = fixture;
for (let row = 0; row < terrain.rows; row++) for (let col = 0; col < terrain.columns; col++) {
    const h = terrain.heights[row * terrain.columns + col];
    positions.push(terrain.bounds.minX + col * terrain.spacing, Math.max(waterLevel, h),
        terrain.bounds.minZ + row * terrain.spacing);
    const colour = new THREE.Color(h <= waterLevel ? '#416c81' : '#73916b');
    if (h > 15) colour.lerp(new THREE.Color('#8b8e8b'), Math.min(1, (h - 15) / 70));
    colours.push(colour.r, colour.g, colour.b);
}
const geometry = new THREE.BufferGeometry();
geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
geometry.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
geometry.setIndex(terrainTriangles(terrain).flat());
geometry.computeVertexNormals();
scene.add(new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .95 })));
const ambient = new THREE.HemisphereLight('#dfeafb', '#635947', 1.8);
const sun = new THREE.DirectionalLight('#ffe0b2', 3);
sun.position.set(-200, 300, -100);
scene.add(ambient, sun);
let state = fixture.state;
const fog = new DiscoveryFog(fixture, fixture.view);
scene.add(fog.root);
let target = { ...fixture.settlement.center };
const rival = new THREE.Mesh(new THREE.SphereGeometry(5, 12, 8), new THREE.MeshBasicMaterial({ color: '#ff8d4e' }));
if (fixture.rival) rival.position.set(fixture.rival.x, surface.surfaceHeightAt(fixture.rival.x, fixture.rival.z) + 6, fixture.rival.z);
scene.add(rival);
const nativeRivalRaycast = rival.raycast.bind(rival);
rival.raycast = (ray, hits) => { if (rival.visible) nativeRivalRaycast(ray, hits); };
const observers = fixture.observers;
let tick = 800500;
const sync = () => {
    const view = inspectClanDiscovery(state, 'player');
    fog.setKnowledge(view);
    rival.visible = !!fixture.rival && projectDiscoveryEntities(view, 'player', [{ id: 'rival-fixture',
        clanId: 'other', kind: 'persona', label: 'Rival fixture', x: rival.position.x,
        y: rival.position.y, z: rival.position.z }]).length > 0;
    canvas.dataset.discovery = JSON.stringify({ ...fog.inspect(), rivalVisible: rival.visible });
};
const resize = () => {
    const rect = canvas.getBoundingClientRect();
    renderer.setSize(rect.width, rect.height, false);
    camera.aspect = rect.width / rect.height;
    camera.updateProjectionMatrix();
};
new ResizeObserver(resize).observe(canvas);
const setView = name => {
    const center = name === 'home' ? target : { x: 0, z: 0 };
    const y = Math.max(waterLevel, surface.surfaceHeightAt(center.x, center.z));
    if (name === 'top') camera.position.set(center.x, 1250, center.z + .01);
    else if (name === 'home') camera.position.set(center.x + 90, y + 95, center.z - 120);
    else camera.position.set(550, 530, -680);
    camera.lookAt(center.x, y, center.z);
};
let last = performance.now(), samples = [], collecting = false;
renderer.setAnimationLoop(() => {
    const now = performance.now(), delta = Math.min(.1, (now - last) / 1000);
    const gap = now - last;
    last = now;
    fog.update(delta);
    const start = performance.now();
    renderer.render(scene, camera);
    if (collecting) samples.push({ intervalMs: gap, submitMs: performance.now() - start });
});
window.discoveryReview = {
    fixture,
    setView,
    setFog(enabled) { fog.root.visible = enabled; },
    setQuality(quality) { renderer.setPixelRatio(quality === 'low' ? 1 : 1.5); resize(); },
    setLighting(name) {
        sun.intensity = name === 'night' ? .1 : name === 'dusk' ? 1.5 : 3;
        ambient.intensity = name === 'night' ? .15 : name === 'dusk' ? .7 : 1.8;
        sun.color.set(name === 'dusk' ? '#ffb77b' : '#ffe0b2');
        scene.background.set(name === 'night' ? '#101e2a' : name === 'dusk' ? '#927e7d' : '#b6c5cb');
    },
    setAtmosphere(enabled) { scene.fog = enabled ? new THREE.Fog('#b6c5cb', 100, 700) : null; },
    observe(point) {
        const started = performance.now();
        tick += 5;
        state = commitClanObservation(state, fixture, state.worldId, 'player',
            [...observers, { id: 'confirmed-scout-fixture', kind: 'expedition', ...point }], tick);
        const observed = performance.now();
        target = point;
        sync();
        return { observationMs: observed - started, presentationMs: performance.now() - observed };
    },
    depart() {
        tick += 5;
        state = commitClanObservation(state, fixture, state.worldId, 'player', observers, tick);
        sync();
    },
    inspect() { return { ...fog.inspect(), rivalVisible: rival.visible, state: structuredClone(state) }; },
    foregroundProof() {
        const world = { waterLevel: -1, terrain: { bounds: { minX: 0, maxX: 64, minZ: 0, maxZ: 32 },
            spacing: 8, columns: 9, rows: 5,
            heights: Array.from({ length: 45 }, (_, i) => i % 9 === 4 ? 12 : 0) } };
        const known = createClanDiscovery(world, 'depth-fixture', 'home',
            [{ id: 'home', kind: 'settlement', x: 4, z: 16 }], 800500);
        const proofFog = new DiscoveryFog(world, inspectClanDiscovery(known, 'home'));
        const proof = new THREE.Scene();
        proof.background = new THREE.Color('#000000');
        const box = new THREE.Mesh(new THREE.BoxGeometry(6, 6, 6), new THREE.MeshBasicMaterial({ color: '#ff3b30' }));
        box.position.set(8, 4, 16);
        proof.add(box, proofFog.root);
        const eye = new THREE.PerspectiveCamera(45, 1, .1, 3000);
        eye.position.set(-40, 10, 16); eye.lookAt(8, 4, 16);
        const target = new THREE.WebGLRenderTarget(128, 128);
        renderer.setRenderTarget(target);
        renderer.render(proof, eye);
        const pixel = new Uint8Array(4);
        renderer.readRenderTargetPixels(target, 64, 64, 1, 1, pixel);
        renderer.setRenderTarget(null);
        proofFog.dispose(); box.geometry.dispose(); box.material.dispose(); target.dispose();
        return [...pixel];
    },
    async measure() {
        await new Promise(resolve => setTimeout(resolve, 300));
        samples = []; collecting = true;
        while (samples.length < 60) await new Promise(requestAnimationFrame);
        collecting = false;
        return { samples, drawCalls: renderer.info.render.calls, triangles: renderer.info.render.triangles,
            geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures };
    },
};
resize(); setView(query.get('view') || 'home'); sync(); canvas.dataset.ready = 'true';
