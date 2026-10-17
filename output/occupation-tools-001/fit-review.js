import * as THREE from 'three';
import { MeshyHumanFactory } from '/src/characters/MeshyHuman.ts';
import { defaultDNA } from '/src/characters/CharacterDNA.ts';
import { defaultCharacterPresentation } from '/src/characters/CharacterPresentation.ts';
import { fjordClothingSets } from '/src/fjord-play/FjordWardrobe.ts';
const scene = new THREE.Scene();
scene.background = new THREE.Color('#dce1d6');
scene.add(new THREE.HemisphereLight(0xffffff, 0x665746, 2));
const light = new THREE.DirectionalLight(0xffffff, 2.5);
light.position.set(2, 3, 4);
scene.add(light);
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(1100, 1000);
document.body.append(renderer.domElement);
const camera = new THREE.OrthographicCamera(-1.32, 1.32, 1.2, -1.2, .01, 20);
const grid = new THREE.GridHelper(6, 30, 0x969c92, 0xbfc8b8);
scene.add(grid);
const factory = new MeshyHumanFactory(), humans = new Map();
for (const occupation of ['farmer', 'fisher', 'hunter', 'smith']) {
    const clothes = fjordClothingSets[occupation === 'fisher' ? 'fisherman' : occupation === 'farmer' ? 'farmerMale' : 'generic'];
    const human = await factory.create({ ...defaultDNA(), age: 32 }, 0, undefined, { ...clothes, hair: 'none', headwear: 'headwear/occupation-' + occupation, equipment: 'equipment/occupation-' + occupation });
    human.root.visible = false;
    scene.add(human.root);
    humans.set(occupation, human);
}
window.toolSet = async (occupation = 'farmer', view = 'front', clip = 'Idle_02', time = .6, hair = 'none', clothed = true) => {
    for (const human of humans.values())
        human.root.visible = false;
    const human = humans.get(occupation), clothes = clothed ? fjordClothingSets[occupation === 'fisher' ? 'fisherman' : occupation === 'farmer' ? 'farmerMale' : 'generic'] : { ...defaultCharacterPresentation, hair: 'none', beard: 'none', outfit: 'none' };
    if (human.root.userData.presentation.hair !== hair || (human.root.userData.toolReviewClothed ?? true) !== clothed)
        await factory.equip(human, { ...clothes, hair, headwear: 'headwear/occupation-' + occupation, equipment: 'equipment/occupation-' + occupation });
    human.root.userData.toolReviewClothed = clothed;
    human.root.visible = true;
    human.root.rotation.y = 0;
    if (clip === 'neutral')
        human.sampleNativeNeutral();
    else
        human.sampleAnimation(clip, time);
    scene.updateMatrixWorld(true);
    const target = new THREE.Vector3(0, .92, 0), direction = new THREE.Vector3(0, 0, 1);
    let half = 1.2;
    grid.visible = true;
    if (view.startsWith('grip')) {
        const joint = human.fit.nativeSkeleton.bones[occupation === 'hunter' ? 11 : 24];
        const indices = occupation === 'hunter' ? [14, 18] : [27, 31];
        target.copy(human.fit.nativeSkeleton.bones[indices[0]].getWorldPosition(new THREE.Vector3()))
            .add(human.fit.nativeSkeleton.bones[indices[1]].getWorldPosition(new THREE.Vector3())).multiplyScalar(.5);
        half = .18;
        grid.visible = false;
    }
    if (view === 'back')
        direction.z = -1;
    if (view === 'side' || view === 'grip-side')
        direction.set(occupation === 'hunter' ? 1 : -1, 0, .2).normalize();
    if (view === 'grip-back')
        direction.set(0, 0, -1);
    if (!view.startsWith('grip')) {
        const bounds = new THREE.Box3().setFromObject(human.root, true), size = bounds.getSize(new THREE.Vector3());
        target.copy(bounds.getCenter(new THREE.Vector3()));
        half = Math.max(1.0, size.y * .55, size.x / 2.2 + .10);
    }
    camera.left = -half * 1.1;
    camera.right = half * 1.1;
    camera.top = half;
    camera.bottom = -half;
    camera.position.copy(target).addScaledVector(direction, 4);
    camera.lookAt(target);
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);
    const parts = [];
    human.fit.modules.get('equipment/occupation-' + occupation).traverse(mesh => {
        if (!mesh.isSkinnedMesh)
            return;
        const bounds = new THREE.Box3();
        for (let i = 0; i < mesh.geometry.attributes.position.count; i++)
            bounds.expandByPoint(mesh.getVertexPosition(i, new THREE.Vector3()).applyMatrix4(mesh.matrixWorld));
        parts.push({ name: mesh.name, min: bounds.min.toArray(), max: bounds.max.toArray() });
    });
    document.getElementById('lab').href = '/character-lab?tool=' + occupation + '&hat=' + occupation + (occupation === 'fisher' ? '&clothing=fisherman-009' : '');
    window.toolReport = parts;
    return parts;
};
window.toolHumans = humans;
window.toolRenderer = renderer;
async function update() {
    try {
        await window.toolSet(document.getElementById('occupation').value, document.getElementById('view').value, document.getElementById('clip').value, Number(document.getElementById('time').value), document.getElementById('hair').value, document.getElementById('clothing').checked);
        document.getElementById('status').textContent = 'Fitted hand grip · Idle / Walking / Running carry · work actions unchanged.';
    }
    catch (error) {
        document.getElementById('status').textContent = String(error);
        throw error;
    }
}
document.querySelectorAll('select,input').forEach(control => control.addEventListener('change', update));
await update();
window.toolsReady = true;
window.toolScene = scene;
window.toolCamera = camera;
