import {
    AmbientLight, Box3, Box3Helper, Color, DirectionalLight, Group, Mesh,
    MeshStandardMaterial, PerspectiveCamera, PlaneGeometry, Scene, Vector3, WebGLRenderer
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { AssetManager } from '../../src/core/AssetManager';
import { FjordModels } from '../../src/fjord-play/FjordModels';
import { FjordEntities } from '../../src/fjord-play/FjordEntities';
import { createFjordLayout, projectFjordSettlement } from '../../src/fjord-play/FjordProjection';
import { applyCommand, createCampaign, serializeState } from '../../src/simulation/SimulationCore';
import { generateWorld } from '../../src/world-generation/GenerateWorld';

const select = document.querySelector<HTMLSelectElement>('#scenario')!;
const status = document.querySelector<HTMLOutputElement>('#status')!;
const slider = document.querySelector<HTMLInputElement>('#time')!;
const pause = document.querySelector<HTMLButtonElement>('#pause')!;
const debug = document.querySelector<HTMLInputElement>('#debug')!;
const renderer = new WebGLRenderer({ antialias: true });
renderer.localClippingEnabled = true;
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setClearColor('#d3dad0');
document.body.append(renderer.domElement);
const scene = new Scene(), camera = new PerspectiveCamera(45, 1, .1, 1500);
const controls = new OrbitControls(camera, renderer.domElement);
scene.add(new AmbientLight('#eef3e4', 2));
const sun = new DirectionalLight('#fff0d1', 3);
sun.position.set(30, 50, 20); scene.add(sun);
const ground = new Mesh(new PlaneGeometry(400, 400), new MeshStandardMaterial({ color: '#8a9b6c', roughness: 1 }));
ground.rotation.x = -Math.PI / 2;
scene.add(ground);
const envelopeHelpers = new Group(); scene.add(envelopeHelpers);
const assets = new AssetManager();
await assets.loadForSimulation();
const models = new FjordModels(assets);
const world = generateWorld({ seed: 32 });
let layer: FjordEntities;
let playing = false, elapsed = 1.2, busy = false;
let canonicalProof = '';

async function prepare(time = 0, fitCamera = false) {
    if (busy) return;
    busy = true;
    layer?.dispose();
    envelopeHelpers.traverse(node => {
        if (!(node instanceof Box3Helper)) return;
        node.geometry.dispose();
        (node.material as import('three').Material).dispose();
    });
    envelopeHelpers.clear();
    layer = new FjordEntities(models); scene.add(layer.root);
    let state = createCampaign(32, { initialMaterials: 1000 }, {
        fertilityChanceBps: 0, mortalityBands: [{ minAge: 0, chanceBps: 0 }]
    }, { enabled: false });
    const households = Object.values(state.households).filter(home => home.memberIds.length);
    const count = select.value === 'multiple' ? 3 : 1;
    const upgraded = ['upgrade', 'longhouse', 'heavy', 'farm'].includes(select.value);
    const level = select.value === 'heavy' ? 3 : select.value === 'longhouse' ? 2 : 1;
    for (const household of households.slice(0, count)) {
        if (select.value === 'farm') state = applyCommand(state, {
            type: 'AssignOccupation', personaId: household.memberIds[0], occupation: 'farmer'
        });
        state = applyCommand(state, { type: 'BuildHouse', householdId: household.id });
        const buildingId = state.residences[state.households[household.id].residenceId!].buildingId!;
        state = applyCommand(state, { type: 'SpecializeBuilding', buildingId,
            occupation: select.value === 'farm' ? 'farmer' : 'smith' });
        if (upgraded) for (let i = 0; i < level - 1; i++)
            state = applyCommand(state, { type: 'UpgradeBuilding', buildingId });
    }
    let view = projectFjordSettlement(state, world, createFjordLayout(world));
    const buildingEntities = () => view.entities.filter(entity => entity.kind === 'building');
    await layer.sync(upgraded ? buildingEntities() : []);
    if (upgraded) {
        for (const building of Object.values(state.buildings))
            state = applyCommand(state, { type: 'UpgradeBuilding', buildingId: building.id });
        view = projectFjordSettlement(state, world, view.layout);
    }
    canonicalProof = serializeState(state);
    await layer.sync(buildingEntities());
    for (let t = 0; t < time; t += .01) layer.updateConstruction(Math.min(.01, time - t));
    elapsed = time; slider.value = String(elapsed);
    const bounds = new Box3();
    for (const entity of buildingEntities()) bounds.union(layer.bounds(entity.selectionKey)!);
    const center = bounds.getCenter(new Vector3()), size = bounds.getSize(new Vector3());
    const floor = Math.min(...buildingEntities().map(entity => entity.transform!.y));
    ground.position.set(center.x, floor - .08, center.z);
    if (fitCamera) {
        const distance = Math.max(size.x, size.z, 10) * 1.65;
        controls.target.copy(center);
        camera.position.copy(center).add(new Vector3(distance, distance * .7, distance));
        controls.update();
    }
    for (const transition of layer.inspectConstruction()) {
        const entity = buildingEntities().find(entity => entity.selectionKey === transition.key)!;
        const box = new Box3();
        for (const point of transition.envelope.footprint)
            for (const y of [transition.envelope.baseHeight, transition.envelope.ridgeHeight])
                box.expandByPoint(new Vector3(point.x, y, point.z));
        const helper = new Box3Helper(box, new Color('#edcf79'));
        const pivot = new Group(); pivot.position.set(entity.transform!.x, entity.transform!.y, entity.transform!.z);
        pivot.rotation.y = entity.transform!.rotation; pivot.add(helper); envelopeHelpers.add(pivot);
    }
    renderer.domElement.dataset.canonicalUnchanged = String(canonicalProof === serializeState(state));
    busy = false;
}

select.addEventListener('change', async () => { playing = false; pause.textContent = 'Play'; await prepare(1.2, true); });
document.querySelector('#replay')!.addEventListener('click', async () => {
    await prepare(0); playing = true; pause.textContent = 'Pause';
});
pause.addEventListener('click', () => { playing = !playing; pause.textContent = playing ? 'Pause' : 'Play'; });
slider.addEventListener('input', async () => {
    playing = false; pause.textContent = 'Play'; await prepare(Number(slider.value));
});
const resize = () => {
    renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
};
addEventListener('resize', resize); resize();
await prepare(1.2, true);
let previous = performance.now();
renderer.setAnimationLoop(now => {
    const delta = Math.min(.1, Math.max(0, (now - previous) / 1000)); previous = now;
    if (playing && !busy) {
        layer.updateConstruction(delta); elapsed = Math.min(3.3, elapsed + delta); slider.value = String(elapsed);
        if (elapsed >= 3.3) { playing = false; pause.textContent = 'Play'; }
    }
    envelopeHelpers.visible = debug.checked;
    controls.update(); renderer.render(scene, camera);
    const construction = layer.inspectConstruction();
    renderer.domElement.dataset.construction = JSON.stringify(construction);
    status.textContent = `${elapsed.toFixed(2)}s · ${construction.length ? construction.map(item =>
        `${item.preset} · ${item.phase} · eave ${item.envelope.eaveHeight.toFixed(1)}m · ridge ${item.envelope.ridgeHeight.toFixed(1)}m · ${item.pieces} pieces / ${item.drawCalls} draws`).join(' | ') : 'Complete · scaffold released'} · ${renderer.info.render.calls} scene draws`;
});
