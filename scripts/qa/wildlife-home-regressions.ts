import { Color, DirectionalLight, HemisphereLight, Mesh, MeshStandardMaterial,
    PerspectiveCamera, PlaneGeometry, Scene, Vector3, WebGLRenderer } from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { WildlifePopulation } from '../../src/wildlife/WildlifePopulation';
import { WildlifeLayer } from '../../src/wildlife/WildlifeLayer';
import { captureWildlife, restoreWildlife } from '../../src/wildlife/WildlifeSnapshot';
import type { WildlifeState } from '../../src/simulation/WildlifeSightings';
import type { WorldBlueprint } from '../../src/world-generation/WorldBlueprint';
import { applyCommand, createCampaign, serializeState } from '../../src/simulation/SimulationCore';
import { GameplaySession } from '../../src/gameplay-lab/GameplaySession';
import { SharedSettlement } from '../../src/play/SharedSettlement';
import type { EntityKind } from '../../src/play/SettlementView';
import { FjordInterface } from '../../src/fjord-play/FjordInterface';

// Separate in-memory fixtures: no browser campaign storage or renderer-only animal decisions.
const bounds = { minX: -400, maxX: 400, minZ: -400, maxZ: 400 };
const heights: number[] = [], cells: boolean[] = [], biomes: string[] = [];
for (let z = -400; z <= 400; z += 4) for (let x = -400; x <= 400; x += 4) {
    const height = x < -92 ? -3 : (x + 80) * .25;
    heights.push(height);
    cells.push(height > .2);
    biomes.push(height < 0 ? 'water' : x < -60 ? 'shore' : x < 70 ? 'forest' : 'rock');
}
const terrain = { bounds, spacing: 4, columns: 201, rows: 201, heights };
const world = { config: { seed: 213, width: 800, depth: 800 }, waterLevel: 0, terrain,
    navigation: { ...terrain, cells },
    coast: [{ a: { x: -80, z: -400 }, b: { x: -80, z: 400 } }],
    settlement: { center: { x: -40, z: 0 }, harbor: { x: -80, z: 0 }, buildings: [] },
    biomes: { cells: biomes, moisture: heights.map(() => .8) }, placementPlan: [],
} as unknown as WorldBlueprint;
const simulation = new WildlifePopulation(world);
const animal = simulation.actors.find(actor => actor.species === 'wolf')!;
const opening = captureWildlife(simulation);
const layer = await WildlifeLayer.create(world);
let tick = 800000, threatened = false, running = true, accumulated = 0;
const snapshot = (): WildlifeState => ({ version: 2, worldId: 'qa-motion', startedAt: 800000,
    advancedAt: tick, actors: captureWildlife(simulation), nextEncounter: 1, contacts: [], firstDiscoveries: {} });
layer.useCanonical(snapshot(), .5);
layer.advance(0, false);
const actorRoot = layer.root.getObjectByName('wildlife:' + animal.id)!;
const scene = new Scene();
scene.background = new Color('#dce4df');
scene.add(new HemisphereLight('#ffffff', '#6f805e', 2.5));
const sun = new DirectionalLight('#fff1d4', 2.5);
sun.position.set(15, 40, 20);
scene.add(sun, layer.root);
const geometry = new PlaneGeometry(800, 800);
geometry.rotateX(-Math.PI / 2);
const positions = geometry.getAttribute('position');
for (let vertex = 0; vertex < positions.count; vertex++) positions.setY(vertex, (positions.getX(vertex) + 80) * .25);
geometry.computeVertexNormals();
const ground = new Mesh(geometry, new MeshStandardMaterial({ color: '#70815a' }));
scene.add(ground);
const viewport = document.getElementById('qa-scene')!;
const renderer = new WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
viewport.append(renderer.domElement);
const camera = new PerspectiveCamera(42, innerWidth / innerHeight, .01, 2000);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.copy(actorRoot.position).add(new Vector3(0, .7, 0));
camera.position.copy(controls.target).add(new Vector3(5, 3, 5));
controls.update();
let state = createCampaign(32, { initialMaterials: 100 });
const house = Object.values(state.households).find(home => home.memberIds.length > 0)!;
const tent = Object.values(state.households).find(home => home.id !== house.id && home.memberIds.length > 0)!;
state = applyCommand(state, { type: 'BuildHouse', householdId: house.id });
const building = state.residences[state.households[house.id].residenceId!].buildingId;
const session = new GameplaySession();
session.loadJSON(serializeState(state));
const owner = new SharedSettlement(session);
const refresh = () => ui.refresh(session.readSnapshot(), owner.selection, '', () => '');
const ui = new FjordInterface(owner, { refresh, select(kind, id) {
    owner.select(kind ? { kind: kind as EntityKind, id } : null);
    refresh();
}, commit(commands, done) {
    for (const command of typeof commands === 'function' ? commands() : commands) session.command(command);
    done();
    refresh();
}, notify() {} });
document.getElementById('entity-panel')!.addEventListener('click', event => {
    const button = (event.target as Element).closest<HTMLButtonElement>('button');
    if (button) ui.handle(button);
});
document.getElementById('qa-home')!.onclick = () => { owner.select({ kind: 'building', id: building }); refresh(); };
document.getElementById('qa-tent')!.onclick = () => { owner.select({ kind: 'household', id: tent.id }); refresh(); };
document.getElementById('qa-threat')!.onclick = () => { threatened = !threatened; };
document.getElementById('qa-replay')!.onclick = () => {
    restoreWildlife(simulation, opening, 0);
    tick = 800000;
    accumulated = 0;
    threatened = true;
    running = true;
    layer.useCanonical(undefined);
    layer.useCanonical(snapshot(), .5);
    layer.advance(0, false);
    simulation.setHumans([{ x: animal.position.x - 10, z: animal.position.z }]);
    simulation.advance(.2, true);
    tick++;
    layer.useCanonical(snapshot(), .5);
};
document.getElementById('qa-pause')!.onclick = () => { running = !running; };
owner.select({ kind: 'building', id: building });
refresh();
const oldFocus = controls.target.clone();
let last = performance.now();
renderer.setAnimationLoop(() => {
    const now = performance.now(), delta = Math.min(.1, (now - last) / 1000);
    last = now;
    if (running) accumulated += delta;
    if (accumulated >= .5) {
        accumulated -= .5;
        simulation.setHumans(threatened ? [{ x: animal.position.x - 10, z: animal.position.z }] : []);
        for (let step = 0; step < 3; step++) { simulation.advance(.2, true); tick++; }
        layer.useCanonical(snapshot(), .5);
    }
    layer.advance(delta, running);
    for (const child of layer.root.children) child.visible = child === actorRoot;
    const nextFocus = actorRoot.position.clone().add(new Vector3(0, .7, 0));
    camera.position.add(nextFocus.clone().sub(oldFocus));
    controls.target.copy(nextFocus);
    oldFocus.copy(nextFocus);
    controls.update();
    document.getElementById('qa-status')!.textContent = `Wolf: ${animal.state} · `
        + `canonical flee speed ${animal.variant.fleeSpeed} m/s · ${running ? 'Running' : 'Paused'} · `
        + `house residents appear immediately`;
    renderer.domElement.dataset.motion = JSON.stringify({ state: animal.state,
        displayed: actorRoot.position.toArray(), confirmed: { ...animal.position },
        canonicalFleeSpeed: animal.variant.fleeSpeed, running });
    renderer.render(scene, camera);
});
onresize = () => {
    const mobile = innerWidth < 800;
    viewport.style.width = mobile ? '100%' : 'calc(100% - 390px)';
    Object.assign(document.getElementById('fjord-management')!.style, {
        left: 'auto', right: '12px', bottom: '12px', top: mobile ? 'auto' : '145px',
        width: mobile ? 'calc(100% - 24px)' : '365px',
        maxHeight: mobile ? '40vh' : 'calc(100% - 160px)',
    });
    camera.aspect = viewport.clientWidth / viewport.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(viewport.clientWidth, viewport.clientHeight);
};
onresize(new Event('resize'));
onpagehide = () => {
    renderer.setAnimationLoop(null);
    ui.dispose();
    layer.dispose();
    ground.geometry.dispose();
    ground.material.dispose();
    controls.dispose();
    renderer.dispose();
};
