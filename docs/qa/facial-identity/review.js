import * as THREE from 'three';
import { MeshyHumanFactory } from '/src/characters/MeshyHuman.ts';
import { FjordWardrobe } from '/src/fjord-play/FjordWardrobe.ts';
import { closestSurface, anchorPoint } from '/src/characters/MeshyBodyFitAdapter.ts';

const canvas = document.querySelector('#studio');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setSize(512, 512, false);
renderer.setPixelRatio(1);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1;
const scene = new THREE.Scene();
scene.background = new THREE.Color('#243e45');
scene.add(new THREE.HemisphereLight(0xe1edff, 0x5c5547, 2.2));
const key = new THREE.DirectionalLight(0xffe3bd, 3);
key.position.set(2, 4, 4);
scene.add(key);
const rim = new THREE.DirectionalLight(0xa8d8f0, 2);
rim.position.set(-3, 2, -2);
scene.add(rim);
const camera = new THREE.PerspectiveCamera(30, 1, .01, 30);
const factory = new MeshyHumanFactory();
const diagnostics = [];
const wardrobe = new FjordWardrobe(factory, message => diagnostics.push(message));
const controls = Object.fromEntries(['resident', 'view', 'age', 'lod', 'appearance', 'animation', 'extreme']
    .map(id => [id, document.getElementById(id)]));
const status = document.querySelector('#status');
const family = await (await fetch('./family.json')).json();
let busy = false, renders = 0;
const cache = new Map();
const rows = family.rows;
for (const row of rows) controls.resident.add(new Option(`${row.name} · ${row.age} Winters`, row.id));

function options() {
    return Object.fromEntries(Object.entries(controls).map(([key, control]) => [key, control.value]));
}
async function portrait(row, selected, withFace = true) {
    const signature = JSON.stringify([row, selected, withFace]);
    if (cache.has(signature)) {
        const result = cache.get(signature);
        cache.delete(signature); cache.set(signature, result);
        return result;
    }
    const started = performance.now();
    const dna = { ...row.dna, age: selected.age === 'recorded' ? row.age : Number(selected.age) };
    const face = structuredClone(row.face);
    if (selected.extreme !== 'recorded') for (const axis of Object.keys(face.axes))
        face.axes[axis] = selected.extreme === 'plus' ? 1 : -1;
    const human = await factory.create(dna, Number(selected.lod), undefined, undefined,
        withFace ? face : undefined);
    try {
        if (selected.appearance !== 'bare') await wardrobe.reconcile(human, { kind: 'persona', id: row.id,
            dna, status: { occupation: selected.appearance === 'wardrobe' ? row.occupation : selected.appearance,
                sex: dna.sex, age: dna.age } });
        human.setAnimation(selected.animation);
        human.sample(.4);
        scene.add(human.root);
        human.root.updateMatrixWorld(true);
        human.fit.nativeSkeleton.update();
        const posed = human.fit.surface('posed');
        const landmark = point => anchorPoint(posed, closestSurface(human.fit.source,
            new THREE.Vector3(...point), ['HEAD'])).applyMatrix4(human.fit.mesh.matrixWorld);
        const chin = landmark([0, 1.45, .11]), forehead = landmark([0, 1.60, .12]);
        const left = landmark([-.045, 1.54, .12]), right = landmark([.045, 1.54, .12]);
        const across = right.sub(left).normalize(), up = forehead.clone().sub(chin).normalize();
        const forward = new THREE.Vector3().crossVectors(across, up).normalize();
        const target = chin.clone().lerp(forehead, .6);
        const size = new THREE.Box3().setFromObject(human.root, true).getSize(new THREE.Vector3());
        const distance = selected.view === 'world' ? 6 : .56 * Math.max(.75, size.y / 1.4);
        const angle = selected.view === 'profile' ? Math.PI / 2 : selected.view === 'quarter' ? Math.PI / 4 : 0;
        if (selected.view === 'world') target.y = size.y * .5;
        camera.position.copy(target).addScaledVector(forward, Math.cos(angle) * distance)
            .addScaledVector(across, Math.sin(angle) * distance).addScaledVector(up, distance * .03);
        camera.lookAt(target);
        camera.updateProjectionMatrix();
        renderer.render(scene, camera);
        renders++;
        const result = { image: canvas.toDataURL('image/png'), evidence: { id: row.id, name: row.name,
            age: dna.age, withFace, selected, triangles: renderer.info.render.triangles,
            calls: renderer.info.render.calls, geometries: renderer.info.memory.geometries,
            textures: renderer.info.memory.textures, renderMsIncludingPreparation: performance.now() - started,
            facialIdentity: human.root.userData.facialIdentity ?? null,
            facialPresentation: human.root.userData.facialPresentation ?? null,
            fit: human.modules.snapshot(),
            corrective: [] } };
        human.root.traverse(node => {
            if (node.userData.facialCorrective) result.evidence.corrective.push(node.userData.facialCorrective);
        });
        cache.set(signature, result);
        while (cache.size > 48) cache.delete(cache.keys().next().value);
        return result;
    } finally { human.root.removeFromParent(); human.dispose(); }
}
async function run(task) {
    if (busy) return;
    busy = true;
    for (const control of document.querySelectorAll('button,select')) control.disabled = true;
    document.body.dataset.ready = 'false';
    status.textContent = 'Preparing the actual native resident and fitted modules…';
    try {
        await task();
        document.body.dataset.ready = 'true';
        status.textContent = `Rendered on demand · ${renders} render calls made by this studio · ${cache.size} / 48 cached images. No animation loop.`;
    } catch (error) { status.textContent = error.message; diagnostics.push(String(error)); }
    finally {
        busy = false;
        for (const control of document.querySelectorAll('button,select')) control.disabled = false;
    }
}
document.querySelector('#render').onclick = () => run(async () => {
    const row = rows.find(row => row.id === controls.resident.value), selected = options();
    const before = await portrait(row, selected, false), after = await portrait(row, selected);
    document.querySelector('#before').src = before.image;
    document.querySelector('#after').src = after.image;
    document.querySelector('#after').dataset.evidence = JSON.stringify(after.evidence);
    document.querySelector('#diagnostics').textContent = JSON.stringify({ before: before.evidence,
        after: after.evidence, diagnostics }, null, 2);
    document.querySelector('#family-facts').textContent = `${row.name} · recorded age ${row.age} · ` +
        (row.parentIds.length ? `Parents: ${row.parentNames.join(' and ')}.` : 'Original founder.') +
        (row.deceased ? ' Recorded deceased identity.' : ' Recorded living resident.') +
        (selected.age === 'recorded' ? '' : ` Visual age study: ${selected.age}; inherited identity unchanged.`);
});
document.querySelector('#render-family').onclick = () => run(async () => {
    document.querySelector('#gallery').replaceChildren();
    for (const row of rows) {
        const article = document.createElement('article');
        const title = document.createElement('h3'); title.textContent = row.name;
        const caption = document.createElement('small');
        caption.textContent = `${row.age} Winters · ${row.parentIds.length ? 'Recorded descendant' : 'Original founder'} · ${row.dna.sex}`;
        const images = document.createElement('div'); images.className = 'angles';
        article.append(title, caption, images); document.querySelector('#gallery').append(article);
        for (const view of ['front', 'quarter', 'profile']) {
            const result = await portrait(row, { ...options(), resident: row.id, view });
            const image = document.createElement('img'); image.src = result.image;
            image.alt = row.name + ' · ' + view; image.dataset.evidence = JSON.stringify(result.evidence);
            images.append(image);
        }
    }
});
document.querySelector('#render').click();
window.addEventListener('pagehide', () => { cache.clear(); renderer.dispose(); }, { once: true });
