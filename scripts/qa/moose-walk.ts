import { Scene, Color, HemisphereLight, DirectionalLight, PerspectiveCamera, WebGLRenderer,
    GridHelper, AnimationMixer, Box3, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { animalRestRig, clearAnimalRest, poseAnimalRest } from '../../src/wildlife/AnimalRestMotion';

const scene = new Scene();
scene.background = new Color('#dce4df');
scene.add(new HemisphereLight('#ffffff', '#8a9681', 2.5));
const sun = new DirectionalLight('#fff4df', 2.5);
sun.position.set(4, 8, 5);
scene.add(sun, new GridHelper(20, 40, '#89988c', '#b9c6ba'));
const camera = new PerspectiveCamera(40, innerWidth / innerHeight, .01, 100);
const renderer = new WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
document.body.append(renderer.domElement);
const controls = new OrbitControls(camera, renderer.domElement);
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const ids = ['moose', 'lynx', 'bear', 'wolf', 'fox', 'reindeer', 'otter', 'seal'];
const species = ['moose', 'lynx', 'brown-bear', 'wolf', 'red-fox', 'reindeer', 'otter', 'seal'];
const models = await Promise.all(ids.map(id => loader.loadAsync('/wildlife/' + id + '.glb')));
const select = document.getElementById('animal') as HTMLSelectElement;
const timeline = document.getElementById('time') as HTMLInputElement;
const status = document.getElementById('status')!;
let selected = models[0];
let mixer = new AnimationMixer(selected.scene);
let motion = 'Walk';
let running = true;
let time = 0;
let rest = animalRestRig(selected.scene, selected.scene, species[0]);
function choose() {
    if (rest) clearAnimalRest(rest);
    mixer.stopAllAction();
    mixer.uncacheRoot(selected.scene);
    scene.remove(selected.scene);
    const index = ids.indexOf(select.value);
    selected = models[index];
    scene.add(selected.scene);
    mixer = new AnimationMixer(selected.scene);
    rest = animalRestRig(selected.scene, selected.scene, species[index]);
    mixer.clipAction(selected.animations.find(clip => clip.name === motion) ?? selected.animations[0]).play();
    mixer.setTime(time);
    const bounds = new Box3().setFromObject(selected.scene, true);
    const size = bounds.getSize(new Vector3());
    const radius = Math.max(size.x, size.y, size.z);
    controls.target.set(0, size.y * .65, 0);
    camera.position.set(radius * 2.1, size.y * 1.3, radius * 1.3);
    controls.update();
    status.textContent = select.value + ' · ' + motion + ' · actual published GLB · drag to orbit';
}
select.onchange = choose;
document.getElementById('walk')!.onclick = () => {
    motion = 'Walk';
    choose();
};
document.getElementById('idle')!.onclick = () => {
    motion = 'Idle';
    choose();
};
document.getElementById('pause')!.onclick = () => { running = !running; };
timeline.oninput = () => {
    running = false;
    time = Number(timeline.value);
};
choose();
let last = performance.now();
renderer.setAnimationLoop(() => {
    const now = performance.now();
    const delta = Math.min(.1, (now - last) / 1000);
    last = now;
    if (running) time += delta;
    if (rest) clearAnimalRest(rest);
    mixer.setTime(motion === 'Idle' ? 0 : time);
    if (rest && motion === 'Idle') poseAnimalRest(rest, time, 0);
    timeline.value = String(time % 1);
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
    controls.dispose();
    mixer.stopAllAction();
    mixer.uncacheRoot(selected.scene);
    renderer.dispose();
};
