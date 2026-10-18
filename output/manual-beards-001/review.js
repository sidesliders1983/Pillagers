import * as THREE from 'three';
import { MeshyHumanFactory } from '/src/characters/MeshyHuman.ts';
import { defaultDNA } from '/src/characters/CharacterDNA.ts';
import { defaultCharacterPresentation } from '/src/characters/CharacterPresentation.ts';
import { manualBeardAssets } from '/src/characters/ManualBeardCatalog.ts';
const scene = new THREE.Scene();
scene.background = new THREE.Color('#dce1d6');
scene.add(new THREE.HemisphereLight(0xffffff, 0x786654, 2));
const light = new THREE.DirectionalLight(0xffffff, 2.5);
light.position.set(2, 3, 4);
scene.add(light);
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(1500, 520);
document.getElementById('viewer').append(renderer.domElement);
const camera = new THREE.OrthographicCamera(-.9, .9, .312, -.312, .01, 20);
const factory = new MeshyHumanFactory();
const humans = [];
for (const [index, entry] of manualBeardAssets.entries()) {
    const human = await factory.create({ ...defaultDNA(), age: 32 }, 0, undefined, { ...defaultCharacterPresentation, hair: 'none', beard: entry.id, outfit: 'none' });
    human.root.position.x = (index - 1.5) * .44;
    scene.add(human.root);
    humans.push(human);
}
window.beardSet = async (view = 'front', clip = 'NativeNeutral', time = .6, colour = 'auto') => {
    const centre = new THREE.Vector3();
    for (const human of humans) {
        const hairColor = colour === 'auto' ? null : colour;
        if (human.root.userData.presentation.hairColor !== hairColor) {
            await factory.equip(human, { ...human.root.userData.presentation, hairColor });
        }
        human.root.rotation.y = view === 'side' ? Math.PI / 2 : view === 'three-quarter' ? Math.PI / 4 : 0;
        human.sampleAnimation(clip, clip === 'NativeNeutral' ? 0 : time);
        human.root.updateMatrixWorld(true);
        centre.add(human.fit.nativeSkeleton.bones[5].getWorldPosition(new THREE.Vector3()));
    }
    centre.divideScalar(humans.length).add(new THREE.Vector3(0, -.005, .03));
    camera.position.copy(centre).add(new THREE.Vector3(0, 0, 4));
    camera.lookAt(centre);
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);
};
async function update() {
    await window.beardSet(document.getElementById('view').value, document.getElementById('pose').value, .6, document.getElementById('colour').value);
    document.getElementById('status').textContent = 'Ready · source placement retained · shared native head rig.';
}
document.querySelectorAll('select').forEach(control => control.addEventListener('change', update));
window.beardHumans = humans;
window.beardRenderer = renderer;
await update();
window.beardsReady = true;
