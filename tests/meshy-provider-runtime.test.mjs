import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {load} from './load-source.mjs';

const require = createRequire(import.meta.url);
const {BufferGeometry, Float32BufferAttribute, Group, Mesh, MeshStandardMaterial, Texture, Vector3} = require('three');
const {GLTFLoader} = require('three/addons/loaders/GLTFLoader.js');
const {MeshoptDecoder} = require('three/addons/libs/meshopt_decoder.module.js');
const {MeshyHumanFactory, validateMeshyBodySource} = load('../src/characters/MeshyHuman.ts');
const {validateNativeModule} = load('../src/characters/MeshyModuleRuntime.ts');
const {anchorPoint} = load('../src/characters/MeshyBodyFitAdapter.ts');
const {characterAsset} = load('../src/characters/CharacterAssets.ts');
const {meshyModuleMeasurements} = load('../src/characters/MeshyModuleMeasurements.ts');
const {meshyHumanAssetIdentity} = load('../src/characters/MeshyHumanAssetIdentity.ts');
const {meshyRigSignature} = load('../src/characters/MeshyNativeRig.ts');
const {defaultDNA} = load('../src/characters/CharacterDNA.ts');
const {universalHumanProfile} = load('../src/characters/UniversalHumanProfile.ts');
globalThis.self = globalThis;
globalThis.createImageBitmap = async () => ({width: 2048, height: 2048, close() {}});
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const digest = value => createHash('sha256').update(value).digest('hex');
const arrayBuffer = value => value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
const manifest = Buffer.from(JSON.stringify({reviewOnly: true, fixture: 'source identity mechanics only'}));
const dna = {...defaultDNA(), age: 32, morphology: {height: 1.55, masculinity: .8}};
const bodyBytes = await readFile(new URL('../public' + meshyHumanAssetIdentity[2].path, import.meta.url));
const body = await loader.parseAsync(arrayBuffer(bodyBytes), '');
const descriptor = (sha256 = 'b'.repeat(64)) => ({
 id: 'body/meshy-human', rigSignature: meshyRigSignature, reviewOnly: true,
 lods: [0, 1, 2].map(lod => ({lod, path: '/review/body-' + lod + '.glb', sha256})),
 provenance: {path: '/review/body-manifest.json', sha256: digest(manifest)},
});
const factory = () => new MeshyHumanFactory(async () => body, async () => arrayBuffer(manifest),
 {bodySource: descriptor()});

/** Synthetic geometry verifies preservation/ownership only; it does not qualify garment fit. */
function providerFixture(t, fit) {
 const original = characterAsset('hair/meshy-short-angular');
 const path = '/technical/provider-materials.glb';
 const asset = {...structuredClone(original), id: 'garment/provider-runtime-fixture',
  type: 'garment', lods: {2: path}, reviewStatus: 'preview',
  compatibleBodies: [{id: fit.body.id, sha256: fit.body.sha256}],
  metadata: {...structuredClone(original.metadata), id: 'garment/provider-runtime-fixture', type: 'garment',
   slot: 'upper', anchor: 'socket_chest', fitMode: 'drape'}};
 meshyModuleMeasurements[path] = {...meshyModuleMeasurements[original.lods[2]]};
 t.after(() => {delete meshyModuleMeasurements[path];});
 const texture = new Texture();
 const material = new MeshStandardMaterial({color: 0x704329, map: texture, roughness: .47, metalness: .12});
 material.name = 'Provider leather';
 const secondMaterial = new MeshStandardMaterial({color: 0xb18d59, map: texture, transparent: true, opacity: .7});
 const scene = new Group();
 const anchors = [];
 const meshes = [];
 for (const [index, count] of [[0, 6], [1, 3]]) {
  const positions = [];
  for (let vertex = 0; vertex < count; vertex++) {
   const anchor = {triangle: 0, barycentric: [1, 0, 0], offset: [index * .02, vertex * .001, .003]};
   positions.push(...anchorPoint(fit.source, anchor).add(new Vector3(...anchor.offset)).toArray());
   anchors.push(anchor);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new Float32BufferAttribute(Array.from({length: count}, () => [0, 0, 1]).flat(), 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(Array.from({length: count}, (_, i) => [i / count, .5]).flat(), 2));
  geometry.setIndex(Array.from({length: count}, (_, i) => i));
  if (index === 0) {
   geometry.addGroup(0, 3, 0);
   geometry.addGroup(3, 3, 1);
  }
  const mesh = new Mesh(geometry, index === 0 ? [material, secondMaterial] : material);
  mesh.name = 'Module_top_' + index;
  scene.add(mesh);
  meshes.push(mesh);
 }
 const binding = {
  version: 'pillagers-fit/0.2', id: asset.id, moduleSha256: meshyModuleMeasurements[path].sha256,
  rigSignature: meshyRigSignature, recipe: {id: 'synthetic-provider-preservation', version: 1, blender: 'none'},
  coordinateFrame: {up: '+Y', front: '+Z', unit: 'metre', origin: 'Meshy source bind'},
  construction: 'intentional-asymmetry', skinning: 'surface-barycentric-native',
  materialPolicy: {kind: 'provider-original', provider: 'Meshy', sourceSha256: 'c'.repeat(64), reviewOnly: true},
  vertexRanges: [{mesh: meshes[0].name, start: 0, count: 6}, {mesh: meshes[1].name, start: 6, count: 3}],
  supportedAges: {min: 6, max: 90},
  lods: Object.fromEntries([0, 1, 2].map(lod => [lod, {
   bodySha256: fit.body.sha256, topology: fit.topologySignature, anchors,
   vertexAnchors: anchors.map((_, i) => i),
   weights: anchors.map(() => ({joints: [0, 0, 0, 0], weights: [1, 0, 0, 0]})),
   coverageTriangles: [],
  }])),
  regions: {provider: {contact: [], free: anchors.map((_, i) => i), boundary: []}},
  seams: [[0, 6]], garmentFrames: {},
 };
 return {source: {asset, source: {scene, animations: []}, binding}, texture, meshes, material, secondMaterial};
}

test('review descriptor requires all exact LOD identities and safe local provenance', () => {
 const input = descriptor();
 const frozen = validateMeshyBodySource(input);
 input.lods[0].sha256 = 'd'.repeat(64);
 assert.equal(frozen.lods[0].sha256, 'b'.repeat(64));
 assert.ok(Object.isFrozen(frozen.lods[0]));
 for (const mutate of [
  value => {value.reviewOnly = false;},
  value => {value.rigSignature = '0'.repeat(64);},
  value => {value.lods.pop();},
  value => {value.lods[1].lod = 0;},
  value => {value.lods[0].path = 'https://example.com/body.glb';},
  value => {value.lods[0].path = '/review/%2e%2e/body.glb';},
  value => {value.lods[0].path = '/review/%5cbody.glb';},
  value => {value.provenance.sha256 = 'stale';},
 ]) {
  const value = descriptor();
  mutate(value);
  assert.throws(() => validateMeshyBodySource(value), /body source descriptor/);
 }
 const filesystem = descriptor();
 filesystem.lods[0].path = '/@fs/C:/Workspace/body.glb';
 assert.equal(validateMeshyBodySource(filesystem).lods[0].path, filesystem.lods[0].path);
});

test('factory verifies review body and provenance bytes and never assigns production identity', async t => {
 const calls = [];
 const oldFetch = globalThis.fetch;
 globalThis.fetch = async url => {
  calls.push(url);
  return new Response(url.includes('manifest') ? manifest : bodyBytes);
 };
 t.after(() => {globalThis.fetch = oldFetch;});
 const source = descriptor(digest(bodyBytes));
 const actual = new MeshyHumanFactory(undefined, undefined, {bodySource: source});
 const model = await actual.create(dna, 2);
 t.after(() => model.dispose());
 assert.equal(model.fit.body.path, source.lods[2].path);
 assert.equal(model.fit.body.reviewOnly, true);
 assert.deepEqual(model.fit.body.provenance, source.provenance);
 assert.equal(model.root.userData.bodySource.sha256, digest(bodyBytes));
 assert.equal(calls.filter(url => url.includes('manifest')).length, 1);
 await assert.rejects(actual.createWorld(dna), /review-only body/);
 await assert.rejects(new MeshyHumanFactory(async () => body).equip(model, {}), /does not own/);
 const staleBody = new MeshyHumanFactory(undefined, undefined, {bodySource: descriptor()});
 await assert.rejects(staleBody.create(dna, 2), /asset bytes differ/);
 const staleManifest = descriptor(digest(bodyBytes));
 staleManifest.provenance.sha256 = 'e'.repeat(64);
 await assert.rejects(new MeshyHumanFactory(undefined, undefined, {bodySource: staleManifest}).create(dna, 2),
  /provenance bytes differ/);
});

test('provider review retains every mesh, material, texture, UV and triangle through refits and disposal', async t => {
 const model = await factory().create(dna, 2);
 t.after(() => model.dispose());
 const {source, texture, meshes, material} = providerFixture(t, model.fit);
 const originalPositions = meshes.map(mesh => Array.from(mesh.geometry.attributes.position.array));
 const originalUVs = meshes.map(mesh => Array.from(mesh.geometry.attributes.uv.array));
 const originalIndices = meshes.map(mesh => Array.from(mesh.geometry.index.array));
 const profile = universalHumanProfile(dna);
 let textureDisposals = 0;
 let sourceDisposals = 0;
 texture.addEventListener('dispose', () => textureDisposals++);
 material.addEventListener('dispose', () => sourceDisposals++);
 model.modules.install([source], profile);
 const parts = model.fit.modules.get(source.asset.id).children;
 assert.equal(parts.length, 2);
 assert.equal(parts[0].material[0], parts[1].material);
 assert.notEqual(parts[1].material, material);
 assert.equal(parts[1].material.map, texture);
 assert.equal(parts[1].material.roughness, .47);
 assert.equal(parts[1].material.color.getHex(), material.color.getHex());
 assert.equal(parts[0].material[1].transparent, true);
 assert.equal(parts[0].material[1].opacity, .7);
 assert.equal(parts[0].skeleton, model.fit.nativeSkeleton);
 assert.equal(parts[1].skeleton, model.fit.nativeSkeleton);
 const runs = model.modules.fitRuns;
 for (const clip of ['Idle', 'Walk', 'Run']) model.sampleAnimation(clip, .3);
 assert.equal(model.modules.fitRuns, runs, 'Animation must never perform geometry refits');
 model.applyDNA({...dna, age: 6});
 assert.equal(model.fit.modules.size, 1);
 for (const [index, part] of parts.entries()) {
  assert.deepEqual(Array.from(part.geometry.attributes.uv.array), originalUVs[index]);
  assert.deepEqual(Array.from(part.geometry.index.array), originalIndices[index]);
  assert.deepEqual(part.geometry.groups, meshes[index].geometry.groups);
  assert.equal(part.geometry.attributes.color, undefined, 'Runtime must not invent provider vertex colors');
  assert.equal(part.geometry.attributes.position.count, meshes[index].geometry.attributes.position.count);
  assert.deepEqual(Array.from(meshes[index].geometry.attributes.position.array), originalPositions[index]);
 }
 assert.equal(model.fit.mesh.geometry, model.fit.sourceGeometry);
 assert.deepEqual(model.modules.snapshot().bindings[0].meshes, source.binding.vertexRanges);
 let ownedDisposals = 0;
 parts[1].material.addEventListener('dispose', () => ownedDisposals++);
 model.modules.clear();
 assert.equal(ownedDisposals, 1, 'Shared owned material is disposed exactly once');
 assert.equal(sourceDisposals, 0);
 assert.equal(textureDisposals, 0, 'Cached provider textures remain alive for other instances');
});

test('provider policy is explicit, review-only, source-exact and covers every mesh', async t => {
 const model = await factory().create(dna, 2);
 const production = await new MeshyHumanFactory(async () => body).create(dna, 2);
 t.after(() => {model.dispose(); production.dispose();});
 const {source} = providerFixture(t, model.fit);
 validateNativeModule(source, model.fit);
 for (const [mutate, expected] of [
  [value => {delete value.binding.materialPolicy;}, /One mesh|mapless/],
  [value => {value.asset.reviewStatus = 'accepted';}, /explicit source-bound Lab review/],
  [value => {value.binding.materialPolicy.reviewOnly = false;}, /explicit source-bound Lab review/],
  [value => {value.binding.materialPolicy.sourceSha256 = 'bad';}, /explicit source-bound Lab review/],
  [value => {value.binding.vertexRanges.pop();}, /vertex ranges/],
  [value => {value.binding.vertexRanges[1].start = 5;}, /vertex ranges/],
  [value => {value.binding.lods[2].bodySha256 = '0'.repeat(64);}, /exact body/],
  [value => {value.binding.lods[2].coverageTriangles = [0];}, /preserve its topology/],
 ]) {
  const changed = {...source, asset: structuredClone(source.asset), binding: structuredClone(source.binding)};
  mutate(changed);
  assert.throws(() => validateNativeModule(changed, model.fit), expected);
 }
 const forProduction = {...source, binding: structuredClone(source.binding)};
 forProduction.binding.lods[2].bodySha256 = production.fit.body.sha256;
 assert.throws(() => validateNativeModule(forProduction, production.fit), /explicit source-bound Lab review/);
 source.source.scene.children[1].position.x = 1;
 assert.throws(() => validateNativeModule(source, model.fit), /transforms must be baked/);
});

test('native-neutral uses exact source bones, scale and texture; clip selection restores DNA behavior', async t => {
 const model = await factory().create(dna, 2);
 t.after(() => model.dispose());
 const {source} = providerFixture(t, model.fit);
 model.modules.install([source], universalHumanProfile(dna));
 model.sampleAnimation('NativeNeutral', 0);
 assert.deepEqual(model.animationState, {animation: 'NativeNeutral', time: 0});
 assert.equal(model.root.userData.nativeNeutralPose, true);
 assert.equal(model.root.userData.skinTint.strength, 0);
 assert.deepEqual(model.fit.bodyRoot.scale.toArray(), [1, 1, 1]);
 const sourceBones = new Map();
 body.scene.traverse(node => {if (node.isBone) sourceBones.set(node.name, node);});
 for (const bone of model.fit.nativeSkeleton.bones) {
  const original = sourceBones.get(bone.name);
  assert.deepEqual(bone.position.toArray(), original.position.toArray());
  assert.deepEqual(bone.quaternion.toArray(), original.quaternion.toArray());
  assert.deepEqual(bone.scale.toArray(), original.scale.toArray());
 }
 const matrices = model.fit.nativeSkeleton.bones.map(bone => bone.matrixWorld.toArray());
 model.update(.5);
 model.root.updateMatrixWorld(true);
 assert.deepEqual(model.fit.nativeSkeleton.bones.map(bone => bone.matrixWorld.toArray()), matrices);
 assert.throws(() => model.sampleAnimation('NativeNeutral', .5), /time zero/);
 model.sampleAnimation('Walk', .3);
 assert.equal(model.animationState.animation, 'Walk');
 assert.equal(model.root.userData.nativeNeutralPose, false);
 assert.equal(model.root.userData.skinTint.strength, .2);
 assert.notDeepEqual(model.fit.bodyRoot.scale.toArray(), [1, 1, 1]);
 assert.equal(model.fit.modules.size, 1);
});


test('solid clothing review changes only owned materials and rejects invalid overrides', async t => {
 const model = await factory().create(dna, 2);
 t.after(() => model.dispose());
 const {source, meshes, material, texture} = providerFixture(t, model.fit);
 const before = meshes.map(mesh => ({
  positions: Array.from(mesh.geometry.attributes.position.array),
  uv: Array.from(mesh.geometry.attributes.uv.array),
  indices: Array.from(mesh.geometry.index.array),
 }));
 source.binding.appearanceOverride = {kind: 'solid', color: '#c6b999'};
 model.modules.install([source], universalHumanProfile(dna));
 const parts = model.fit.modules.get(source.asset.id).children;
 for (const [index, part] of parts.entries()) {
  const owned = Array.isArray(part.material) ? part.material : [part.material];
  for (const value of owned) {
   assert.equal(value.map, null);
   assert.equal(value.normalMap, null);
   assert.equal(value.color.getHexString(), 'c6b999');
   assert.equal(value.roughness, 1);
   assert.equal(value.transparent, false);
   assert.equal(value.opacity, 1);
  }
  assert.equal(part.skeleton, model.fit.nativeSkeleton);
  assert.deepEqual(Array.from(part.geometry.attributes.uv.array), before[index].uv);
  assert.deepEqual(Array.from(part.geometry.index.array), before[index].indices);
  assert.deepEqual(Array.from(meshes[index].geometry.attributes.position.array), before[index].positions);
 }
 assert.equal(material.map, texture);
 assert.equal(material.roughness, .47);
 source.binding.appearanceOverride.color = 'invalid';
 assert.throws(() => model.modules.install([source], universalHumanProfile(dna)), /Solid appearance/);
});
