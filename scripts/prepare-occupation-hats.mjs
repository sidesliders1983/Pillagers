import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { NodeIO } from '@gltf-transform/core';
import { prune } from '@gltf-transform/functions';
import sharp from 'sharp';
import { Group, Matrix3, Matrix4, Vector3, Ray, Box3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { loadTypeScript } from './load-typescript.mjs';
const { MeshyBodyFitAdapter } = loadTypeScript(new URL('../src/characters/MeshyBodyFitAdapter.ts', import.meta.url));
const { meshyHumanAssetIdentity } = loadTypeScript(new URL('../src/characters/MeshyHumanAssetIdentity.ts', import.meta.url));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const root = 'output/occupation-hats-001';
const sources = JSON.parse(await readFile(new URL('./characters/occupation-hats.sources.json', import.meta.url), 'utf8'));
globalThis.self = globalThis;
globalThis.createImageBitmap = async () => ({ width: 2048, height: 2048, close() { } });
const bytes = await readFile('public' + meshyHumanAssetIdentity[0].path);
assert.equal(hash(bytes), meshyHumanAssetIdentity[0].sha256);
const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
let body;
gltf.scene.traverse(node => { if (node.isSkinnedMesh)
    body = node; });
const bodyRoot = new Group();
bodyRoot.add(gltf.scene);
const fit = new MeshyBodyFitAdapter(body, bodyRoot, gltf.scene, 0);
const headFrame = new Matrix4(), inverseHead = headFrame.clone().invert();
const head = [];
for (let i = 0; i < fit.source.positions.length; i += 3) {
    if (fit.source.regions[i / 3] !== 'HEAD')
        continue;
    head.push(new Vector3().fromArray(fit.source.positions, i).applyMatrix4(inverseHead));
}
const top = Math.max(...head.map(p => p.y));
const rimY = top - .045;
const band = head.filter(p => Math.abs(p.y - rimY) < .065);
const cx = (Math.min(...band.map(p => p.x)) + Math.max(...band.map(p => p.x))) / 2;
const cz = (Math.min(...band.map(p => p.z)) + Math.max(...band.map(p => p.z))) / 2;
const rx = Math.max(...band.map(p => Math.abs(p.x - cx))) + .003;
const rz = Math.max(...band.map(p => Math.abs(p.z - cz))) + .003;
const frame = headFrame.clone().multiply(new Matrix4().makeTranslation(cx, rimY, cz));
console.log('Native cap seat', JSON.stringify({ top, rimY, cx, cz, rx, rz }));
const directory = '/character-lab/modules/occupation-hats';
await mkdir('public' + directory, { recursive: true });
const io = new NodeIO();
const template = JSON.parse(await readFile('public/character-lab/candidates/meshy-fisherman-009/shoe.binding.json', 'utf8'));
const records = [], measurements = {}, report = [];
for (const record of sources) {
    const sourceBytes = await readFile(record.path);
    assert.equal(hash(sourceBytes), record.sha256);
    const doc = await io.readBinary(sourceBytes);
    assert.equal(doc.getRoot().listSkins().length, 0);
    assert.equal(doc.getRoot().listAnimations().length, 0);
    const textures = new Set();
    for (const mat of doc.getRoot().listMaterials()) {
        if (mat.getBaseColorTexture())
            textures.add(mat.getBaseColorTexture());
        mat.setNormalTexture(null).setOcclusionTexture(null).setMetallicRoughnessTexture(null).setEmissiveTexture(null)
            .setMetallicFactor(0).setRoughnessFactor(.95).setDoubleSided(true);
    }
    for (const tex of textures)
        tex.setImage(await sharp(tex.getImage()).resize(1024, 1024, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 90 }).toBuffer()).setMimeType('image/jpeg');
    const nodes = doc.getRoot().listNodes().filter(n => n.getMesh()), triangles = [];
    let maximumY = -Infinity;
    for (const node of nodes) {
        const world = new Matrix4().fromArray(node.getWorldMatrix());
        for (const primitive of node.getMesh().listPrimitives()) {
            const p = primitive.getAttribute('POSITION'), idx = primitive.getIndices();
            for (let i = 0; i < idx.getCount(); i += 3) {
                const tri = [0, 1, 2].map(c => new Vector3().fromArray(p.getElement(idx.getScalar(i + c), [])).applyMatrix4(world));
                maximumY = Math.max(maximumY, ...tri.map(v => v.y));
                triangles.push(tri);
            }
        }
    }
    // Ray intersections from the opening centre find the cavity wall, not the exterior brim.
    const rim = { farmer: .045, fisher: .040, hunter: .025, smith: .040 }[record.occupation];
    function radii(y) {
        const cardinal = [new Vector3(1, 0, 0), new Vector3(-1, 0, 0), new Vector3(0, 0, 1), new Vector3(0, 0, -1)].map(dir => {
            const origin = new Vector3(0, y, 0), ray = new Ray(origin, dir);
            const hits = triangles.map(tri => ray.intersectTriangle(...tri, false, new Vector3())).filter(Boolean).map(p => p.distanceTo(origin)).filter(d => d > .001);
            if (!hits.length)
                return .001;
            return Math.max(...hits);
        });
        return [Math.min(cardinal[0], cardinal[1]), Math.min(cardinal[2], cardinal[3])];
    }
    const sourceRadii = radii(rim);
    let sx = rx / sourceRadii[0], sz = rz / sourceRadii[1], sy = Math.sqrt(sx * sz);
    // Keep the measured skull inside the original cavity without moving the rim off a bald head.
    const above = head.filter(p => p.y >= rimY);
    const rawProfile = Array.from({ length: 41 }, (_, i) => { const y = rim + (maximumY - rim) * i / 40; return [y - rim, ...radii(Math.min(y, maximumY - .0001))]; });
    function profileRadius(y, axis) {
        const amount = Math.max(0, Math.min(39.999, y / (maximumY - rim) * 40)), i = Math.floor(amount), t = amount - i;
        return rawProfile[i][axis] * (1 - t) + rawProfile[i + 1][axis] * t;
    }
    let best;
    for (let iy = 0; iy <= 60; iy++) {
        const heightScale = sy * (1 + iy * .025);
        let radial = 1;
        for (const p of above) {
            const y = (p.y - rimY + .002) / heightScale;
            if (y > maximumY - rim) {
                radial = Infinity;
                break;
            }
            radial = Math.max(radial, Math.hypot((Math.abs(p.x - cx) + .002) / (profileRadius(y, 1) * sx), (Math.abs(p.z - cz) + .002) / (profileRadius(y, 2) * sz)));
        }
        const cost = radial + .35 * (heightScale / sy - 1);
        if (radial <= 1.30 && (!best || cost < best.cost))
            best = { radial, heightScale, cost };
    }
    assert.ok(best, 'No direct native head seat for ' + record.occupation);
    sx *= best.radial;
    sz *= best.radial;
    sy = best.heightScale;
    const hatFrame = frame.clone();
    if (record.occupation === 'fisher') {
        // Owner-requested wider hat and five-centimetre lower seat.
        sx *= 1.30;
        sz *= 1.30;
        sy *= 1.15;
        hatFrame.elements[13] -= .05;
        hatFrame.multiply(new Matrix4().makeRotationX(-Math.PI / 15));
    }
    if (record.occupation === 'smith') {
        // Close leather skullcap: the covered crown is tucked instead of widening the cap.
        sx *= .95;
        sz *= .95;
        sy *= .75;
        hatFrame.elements[13] -= .012;
    }
    const transform = hatFrame.clone().multiply(new Matrix4().makeScale(sx, sy, sz)).multiply(new Matrix4().makeTranslation(0, -rim, 0));
    const bounds = new Box3(), meshes = [];
    let primitiveIndex = 0;
    for (const node of nodes) {
        const world = new Matrix4().fromArray(node.getWorldMatrix());
        const matrix = transform.clone().multiply(world), normalMatrix = new Matrix3().getNormalMatrix(matrix);
        const mesh = node.getMesh();
        for (const primitive of mesh.listPrimitives()) {
            const positions = primitive.getAttribute('POSITION'), normals = primitive.getAttribute('NORMAL'), count = positions.getCount();
            assert.ok(normals && primitive.getAttribute('TEXCOORD_0'));
            for (let v = 0; v < count; v++) {
                const point = new Vector3().fromArray(positions.getElement(v, [])).applyMatrix4(matrix);
                positions.setElement(v, point.toArray());
                bounds.expandByPoint(point);
                normals.setElement(v, new Vector3().fromArray(normals.getElement(v, [])).applyNormalMatrix(normalMatrix).toArray());
            }
            const joints = new Uint16Array(count * 4), weights = new Float32Array(count * 4);
            for (let v = 0; v < count; v++) {
                joints[v * 4] = 5;
                weights[v * 4] = 1;
            }
            const buffer = positions.getBuffer();
            primitive.setAttribute('JOINTS_0', doc.createAccessor().setType('VEC4').setArray(joints).setBuffer(buffer))
                .setAttribute('WEIGHTS_0', doc.createAccessor().setType('VEC4').setArray(weights).setBuffer(buffer));
            // GLTFLoader names separate primitives with suffixes when a mesh has several materials.
            const name = 'Module_occupation_' + record.occupation + '_' + primitiveIndex++;
            const newMesh = doc.createMesh(name).addPrimitive(primitive);
            doc.getRoot().listScenes()[0].addChild(doc.createNode(name).setMesh(newMesh));
            meshes.push({ mesh: name, vertices: count });
        }
        node.dispose();
    }
    await doc.transform(prune());
    const output = await io.writeBinary(doc), path = directory + '/' + record.occupation + '.glb';
    const id = 'headwear/occupation-' + record.occupation;
    const underside = Array.from({ length: 8 }, (_, i) => {
        const y = rim * i / 8, measured = radii(y);
        return [(y - rim) * sy,
            (measured[0] > .01 ? measured[0] : sourceRadii[0]) * sx * .92,
            (measured[1] > .01 ? measured[1] : sourceRadii[1]) * sz * .92];
    });
    const profile = [...underside, ...rawProfile.map(row => [row[0] * sy, row[1] * sx * .92, row[2] * sz * .92])];
    const binding = { ...template, id, moduleSha256: hash(output), construction: 'intentional-asymmetry', skinning: 'rigid-native-head',
        recipe: { id: 'occupation-hat-native-head', version: 1, blender: 'not-required' },
        reviewScope: 'Supplied occupation cap; direct native head seat with bounded upper-hair clearance',
        materialPolicy: { kind: 'provider-original', provider: 'Meshy', sourceSha256: record.sha256, reviewOnly: true },
        headwearFit: { version: 1, headJoint: 5, frame: hatFrame.elements, profile, clearance: .003, maximumLift: .012, maximumRadialScale: record.occupation === 'smith' ? 1.04 : 1.12 },
        precomputedNative: { version: 3, coordinateFrame: 'metre', meshes, bodyBindings: template.precomputedNative.bodyBindings, moduleCoverage: [] },
    };
    const bindingBytes = Buffer.from(JSON.stringify(binding, null, 2) + '\n');
    const entry = { id, label: { farmer: 'Farmer · felt cap', fisher: 'Fisher · brimmed cap', hunter: 'Hunter · fur cap', smith: 'Smith · leather cap' }[record.occupation],
        occupation: record.occupation, path, triangles: record.triangles, materials: doc.getRoot().listMaterials().length,
        bindingPath: path.replace('.glb', '.binding.json'), bindingSha256: hash(bindingBytes) };
    await writeFile('public' + path, output);
    await writeFile('public' + entry.bindingPath, bindingBytes);
    measurements[path] = { sha256: hash(output), triangles: record.triangles, materials: entry.materials, bytes: output.length, bounds: { min: bounds.min.toArray(), max: bounds.max.toArray() } };
    const proof = { source: record, output: measurements[path], bindingSha256: entry.bindingSha256, nativeFrame: hatFrame.elements,
        sourceRim: rim, sourceRadii, scale: [sx, sy, sz], skullClearance: .002, hairClearance: .002,
        operations: ['Preserve supplied triangle topology and UVs', 'Bake measured cap seat in the unchanged native Head frame',
            'Resize source albedo to 1024 pixels; remove high-frequency normal and PBR maps', 'Use source material colour independently from DNA hair colour',
            'Rigid native Head weights; no copied skeleton, body masking or animation-derived fit'] };
    await writeFile('public' + path.replace('.glb', '.provenance.json'), JSON.stringify(proof, null, 2) + '\n');
    records.push(entry);
    report.push(proof);
    console.log(record.occupation, JSON.stringify({ sourceRadii, scale: proof.scale, bytes: output.length, triangles: record.triangles }));
}
await writeFile('src/characters/OccupationHatMeasurements.ts', '/** Generated by scripts/prepare-occupation-hats.mjs. */\nimport type {AssetMeasurement} from \'./CharacterAssetMeasurements\';\n' +
    'export const occupationHatRecords = ' + JSON.stringify(records, null, 4) + ' as const;\n' +
    'export const occupationHatMeasurements: Record<string, AssetMeasurement> = ' + JSON.stringify(measurements, null, 4) + ';\n');
await writeFile(root + '/preparation.json', JSON.stringify(report, null, 2) + '\n');
