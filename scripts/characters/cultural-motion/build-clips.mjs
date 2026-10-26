import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Document, NodeIO } from '@gltf-transform/core';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { AnimationMixer, Matrix4, Quaternion, Vector3 } from 'three';

function glbDocument(bytes) {
    return JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)));
}

function worldQuaternion(rows) {
    const matrix = new Matrix4().set(...rows.flat());
    const rotation = new Quaternion();
    matrix.decompose(new Vector3(), rotation, new Vector3());
    return rotation;
}

/** Reuse the executed native-frame retarget; no model, image or source clip is generated here. */
export async function buildClips({ manifest, nativeFile, texturelessFile, posesDirectory, outputFile }) {
    const original = glbDocument(readFileSync(nativeFile));
    const bytes = readFileSync(texturelessFile);
    const source = await new GLTFLoader().parseAsync(
        bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '',
    );
    const mixer = new AnimationMixer(source.scene);
    const idle = source.animations.find(clip => clip.name === 'Idle_02');
    if (!idle) throw new Error('The pinned native source is missing Idle_02.');
    mixer.clipAction(idle).play();

    const boneNames = original.skins[0].joints.map(index => original.nodes[index].name);
    const objects = new Map(boneNames.map(name => [
        name, source.scene.getObjectByName(name.replaceAll(':', '')),
    ]));
    if ([...objects.values()].some(object => !object)) {
        throw new Error('The pinned native hierarchy has a missing animation target.');
    }
    const restWorld = new Map();
    source.scene.updateMatrixWorld(true);
    for (const [name, object] of objects) {
        restWorld.set(name, object.getWorldQuaternion(new Quaternion()));
    }
    const conversion = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), Math.PI / 2);
    const inverseConversion = conversion.clone().invert();
    const parents = new Map();
    for (const [index, node] of original.nodes.entries()) {
        for (const child of node.children ?? []) parents.set(child, index);
    }
    const depth = index => parents.has(index) ? 1 + depth(parents.get(index)) : 0;
    const ordered = original.skins[0].joints.slice()
        .sort((first, second) => depth(first) - depth(second))
        .map(index => original.nodes[index].name);
    const upperNames = new Set(Object.keys(manifest.semanticMapping)
        .filter(name => !/(Hips|UpLeg|Leg|Foot|ToeBase)$/.test(name)));

    const document = new Document();
    const buffer = document.createBuffer('Cultural motion tracks');
    const scene = document.createScene('Native rig animation extension');
    const nodes = original.nodes.map(node => document.createNode(node.name)
        .setTranslation(node.translation ?? [0, 0, 0])
        .setRotation(node.rotation ?? [0, 0, 0, 1])
        .setScale(node.scale ?? [1, 1, 1]));
    for (const [index, node] of original.nodes.entries()) {
        for (const child of node.children ?? []) nodes[index].addChild(nodes[child]);
    }
    for (const index of original.scenes[original.scene ?? 0].nodes) scene.addChild(nodes[index]);

    let conservativeTrackBytes = 0;
    const results = [];
    for (const sourceClip of manifest.sources) {
        const poses = JSON.parse(readFileSync(
            join(posesDirectory, sourceClip.name + '-native-world-poses.json'), 'utf8',
        ));
        const animation = document.createAnimation(sourceClip.name);
        const times = Float32Array.from(poses.frames.map(frame => frame.time));
        const time = document.createAccessor(sourceClip.name + ' time')
            .setType('SCALAR').setArray(times).setBuffer(buffer);
        const tracks = new Map(boneNames.map(name => [name, {
            translation: [], rotation: [], scale: [],
        }]));
        mixer.setTime(0);
        source.scene.updateMatrixWorld(true);

        for (const frame of poses.frames) {
            mixer.setTime(frame.time);
            source.scene.updateMatrixWorld(true);
            for (const name of ordered) {
                if (!upperNames.has(name)) continue;
                const desired = inverseConversion.clone()
                    .multiply(worldQuaternion(frame.worldMatrices[name]))
                    .multiply(worldQuaternion(poses.nativeRestWorld[name]).invert())
                    .multiply(conversion)
                    .multiply(restWorld.get(name));
                const object = objects.get(name);
                const parent = object.parent.getWorldQuaternion(new Quaternion());
                object.quaternion.copy(parent.invert().multiply(desired)).normalize();
                object.updateWorldMatrix(false, true);
            }
            for (const [name, object] of objects) {
                const track = tracks.get(name);
                track.translation.push(...object.position.toArray());
                const rotation = object.quaternion.clone();
                if (track.rotation.length) {
                    const prior = new Quaternion().fromArray(track.rotation, track.rotation.length - 4);
                    if (prior.dot(rotation) < 0) {
                        rotation.set(-rotation.x, -rotation.y, -rotation.z, -rotation.w);
                    }
                }
                track.rotation.push(...rotation.toArray());
                track.scale.push(...object.scale.toArray());
            }
        }
        for (const [name, track] of tracks) {
            const target = nodes[original.nodes.findIndex(node => node.name === name)];
            for (const path of ['translation', 'rotation', 'scale']) {
                const values = Float32Array.from(track[path]);
                conservativeTrackBytes += times.byteLength + values.byteLength;
                const accessor = document.createAccessor(sourceClip.name + ' ' + name + ' ' + path)
                    .setType(path === 'rotation' ? 'VEC4' : 'VEC3')
                    .setArray(values).setBuffer(buffer);
                const sampler = document.createAnimationSampler()
                    .setInput(time).setOutput(accessor).setInterpolation('LINEAR');
                animation.addSampler(sampler);
                animation.addChannel(document.createAnimationChannel()
                    .setTargetNode(target).setTargetPath(path).setSampler(sampler));
            }
        }
        results.push({ name: sourceClip.name, frames: poses.frames.length,
            duration: poses.duration, channels: animation.listChannels().length });
    }
    const output = await new NodeIO().writeBinary(document);
    writeFileSync(outputFile, output);
    return { conservativeTrackBytes, clips: results, meshes: document.getRoot().listMeshes().length,
        images: document.getRoot().listTextures().length, skins: document.getRoot().listSkins().length };
}
