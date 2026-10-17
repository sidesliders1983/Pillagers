import * as THREE from 'three';
import { createSurfaceQuery } from '../characters/outfit-surface-binding.mjs';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { MeshyHumanFactory } from '/src/characters/MeshyHuman.ts';
import { defaultDNA } from '/src/characters/CharacterDNA.ts';
const scene = new THREE.Scene();
scene.background = new THREE.Color('#dce1d6');
scene.add(new THREE.HemisphereLight(0xffffff, 0x7c7363, 2));
const light = new THREE.DirectionalLight(0xfff5e4, 2.5);
light.position.set(3, 5, 4);
scene.add(light);
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(1024, 1024);
renderer.setPixelRatio(1);
document.body.append(renderer.domElement);
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, .01, 20);
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const params = new URLSearchParams(location.search);
const mode = params.get('mode') ?? 'native';
let model, root, baseEdges;
const pass = '/output/meshy-outfit-pipeline/pass-009/';
if (mode === 'native') {
    model = await new MeshyHumanFactory().create({ ...defaultDNA(), age: 32 }, 2, undefined, { hair: 'none', beard: 'none', outfit: 'none', equipment: 'none', top: 'garment/meshy-fisherman-tunic-009', trousers: 'garment/meshy-fisherman-trousers-009', shoes: 'garment/meshy-fisherman-shoe-009' });
    root = model.root;
    scene.add(root);
    model.sampleAnimation('NativeNeutral', 0);
}
else {
    root = new THREE.Group();
    scene.add(root);
    const paths = mode === 'raw-shoe' ? ['meshy/shoe/download/source.glb'] : mode === 'tunic-only' ? ['native-011/tunic-authoring.glb']
        : ['source/authoring-a20-002.glb', ...['tunic', 'trousers', 'shoe'].map(part => (params.get('revision') ?? 'native-011') + '/' + part + '-authoring.glb')];
    for (const path of paths) {
        const gltf = await loader.loadAsync(pass + path);
        root.add(gltf.scene);
    }
}
function draw(view = 'front') {
    camera.left = camera.bottom = -1;
    camera.right = camera.top = 1;
    const target = mode === 'raw-shoe' ? new THREE.Vector3(0, 0, 0) : new THREE.Vector3(0, .84, .03);
    const directions = { front: [0, 0, 4], back: [0, 0, -4], left: [4, 0, 0], right: [-4, 0, 0], oblique: [3, 0, 4], top: [0, 4, .0001] };
    camera.position.copy(target).add(new THREE.Vector3(...directions[view]));
    camera.lookAt(target);
    camera.updateProjectionMatrix();
    scene.updateMatrixWorld(true);
    renderer.render(scene, camera);
}
function meshes() {
    const result = [];
    root.traverse(mesh => {
        if (mesh.isSkinnedMesh && mesh.name.startsWith('Module_'))
            result.push(mesh);
    });
    return result;
}
function vertices(mesh) { return Array.from({ length: mesh.geometry.getAttribute('position').count }, (_, i) => mesh.getVertexPosition(i, new THREE.Vector3())); }
function audit() {
    const result = [];
    for (const mesh of meshes()) {
        const points = vertices(mesh), rest = baseEdges.get(mesh.name), index = mesh.geometry.index;
        let maximumRatio = 0, stretched = 0, maximumEdge = 0;
        const worst = [];
        for (let face = 0; face < index.count; face += 3)
            for (let edge = 0; edge < 3; edge++) {
                const a = index.getX(face + edge), b = index.getX(face + (edge + 1) % 3);
                const length = points[a].distanceTo(points[b]);
                const before = rest[a].distanceTo(rest[b]);
                const ratio = length / Math.max(.003, before);
                maximumRatio = Math.max(maximumRatio, ratio);
                maximumEdge = Math.max(maximumEdge, length);
                if (ratio > 4 && length > .05) {
                    stretched++;
                    worst.push({ ratio, length, a: rest[a].toArray(), b: rest[b].toArray(), joints: [a, b].map(v => Array.from({ length: 4 }, (_, i) => [mesh.geometry.getAttribute('skinIndex').getComponent(v, i), mesh.geometry.getAttribute('skinWeight').getComponent(v, i)])) });
                }
            }
        result.push({ mesh: mesh.name, maximumRatio, stretchedEdges: stretched, maximumEdge, vertices: points.length, worst: worst.sort((a, b) => b.ratio - a.ratio).slice(0, 3) });
    }
    return result;
}
if (model)
    baseEdges = new Map(meshes().map(mesh => [mesh.name, vertices(mesh)]));
let savedBody;
function showBare(enabled) {
    if (enabled && !savedBody) {
        const mesh = model.fit.mesh;
        savedBody = { geometry: mesh.geometry, material: mesh.material };
        mesh.geometry = model.fit.sourceGeometry;
        mesh.material = Array.isArray(mesh.material) ? mesh.material.map(material => material.clone())
            : mesh.material.clone();
        for (const group of model.fit.modules.values())
            group.visible = false;
    }
    else if (!enabled && savedBody) {
        const mesh = model.fit.mesh;
        for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material])
            material.dispose();
        mesh.geometry = savedBody.geometry;
        mesh.material = savedBody.material;
        savedBody = undefined;
        for (const group of model.fit.modules.values())
            group.visible = true;
    }
}
function lookAtNeck(view) {
    const target = model.fit.nativeSkeleton.bones[4].getWorldPosition(new THREE.Vector3());
    target.y -= .04;
    camera.left = camera.bottom = -.34;
    camera.right = camera.top = .34;
    const directions = { front: [0, 0, 4], back: [0, 0, -4], left: [4, 0, 0], top: [0, 4, .0001] };
    camera.position.copy(target).add(new THREE.Vector3(...directions[view]));
    camera.lookAt(target);
    camera.updateProjectionMatrix();
    scene.updateMatrixWorld(true);
    renderer.render(scene, camera);
}
function upperContactAudit() {
    const fit = model.fit;
    const body = fit.mesh;
    const saved = body.geometry;
    body.geometry = fit.sourceGeometry;
    const positions = [];
    for (let vertex = 0; vertex < fit.sourceGeometry.getAttribute('position').count; vertex++) {
        positions.push(...body.getVertexPosition(vertex, new THREE.Vector3())
            .applyMatrix4(body.matrixWorld).toArray());
    }
    body.geometry = saved;
    const indices = [];
    for (let face = 0; face < fit.source.indices.length; face += 3) {
        const corners = fit.source.indices.slice(face, face + 3);
        if (corners.every(vertex => fit.source.positions[vertex * 3 + 1] > 1.12
            && fit.source.positions[vertex * 3 + 1] < 1.49))
            indices.push(...corners);
    }
    const query = createSurfaceQuery({ positions, indices, triangles: indices.length / 3 });
    const groups = { collar: [], shoulders: [] };
    for (const mesh of meshes().filter(mesh => mesh.name.includes('tunic'))) {
        const positions = mesh.geometry.getAttribute('position');
        for (let vertex = 0; vertex < positions.count; vertex++) {
            const rest = new THREE.Vector3().fromBufferAttribute(positions, vertex).applyMatrix4(fit.encoding);
            if (rest.y < 1.30 || rest.y > 1.49 || Math.abs(rest.x) > .28)
                continue;
            const point = mesh.getVertexPosition(vertex, new THREE.Vector3()).applyMatrix4(mesh.matrixWorld);
            const contact = query.closest(point);
            const signedDistance = point.clone().sub(contact.point).dot(contact.normal);
            const inside = signedDistance < -.003;
            const region = Math.abs(rest.x) < .115 && rest.y > 1.34 ? 'collar' : 'shoulders';
            groups[region].push({ distance: contact.distance, inside, signedDistance, vertex, rest: rest.toArray() });
        }
    }
    return Object.fromEntries(Object.entries(groups).map(([region, samples]) => {
        const ordered = samples.map(sample => sample.distance).sort((a, b) => a - b);
        return [region, { vertices: samples.length, maximumMetres: ordered.at(-1),
                p95Metres: ordered[Math.floor(ordered.length * .95)],
                insideBeyond3mm: samples.filter(sample => sample.inside).length,
                deepest: samples.filter(sample => sample.inside)
                    .sort((a, b) => a.signedDistance - b.signedDistance).slice(0, 3) }];
    }));
}
window.fisherQA = { showBare, lookAtNeck, upperContactAudit,
    model, root, draw, audit,
    contactPixels() {
        const contacts = [['neck', 4], ['left-wrist', 11], ['right-wrist', 24],
            ['left-ankle', 36], ['right-ankle', 41]];
        return contacts.map(([id, index]) => {
            const point = model.fit.nativeSkeleton.bones[index]
                .getWorldPosition(new THREE.Vector3()).project(camera);
            return { id, x: (point.x * .5 + .5) * 1024, y: (-point.y * .5 + .5) * 1024 };
        });
    },
    pose(clip, time = 0) {
        model.sampleAnimation(clip, time);
        root.updateMatrixWorld(true);
        draw();
    },
    meshInfo: () => meshes().map(mesh => ({ name: mesh.name, bones: mesh.skeleton.bones.length })),
};
draw();
window.fisherReady = true;
