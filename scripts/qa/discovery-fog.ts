import { Color, GridHelper, Mesh, MeshBasicMaterial, PerspectiveCamera, PlaneGeometry,
    Scene, WebGLRenderer } from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { DiscoveryFog } from '../../src/fjord-play/DiscoveryFog';
import type { DiscoveryView } from '../../src/simulation/ClanDiscovery';

const bounds = { minX: 0, maxX: 800, minZ: 0, maxZ: 800 };
const world = { waterLevel: -1, terrain: { bounds, columns: 201, rows: 201,
    spacing: 4, heights: Array(201 * 201).fill(0) } };
const scene = new Scene();
scene.background = new Color('#dce4df');
const ground = new Mesh(new PlaneGeometry(800, 800), new MeshBasicMaterial({ color: '#749068' }));
ground.rotation.x = -Math.PI / 2;
ground.position.set(400, 0, 400);
const grid = new GridHelper(800, 100, '#364e31', '#52684a');
grid.position.set(400, .01, 400);
scene.add(ground, grid);
const renderer = new WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
document.body.append(renderer.domElement);
const camera = new PerspectiveCamera(45, innerWidth / innerHeight, .1, 5000);
const controls = new OrbitControls(camera, renderer.domElement);
const coverage = document.getElementById('coverage') as HTMLSelectElement;
const status = document.getElementById('status')!;
const motionButton = document.getElementById('motion')!;
let fog: DiscoveryFog;
let states: number[];
let row = 50, cursor = 0, moving = false, elapsed = 0, updateMs = 0;
const encode = (bytes: Uint8Array) => Array.from(bytes, n => n.toString(16).padStart(2, '0')).join('');

function knowledge(): DiscoveryView {
    const explored = new Uint8Array(1250), visible = new Uint8Array(1250);
    states.forEach((state, cell) => {
        if (state) explored[cell >> 3] |= 1 << (cell & 7);
        if (state === 2) visible[cell >> 3] |= 1 << (cell & 7);
    });
    return { version: 1, worldId: 'fog-review', cellSize: 8,
        grid: { bounds, columns: 100, rows: 100 }, explored: encode(explored), visible: encode(visible) };
}

function reset() {
    fog?.dispose();
    const fraction = Number(coverage.value);
    states = Array.from({ length: 10000 }, (_, cell) => cell < fraction * 10000 ? 1 : 0);
    row = fraction === .9 ? 50 : 10;
    for (let z = row - 1; z <= row + 1; z++) for (let x = 45; x < 55; x++) states[z * 100 + x] = 0;
    cursor = 0;
    fog = new DiscoveryFog(world, knowledge());
    scene.add(fog.root);
    controls.target.set(400, 0, row * 8);
    camera.position.set(400, 155, row * 8 + 145);
    controls.update();
}

function commit(next: DiscoveryView, count = 1) {
    const start = performance.now();
    for (let update = 0; update < count; update++) fog.setKnowledge(next);
    updateMs = performance.now() - start;
}

document.getElementById('reveal')!.onclick = () => {
    const cell = (row - 1 + Math.floor(cursor / 10) % 3) * 100 + 45 + cursor % 10;
    states[cell] = 2;
    cursor++;
    commit(knowledge());
};
document.getElementById('repeat')!.onclick = () => commit(knowledge(), 1000);
motionButton.onclick = () => {
    moving = !moving;
    motionButton.setAttribute('aria-pressed', String(moving));
};
coverage.onchange = reset;
reset();
let previous = performance.now();
renderer.setAnimationLoop(() => {
    const now = performance.now(), delta = Math.min(.1, (now - previous) / 1000);
    previous = now;
    elapsed += delta;
    if (moving && elapsed >= 1.5) {
        elapsed = 0;
        for (let x = 58; x <= 63; x++) states[row * 100 + x] = 1;
        states[row * 100 + 58 + cursor++ % 6] = 2;
        commit(knowledge());
    }
    fog.update(delta);
    const stats = fog.inspect();
    status.textContent = `Builds ${stats.maskBuilds} · updates ${stats.maskUpdates} · `
        + `last raster ${stats.lastRasterizedCells}/10,000 cells · ${stats.drawCalls} draw · `
        + `${stats.fadingPixels} fading pixels · last call ${updateMs.toFixed(2)} ms`;
    renderer.domElement.dataset.discovery = JSON.stringify(stats);
    controls.update();
    renderer.render(scene, camera);
});
onresize = () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
};
onpagehide = () => {
    renderer.setAnimationLoop(null);
    fog.dispose();
    ground.geometry.dispose();
    ground.material.dispose();
    grid.geometry.dispose();
    (Array.isArray(grid.material) ? grid.material : [grid.material]).forEach(material => material.dispose());
    controls.dispose();
    renderer.dispose();
};
