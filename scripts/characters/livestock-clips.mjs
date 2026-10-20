import assert from 'node:assert/strict';
import { AnimationMixer, Box3, Matrix3, Quaternion, Vector3 } from 'three';

const smooth = value => {
    const t = Math.max(0, Math.min(1, value));
    return t * t * (3 - 2 * t);
};
const axisX = new Vector3(1, 0, 0);
const axisY = new Vector3(0, 1, 0);
const axisZ = new Vector3(0, 0, 1);

/** Bake ordinary glTF channels on the supplied skin; no runtime procedural skeletal authority. */
export function authorLivestockClips(doc, gltf, definition, cattle = false) {
    const root = doc.getRoot();
    const nodes = new Map(root.listNodes().map(node => [node.getName(), node]));
    const bones = [];
    const meshes = [];
    gltf.scene.traverse(object => {
        if (object.isBone) bones.push(object);
        if (object.isSkinnedMesh) meshes.push(object);
    });
    assert.equal(meshes.length, 1, 'One supplied livestock skin is required');
    gltf.scene.updateMatrixWorld(true);
    const neutral = new Map(bones.map(bone => [bone.name, {
        position: bone.position.clone(), rotation: bone.quaternion.clone(), scale: bone.scale.clone(),
        worldRotation: bone.getWorldQuaternion(new Quaternion()),
    }]));
    const hips = bones.find(bone => bone.name === (definition.root ?? 'Hips'));
    const chest = bones.find(bone => bone.name === (definition.shoulder ?? 'chest'));
    const head = bones.find(bone => bone.name === (definition.head ?? 'head'));
    assert.ok(hips && chest && head, 'Mapped pelvis, chest and head are required');
    const mesh = meshes[0];
    const vertex = new Vector3();
    const surfacePoints = () => {
        gltf.scene.updateMatrixWorld(true);
        mesh.skeleton.update();
        return Array.from({ length: mesh.geometry.attributes.position.count }, (_, index) =>
            mesh.getVertexPosition(index, new Vector3()).applyMatrix4(mesh.matrixWorld));
    };
    const bindPoints = surfacePoints();
    const bounds = new Box3().setFromPoints(bindPoints);
    const size = bounds.getSize(new Vector3());
    const center = bounds.getCenter(new Vector3());
    const reset = () => {
        for (const bone of bones) {
            const pose = neutral.get(bone.name);
            bone.position.copy(pose.position);
            bone.quaternion.copy(pose.rotation);
            bone.scale.copy(pose.scale);
        }
    };
    const rotate = (bone, axis, radians) => {
        if (!bone) return;
        const localAxis = axis.clone().applyQuaternion(neutral.get(bone.name).worldRotation.clone().invert());
        bone.quaternion.multiply(new Quaternion().setFromAxisAngle(localAxis, radians));
    };
    const shift = (bone, offset) => {
        bone.parent.updateWorldMatrix(true, false);
        const inverse = new Matrix3().setFromMatrix4(bone.parent.matrixWorld).invert();
        bone.position.add(offset.clone().applyMatrix3(inverse));
    };
    const ground = () => {
        const points = surfacePoints();
        const minimum = points.reduce((value, point) => Math.min(value, point.y), Infinity);
        shift(hips, new Vector3(0, bounds.min.y - minimum, 0));
        return minimum;
    };
    const tail = bones.find(bone => bone.name === 'tailstart');
    const sourceWalk = gltf.animations[0];
    const sourceMixer = new AnimationMixer(gltf.scene);
    const sourceAction = sourceWalk ? sourceMixer.clipAction(sourceWalk).play() : undefined;
    const legs = cattle ? [] : ['backleg', 'frontleg', 'R_backleg', 'R_frontleg'].map((name, index) => {
        const chain = [name, name + '0', name + '1', name + '2'].map(id => bones.find(bone => bone.name === id));
        assert.ok(chain.every(Boolean), 'Four supplied leg chains are required');
        return { chain, phase: index * .25, contact: chain[3].getWorldPosition(new Vector3()),
            hoofRotation: chain[3].getWorldQuaternion(new Quaternion()) };
    });
    // Keep the source cycle duration and observe its actual lift ordering before repairing it.
    if (!cattle && sourceAction) {
        const peaks = legs.map(() => ({ height: -Infinity, phase: 0 }));
        for (let index = 0; index < 30; index++) {
            sourceMixer.setTime(sourceWalk.duration * index / 30);
            gltf.scene.updateMatrixWorld(true);
            legs.forEach((leg, legIndex) => {
                const height = leg.chain[3].getWorldPosition(new Vector3()).y;
                if (height > peaks[legIndex].height) peaks[legIndex] = { height, phase: index / 30 };
            });
        }
        legs.forEach((leg, index) => { leg.phase = peaks[index].phase - .825; });
        sourceMixer.stopAllAction();
        reset();
        gltf.scene.updateMatrixWorld(true);
    }
    const stride = size.z * .20;
    const plant = (leg, target) => {
        const end = leg.chain[3];
        for (let iteration = 0; iteration < 24; iteration++) {
            for (const joint of leg.chain.slice(0, 3).reverse()) {
                gltf.scene.updateMatrixWorld(true);
                const origin = joint.getWorldPosition(new Vector3());
                const current = end.getWorldPosition(new Vector3()).sub(origin);
                const desired = target.clone().sub(origin);
                if (current.lengthSq() < 1e-18 || desired.lengthSq() < 1e-18) continue;
                const change = new Quaternion().setFromUnitVectors(current.normalize(), desired.normalize());
                const world = joint.getWorldQuaternion(new Quaternion()).premultiply(change);
                const parent = joint.parent.getWorldQuaternion(new Quaternion()).invert();
                joint.quaternion.copy(parent.multiply(world));
            }
        }
        gltf.scene.updateMatrixWorld(true);
        end.quaternion.copy(end.parent.getWorldQuaternion(new Quaternion()).invert().multiply(leg.hoofRotation));
    };
    const metadata = {};
    const durations = cattle ? { Death: 2.4 } : {
        Idle: 6, Walk: sourceWalk?.duration ?? 1, Graze: 12, Rest: 10,
        HumanInteraction: 6, Death: 2.4,
    };
    if (!cattle) for (const animation of root.listAnimations()) animation.dispose();
    for (const [name, duration] of Object.entries(durations)) {
        const animation = doc.createAnimation(name);
        const count = Math.round(duration * 30) + 1;
        const times = doc.createAccessor(name + '_time').setType('SCALAR')
            .setArray(Float32Array.from({ length: count }, (_, index) => duration * index / (count - 1)))
            .setBuffer(root.listBuffers()[0]);
        const samples = new Map(bones.map(bone => [bone.name, { translation: [], rotation: [], scale: [] }]));
        let minimumY = Infinity;
        let maximumY = -Infinity;
        for (let index = 0; index < count; index++) {
            const t = duration * index / (count - 1);
            reset();
            if (name === 'Walk' && sourceAction) {
                // Source lift ordering with a planted stance. The imported crouch and splayed
                // limb rotations are replaced on this same skin, never by tilting the actor root.
                for (const leg of legs) {
                    const phase = ((t / duration - leg.phase) % 1 + 1) % 1;
                    const target = leg.contact.clone();
                    if (phase <= .65) target.z += stride * (.5 - phase / .65);
                    else {
                        const swing = (phase - .65) / .35;
                        target.z += stride * (-.5 + smooth(swing));
                        target.y += size.y * .065 * Math.sin(Math.PI * swing);
                    }
                    plant(leg, target);
                }
            } else if (name === 'Death') {
                const fall = smooth((t - .12) / 1.65);
                rotate(hips, axisZ, -Math.PI / 2 * fall);
                rotate(head, axisX, .16 * fall);
                shift(hips, new Vector3(size.x * .45 * fall, 0, 0));
                ground();
            } else {
                const phase = Math.PI * 2 * t / duration;
                rotate(chest, axisX, .008 * Math.sin(phase));
                rotate(tail, axisY, .055 * Math.sin(phase));
                if (name === 'Graze') {
                    const feeding = smooth(t / 2.5) * (1 - smooth((t - 9.5) / 2.5));
                    const bend = definition.species === 'pig' ? .55 : 1.05;
                    rotate(hips, axisX, .07 * feeding);
                    rotate(chest, axisX, (definition.species === 'pig' ? .25 : .55) * feeding);
                    rotate(head, axisX, (bend + .025 * Math.sin(t * Math.PI * 2)) * feeding);
                    rotate(head, axisY, .045 * Math.sin(phase * 2) * feeding);
                    for (const leg of legs) plant(leg, leg.contact);
                } else if (name === 'HumanInteraction') {
                    const attention = Math.sin(Math.PI * t / duration) ** 2;
                    rotate(head, axisX, (-.13 + .07 * Math.sin(phase * 3)) * attention);
                    rotate(head, axisY, .07 * Math.sin(phase) * attention);
                    for (const bone of bones.filter(bone => /earend$/.test(bone.name)))
                        rotate(bone, axisZ, .04 * Math.sin(phase));
                } else if (name === 'Rest') {
                    const down = smooth(t / 2) * (1 - smooth((t - 8) / 2));
                    shift(hips, new Vector3(0, -size.y * .38 * down, 0));
                    for (const leg of legs) {
                        const target = leg.contact.clone();
                        const front = leg.chain[0].name.includes('front');
                        target.z += size.z * (front ? -.12 : .06) * down;
                        plant(leg, target);
                    }
                    rotate(head, axisX, .10 * down);
                }
                ground();
            }
            gltf.scene.updateMatrixWorld(true);
            mesh.skeleton.update();
            for (let sample = 0; sample < mesh.geometry.attributes.position.count; sample += 17) {
                mesh.getVertexPosition(sample, vertex).applyMatrix4(mesh.matrixWorld);
                minimumY = Math.min(minimumY, vertex.y);
                maximumY = Math.max(maximumY, vertex.y);
            }
            for (const bone of bones) {
                const output = samples.get(bone.name);
                const previous = output.rotation.slice(-4);
                if (previous.length && bone.quaternion.dot(new Quaternion().fromArray(previous)) < 0)
                    bone.quaternion.set(-bone.quaternion.x, -bone.quaternion.y, -bone.quaternion.z, -bone.quaternion.w);
                output.translation.push(...bone.position.toArray());
                output.rotation.push(...bone.quaternion.toArray());
                output.scale.push(...bone.scale.toArray());
            }
        }
        for (const bone of bones) for (const path of ['translation', 'rotation', 'scale']) {
            const values = samples.get(bone.name)[path];
            // Ordinary activities loop exactly. Death deliberately keeps its final fallen pose.
            if (name !== 'Death') {
                const width = path === 'rotation' ? 4 : 3;
                values.splice(values.length - width, width, ...values.slice(0, width));
            }
            const output = doc.createAccessor(name + '_' + bone.name + '_' + path)
                .setType(path === 'rotation' ? 'VEC4' : 'VEC3').setArray(new Float32Array(values))
                .setBuffer(root.listBuffers()[0]);
            const sampler = doc.createAnimationSampler().setInput(times).setOutput(output).setInterpolation('LINEAR');
            animation.addSampler(sampler).addChannel(doc.createAnimationChannel()
                .setTargetNode(nodes.get(bone.name)).setTargetPath(path).setSampler(sampler));
        }
        metadata[name] = { duration, loop: name !== 'Death', surfaceMinY: minimumY, surfaceMaxY: maximumY };
    }
    sourceMixer.stopAllAction();
    reset();
    return { clips: metadata, sourceWalkDuration: sourceWalk?.duration,
        walkSpeedSourceUnits: stride / (.65 * (sourceWalk?.duration ?? 1)),
        bindBounds: { min: bounds.min.toArray(), max: bounds.max.toArray() },
        center: center.toArray() };
}
