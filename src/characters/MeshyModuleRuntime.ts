import type { NativeEncounterPoseRequest } from './NativeEncounterPose';
import { nativeCombatEquipmentRole } from './NativeCombatEquipmentCatalog';
import { NativeEncounterBodyEnvelope, nativePropFrame, placeNativeArm, rotateNativeBoneWorld } from './NativeEncounterArmPose';
import {
 BufferAttribute, type BufferGeometry, Color, Group, Material, Matrix3, Matrix4, Mesh,
 MeshStandardMaterial, Quaternion, SkinnedMesh, Vector3,
} from 'three';
import type {GLTF} from 'three/addons/loaders/GLTFLoader.js';
import {MeshyBodyFitAdapter, anchorPoint} from './MeshyBodyFitAdapter';
import {ModuleBindingV2} from './BodyFitAdapter';
import {fitNativeHeadwear} from './NativeHeadwearFit';
import { fitNativeFacialModule } from './NativeFacialGeometry';
import {NativeHairRig} from './NativeHairRig';
import {maskedBodyGeometry} from './BodyCoverage';
import {sewModuleOpenings, weldModuleOpeningCorners} from './ModuleRims';
import {CharacterAsset, assetMeasurement} from './CharacterAssets';
import {HumanProfile} from './UniversalHumanProfile';
import {validatePreparedOutfit, validateArmorUnderlayFit, preparedCoverage, preparedCoverageMaterial, preparedModuleCoverage, preparedNeckMaterial} from './PreparedNativeOutfit';
import { characterSync, type CharacterPreparationObserver } from './CharacterPreparation';

export interface NativeModuleSource {asset: CharacterAsset; source: GLTF; binding: ModuleBindingV2;}
interface ModulePart {original: Mesh; mesh: Mesh; start: number; count: number;}
interface ModuleRecord {source: NativeModuleSource; group: Group; parts: ModulePart[]; hairRig?: NativeHairRig;}

function fail(ok: unknown, message: string): asserts ok {
 if (!ok) throw new Error(message);
}
function sourceMeshes(source: GLTF) {
 const meshes: Mesh[] = [];
 source.scene.traverse(node => {if ((node as Mesh).isMesh) meshes.push(node as Mesh);});
 return meshes;
}
function providerOriginal(binding: ModuleBindingV2) {
 return binding.materialPolicy?.kind === 'provider-original';
}

/** Appearance-time fitting changes only a wearer's fresh clone and adjacent normals. */
function fitArmorUnderlay(geometry: BufferGeometry,
 vertices: NonNullable<NonNullable<ModuleBindingV2['bodyArmorLayer']>['underlayFit']>['vertices']) {
 const position = geometry.getAttribute('position'), normal = geometry.getAttribute('normal');
 const joints = geometry.getAttribute('skinIndex'), weights = geometry.getAttribute('skinWeight');
 const changed = new Set(vertices.map(value => value.vertex)), adjacent = new Set(changed);
 for (const value of vertices) {
  position.setXYZ(value.vertex, ...value.position);
  if (value.joints && value.weights) for (let influence = 0; influence < 4; influence++) {
   joints.setComponent(value.vertex, influence, value.joints[influence]);
   weights.setComponent(value.vertex, influence, value.weights[influence]);
  }
 }
 const index = geometry.index!;
 for (let offset = 0; offset < index.count; offset += 3) {
  const face = [index.getX(offset), index.getX(offset + 1), index.getX(offset + 2)];
  if (face.some(vertex => changed.has(vertex))) face.forEach(vertex => adjacent.add(vertex));
 }
 const sums = new Map([...adjacent].map(vertex => [vertex, new Vector3()]));
 const a = new Vector3(), b = new Vector3(), c = new Vector3(), faceNormal = new Vector3();
 for (let offset = 0; offset < index.count; offset += 3) {
  const face = [index.getX(offset), index.getX(offset + 1), index.getX(offset + 2)];
  if (!face.some(vertex => adjacent.has(vertex))) continue;
  a.fromBufferAttribute(position, face[0]); b.fromBufferAttribute(position, face[1]); c.fromBufferAttribute(position, face[2]);
  faceNormal.crossVectors(b.sub(a), c.sub(a));
  for (const vertex of face) sums.get(vertex)?.add(faceNormal);
 }
 for (const [vertex, sum] of sums) {
  if (sum.lengthSq() < 1e-20) continue;
  sum.normalize(); normal.setXYZ(vertex, sum.x, sum.y, sum.z);
 }
}

/** Validation is performed before an instance takes ownership of fitted geometry. */
export function validateNativeModule(source: NativeModuleSource, fit: MeshyBodyFitAdapter) {
 const {asset, binding, source: gltf} = source;
 const lod = binding.lods?.[fit.body.lod];
 const metadata = asset.metadata;
 fail(metadata?.version === 'pillagers-fit/0.2' && binding.version === metadata.version
  && binding.id === asset.id && binding.moduleSha256 === assetMeasurement(asset.lods[2]).sha256
  && binding.rigSignature === fit.body.rigSignature
  && binding.rigSignature === metadata.nativeBinding?.rigSignature, 'Stale native module or rig binding');
 const exactBody = binding.precomputedNative
  ? binding.precomputedNative.bodyBindings.find(body => body.lod === fit.body.lod
      && body.bodySha256 === fit.body.sha256 && body.topology === fit.topologySignature)
  : lod && lod.bodySha256 === fit.body.sha256 && lod.topology === fit.topologySignature;
 fail(exactBody,
  'Binding does not match this exact body/LOD topology');
 fail(binding.coordinateFrame?.up === '+Y' && binding.coordinateFrame.front === '+Z'
  && binding.coordinateFrame.unit === 'metre' && binding.coordinateFrame.origin === 'Meshy source bind',
 'Invalid native module coordinate frame');
 fail(gltf.animations.length === 0, 'Modules must not duplicate body clips');
 fail(binding.supportedAges && Number.isFinite(binding.supportedAges.min)
  && Number.isFinite(binding.supportedAges.max) && binding.supportedAges.min >= 0
  && binding.supportedAges.max <= 100 && binding.supportedAges.min <= binding.supportedAges.max,
 'Invalid supported module ages');

 if (binding.appearanceOverride !== undefined) {
  fail(binding.appearanceOverride.kind === 'solid'
   && /^#[a-fA-F0-9]{6}$/.test(binding.appearanceOverride.color)
   && (binding.appearanceOverride.vertexColors === undefined
    || typeof binding.appearanceOverride.vertexColors === 'boolean')
   && providerOriginal(binding) && binding.materialPolicy?.reviewOnly === true
   && asset.type === 'garment' && asset.scope === 'body-bound' && asset.reviewStatus === 'preview',
  'Solid appearance requires an explicit source-bound clothing review');
 }
 fail(asset.type !== 'equipment' || !binding.rigidEquipment || binding.precomputedNative,
  'Rigid tools require their prepared source binding');
 fail(asset.type !== 'headwear' || binding.precomputedNative && binding.headwearFit,
  'Headwear requires its prepared cavity and rigid native head binding');
 fail(!asset.tags.includes('personal-body-armor') && !binding.bodyArmorLayer
  || binding.precomputedNative && binding.bodyArmorLayer,
 'Personal Body Armor requires a prepared qualified layer');
 if (binding.precomputedNative) {
  validatePreparedOutfit(source, fit);
  return;
 }
 const hairRig = binding.hairRig;
 if (hairRig) {
  fail(asset.type === 'hair' && binding.skinning === 'secondary-hair-chain' && !binding.dependency
   && hairRig.version === 1 && hairRig.headJoint === 5 && hairRig.backJoint === 3,
  'Hair chains require their exact native Head and Spine2 parents');
  fail(hairRig.bones.length >= 2 && hairRig.bones.length <= 12
   && new Set(hairRig.bones.map(bone => bone.name)).size === hairRig.bones.length
   && hairRig.bones.every((bone, i) => /^Hair_[A-Za-z0-9_]+$/.test(bone.name)
    && bone.position.length === 3 && bone.position.every(Number.isFinite)
    && (i === 0 || new Vector3(...bone.position).distanceTo(new Vector3(...hairRig.bones[i - 1].position)) > .001)),
  'Invalid owned hair chain');
  fail(hairRig.rearProfile.length >= 2 && hairRig.rearProfile.every((row, i) => row.length === 2
   && row.every(Number.isFinite) && (i === 0 || row[0] > hairRig.rearProfile[i - 1][0]))
   && Number.isFinite(hairRig.radius) && hairRig.radius > 0 && hairRig.radius < .1
   && Number.isFinite(hairRig.clearance) && hairRig.clearance >= 0 && hairRig.clearance < .1,
  'Invalid source-bound braid clearance');
  fail(/^#[a-fA-F0-9]{6}$/.test(hairRig.fixedColor.color)
   && hairRig.fixedColor.vertices.length > 0
   && new Set(hairRig.fixedColor.vertices).size === hairRig.fixedColor.vertices.length,
  'Invalid fixed hair accessory colour');
 } else fail(binding.skinning !== 'secondary-hair-chain', 'Hair chain binding is missing');
 const provider = providerOriginal(binding);
 if (binding.materialPolicy !== undefined) {
  const policy = binding.materialPolicy;
  fail(provider && policy.provider === 'Meshy' && policy.reviewOnly === true
   && /^[a-f0-9]{64}$/.test(policy.sourceSha256)
   && asset.scope === 'body-bound' && asset.reviewStatus === 'preview' && fit.body.reviewOnly === true,
  'Provider-original materials require an explicit source-bound Lab review');
  fail(binding.skinning === 'surface-barycentric-native' && !binding.dependency,
   'Provider review requires native surface-bound skinning');
  fail(!lod.coverageTriangles.length && !binding.coverageClipPlanes?.length
   && !binding.coverageRimContacts?.length,
  'Provider review must preserve its topology without coverage cuts or inserted rims');
 }

 gltf.scene.updateMatrixWorld(true);
 const meshes = sourceMeshes(gltf);
 fail(meshes.length > 0, 'Native module mesh is missing');
 if (!provider) fail(meshes.length === 1, 'One mesh per native proof export is required');
 let count = 0;
 const names = new Set<string>();
 for (const mesh of meshes) {
  const position = mesh.geometry.getAttribute('position');
  fail(position?.itemSize === 3 && position.count > 0, 'Native module positions are missing');
  fail(mesh.name.startsWith('Module_') && !(mesh as SkinnedMesh).isSkinnedMesh,
   'Module export contains a helper or copied rig');
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  fail(materials.length > 0, 'Native module materials are missing');
  if (provider) {
   fail(!names.has(mesh.name), 'Provider mesh names must be unique');
   const identity = new Matrix4();
   fail(mesh.matrixWorld.elements.every((value, index) =>
    Math.abs(value - identity.elements[index]) < 1e-7),
   'Provider module world transforms must be baked into geometry');
   const range = binding.vertexRanges?.[names.size];
   fail(range && range.mesh === mesh.name && range.start === count && range.count === position.count,
    'Provider vertex ranges must exactly partition exported mesh traversal');
  } else {
   for (const material of materials) {
    const value = material as MeshStandardMaterial;
    fail(!value.map && !value.normalMap && !value.alphaMap && !value.transparent
     && value.opacity === 1 && value.color?.equals(new Color(0xffffff))
     && mesh.geometry.getAttribute('color'), 'Native modules require opaque mapless COLOR_0');
   }
  }
  names.add(mesh.name);
  count += position.count;
 }
 if (provider) {
  fail(binding.vertexRanges?.length === meshes.length,
   'Provider vertex ranges must include every exported mesh');
  gltf.scene.traverse(node => fail(!(node as import('three').Bone).isBone,
   'Provider modules must not duplicate body bones'));
 }
 fail(binding.dependency ? lod.anchors.length === 0 && lod.vertexAnchors.length === 0
  : lod.vertexAnchors.length === count && lod.vertexAnchors.every(value =>
   Number.isInteger(value) && value >= 0 && value < lod.anchors.length),
 'Module/body correspondence count differs');
 for (const anchor of lod.anchors) anchorPoint(fit.source, anchor);
 fail(lod.weights.length === lod.anchors.length && lod.weights.every(value =>
  value.joints.length === 4 && value.weights.length === 4
  && value.joints.every(joint => Number.isInteger(joint) && joint >= 0 && joint < 44 + (hairRig?.bones.length ?? 0))
  && value.weights.every(weight => Number.isFinite(weight) && weight >= 0 && weight <= 1)
  && Math.abs(value.weights.reduce((a, b) => a + b, 0) - 1) < .00001),
 'Invalid source-bound native weights');
 if (hairRig) fail(hairRig.fixedColor.vertices.every(vertex =>
  Number.isInteger(vertex) && vertex >= 0 && vertex < count), 'Invalid fixed-colour vertex range');
 const groups = Object.values(binding.regions ?? {});
 const known = new Set(groups.flatMap(region => [...region.contact, ...region.free]));
 fail(known.size === count && [...known].every(value =>
  Number.isInteger(value) && value >= 0 && value < count),
 'Every render vertex needs a declared contact/free region');
 fail(groups.every(region => region.boundary.every(value =>
  Number.isInteger(value) && value >= 0 && value < count)), 'Invalid locked boundary');
 fail(binding.seams?.every(seam => seam.length >= 2 && seam.every(value =>
  Number.isInteger(value) && value >= 0 && value < count)), 'Invalid sewn seam');
 fail(lod.coverageTriangles.every(triangle =>
  Number.isInteger(triangle) && triangle >= 0 && triangle < fit.source.triangles)
  && new Set(lod.coverageTriangles).size === lod.coverageTriangles.length, 'Invalid source coverage mask');
 if (binding.dependency) {
  fail(metadata.dependency?.module === binding.dependency.module
   && metadata.dependency.frame === binding.dependency.frame, 'Garment dependency differs from the registry');
 }
 fail((binding.coverageClipPlanes ?? []).every(plane => plane.regions.length > 0
  && plane.regions.every(region => typeof region === 'string')
  && (!plane.regionMatch || ['all', 'any'].includes(plane.regionMatch))
  && plane.normal.length === 3 && plane.normal.every(Number.isFinite)
  && Math.hypot(...plane.normal) > .9 && Math.hypot(...plane.normal) < 1.1
  && Number.isFinite(plane.constant)), 'Invalid body opening cut planes');
 fail((binding.coverageRimContacts ?? []).every(vertex =>
  Number.isInteger(vertex) && vertex >= 0 && vertex < count
  && groups.some(region => region.contact.includes(vertex))
  && Math.hypot(...lod.anchors[lod.vertexAnchors[vertex]].offset) < .000001),
 'Invalid shared body/garment rim contact');
 return source;
}

export function nativeModuleEligible(source: NativeModuleSource, profile: HumanProfile) {
 const {asset, binding} = source;
 return profile.age >= binding.supportedAges.min && profile.age <= binding.supportedAges.max
  && !(asset.type === 'beard' && (profile.age < 18 || profile.masculinity <= .5));
}

/** Owned geometry and materials, immutable shared texture maps, shared native skeleton. */
export class MeshyModuleRuntime {
 private records = new Map<string, ModuleRecord>();
 private mask: import('three').BufferGeometry | null = null;
 private frames: Group[] = [];
 private originalBodyMaterial: Material | Material[] | null = null;
 private coverageMaterials: Material[] = [];
 fitRuns = 0;
 lastFitMilliseconds = 0;

 constructor(readonly fit: MeshyBodyFitAdapter, private observe?: CharacterPreparationObserver) {}

 install(sources: NativeModuleSource[], profile: HumanProfile) {
  characterSync(this.observe, 'module-binding-validation', () => {
   for (const source of sources) validateNativeModule(source, this.fit);
  });
  fail(new Set(sources.map(source => source.asset.id)).size === sources.length,
   'Native module IDs must be unique');
  const armorLayers = sources.filter(source => source.binding.bodyArmorLayer);
  fail(armorLayers.length <= 1, 'Only one personal Body Armor layer may be installed');
  for (const layer of armorLayers) {
   const qualification = layer.binding.bodyArmorLayer!;
   const underlay = sources.find(source => source.asset.id === qualification.underlayId);
   fail(underlay && assetMeasurement(underlay.asset.lods[2]).sha256 === qualification.underlaySha256
    && (!nativeModuleEligible(layer, profile) || nativeModuleEligible(underlay, profile)),
   'Body Armor requires its exact available field tunic underlay');
   validateArmorUnderlayFit(layer, underlay);
  }
  this.clear();
  for (const source of sources) {
   if (!nativeModuleEligible(source, profile)) continue;
   const {asset, binding} = source;
   const originals = sourceMeshes(source.source).filter(mesh =>
    !mesh.name.startsWith('Coverage_'));
   const materials = new Map<Material, Material>();
   const cloneMaterial = (original: Material) => {
    let owned = materials.get(original);
    if (!owned) {
     owned = binding.appearanceOverride
      ? new MeshStandardMaterial({color: binding.appearanceOverride.color, roughness: 1,
       vertexColors: binding.appearanceOverride.vertexColors === true,
       side: (original as MeshStandardMaterial).side})
      : original.clone();
     materials.set(original, owned);
    }
    return owned;
   };
   const group = new Group();
   group.name = asset.id;
   let start = 0;
   const parts = originals.map(original => {
    const geometry = original.geometry.clone();
    const material = providerOriginal(binding)
     ? Array.isArray(original.material) ? original.material.map(cloneMaterial) : cloneMaterial(original.material)
     : new MeshStandardMaterial({color: 0xffffff, vertexColors: true, roughness: 1,
      flatShading: true, side: (original.material as MeshStandardMaterial).side});
    const mesh = binding.dependency ? new Mesh(geometry, material) : new SkinnedMesh(geometry, material);
    mesh.name = original.name;
    mesh.castShadow = true;
    mesh.frustumCulled = false;
    group.add(mesh);
    const count = geometry.getAttribute('position').count;
    const part = {original, mesh, start, count};
    start += count;
    return part;
   });
   this.fit.bodyRoot.add(group);
   this.records.set(asset.id, {source, group, parts,
    hairRig: binding.hairRig ? new NativeHairRig(this.fit, binding.hairRig) : undefined});
   this.fit.modules.set(asset.id, group);
  }
  this.refit(profile);
 }

 private fitPart(record: ModuleRecord, part: ModulePart, inverseEncoding: Matrix4, profile: HumanProfile) {
  const {source} = record;
  const {mesh, original, start, count} = part;
  mesh.geometry.dispose();
  mesh.geometry = original.geometry.clone();
  const position = mesh.geometry.getAttribute('position');
  if (source.binding.precomputedNative) {
   for (const upper of this.records.values()) {
    const layer = upper.source.binding.bodyArmorLayer, fitting = layer?.underlayFit;
    if (!fitting || layer!.underlayId !== source.asset.id || fitting.meshName !== original.name) continue;
    fitArmorUnderlay(mesh.geometry, fitting.vertices);
   }
   for (const upper of this.records.values()) {
    const prepared = upper.source.binding.precomputedNative;
    const underlap = prepared?.version === 3 ? prepared.lowerUnderlap : undefined;
    if (!underlap || underlap.id !== source.asset.id) continue;
    fail(underlap.moduleSha256 === source.binding.moduleSha256
     && source.asset.metadata?.slot === 'lower', 'Lower underlap does not match its exact source');
    const surface = {
     positions: Array.from({length: position.count}, (_, vertex) => [
      position.getX(vertex), position.getY(vertex), position.getZ(vertex),
     ]).flat(),
     indices: Array.from(mesh.geometry.index!.array),
     regions: Array(position.count).fill('LOWER_CLOTHING'),
     triangles: mesh.geometry.index!.count / 3,
    };
    const clipped = maskedBodyGeometry(mesh.geometry, surface, new Set(), [{
     regions: ['LOWER_CLOTHING'], normal: [0, -1, 0], constant: underlap.maximumY,
    }]);
    mesh.geometry.dispose();
    mesh.geometry = clipped;
    if (underlap.hipBlendFromY !== undefined && underlap.hipBlendToY !== undefined) {
     const positions = clipped.getAttribute('position');
     const joints = clipped.getAttribute('skinIndex'), weights = clipped.getAttribute('skinWeight');
     for (let vertex = 0; vertex < positions.count; vertex++) {
      const value = Math.max(0, Math.min(1, (positions.getY(vertex) - underlap.hipBlendFromY)
       / (underlap.hipBlendToY - underlap.hipBlendFromY)));
      const amount = value * value * (3 - 2 * value);
      if (amount === 0) continue;
      // Tuck only the matching lower garment's upper band inside this shirt.
      if (underlap.radialInset) {
       const x = positions.getX(vertex), z = positions.getZ(vertex);
       const radius = Math.hypot(x, z);
       const scale = Math.max(0, radius - underlap.radialInset * amount) / (radius || 1);
       positions.setXYZ(vertex, x * scale, positions.getY(vertex), z * scale);
      }
      const mixture = new Map<number, number>([[0, amount]]);
      for (let influence = 0; influence < 4; influence++) {
       const joint = joints.getComponent(vertex, influence);
       mixture.set(joint, (mixture.get(joint) ?? 0)
        + weights.getComponent(vertex, influence) * (1 - amount));
      }
      const retained = [...mixture].filter(([, weight]) => weight > 0)
       .sort((a, b) => b[1] - a[1]).slice(0, 4);
      const sum = retained.reduce((total, [, weight]) => total + weight, 0);
      for (let influence = 0; influence < 4; influence++) {
       joints.setComponent(vertex, influence, retained[influence]?.[0] ?? 0);
       weights.setComponent(vertex, influence, (retained[influence]?.[1] ?? 0) / sum);
      }
     }
    }
   }
   mesh.geometry.applyMatrix4(inverseEncoding);
   const skin = mesh as SkinnedMesh;
   skin.bind(record.hairRig?.skeleton ?? this.fit.nativeSkeleton, this.fit.mesh.bindMatrix);
   skin.bindMatrixInverse.copy(this.fit.mesh.bindMatrixInverse);
   mesh.geometry.computeBoundingSphere();
   return;
  }
  const lod = source.binding.lods[this.fit.body.lod];
  const joints = new Uint16Array(count * 4);
  const weights = new Float32Array(count * 4);
  for (let vertex = 0; vertex < count; vertex++) {
   const anchorIndex = lod.vertexAnchors[start + vertex];
   const anchor = lod.anchors[anchorIndex];
   const point = anchorPoint(this.fit.source, anchor)
    .add(new Vector3(...anchor.offset)).applyMatrix4(inverseEncoding);
   position.setXYZ(vertex, point.x, point.y, point.z);
   joints.set(lod.weights[anchorIndex].joints, vertex * 4);
   weights.set(lod.weights[anchorIndex].weights, vertex * 4);
  }
  position.needsUpdate = true;
  mesh.geometry.setAttribute('skinIndex', new BufferAttribute(joints, 4));
  mesh.geometry.setAttribute('skinWeight', new BufferAttribute(weights, 4));
  const skin = mesh as SkinnedMesh;
  skin.bind(record.hairRig?.skeleton ?? this.fit.nativeSkeleton, this.fit.mesh.bindMatrix);
  skin.bindMatrixInverse.copy(this.fit.mesh.bindMatrixInverse);
  if (providerOriginal(source.binding)) {
   // The binder emits source-metre normals. Positions and normals enter the same
   // encoded native bind frame; provider UVs, topology and materials stay intact.
   const normal = mesh.geometry.getAttribute('normal');
   if (normal) {
    normal.applyNormalMatrix(new Matrix3().getNormalMatrix(inverseEncoding));
    normal.needsUpdate = true;
   }
   const tangent = mesh.geometry.getAttribute('tangent');
   if (tangent) {
    tangent.transformDirection(inverseEncoding);
    tangent.needsUpdate = true;
   }
  } else {
   const sewn = sewModuleOpenings(mesh.geometry, source.binding, this.fit);
   if (sewn !== mesh.geometry) {
    mesh.geometry.dispose();
    mesh.geometry = sewn;
   }
   if (source.asset.type === 'hair' || source.asset.type === 'beard') {
    const color = mesh.geometry.getAttribute('color');
    const selected = new Color(profile.appearance.color);
    const fixed = source.binding.hairRig?.fixedColor;
    const retained = new Set(fixed?.vertices ?? []);
    const leather = fixed ? new Color(fixed.color) : selected;
    for (let vertex = 0; vertex < color.count; vertex++) {
     const value = retained.has(start + vertex) ? leather : selected;
     color.setXYZ(vertex, value.r, value.g, value.b);
    }
    color.needsUpdate = true;
   }
  }
  mesh.geometry.computeBoundingSphere();
 }

 private attachDependency(id: string, record: ModuleRecord) {
  const dependency = record.source.binding.dependency!;
  const garment = this.records.get(dependency.module);
  const frame = garment?.source.binding.garmentFrames[dependency.frame];
  if (!garment || !frame) {
   this.remove(id);
   return;
  }
  const part = garment.parts.find(value => frame.vertex >= value.start && frame.vertex < value.start + value.count);
  fail(Number.isInteger(frame.vertex) && part, 'Invalid garment socket vertex');
  const vertex = frame.vertex - part.start;
  const mesh = part.mesh as SkinnedMesh;
  const indices = mesh.geometry.getAttribute('skinIndex');
  const weights = mesh.geometry.getAttribute('skinWeight');
  let influence = 0;
  for (let index = 1; index < 4; index++) {
   if (weights.getComponent(vertex, index) > weights.getComponent(vertex, influence)) influence = index;
  }
  const bone = this.fit.nativeSkeleton.bones[indices.getComponent(vertex, influence)];
  const socket = new Group();
  socket.name = dependency.frame;
  const point = mesh.getVertexPosition(vertex, new Vector3());
  mesh.localToWorld(point);
  bone.worldToLocal(point);
  socket.position.copy(point);
  socket.quaternion.copy(bone.getWorldQuaternion(new Quaternion()).invert()
   .multiply(this.fit.bodyRoot.getWorldQuaternion(new Quaternion()))
   .multiply(new Quaternion(...frame.quaternion)));
  bone.add(socket);
  socket.add(record.group);
  record.group.position.set(0, 0, .025);
  record.group.quaternion.identity();
  this.frames.push(socket);
 }

 refit(profile: HumanProfile) {
  this.encounterBodyEnvelope = undefined;
  const started = performance.now();
  for (const [id, record] of [...this.records]) {
   if (!nativeModuleEligible(record.source, profile)) this.remove(id);
  }
  this.frames.forEach(frame => frame.removeFromParent());
  this.frames = [];
  const inverseEncoding = this.fit.encoding.clone().invert();
  for (const record of this.records.values()) {
   if (!record.source.binding.dependency) {
    for (const part of record.parts) characterSync(this.observe, 'module-part-fit', () =>
     this.fitPart(record, part, inverseEncoding, profile), record.source.asset.id);
   }
  }
  const qualifiedHeadwear = [...this.records.values()].filter(record =>
   record.source.binding.headwearFit?.crownCavity);
  if (qualifiedHeadwear.length) {
   this.fit.rootForModulesUpdate();
   const crownHair = [...this.records.values()].filter(record => record.source.asset.type === 'hair')
    .flatMap(record => record.parts.map(part => part.mesh)
     .filter((mesh): mesh is SkinnedMesh => (mesh as SkinnedMesh).isSkinnedMesh));
   // Source-wall fields are measured before facial offsets. Fit that crown first, then
   // apply the shared facial field to both helmet and hair so their clearance deforms together.
   for (const record of qualifiedHeadwear) for (const part of record.parts)
    characterSync(this.observe, 'qualified-helmet-crown-fit', () =>
     fitNativeHeadwear(part.mesh as SkinnedMesh, record.source.binding.headwearFit!, crownHair, this.fit),
    record.source.asset.id);
  }
  if (this.fit.facialIdentity && this.fit.mesh.morphTargetInfluences?.some(weight => weight !== 0)) {
   for (const record of this.records.values()) {
    if (!['hair', 'beard', 'headwear'].includes(record.source.asset.type)) continue;
    for (const part of record.parts)
     characterSync(this.observe, 'hair-beard-face-fit', () =>
      fitNativeFacialModule(part.mesh as SkinnedMesh, this.fit, this.fit.facialIdentity!), record.source.asset.id);
   }
  }
  this.fit.rootForModulesUpdate();
  const garments = [...this.records.values()].filter(record => record.source.asset.type === 'garment')
   .flatMap(record => record.parts.map(part => part.mesh).filter((mesh): mesh is SkinnedMesh => (mesh as SkinnedMesh).isSkinnedMesh));
  const backEquipment = [...this.records.values()].flatMap(record => record.parts
   .filter(part => record.source.binding.rigidEquipment?.parts.some(binding =>
    binding.mesh === part.mesh.name && binding.socket === 'socket_back'))
   .map(part => part.mesh as SkinnedMesh));
  characterSync(this.observe, 'hair-garment-clearance', () => {
   for (const record of this.records.values()) record.hairRig?.configureClearance([...garments, ...backEquipment]);
  });
  this.poseHair();
  this.fit.rootForModulesUpdate();
  const hair = [...this.records.values()].filter(record => record.source.asset.type === 'hair')
   .flatMap(record => record.parts.map(part => part.mesh).filter((mesh): mesh is SkinnedMesh => (mesh as SkinnedMesh).isSkinnedMesh));
  for (const record of this.records.values()) {
   if (record.source.binding.headwearFit && !record.source.binding.headwearFit.crownCavity)
    for (const part of record.parts) {
    characterSync(this.observe, 'hat-fit', () =>
     fitNativeHeadwear(part.mesh as SkinnedMesh, record.source.binding.headwearFit!, hair, this.fit), record.source.asset.id);
   }
  }
  for (const [id, record] of [...this.records]) {
   if (record.source.binding.dependency) this.attachDependency(id, record);
  }
  this.restoreMask();
  const prepared = [...this.records.values()].filter(record => record.source.asset.type === 'garment' && record.source.binding.precomputedNative);
  const full = prepared.filter(record => record.source.binding.precomputedNative!.version === 2);
  const layers = prepared.filter(record => record.source.binding.bodyArmorLayer);
  const footwear = prepared.filter(record => record !== full[0] && !record.source.binding.bodyArmorLayer);
  fail(layers.length <= 1 && layers.every(record => {
   const layer = record.source.binding.bodyArmorLayer!;
   return full.length === 1 && full[0].source.asset.id === layer.underlayId
    && assetMeasurement(full[0].source.asset.lods[2]).sha256 === layer.underlaySha256;
  }), 'Body Armor requires its exact qualified tunic and unchanged native body coverage');
  fail(full.length <= 1 && (!full.length || !footwear.length
   || full[0].source.asset.metadata?.includesFootwear === false
   && footwear.every(record => record.source.asset.metadata?.slot === 'footwear'
    && record.source.binding.precomputedNative!.version === 3)),
   'Prepared full outfits may combine only with explicitly separate footwear');
  if (prepared.length && !full.length) {
   this.mask = characterSync(this.observe, 'body-coverage-preparation', () =>
    preparedModuleCoverage([...this.records.values()].map(record => record.source), this.fit));
   this.fit.mesh.geometry = this.mask;
   const necks = prepared.flatMap(record => {
    const value = record.source.binding.precomputedNative!;
    return value.version === 3 && value.neckMaterial ? [value.neckMaterial] : [];
   });
   fail(necks.length <= 1, 'Only one native collar boundary may be selected');
   if (necks.length) {
    this.originalBodyMaterial = this.fit.mesh.material;
    const originals = Array.isArray(this.originalBodyMaterial) ? this.originalBodyMaterial : [this.originalBodyMaterial];
    this.coverageMaterials = originals.map(material => preparedNeckMaterial(material, this.fit.encoding, necks[0]));
    this.fit.mesh.material = Array.isArray(this.originalBodyMaterial) ? this.coverageMaterials : this.coverageMaterials[0];
   }
   this.finishRefit(started);
   return;
  }
  if (prepared.length) {
   this.mask = characterSync(this.observe, 'body-coverage-preparation', () =>
    preparedCoverage(full[0].source, this.fit, footwear.map(record => record.source)));
   this.fit.mesh.geometry = this.mask;
   this.originalBodyMaterial = this.fit.mesh.material;
   const originals = Array.isArray(this.originalBodyMaterial)
    ? this.originalBodyMaterial : [this.originalBodyMaterial];
   const fullCoverage = full[0].source.binding.precomputedNative!;
   fail(fullCoverage.version === 2, 'Full outfit coverage requires version 2');
   this.coverageMaterials = originals.map(material => preparedCoverageMaterial(material, this.fit.encoding,
    fullCoverage.coverage));
   this.fit.mesh.material = Array.isArray(this.originalBodyMaterial)
    ? this.coverageMaterials : this.coverageMaterials[0];
   this.finishRefit(started);
   return;
  }
  const covered = new Set<number>();
  for (const record of this.records.values()) {
   for (const triangle of record.source.binding.lods[this.fit.body.lod].coverageTriangles) covered.add(triangle);
  }
  const records = [...this.records.values()];
  const planes = records.flatMap(record => record.source.binding.coverageClipPlanes ?? []);
  if (covered.size || planes.length) {
   const rims = records.flatMap(record => (record.source.binding.coverageRimContacts ?? []).map(vertex => {
    const lod = record.source.binding.lods[this.fit.body.lod];
    return lod.anchors[lod.vertexAnchors[vertex]];
   }));
   this.mask = maskedBodyGeometry(this.fit.sourceGeometry, this.fit.source, covered, planes, rims);
   this.fit.mesh.geometry = this.mask;
   for (const record of records) {
    if (!providerOriginal(record.source.binding)) {
     for (const part of record.parts) weldModuleOpeningCorners(this.mask, part.mesh.geometry, this.fit.encoding);
    }
   }
  }
  this.finishRefit(started);
 }

 private finishRefit(started: number) {
  if ([...this.records.keys()].some(id => id.startsWith('equipment/native-'))) this.encounterBody();
  this.fitRuns++;
  this.lastFitMilliseconds = performance.now() - started;
 }

 private encounterBodyEnvelope?: NativeEncounterBodyEnvelope;
 private encounterShieldFrame = new WeakMap<SkinnedMesh, { right: number; left: number; up: number; rear: number }>();
 private encounterSpearEnds = new WeakMap<SkinnedMesh, { tip: number; butt: number; radius: number;
  sections: {from: number; to: number; radius: number}[] }>();
 private gripArm: {joint: number; rotation: Quaternion}[] = [];

 /** Apply one carry layer over the original animation; equipment changes restore its saved arm. */
 poseEquipmentGrips(
  animationRotations: ReadonlyMap<import('three').Bone, Quaternion>,
  restorePrevious = false,
  enabled = true,
  carryArms = true,
 ) {
  const bones = this.fit.nativeSkeleton.bones;
  if (restorePrevious) {
   for (const saved of this.gripArm) bones[saved.joint].quaternion.copy(saved.rotation);
  }
  this.gripArm = [];
  // Native wrists, Thumb1–3 and Middle1–3; terminal/helper bones keep their authored transforms.
  for (const joint of [11, 13, 14, 15, 17, 18, 19, 24, 26, 27, 28, 30, 31, 32]) {
   const bone = bones[joint], rotation = animationRotations.get(bone);
   if (rotation) bone.quaternion.copy(rotation);
  }
  if (!enabled) return;
  for (const record of this.records.values()) {
   if (!record.group.visible) continue;
   const pose = record.source.binding.rigidEquipment?.gripPose;
   if (!pose) continue;
   if (carryArms) for (const [joint, rotation, blend] of [
    [pose.upperArmJoint, pose.upperArmRotation, pose.upperArmBlend],
    [pose.forearmJoint, pose.forearmRotation, pose.forearmBlend],
   ] as const) {
    const bone = bones[joint];
    this.gripArm.push({joint, rotation: bone.quaternion.clone()});
    bone.quaternion.slerp(new Quaternion().fromArray(rotation), blend);
   }
   bones[pose.wristJoint].quaternion.fromArray(pose.wristRotation);
   for (const finger of pose.fingers) bones[finger.joint].quaternion.fromArray(finger.rotation);
  }
 }

 private encounterBody() {
  if (!this.encounterBodyEnvelope) {
   const meshes = [this.fit.mesh];
   for (const record of this.records.values()) {
    if (record.source.asset.type === 'equipment') continue;
    for (const part of record.parts) if ((part.mesh as SkinnedMesh).isSkinnedMesh)
     meshes.push(part.mesh as SkinnedMesh);
   }
   this.encounterBodyEnvelope = characterSync(this.observe, 'encounter-body-envelope-preparation',
    () => new NativeEncounterBodyEnvelope(meshes, this.fit.encoding));
  }
  return this.encounterBodyEnvelope;
 }

 /** Keep the measured fingers while an action owns its arm pose instead of the carry layer. */
 poseEncounterAction(animationRotations: ReadonlyMap<import('three').Bone, Quaternion>,
  request: NativeEncounterPoseRequest, phase: number) {
  this.poseEquipmentGrips(animationRotations, false, true, false);
  if (['ready', 'spear', 'shield', 'brace', 'withdraw'].includes(request.action) && request.hasShield) {
   const shield = [...this.records.values()].find(record => record.group.visible &&
    nativeCombatEquipmentRole(record.source.asset.id) === 'shield');
   const grip = shield?.source.binding.rigidEquipment?.gripPose;
   if (shield && grip) {
    const defence = request.action === 'shield' ? Math.sin(Math.PI * phase) : 0;
    const bones = this.fit.nativeSkeleton.bones;
    bones[grip.upperArmJoint].quaternion.fromArray(grip.upperArmRotation);
    bones[grip.forearmJoint].quaternion.fromArray(grip.forearmRotation);
    this.fit.rootForModulesUpdate();
    const bodyRotation = this.fit.bodyRoot.getWorldQuaternion(new Quaternion());
    const parent = bones[grip.upperArmJoint].parent!.getWorldQuaternion(new Quaternion());
    const lift = new Quaternion().setFromAxisAngle(new Vector3(-1, 0, 0).applyQuaternion(bodyRotation),
     defence);
    bones[grip.upperArmJoint].quaternion.premultiply(parent.clone().invert().multiply(lift).multiply(parent));
    this.fit.rootForModulesUpdate();
    const part = shield.parts[0], mesh = part.mesh as SkinnedMesh;
    let frame = this.encounterShieldFrame.get(mesh);
    if (!frame) {
     const positions = part.original.geometry.getAttribute('position');
     const across = new Vector3().fromArray(grip.axis);
     const up = new Vector3(0, 1, 0).addScaledVector(across, -across.y).normalize();
     // Match the generator's signed source frame: its +Z is the shield's front face.
     if (across.clone().cross(up).x < 0) across.negate();
     frame = { right: 0, left: 0, up: 0, rear: 0 };
     let maximum = -Infinity, minimum = Infinity, highest = -Infinity, rearmost = Infinity;
     const front = across.clone().cross(up).normalize();
     for (let vertex = 0; vertex < positions.count; vertex++) {
      const point = new Vector3().fromBufferAttribute(positions, vertex);
      if (point.dot(across) > maximum) { maximum = point.dot(across); frame.right = vertex; }
      if (point.dot(across) < minimum) { minimum = point.dot(across); frame.left = vertex; }
      if (point.dot(up) > highest) { highest = point.dot(up); frame.up = vertex; }
      if (point.dot(front) < rearmost) { rearmost = point.dot(front); frame.rear = vertex; }
     }
     this.encounterShieldFrame.set(mesh, frame);
    }
    const point = (vertex: number) => mesh.getVertexPosition(vertex, new Vector3()).applyMatrix4(mesh.matrixWorld);
    const left = point(frame.left), right = point(frame.right), top = point(frame.up);
    const normal = right.clone().sub(left).cross(top.sub(left.clone().lerp(right, .5))).normalize();
    const forward = new Vector3(0, 0, 1).applyQuaternion(bodyRotation);
    const turn = new Quaternion().slerp(new Quaternion().setFromUnitVectors(normal, forward), defence);
    const update = () => this.fit.rootForModulesUpdate();
    const upper = bones[grip.upperArmJoint], forearm = bones[grip.forearmJoint], wrist = bones[grip.wristJoint];
    const shoulder = upper.getWorldPosition(new Vector3()), elbow = forearm.getWorldPosition(new Vector3());
    const hand = wrist.getWorldPosition(new Vector3());
    const desiredNormal = normal.clone().applyQuaternion(turn);
    const desiredArm = hand.clone().sub(elbow).normalize().applyQuaternion(turn);
    const rearOffset = point(frame.rear).sub(hand).dot(normal);
    const localNormal = desiredNormal.clone().applyMatrix3(new Matrix3()
     .setFromMatrix4(this.fit.bodyRoot.matrixWorld).transpose());
    const bodySupport = this.encounterBody().support(this.fit.bodyRoot, localNormal) +
     this.fit.bodyRoot.getWorldPosition(new Vector3()).dot(desiredNormal);
    const upperVector = elbow.clone().sub(shoulder), upperLength = upperVector.length();
    const lowerLength = hand.distanceTo(elbow);
    const clearance = grip.fingerRadius * this.fit.bodyRoot.getWorldScale(new Vector3()).x / 4;
    const needed = bodySupport + clearance - rearOffset - shoulder.dot(desiredNormal)
     - lowerLength * desiredArm.dot(desiredNormal);
    const along = Math.min(upperLength - 1e-6, Math.max(needed, upperVector.dot(desiredNormal)));
    const tangent = upperVector.clone().addScaledVector(desiredNormal, -upperVector.dot(desiredNormal)).normalize();
    const elbowTarget = shoulder.clone().addScaledVector(desiredNormal, along)
     .addScaledVector(tangent, Math.sqrt(Math.max(0, upperLength * upperLength - along * along)));
    rotateNativeBoneWorld(upper, new Quaternion().setFromUnitVectors(upperVector.normalize(),
     elbowTarget.clone().sub(shoulder).normalize()), update);
    // Reorient the entire forearm/hand mount after moving its elbow in front of the protected body.
    const sourceArm = wrist.getWorldPosition(new Vector3()).sub(forearm.getWorldPosition(new Vector3())).normalize();
    const sourceNormal = point(frame.right).sub(point(frame.left))
     .cross(point(frame.up).sub(point(frame.left).lerp(point(frame.right), .5))).normalize();
    const sourceAcross = sourceArm.clone().addScaledVector(sourceNormal, -sourceArm.dot(sourceNormal)).normalize();
    const targetAcross = desiredArm.clone().addScaledVector(desiredNormal, -desiredArm.dot(desiredNormal)).normalize();
    const sourceFrame = new Matrix4().makeBasis(sourceAcross, sourceNormal.clone().cross(sourceAcross), sourceNormal);
    const targetFrame = new Matrix4().makeBasis(targetAcross, desiredNormal.clone().cross(targetAcross), desiredNormal);
    const orient = new Quaternion().setFromRotationMatrix(targetFrame)
     .multiply(new Quaternion().setFromRotationMatrix(sourceFrame).invert());
    rotateNativeBoneWorld(forearm, orient, update);
   }
  }
  // Native Death keeps its fall, while the existing hand/shaft solver prevents
  // the held source spear passing through the folded body and outer clothing.
  if (!['ready', 'spear', 'shield', 'brace', 'withdraw', 'death'].includes(request.action) || !request.hasSpear) return;
  const record = [...this.records.values()].find(record => record.group.visible &&
   nativeCombatEquipmentRole(record.source.asset.id) === 'spear');
  const pose = record?.source.binding.rigidEquipment?.gripPose;
  const part = record?.parts[0];
  if (!record?.group.visible || !pose || !part || !(part.mesh as SkinnedMesh).isSkinnedMesh) return;
  const bones = this.fit.nativeSkeleton.bones;
  const upper = bones[pose.upperArmJoint], forearm = bones[pose.forearmJoint], wrist = bones[pose.wristJoint];
  upper.quaternion.fromArray(pose.upperArmRotation);
  forearm.quaternion.fromArray(pose.forearmRotation);
  const extension = request.action === 'spear' ? Math.sin(Math.PI * phase) : 0;
  // The head curls toward this arm before the fall ends. Reach the measured
  // six-radius forearm margin by mid-fall and keep it through the resting pose.
  const deathRise = Math.min(1, 2 * phase);
  const deathForearmClearance = request.action === 'death'
   ? 6 * pose.fingerRadius * deathRise * deathRise * (3 - 2 * deathRise) : 0;
  this.fit.rootForModulesUpdate();
  const bodyRotation = this.fit.bodyRoot.getWorldQuaternion(new Quaternion());
  const update = () => this.fit.rootForModulesUpdate();
  const mesh = part.mesh as SkinnedMesh, positions = part.original.geometry.getAttribute('position');
  let ends = this.encounterSpearEnds.get(mesh);
  if (!ends) {
   const sourceAxis = new Vector3().fromArray(pose.axis);
   ends = { tip: 0, butt: 0, radius: 0, sections: [] };
   let maximum = -Infinity, minimum = Infinity;
   const gripPoint = new Vector3(...record.source.binding.rigidEquipment!.parts[0].grip);
   for (let vertex = 0; vertex < positions.count; vertex++) {
    const sourcePoint = new Vector3().fromBufferAttribute(positions, vertex);
    const distance = sourcePoint.dot(sourceAxis);
    const radial = sourcePoint.sub(gripPoint);
    ends.radius = Math.max(ends.radius, radial.addScaledVector(sourceAxis, -radial.dot(sourceAxis)).length());
    if (distance > maximum) { maximum = distance; ends.tip = vertex; }
    if (distance < minimum) { minimum = distance; ends.butt = vertex; }
   }
   const gripProjection = gripPoint.dot(sourceAxis);
   const count = Math.min(64, Math.max(1, Math.ceil((maximum - minimum) / (2 * pose.fingerRadius))));
   const width = (maximum - minimum) / count;
   ends.sections = Array.from({length: count}, (_, index) => ({
    from: minimum + index * width - gripProjection,
    to: minimum + (index + 1) * width - gripProjection, radius: 0,
   }));
   const indices = part.original.geometry.index!;
   // A triangle contributes to every axial slice it spans, including long shaft faces.
   for (let triangle = 0; triangle < indices.count; triangle += 3) {
    let low = Infinity, high = -Infinity, radius = 0;
    for (let corner = 0; corner < 3; corner++) {
     const vertex = new Vector3().fromBufferAttribute(positions, indices.getX(triangle + corner));
     const projection = vertex.dot(sourceAxis);
     low = Math.min(low, projection); high = Math.max(high, projection);
     const radial = vertex.sub(gripPoint);
     radius = Math.max(radius, radial.addScaledVector(sourceAxis, -radial.dot(sourceAxis)).length());
    }
    const first = Math.max(0, Math.min(count - 1, Math.floor((low - minimum) / width)));
    const last = Math.max(0, Math.min(count - 1, Math.floor((high - minimum) / width)));
    for (let section = first; section <= last; section++)
     ends.sections[section].radius = Math.max(ends.sections[section].radius, radius);
   }
   this.encounterSpearEnds.set(mesh, ends);
  }
  const point = (vertex: number) => mesh.getVertexPosition(vertex, new Vector3()).applyMatrix4(mesh.matrixWorld);
  const frame = this.fit.bodyRoot;
  const inverse = frame.matrixWorld.clone().invert();
  const shoulder = upper.getWorldPosition(new Vector3()).applyMatrix4(inverse);
  const elbow = forearm.getWorldPosition(new Vector3()).applyMatrix4(inverse);
  const hand = wrist.getWorldPosition(new Vector3()).applyMatrix4(inverse);
  const reach = shoulder.distanceTo(elbow) + elbow.distanceTo(hand);
  const body = this.encounterBody().bounds(this.fit.bodyRoot, false);
  const propFrame = nativePropFrame(mesh, pose.wristJoint, this.fit.encoding, frame);
  const scale = propFrame.elements;
  const radiusScale = Math.sqrt(scale[0] ** 2 + scale[1] ** 2 + scale[2] ** 2 +
   scale[4] ** 2 + scale[5] ** 2 + scale[6] ** 2 + scale[8] ** 2 + scale[9] ** 2 + scale[10] ** 2);
  const gripSection = ends.sections.find(section => section.from <= 0 && section.to >= 0)!;
  const clearance = pose.fingerRadius / 4;
  const lateralLimit = Math.min(body.min.x, shoulder.x) - clearance;
  const target = shoulder.clone();
  target.x = lateralLimit - gripSection.radius * radiusScale - pose.fingerRadius;
  target.y -= .32 * reach;
  // A corpse keeps the held shaft beside its body; the standing diagonal
  // would push the butt below the ground after the native fall reaches its end.
  const forward = new Vector3(0, request.action === 'death' ? 0 : .8 * (1 - extension), 1)
   .normalize().applyQuaternion(bodyRotation);
  for (let pass = 0; pass < 3; pass++) {
   const sideways = target.x - shoulder.x, down = target.y - shoulder.y;
   const available = Math.sqrt(Math.max(0, (reach - clearance) ** 2 - sideways ** 2 - down ** 2));
   // Keep the fallen forearm outside the helmet's side. The source grip radius
   // bounds this Death-only target offset; wrist grasp and shaft direction stay fixed.
   target.z = shoulder.z + available * (extension - .5 * (1 - extension))
    - deathForearmClearance;
   placeNativeArm(upper, forearm, wrist, frame.localToWorld(target.clone()),
    new Vector3(0, -1, 0).applyQuaternion(bodyRotation), update);
   const axis = point(ends.tip).sub(point(ends.butt)).normalize();
   rotateNativeBoneWorld(wrist, new Quaternion().setFromUnitVectors(axis, forward), update);
   if (request.action === 'death' && deathRise > 0) {
    // The shaft keeps its direction while the wrist rolls its real grip away
    // from the elbow. Otherwise the curled forearm can cross the held shaft.
    const gripFrame = nativePropFrame(mesh, pose.wristJoint, this.fit.encoding, frame);
    const shaft = new Vector3(...pose.axis).transformDirection(gripFrame).transformDirection(frame.matrixWorld);
    const wristPoint = wrist.getWorldPosition(new Vector3());
    const gripOffset = new Vector3(...record.source.binding.rigidEquipment!.parts[0].grip)
     .applyMatrix4(gripFrame).applyMatrix4(frame.matrixWorld).sub(wristPoint);
    gripOffset.addScaledVector(shaft, -gripOffset.dot(shaft));
    const awayFromElbow = wristPoint.clone().sub(forearm.getWorldPosition(new Vector3()));
    awayFromElbow.addScaledVector(shaft, -awayFromElbow.dot(shaft));
    if (gripOffset.lengthSq() > 1e-12 && awayFromElbow.lengthSq() > 1e-12) {
     gripOffset.normalize(); awayFromElbow.normalize();
     const roll = Math.atan2(shaft.dot(gripOffset.clone().cross(awayFromElbow)), gripOffset.dot(awayFromElbow));
     const blend = deathRise * deathRise * (3 - 2 * deathRise);
     rotateNativeBoneWorld(wrist, new Quaternion().setFromAxisAngle(shaft, roll * blend), update);
    }
   }
   const fitted = nativePropFrame(mesh, pose.wristJoint, this.fit.encoding, frame);
   const sourceAxis = new Vector3().fromArray(pose.axis);
   const origin = new Vector3(...record.source.binding.rigidEquipment!.parts[0].grip);
   let correction = 0;
   for (const section of ends.sections) {
    const start = origin.clone().addScaledVector(sourceAxis, section.from).applyMatrix4(fitted);
    const end = origin.clone().addScaledVector(sourceAxis, section.to).applyMatrix4(fitted);
    const radius = section.radius * radiusScale;
    const gap = Math.max(body.min.y - Math.max(start.y, end.y), Math.min(start.y, end.y) - body.max.y,
     body.min.z - Math.max(start.z, end.z), Math.min(start.z, end.z) - body.max.z, 0);
    const span = start.distanceTo(end);
    const blend = Math.max(0, Math.min(1, (gap - radius) / Math.max(span, 1e-6)));
    const relevance = 1 - blend * blend * (3 - 2 * blend);
    correction = Math.max(correction, Math.max(0, Math.max(start.x, end.x) + radius - lateralLimit) * relevance);
   }
   target.x -= correction;
  }
 }
 poseHair() {
  for (const record of this.records.values()) record.hairRig?.pose();
 }

 private restoreMask() {
  if (this.originalBodyMaterial) this.fit.mesh.material = this.originalBodyMaterial;
  this.originalBodyMaterial = null;
  this.coverageMaterials.forEach(material => material.dispose());
  this.coverageMaterials = [];
  this.fit.mesh.geometry = this.fit.sourceGeometry;
  if (this.mask) {
   this.mask.dispose();
   this.mask = null;
  }
 }

 private remove(id: string) {
  const record = this.records.get(id);
  if (!record) return;
  record.hairRig?.dispose();
  record.group.removeFromParent();
  const materials = new Set<Material>();
  for (const {mesh} of record.parts) {
   mesh.geometry.dispose();
   for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) materials.add(material);
  }
  // Material.dispose does not dispose its texture maps; cached source maps are shared.
  for (const material of materials) material.dispose();
  this.records.delete(id);
  this.fit.modules.delete(id);
 }

 clear() {
  this.encounterBodyEnvelope = undefined;
  this.frames.forEach(frame => frame.removeFromParent());
  this.frames = [];
  for (const id of [...this.records.keys()]) this.remove(id);
  this.restoreMask();
 }

 snapshot() {
  return {
   bindings: [...this.records.values()].map(record => ({
    id: record.source.asset.id, ...record.source.asset.metadata!.nativeBinding,
    ...(record.hairRig ? {hairRig: record.hairRig.inspect()} : {}),
    ...(record.source.binding.materialPolicy ? {
     materialPolicy: {...record.source.binding.materialPolicy},
     meshes: record.parts.map(part => ({mesh: part.mesh.name, start: part.start, count: part.count})),
    } : {}),
   })),
   fitRuns: this.fitRuns, lastFitMilliseconds: this.lastFitMilliseconds,
  };
 }
}
