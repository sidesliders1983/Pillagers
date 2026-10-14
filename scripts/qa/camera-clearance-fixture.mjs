import { Scene, PerspectiveCamera, Vector3, HemisphereLight, DirectionalLight,
    Mesh, PlaneGeometry, MeshBasicMaterial, SphereGeometry, Color } from 'three';
import { RTSCameraController } from '/src/camera/RTSCameraController.ts';
import { browserGeneration } from '/src/world-generation/BrowserGeneration.ts';
import { createBlueprintTerrainAsync, disposeBlueprintTerrain } from '/src/world/BlueprintTerrain.ts';
import { createBlueprintSurface } from '/src/world-generation/TerrainQueries.ts';
import { createRenderer } from '/src/core/Renderer.ts';

const canvas = document.querySelector('#camera-canvas'), status = document.querySelector('#status');
const renderer = createRenderer(canvas), scene = new Scene();
renderer.shadowMap.enabled = false;
renderer.setPixelRatio(1);
scene.background = new Color('#b9d3dc');
scene.add(new HemisphereLight(0xffffff, 0x665b43, 2.2));
const sun = new DirectionalLight(0xffe0b4, 2);
sun.position.set(-100, 150, 40);
scene.add(sun);
const camera = new PerspectiveCamera(45, 1, .1, 3000);
const controller = new RTSCameraController(camera, canvas, 'pan');
const marker = new Mesh(new SphereGeometry(.9, 8, 6), new MeshBasicMaterial({ color: '#ff6036' }));
scene.add(marker);
const worker = browserGeneration();
let world, terrain, surface, poses, reference = false;
let previous = performance.now(), stopped = false;
const timings = [];

function draw() {
    const requested = controller.inspectClearance()?.requestedEye;
    const y = camera.position.y;
    if (reference && requested) camera.position.fromArray(requested);
    camera.lookAt(controller.focus);
    renderer.render(scene, camera);
    if (reference) { camera.position.y = y; camera.lookAt(controller.focus); }
}
function sample() {
    const diagnostics = controller.inspectClearance();
    if (!diagnostics) return null;
    const focus = controller.focus, eye = camera.position;
    const distance = Math.hypot(eye.x - focus.x, eye.z - focus.z);
    let independentlySampledBoom = Infinity;
    for (let i = 0; i <= 1000; i++) {
        const t = i / 1000;
        if (t * distance < 3) continue;
        const x = focus.x + (eye.x - focus.x) * t, z = focus.z + (eye.z - focus.z) * t;
        independentlySampledBoom = Math.min(independentlySampledBoom,
            focus.y + (eye.y - focus.y) * t - Math.max(world.waterLevel, surface.surfaceHeightAt(x, z)));
    }
    return { ...diagnostics, eye: eye.toArray(), independentlySampledBoom,
        endpointClearance: eye.y - Math.max(world.waterLevel, surface.surfaceHeightAt(eye.x, eye.z)),
        seed: world.config.seed, reference };
}
function pose(name) {
    reference = false;
    document.querySelector('#reference').textContent = 'Show uncorrected reference';
    if (name === 'home') controller.home();
    else controller.setView(poses[name]);
    controller.update(0);
    marker.position.copy(controller.focus);
    draw();
    document.querySelector('#diagnostics').textContent = JSON.stringify(sample(), null, 2);
}
function findPoses() {
    const { bounds, spacing, columns, rows, heights } = world.terrain;
    let best = null, gap = -Infinity, highest = 0;
    for (let i = 0; i < heights.length; i++) if (heights[i] > heights[highest]) highest = i;
    // Search fixtures once, never in a camera frame. Expected clearance is checked independently below.
    for (let row = 8; row < rows - 8; row += 12) for (let col = 8; col < columns - 8; col += 12) {
        const x = bounds.minX + col * spacing, z = bounds.minZ + row * spacing;
        const y = surface.surfaceHeightAt(x, z);
        if (y <= world.waterLevel + 2) continue;
        for (let direction = 0; direction < 8; direction++) {
            const angle = direction * Math.PI / 4, ex = x + Math.sin(angle) * 65, ez = z + Math.cos(angle) * 65;
            const ey = Math.max(y + 8, surface.surfaceHeightAt(ex, ez) + 4);
            let obstruction = 0;
            for (let n = 10; n < 90; n++) {
                const t = n / 100;
                obstruction = Math.max(obstruction, surface.surfaceHeightAt(x + (ex - x) * t, z + (ez - z) * t) - (y + 1 + (ey - y - 1) * t));
            }
            if (obstruction > gap) { gap = obstruction; best = { position: [ex, ey, ez], target: [x, y + 1, z] }; }
        }
    }
    const px = bounds.minX + highest % columns * spacing;
    const pz = bounds.minZ + Math.floor(highest / columns) * spacing;
    const center = world.settlement.center, harbor = world.settlement.harbor || center;
    return { ridge: best,
        cliff: { position: [px, heights[highest] - 4, pz], target: [px + 30, surface.surfaceHeightAt(px + 30, pz) + 1, pz] },
        coast: { position: [harbor.x + 25, world.waterLevel + 18, harbor.z - 28], target: [harbor.x, world.waterLevel + 1, harbor.z] },
    };
}
async function load(seed) {
    stopped = true;
    controller.enabled = false;
    canvas.dataset.ready = 'false';
    status.textContent = 'Preparing terrain…';
    const result = await worker.generate({ kind: 'campaign', seed }, event => {
        if (event.type === 'phase') status.textContent = event.stage;
    });
    if (terrain) { terrain.removeFromParent(); disposeBlueprintTerrain(terrain); }
    world = result.world;
    surface = createBlueprintSurface(world);
    terrain = await createBlueprintTerrainAsync(world, undefined, 'form');
    scene.add(terrain);
    const center = world.settlement.center;
    controller.setNavigationSurface(terrain, new Vector3(center.x, surface.surfaceHeightAt(center.x, center.z), center.z),
        world.terrain.bounds, surface.surfaceHeightAt, { terrain: world.terrain, waterLevel: world.waterLevel });
    poses = findPoses();
    pose('ridge');
    timings.length = 0;
    stopped = false;
    controller.enabled = true;
    status.textContent = 'Ready · drag pan, right-drag orbit, wheel/pinch zoom, touch-drag orbit';
    canvas.dataset.ready = 'true';
}
const resize = () => {
    const rect = canvas.getBoundingClientRect();
    renderer.setSize(rect.width, rect.height, false);
    camera.aspect = rect.width / rect.height;
    camera.updateProjectionMatrix();
};
new ResizeObserver(resize).observe(canvas);
resize();
for (const name of ['ridge', 'cliff', 'coast', 'home']) document.querySelector('#' + name).onclick = () => pose(name);
document.querySelector('#reference').onclick = () => {
    reference = !reference;
    document.querySelector('#reference').textContent = reference ? 'Show corrected camera' : 'Show uncorrected reference';
    draw();
};
document.querySelector('#seed').onchange = event => load(Number(event.target.value));
window.cameraQA = { sample, pose, load, timings,
    advance(dt) { controller.update(dt); draw(); return sample(); },
    setPaused(value) { stopped = value; },
};
renderer.setAnimationLoop(() => {
    const now = performance.now(), dt = Math.min(.1, (now - previous) / 1000);
    previous = now;
    if (!world || stopped) return;
    controller.update(dt);
    const metrics = controller.inspectClearance();
    if (timings.length < 4000) timings.push({ milliseconds: metrics.milliseconds, samples: metrics.samples, conservative: metrics.conservative });
    marker.position.copy(controller.focus);
    draw();
});
window.addEventListener('pagehide', () => { worker.dispose(); controller.dispose(); renderer.dispose(); }, { once: true });
load(32).catch(error => { status.textContent = String(error); throw error; });
