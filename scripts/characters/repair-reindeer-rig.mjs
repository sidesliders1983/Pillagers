import assert from 'node:assert/strict';
import { AnimationMixer, Matrix4, Quaternion, Vector3 } from 'three';

const leftNames = ['backleg', 'backleg0', 'backleg1', 'backleg2'];
const rightNames = leftNames.map(name => 'R_' + name);
const mirror = new Matrix4().makeScale(-1, 1, 1);

function components(matrix) {
    const position = new Vector3(), rotation = new Quaternion(), scale = new Vector3();
    matrix.decompose(position, rotation, scale);
    return { translation: position.toArray(), rotation: rotation.toArray(), scale: scale.toArray() };
}

/** Repair this source's crossed right hock, retaining geometry and the other 23 animated joints. */
export function repairReindeerHindLeg(doc, gltf) {
    const root = doc.getRoot(), skin = root.listSkins()[0];
    assert.equal(root.listSkins().length, 1, 'Expected one reindeer skin');
    const joints = skin.listJoints();
    const nodes = new Map(root.listNodes().map(node => [node.getName(), node]));
    const bones = new Map();
    gltf.scene.traverse(node => { if (node.isBone) bones.set(node.name, node); });
    assert.ok([...leftNames, ...rightNames, 'Hips'].every(name => nodes.has(name) && bones.has(name)));
    gltf.scene.updateMatrixWorld(true);
    const hipBind = bones.get('Hips').matrixWorld.clone();
    const hipReflection = hipBind.clone().invert().multiply(mirror).multiply(hipBind);
    const repairedWorlds = new Map(leftNames.map((name, index) => [rightNames[index],
        mirror.clone().multiply(bones.get(name).matrixWorld).multiply(mirror)]));
    assert.ok(bones.get('R_backleg1').getWorldPosition(new Vector3()).x > 0,
        'Expected the known crossed right hock; review this repair if the source changes');

    // Capture weights in the unchanged neutral surface before adjusting the bind matrices.
    let mesh;
    gltf.scene.traverse(node => { if (node.isSkinnedMesh) mesh = node; });
    const primitive = root.listMeshes()[0].listPrimitives()[0];
    assert.equal(root.listMeshes().length, 1);
    assert.equal(root.listMeshes()[0].listPrimitives().length, 1);
    const indices = primitive.getAttribute('JOINTS_0'), weights = primitive.getAttribute('WEIGHTS_0');
    assert.equal(indices.getCount(), mesh.geometry.attributes.position.count);
    const points = Array.from({ length: indices.getCount() }, (_, index) =>
        new Vector3().fromBufferAttribute(mesh.geometry.attributes.position, index).applyMatrix4(mesh.matrixWorld));
    const indexFor = name => joints.findIndex(joint => joint.getName() === name);
    const leftIndices = leftNames.map(indexFor), rightIndices = rightNames.map(indexFor);
    assert.ok([...leftIndices, ...rightIndices].every(index => index >= 0));
    const sourceWeights = points.map((_, vertex) => {
        const item = new Map();
        const ids = indices.getElement(vertex, []), values = weights.getElement(vertex, []);
        ids.forEach((id, slot) => {
            if (!values[slot]) return;
            // The misplaced right lower joints also captured vertices on the sound left foot.
            const right = rightIndices.indexOf(id);
            const corrected = right >= 0 ? leftIndices[right] : id;
            item.set(corrected, (item.get(corrected) ?? 0) + values[slot]);
        });
        return item;
    });
    const mirroredIndex = index => {
        const name = joints[index].getName();
        const counterpart = indexFor(name.startsWith('R_') ? name.slice(2) : 'R_' + name);
        return counterpart < 0 ? index : counterpart;
    };
    const leftVertices = points.map((point, index) => ({ point, index })).filter(item => item.point.x >= 0);
    let changedVertices = 0, maximumDonorDistance = 0;
    for (let vertex = 0; vertex < points.length; vertex++) {
        const point = points[vertex];
        let donor = vertex, donorDistance = 0;
        if (point.x < 0) {
            const reflected = point.clone();
            reflected.x *= -1;
            donorDistance = Infinity;
            for (const candidate of leftVertices) {
                const distance = candidate.point.distanceToSquared(reflected);
                if (distance < donorDistance) { donor = candidate.index; donorDistance = distance; }
            }
        }
        const donorWeights = sourceWeights[donor];
        const donorHind = leftIndices.reduce((sum, id) => sum + (donorWeights.get(id) ?? 0), 0);
        const currentHind = sourceWeights[vertex];
        if (donorHind < 1e-5 && !leftIndices.some(id => currentHind.has(id))) continue;
        const corrected = [...donorWeights].map(([id, value]) => [point.x < 0 ? mirroredIndex(id) : id, value]);
        corrected.sort((a, b) => b[1] - a[1]);
        const sum = corrected.slice(0, 4).reduce((total, item) => total + item[1], 0);
        assert.ok(sum > 0);
        const ids = [0, 0, 0, 0], values = [0, 0, 0, 0];
        corrected.slice(0, 4).forEach(([id, value], slot) => { ids[slot] = id; values[slot] = value / sum; });
        indices.setElement(vertex, ids);
        weights.setElement(vertex, values);
        changedVertices++;
        maximumDonorDistance = Math.max(maximumDonorDistance, Math.sqrt(donorDistance));
    }

    assert.ok(maximumDonorDistance < .00003, 'Mirrored donor surface is too far from this reindeer');
    const inverseBinds = skin.getInverseBindMatrices();
    for (const name of rightNames) {
        const node = nodes.get(name), world = repairedWorlds.get(name);
        const parentWorld = repairedWorlds.get(node.getParentNode().getName())
            ?? new Matrix4().fromArray(node.getParentNode().getWorldMatrix());
        const local = components(parentWorld.clone().invert().multiply(world));
        node.setTranslation(local.translation).setRotation(local.rotation).setScale(local.scale);
        const index = indexFor(name);
        const leftIndex = indexFor(name.slice(2));
        const leftInverse = new Matrix4().fromArray(inverseBinds.getElement(leftIndex, []));
        inverseBinds.setElement(index, mirror.clone().multiply(leftInverse).multiply(mirror).toArray());
    }

    // Mirror the good chain half a cycle later in the moving hip frame, preserving body motion.
    const clip = gltf.animations[0];
    assert.equal(gltf.animations.length, 1);
    const mixer = new AnimationMixer(gltf.scene);
    mixer.clipAction(clip).play();
    const frameCount = 31;
    const sampled = new Map(rightNames.map(name => [name, { translation: [], rotation: [], scale: [] }]));
    for (let frame = 0; frame < frameCount; frame++) {
        mixer.setTime(clip.duration * (frame / (frameCount - 1) + .5));
        gltf.scene.updateMatrixWorld(true);
        const hipInverse = bones.get('Hips').matrixWorld.clone().invert();
        const targets = leftNames.map(name => hipReflection.clone().multiply(hipInverse)
            .multiply(bones.get(name).matrixWorld).multiply(mirror));
        rightNames.forEach((name, index) => {
            const local = components(index === 0 ? targets[index]
                : targets[index - 1].clone().invert().multiply(targets[index]));
            const values = sampled.get(name);
            const previous = values.rotation.slice(-4);
            if (previous.length && previous.reduce((sum, value, axis) => sum + value * local.rotation[axis], 0) < 0)
                local.rotation = local.rotation.map(value => -value);
            for (const path of ['translation', 'rotation', 'scale']) values[path].push(...local[path]);
        });
    }
    mixer.stopAllAction();
    const times = doc.createAccessor('Repaired_hindleg_times').setType('SCALAR')
        .setArray(Float32Array.from({ length: frameCount }, (_, index) => clip.duration * index / (frameCount - 1)))
        .setBuffer(root.listBuffers()[0]);
    for (const channel of root.listAnimations()[0].listChannels()) {
        const values = sampled.get(channel.getTargetNode()?.getName());
        if (!values) continue;
        const path = channel.getTargetPath();
        const output = doc.createAccessor('Repaired_' + channel.getTargetNode().getName() + '_' + path)
            .setType(path === 'rotation' ? 'VEC4' : 'VEC3').setArray(new Float32Array(values[path]))
            .setBuffer(root.listBuffers()[0]);
        channel.getSampler().setInput(times).setOutput(output).setInterpolation('LINEAR');
    }
    return { changedVertices, maximumDonorDistance,
        operation: 'Repair crossed right hind chain, inverse binds and weights from mirrored left surface; mirror opposite-phase leg motion' };
}
