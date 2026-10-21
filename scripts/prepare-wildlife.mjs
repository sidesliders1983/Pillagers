import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTTextureWebP } from '@gltf-transform/extensions';
import { prune, dedup, resample, meshopt } from '@gltf-transform/functions';
import { MeshoptDecoder as Decoder, MeshoptEncoder } from 'meshoptimizer';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { AnimationMixer, Box3, Matrix3, Matrix4, Quaternion, Vector3 } from 'three';
import sharp from 'sharp';
import { repairReindeerHindLeg } from './characters/repair-reindeer-rig.mjs';
const sourceRoot = resolve(process.argv[2] ?? 'Assets/Characters/Wildlife');
const definitions = JSON.parse(await readFile(new URL('./characters/wildlife.sources.json', import.meta.url), 'utf8'));
const destination = 'public/wildlife';
const only = process.argv.find(arg => arg.startsWith('--only='))?.slice(7).split(',');
await mkdir(destination, { recursive: true });
await Promise.all([Decoder.ready, MeshoptEncoder.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': Decoder, 'meshopt.encoder': MeshoptEncoder });
globalThis.self = globalThis;
globalThis.createImageBitmap = async () => ({ width: 512, height: 512, close() { } });
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const parse = bytes => loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
function pose(gltf, time = 0) {
    if (gltf.animations.length) {
        const mixer = new AnimationMixer(gltf.scene);
        mixer.clipAction(gltf.animations[0]).play();
        mixer.setTime(time);
    }
    gltf.scene.updateMatrixWorld(true);
    return new Box3().setFromObject(gltf.scene, true);
}
const entries = only ? JSON.parse(await readFile(destination + '/manifest.json', 'utf8')).entries
    .filter(entry => !only.includes(entry.id)) : [];
for (const definition of definitions) {
    if (only && !only.includes(definition.id)) continue;
    const original = await readFile(resolve(sourceRoot, definition.file));
    const doc = await io.readBinary(original), root = doc.getRoot();
    const triangles = root.listMeshes().reduce((sum, m) => sum + m.listPrimitives().reduce((n, p) => n + (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3, 0), 0);
    const operations = ['Preserve supplied geometry, UVs, rig and source clip rotations', 'Normalize once to canonical metre scale in an authoring wrapper'];
    if (definition.repairRightHindLeg) {
        const gltf = await parse(original);
        const repair = repairReindeerHindLeg(doc, gltf);
        operations[0] = 'Preserve supplied geometry, UVs and unaffected rig/clip channels';
        operations.push(repair.operation);
        console.log(JSON.stringify({ id: definition.id, repair }));
    }
    if (root.listAnimations().length) {
        for (const animation of root.listAnimations()) {
            animation.setName('Walk');
            for (const channel of animation.listChannels()) {
                if (channel.getTargetNode()?.getName() !== 'Hips' || channel.getTargetPath() !== 'translation')
                    continue;
                const parent = channel.getTargetNode().getParentNode();
                const linear = new Matrix3().setFromMatrix4(new Matrix4().fromArray(parent.getWorldMatrix()));
                const inverse = linear.clone().invert(), output = channel.getSampler().getOutput();
                const array = new Float32Array(output.getArray()), start = new Vector3().fromArray(array);
                for (let i = 0; i < output.getCount(); i++) {
                    const value = new Vector3().fromArray(array, i * 3), delta = value.clone().sub(start).applyMatrix3(linear);
                    delta.y = 0;
                    value.sub(delta.applyMatrix3(inverse));
                    value.toArray(array, i * 3);
                }
                output.setArray(array);
            }
        }
        operations.push('Keep source walk loop; remove only horizontal Hips root motion');
    }
    if (definition.straightenTail) {
        const gltf = await parse(Buffer.from(await io.writeBinary(doc)));
        const [firstJoint, lastJoint] = Array.isArray(definition.straightenTail)
            ? definition.straightenTail : [26, 18];
        for (let index = firstJoint; index >= lastJoint; index--) {
            const name = 'Bone_' + String(index).padStart(3, '0');
            const bone = gltf.scene.getObjectByName(name);
            const tip = gltf.scene.getObjectByName('Bone_' + String(index - 1).padStart(3, '0'));
            assert.ok(bone && tip, 'Expected ' + definition.id + ' tail chain ' + name);
            gltf.scene.updateMatrixWorld(true);
            const current = tip.getWorldPosition(new Vector3()).sub(bone.getWorldPosition(new Vector3())).normalize();
            const turn = new Quaternion().setFromUnitVectors(current, new Vector3(0, 0, -1));
            const parent = bone.parent.getWorldQuaternion(new Quaternion());
            bone.quaternion.premultiply(parent.clone().invert().multiply(turn).multiply(parent));
            root.listNodes().find(node => node.getName() === name).setRotation(bone.quaternion.toArray());
        }
        operations.push('Straighten the supplied tail chain for neutral swimming; preserve skin weights');
    }
    if (definition.foldWings) {
        const gltf = await parse(Buffer.from(await io.writeBinary(doc)));
        for (const [name, tip, direction] of [
            ['Bone_022', 'Bone_020', [.06, .35, -.9]], ['Bone_027', 'Bone_025', [-.06, .35, -.9]],
            ['Bone_020', 'Bone_018', [.02, -.24, .7]], ['Bone_025', 'Bone_023', [-.02, -.24, .7]]
        ]) {
            const bone = gltf.scene.getObjectByName(name), end = gltf.scene.getObjectByName(tip);
            assert.ok(bone && end, 'Expected puffin wing chain ' + name);
            gltf.scene.updateMatrixWorld(true);
            const current = end.getWorldPosition(new Vector3()).sub(bone.getWorldPosition(new Vector3())).normalize();
            const turn = new Quaternion().setFromUnitVectors(current, new Vector3(...direction).normalize());
            const parent = bone.parent.getWorldQuaternion(new Quaternion());
            const local = parent.clone().invert().multiply(turn).multiply(parent);
            bone.quaternion.premultiply(local);
            root.listNodes().find(n => n.getName() === name).setRotation(bone.quaternion.toArray());
        }
        operations.push('Fold the supplied puffin wing chains for land and floating poses');
    }
    if (definition.pitch) {
        const scene = root.listScenes()[0], pivot = doc.createNode('Authored_bird_stance').setRotation(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), definition.pitch).toArray());
        for (const node of scene.listChildren().slice()) {
            scene.removeChild(node);
            pivot.addChild(node);
        }
        scene.addChild(pivot);
        operations.push('Rotate the source puffin body upright around its original rig');
    }
    for (const material of root.listMaterials()) {
        material.setNormalTexture(null).setOcclusionTexture(null).setMetallicRoughnessTexture(null)
            .setEmissiveTexture(null).setEmissiveFactor([0, 0, 0]).setMetallicFactor(0).setRoughnessFactor(1);
    }
    await doc.transform(prune());
    doc.createExtension(EXTTextureWebP).setRequired(true);
    for (const texture of root.listTextures()) {
        texture.setImage(await sharp(texture.getImage()).resize({ width: 512, height: 512, fit: 'inside', withoutEnlargement: true }).webp({ quality: 86, alphaQuality: 100 }).toBuffer()).setMimeType('image/webp');
    }
    operations.push('Resize albedo to 512px WebP and remove high-frequency surface maps');
    const before = await parse(Buffer.from(await io.writeBinary(doc))), bounds = pose(before);
    const sourceDimension = definition.sourceDimension ?? (definition.reference === 'wingspan'
        ? bounds.max.x - bounds.min.x : definition.reference === 'body-length'
            ? bounds.max.z - bounds.min.z : bounds.max.y - bounds.min.y);
    const scale = definition.metres / sourceDimension;
    assert.ok(Number.isFinite(scale) && scale > 0);
    const scene = root.listScenes()[0], wrapper = doc.createNode('Wildlife_metres_' + definition.id);
    const sourceNodes = scene.listChildren().slice();
    for (const node of sourceNodes) {
        scene.removeChild(node);
        wrapper.addChild(node);
    }
    wrapper.setScale([scale, scale, scale]);
    const originY = definition.reference === 'body-length' ? (bounds.max.y + bounds.min.y) * .5 : bounds.min.y;
    wrapper.setTranslation([-(bounds.max.x + bounds.min.x) * .5 * scale, -originY * scale, -(bounds.max.z + bounds.min.z) * .5 * scale]);
    scene.addChild(wrapper);
    await doc.transform(dedup(), resample({ tolerance: 1e-6 }), prune(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
    const bytes = Buffer.from(await io.writeBinary(doc)), gltf = await parse(bytes), finalBounds = pose(gltf);
    const file = definition.id + '.glb';
    await writeFile(destination + '/' + file, bytes);
    const entry = { id: definition.id, file, path: '/wildlife/' + file, source: 'Assets/Characters/Wildlife/' + definition.file, sourceSha256: hash(original), sha256: hash(bytes), sourceBytes: original.length, bytes: bytes.length, triangles,
        scaleReference: { kind: definition.reference, metres: definition.metres, sourceDimension, scale }, bounds: { min: finalBounds.min.toArray(), max: finalBounds.max.toArray() },
        joints: root.listSkins().reduce((n, s) => n + s.listJoints().length, 0), clips: gltf.animations.map(a => ({ name: a.name, duration: a.duration })), operations };
    entries.push(entry);
    console.log(JSON.stringify({ id: entry.id, bytes: entry.bytes, scale, size: finalBounds.getSize(new Vector3()).toArray(), clips: entry.clips }));
}
await writeFile(destination + '/manifest.json', JSON.stringify({ version: 1, entries }, null, 2) + '\n');
await writeFile('src/wildlife/WildlifeAssetManifest.ts', '/** Generated by scripts/prepare-wildlife.mjs. */\nexport const wildlifeAssetManifest = ' + JSON.stringify(entries, null, 4) + ' as const;\n');
