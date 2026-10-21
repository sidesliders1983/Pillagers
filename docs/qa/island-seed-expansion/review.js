import * as THREE from 'three';
import { createBlueprintTerrainAsync, disposeBlueprintTerrain } from '/src/world/BlueprintTerrain.ts';
import { createBlueprintSurface } from '/src/world-generation/TerrainQueries.ts';
import { AssetManager } from '/src/core/AssetManager.ts';
import { FjordModels } from '/src/fjord-play/FjordModels.ts';

const canvas = document.querySelector('#viewer');
const status = document.querySelector('#status');
const scene = new THREE.Scene();
scene.background = new THREE.Color('#23444e');
scene.add(new THREE.HemisphereLight(0xdfeaff, 0x58624f, 2.0));
const sun = new THREE.DirectionalLight(0xfff5dc, 2.3);
sun.position.set(-320, 230, -190);
scene.add(sun);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1;
const camera = new THREE.PerspectiveCamera(42, 1, 1, 5000);
const water = new THREE.Mesh(new THREE.PlaneGeometry(3200, 3200),
    new THREE.MeshStandardMaterial({ color: '#254d60', roughness: .8 }));
water.rotation.x = -Math.PI / 2;
scene.add(water);
const actors = new THREE.Group();
scene.add(actors);
let terrain, current, currentSeed, revision = 0, view = 'oblique', assets, models, loadingAssets;

function render() {
    const bounds = canvas.getBoundingClientRect();
    renderer.setSize(bounds.width, bounds.height, false);
    camera.aspect = bounds.width / Math.max(1, bounds.height);
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);
    canvas.dataset.renderEvidence = JSON.stringify({ seed: currentSeed, view,
        triangles: renderer.info.render.triangles, calls: renderer.info.render.calls,
        geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures,
        pixelRatio: renderer.getPixelRatio(), width: bounds.width, height: bounds.height,
        modelDiagnostics: models?.diagnostics ?? [], assetDiagnostics: assets?.diagnostics ?? [] });
}
new ResizeObserver(render).observe(canvas);

async function showActors() {
    actors.visible = !['top', 'oblique'].includes(view);
    if (!actors.visible || actors.children.length) return;
    status.textContent = 'Loading the existing authored dwelling assets…';
    if (!loadingAssets) {
        assets = new AssetManager();
        loadingAssets = assets.load().then(() => { models = new FjordModels(assets); });
    }
    await loadingAssets;
    const owner = revision;
    const selected = view === 'rival' ? current.entities.rival :
        view === 'shore' ? current.entities.player : current.entities.built;
    const fire = view === 'rival' ? current.entities.rivalCampfire : current.entities.campfire;
    const entities = selected.filter(entity => ['household', 'building', 'longship'].includes(entity.kind) && entity.transform);
    entities.push({ kind: 'campfire', id: 'review-fire', asset: 'stoneCampfire', transform: fire.transform });
    for (const entity of entities) {
        const model = await models.create(entity);
        if (owner !== revision) { models.release(model); return; }
        const transform = entity.transform;
        model.position.set(transform.x, transform.y, transform.z);
        model.rotation.y = transform.rotation;
        actors.add(model);
    }
    if (view === 'shore') {
        const pier = current.dock?.find(attachment => attachment.key === 'jetty');
        if (pier) {
            const model = assets.get('jetty');
            model.position.set(pier.x, pier.y, pier.z);
            model.rotation.y = pier.rotation;
            actors.add(model);
        }
    }
    canvas.dataset.modelDiagnostics = JSON.stringify(models.diagnostics);
}

async function setView(next) {
    if (!current) return;
    revision++;
    for (const model of [...actors.children]) { actors.remove(model); models?.release(model); }
    view = next;
    const world = current.world;
    const surface = createBlueprintSurface(world);
    const center = next === 'rival' ? current.rival.center :
        next === 'shore' ? current.plan.berth.center : current.plan.center;
    const y = surface.surfaceHeightAt(center.x, center.z);
    if (next === 'top') { camera.position.set(0, 1100, -.01); camera.lookAt(0, 0, 0); }
    else if (next === 'oblique') { camera.position.set(630, 560, -630); camera.lookAt(0, 0, 0); }
    else { camera.position.set(center.x + 95, y + 82, center.z - 105); camera.lookAt(center.x, y + 2, center.z); }
    await showActors();
    render();
    canvas.dataset.ready = 'true';
    canvas.dataset.seed = String(currentSeed);
    canvas.dataset.view = next;
    status.textContent = `Geography ${currentSeed} · ${next} · canonical terrain · fixed neutral summer light. ` +
        (next === 'shore' ? (current.dock ? 'Actual published pier; supported by the existing dock planner.' :
            'Pier support is still a separate acceptance gate for this candidate.') :
            next === 'player' ? 'Funded ten-home construction fixture, not a starting stock or gameplay change.' : 'QA developer view.');
    canvas.scrollIntoView({ block: 'center' });
}
for (const button of document.querySelectorAll('[data-view]'))
    button.addEventListener('click', () => setView(button.dataset.view).catch(error => status.textContent = error.message));

async function openCandidate(seed) {
    canvas.dataset.ready = 'false';
    status.textContent = 'Loading the candidate’s canonical terrain inspection…';
    const row = report.rows.find(candidate => candidate.seed === seed);
    if (!row.inspection) throw new Error('The detailed inspection is still being prepared. The elevation map is available above.');
    const response = await fetch(row.inspection.path);
    if (!response.ok) throw new Error('The full inspection is still being prepared. Its top-down map is already available above.');
    // Vite serves .json.gz with Content-Encoding: gzip; Fetch already decodes it.
    current = await response.json();
    currentSeed = seed;
    if (terrain) { scene.remove(terrain); disposeBlueprintTerrain(terrain); }
    terrain = await createBlueprintTerrainAsync(current.world, undefined, 'form');
    scene.add(terrain);
    water.position.y = current.world.waterLevel + .02;
    document.querySelector('#viewer-title').textContent = 'Geography seed ' + seed;
    await setView('oblique');
}

const report = await (await fetch('./results.json')).json();
document.querySelector('#summary').textContent = `${report.completed} / ${report.expected} geography seeds measured. ` +
    `${report.newPreparedCandidates.length} new preparation candidates; ${report.shortlist.length} on the current shortlist. Current game pool: 18 and 7.`;
for (const row of report.rows.filter(row => row.preparationPassed)) {
    const article = document.createElement('article');
    article.innerHTML = `<img src="maps/${row.seed}.png" alt="Elevation map for geography ${row.seed}">
        <div><strong>Geography ${row.seed}</strong><small>${row.plan.plots.length} home plots · ` +
        `${row.plan.access.rivalRoute} m landing-to-rival route</small>` +
        `<small>${row.inspection?.report.checks.travel?.returned ? 'Direct eight-Food return probe passed' :
            row.inspection?.report.findings.length ? 'Route / inspection limitations recorded' : 'Detailed inspection pending'}</small>` +
        `<button ${row.inspection ? '' : 'disabled'}>Inspect terrain</button></div>`;
    article.querySelector('button').addEventListener('click', () => openCandidate(row.seed)
        .catch(error => status.textContent = error.message));
    if (row.shortlisted) {
        const links = document.createElement('small');
        links.innerHTML = ['top', 'oblique', 'player', 'shore', 'rival']
            .map(view => `<a href="captures/${row.seed}-${view}.png">${view}</a>`).join(' · ');
        article.querySelector('div').append(links);
    }
    document.querySelector(row.control ? '#controls' : row.shortlisted ? '#candidates' : '#alternates').append(article);
}
window.addEventListener('pagehide', () => {
    if (terrain) disposeBlueprintTerrain(terrain);
    models?.dispose(); assets?.dispose(); renderer.dispose();
}, { once: true });
