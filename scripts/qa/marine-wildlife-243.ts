import { Scene, Color, HemisphereLight, DirectionalLight, PerspectiveCamera, WebGLRenderer,
    Vector3 } from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { WildlifeLayer } from '../../src/wildlife/WildlifeLayer';
import { advanceMarine, marinePose } from '../../src/wildlife/MarineEncounters';
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
const whale = layer.population.actors.find(actor => actor.marine)!;
const otter = layer.population.actors.find(actor => actor.variant.behavior === 'otter_shore_water')!;
const routes = layer.population.marineRoutes.get(whale.id)!;
let selected = whale, playing = false, waterTime = 0;
function focus() {
    const size = selected === whale ? 14 : 1.5;
    controls.target.set(selected.position.x, 0, selected.position.z);
    camera.position.copy(controls.target).add(new Vector3(size * 1.1, size * .7, size * 1.1));
    water.mesh.position.set(selected.position.x, 0, selected.position.z);
    controls.update();
}
function choose(id: string) {
    selected = id === 'float' || id === 'swim' ? otter : whale;
    playing = id === 'play' || selected === otter;
    if (selected === whale) {
        whale.state = 'surface';
        Object.assign(whale.marine!, { elapsed: id === 'blow' ? 22.25 : id === 'dive' ? 49
            : id === 'deep' ? 60 : id === 'play' ? 0 : 28, cooldown: 0, routeIndex: 0,
            special: id === 'dive' });
        advanceMarine(whale, 0, world.config.seed, routes, layer.population.habitats);
    } else {
        otter.state = id === 'float' ? 'back_float' : 'swim';
        otter.wait = 1010;
        otter.floatUntil = layer.population.time + 1000;
        otter.target = null;
    }
    layer.advance(0, false);
    focus();
}
for (const id of ['surface', 'blow', 'dive', 'deep', 'play', 'float', 'swim'])
    document.getElementById(id)!.onclick = () => choose(id);
document.getElementById('pause')!.onclick = () => { playing = !playing; };
choose('surface');
let previous = performance.now();
renderer.setAnimationLoop(() => {
    const now = performance.now(), delta = Math.min(.05, (now - previous) / 1000);
    previous = now;
    if (playing) waterTime += delta;
    water.update(waterTime, camera);
    layer.advance(delta, playing, camera);
    if (selected === whale && playing) {
        const shift = new Vector3(whale.position.x - controls.target.x, 0, whale.position.z - controls.target.z);
        controls.target.add(shift);
        camera.position.add(shift);
    }
    document.getElementById('status')!.textContent = `${selected.species} · ${selected.state} · `
        + (selected === whale ? `14 m · depth ${(-layer.population.habitats.surface.surfaceHeightAt(
            selected.position.x, selected.position.z)).toFixed(1)} m · `
            + `${marinePose(whale).visible ? 'surfaced / sightable' : 'submerged / not sightable'}`
            : 'source rig · DNA-independent wildlife material');
    controls.update();
    renderer.render(scene, camera);
});
onresize = () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
};
onpagehide = () => { renderer.setAnimationLoop(null); layer.dispose(); water.dispose(); renderer.dispose(); };
