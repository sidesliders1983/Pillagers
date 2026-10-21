import { Scene, Color, HemisphereLight, DirectionalLight, PerspectiveCamera, WebGLRenderer,
    Vector3 } from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { WildlifeLayer } from '../../src/wildlife/WildlifeLayer';
import { advanceMarine, marineDuration, marinePose } from '../../src/wildlife/MarineEncounters';
import { ReferenceWater } from '../../src/water/ReferenceWater';
import type { WorldBlueprint } from '../../src/world-generation/WorldBlueprint';

// Deliberately small review fixture, separate from saved campaigns. Uses the actual population,
// renderer, prepared rig, water sampling and encounter phases; no alternate animation implementation.
const bounds = { minX: -400, maxX: 400, minZ: -400, maxZ: 400 };
const heights: number[] = [], cells: boolean[] = [], biomes: string[] = [];
for (let z = -400; z <= 400; z += 4) for (let x = -400; x <= 400; x += 4) {
    heights.push(x < -100 ? -10 : x < -80 ? (x + 80) * .5 : (x + 80) * .25);
    cells.push(x > -80);
    biomes.push(x < -80 ? 'water' : x < -60 ? 'shore' : x < 70 ? 'forest' : 'rock');
}
const terrain = { bounds, spacing: 4, columns: 201, rows: 201, heights };
const world = { config: { seed: 243, width: 800, depth: 800 }, waterLevel: 0, terrain,
    navigation: { ...terrain, cells },
    coast: [{ a: { x: -80, z: -400 }, b: { x: -80, z: 400 } }],
    settlement: { center: { x: -40, z: 0 }, harbor: { x: -80, z: 0 }, buildings: [] },
    biomes: { cells: biomes, moisture: heights.map(() => .8) }, placementPlan: [],
} as unknown as WorldBlueprint;
const scene = new Scene();
scene.background = new Color('#cad7db');
scene.add(new HemisphereLight('#ffffff', '#7193a0', 2.5));
const sun = new DirectionalLight('#fff5df', 2.5);
sun.position.set(10, 30, 20);
scene.add(sun);
const camera = new PerspectiveCamera(42, innerWidth / innerHeight, .01, 1500);
const renderer = new WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
document.body.append(renderer.domElement);
const controls = new OrbitControls(camera, renderer.domElement);
const water = new ReferenceWater({ size: 80, extent: 1800, quality: 'medium', level: 0 });
scene.add(water.mesh);
const layer = await WildlifeLayer.create(world);
scene.add(layer.root);
layer.setWaterHeightSampler((x, z) => water.getHeightAt(x, z) ?? world.waterLevel);
const whale = layer.population.actors.find(actor => actor.species === 'humpback-whale')!;
const orca = layer.population.actors.find(actor => actor.species === 'orca')!;
const otter = layer.population.actors.find(actor => actor.variant.behavior === 'otter_shore_water')!;
const species = document.getElementById('marine-species') as HTMLSelectElement;
const timeline = document.getElementById('encounter-time') as HTMLInputElement;
let selected = whale, playing = false, waterTime = 0;
function present() {
    document.getElementById('status')!.textContent = `${selected.species} · ${selected.state} · `
        + (selected.marine ? `${selected.variant.encounter!.canonicalLength} m · depth ${(-layer.population.habitats.surface.surfaceHeightAt(
            selected.position.x, selected.position.z)).toFixed(1)} m · `
            + `${marinePose(selected).visible ? 'surfaced / sightable' : 'submerged / not sightable'}`
            : selected.state === 'back_float' ? 'source rig · tail tip on local water surface'
                : 'source rig · upper back at waterline · paws submerged');
    controls.update();
    renderer.render(scene, camera);
}
function focus() {
    const size = selected.variant.encounter?.canonicalLength ?? 1.5;
    controls.target.set(selected.position.x, 0, selected.position.z);
    const view = new Vector3(size * 1.3, size * .6, size * .6)
        .applyAxisAngle(new Vector3(0, 1, 0), selected.heading);
    camera.position.copy(controls.target).add(view);
    water.mesh.position.set(selected.position.x, 0, selected.position.z);
    controls.update();
}
function choose(id: string) {
    selected = id === 'float' || id === 'swim' ? otter : species.value === 'orca' ? orca : whale;
    playing = id !== 'deep';
    if (selected.marine) {
        const isOrca = selected === orca;
        selected.state = 'surface';
        Object.assign(selected.marine, { elapsed: id === 'blow' ? 21
            : id === 'dive' ? isOrca ? 34 : 42 : id === 'headrise' ? 62
                : id === 'deep' ? isOrca ? 48 : 60 : id === 'play' ? 0 : isOrca ? 22 : 28,
            cooldown: 0, routeIndex: 0, special: id === 'dive' || id === 'headrise' });
        advanceMarine(selected, 0, world.config.seed, layer.population.marineRoutes.get(selected.id)!, layer.population.habitats);
    } else {
        otter.state = id === 'float' ? 'back_float' : 'swim';
        otter.wait = 1010;
        otter.floatUntil = layer.population.time + 1000;
        otter.target = null;
    }
    layer.advance(0, false);
    timeline.disabled = !selected.marine;
    if (selected.marine) {
        timeline.max = String(marineDuration(selected.variant) - .1);
        timeline.value = String(selected.marine.elapsed);
    }
    focus();
    present();
}
for (const id of ['surface', 'blow', 'dive', 'deep', 'play', 'headrise', 'float', 'swim'])
    document.getElementById(id)!.onclick = () => choose(id);
document.getElementById('pause')!.onclick = () => { playing = !playing; };
species.onchange = () => {
    (document.getElementById('blow') as HTMLButtonElement).disabled = species.value === 'orca';
    (document.getElementById('headrise') as HTMLButtonElement).disabled = species.value !== 'orca';
    document.getElementById('dive')!.textContent = species.value === 'orca' ? 'Dive' : 'Rare tail dive';
    choose('surface');
};
timeline.oninput = () => {
    if (!selected.marine) return;
    playing = false;
    selected.state = 'surface';
    selected.marine.cooldown = 0;
    selected.marine.elapsed = Number(timeline.value);
    advanceMarine(selected, 0, world.config.seed, layer.population.marineRoutes.get(selected.id)!, layer.population.habitats);
    layer.advance(0, false);
    focus();
    present();
};
choose('surface');
let previous = performance.now();
renderer.setAnimationLoop(() => {
    const now = performance.now(), delta = Math.min(.05, (now - previous) / 1000);
    previous = now;
    if (playing) waterTime += delta;
    water.update(waterTime, camera);
    layer.advance(delta, playing, camera);
    if (playing && selected.marine) timeline.value = String(selected.marine.elapsed);
    if (selected.marine && playing) {
        const shift = new Vector3(selected.position.x - controls.target.x, 0, selected.position.z - controls.target.z);
        controls.target.add(shift);
        camera.position.add(shift);
    }
    present();
});
onresize = () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
};
onpagehide = () => { renderer.setAnimationLoop(null); layer.dispose(); water.dispose(); renderer.dispose(); };
