import * as THREE from 'three';
import { createBlueprintTerrainAsync, disposeBlueprintTerrain } from '/src/world/BlueprintTerrain.ts';
import { loadWorldGroundMaterials } from '/src/world/WorldGroundMaterials.ts';
import { SeasonTint } from '/src/world/SeasonTint.ts';
import { fjordSnowLine } from '/src/config/FjordTerrain.ts';

const canvas = document.querySelector('#viewer'), status = document.querySelector('#status');
const selector = document.querySelector('#seed'), quality = document.querySelector('#quality');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
const camera = new THREE.PerspectiveCamera(42, 1, 1, 5000);
const scenes = [0, 1].map(() => {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#294a57');
    scene.add(new THREE.HemisphereLight(0xdfeaff, 0x58624f, 2));
    const sun = new THREE.DirectionalLight(0xfff5dc, 2.3);
    sun.position.set(-320, 230, -190);
    scene.add(sun);
    const water = new THREE.Mesh(new THREE.PlaneGeometry(10000, 10000),
        new THREE.MeshStandardMaterial({ color: '#254d60', roughness: .8 }));
    water.rotation.x = -Math.PI / 2;
    scene.add(water);
    return { scene, water };
});
let world, mesh, clone, grounds, tints = [], view = 'oblique', revision = 0;

function render() {
    if (!world) return;
    const bounds = canvas.getBoundingClientRect(), width = Math.round(bounds.width), height = Math.round(bounds.height);
    renderer.setSize(width, height, false);
    camera.aspect = width / 2 / height;
    camera.updateProjectionMatrix();
    if (view === 'top') { camera.position.set(0, 1000, -.01); camera.lookAt(0, 0, 0); }
    else { camera.position.set(600, 430, -600); camera.lookAt(0, 8, 0); }
    renderer.setScissorTest(true);
    for (let index = 0; index < scenes.length; index++) {
        renderer.setViewport(index * width / 2, 0, width / 2, height);
        renderer.setScissor(index * width / 2, 0, width / 2, height);
        renderer.render(scenes[index].scene, camera);
    }
    renderer.setScissorTest(false);
    canvas.dataset.evidence = JSON.stringify({ seed: world.config.seed, view, quality: quality.value,
        snowlineY: fjordSnowLine(world), previousSnowlineY: fjordSnowLine(world) + 5,
        triangles: renderer.info.render.triangles, geometries: renderer.info.memory.geometries,
        textures: renderer.info.memory.textures, width, height });
}
new ResizeObserver(render).observe(canvas);

async function inspect(seed) {
    const owner = ++revision;
    canvas.dataset.ready = 'false';
    status.textContent = 'Loading canonical island terrain and native materials…';
    const response = await fetch(`/scratch/island-seed-expansion/promotion-v3/${seed}-render.json.gz`);
    if (!response.ok) throw new Error('Run the documented promotion validation to create the local render input.');
    const data = await response.json();
    for (const tint of tints) tint.dispose();
    tints = [];
    if (clone) { clone.removeFromParent(); for (const material of clone.material) material.dispose(); }
    if (mesh) { mesh.removeFromParent(); disposeBlueprintTerrain(mesh); }
    grounds?.dispose();
    world = data.world;
    grounds = await loadWorldGroundMaterials(quality.value, 1, 256, 'zoned', 'cool-grey', 'iceland-v1');
    mesh = await createBlueprintTerrainAsync(world, grounds.materials, 'none', undefined, 'zoned');
    if (owner !== revision) return;
    clone = mesh.clone(false);
    clone.material = mesh.material.map(source => {
        const material = source.clone();
        material.onBeforeCompile = source.onBeforeCompile;
        material.customProgramCacheKey = source.customProgramCacheKey;
        return material;
    });
    scenes[0].scene.add(mesh); scenes[1].scene.add(clone);
    for (const { water } of scenes) water.position.y = world.waterLevel + .02;
    tints = [new SeasonTint(new THREE.Group(), mesh, fjordSnowLine(world) + 5),
        new SeasonTint(new THREE.Group(), clone, fjordSnowLine(world))];
    for (const tint of tints) tint.update(null);
    render();
    canvas.dataset.ready = 'true';
    canvas.dataset.seed = String(seed);
    status.textContent = `Island ${seed} · snowline ${data.report.previousSnowlineY.toFixed(1)} → ` +
        `${data.report.snowlineY.toFixed(1)} m · snow-capable land ${data.report.oldLandSnowPercent.toFixed(2)}% → ` +
        `${data.report.newLandSnowPercent.toFixed(2)}%. Sample-based area estimate; steep faces remain exposed.`;
}
function open(seed) { inspect(seed).catch(error => { status.textContent = error.message; }); }
document.querySelector('#inspect').onclick = () => open(Number(selector.value));
quality.onchange = () => open(Number(selector.value));
for (const button of document.querySelectorAll('[data-view]')) button.onclick = () => { view = button.dataset.view; render(); };
const measurements = await (await fetch('./measurements.json')).json();
for (const row of measurements.rows) {
    selector.add(new Option(String(row.seed), String(row.seed)));
    const article = document.createElement('article');
    article.innerHTML = `<strong>Island ${row.seed}${[18, 7].includes(row.seed) ? ' · existing' : ' · new'}</strong>` +
        `<div class="maps"><img src="maps/${row.seed}-before.png" alt="Previous snow on island ${row.seed}">` +
        `<img src="maps/${row.seed}-after.png" alt="Lower snowline on island ${row.seed}"></div>` +
        `<small>Snowline ${row.previousSnowlineY.toFixed(1)} → ${row.snowlineY.toFixed(1)} m. ` +
        `Snow-capable land ${row.oldLandSnowPercent.toFixed(2)}% → ${row.newLandSnowPercent.toFixed(2)}%.</small>` +
        `<button>Inspect island ${row.seed}</button>` +
        `<small>Saved views: <a href="captures/${row.seed}-top.png">top-down</a> · ` +
        `<a href="captures/${row.seed}-oblique.png">oblique</a></small>`;
    article.querySelector('button').onclick = () => { selector.value = String(row.seed); open(row.seed); };
    document.querySelector('#islands').append(article);
}
open(Number(selector.value));
window.addEventListener('pagehide', () => {
    for (const tint of tints) tint.dispose();
    if (clone) for (const material of clone.material) material.dispose();
    if (mesh) disposeBlueprintTerrain(mesh);
    grounds?.dispose(); renderer.dispose();
}, { once: true });
