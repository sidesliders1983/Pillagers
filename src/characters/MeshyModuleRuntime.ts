import {
 BufferAttribute, Color, Group, Material, Matrix3, Matrix4, Mesh,
 MeshStandardMaterial, Quaternion, SkinnedMesh, Vector3,
} from 'three';
import type {GLTF} from 'three/addons/loaders/GLTFLoader.js';
import {MeshyBodyFitAdapter, anchorPoint} from './MeshyBodyFitAdapter';
import {ModuleBindingV2} from './BodyFitAdapter';
import {fitNativeHeadwear} from './NativeHeadwearFit';
import {NativeHairRig} from './NativeHairRig';
import {maskedBodyGeometry} from './BodyCoverage';
import {sewModuleOpenings, weldModuleOpeningCorners} from './ModuleRims';
import {CharacterAsset, assetMeasurement} from './CharacterAssets';
import {HumanProfile} from './UniversalHumanProfile';
import {validatePreparedOutfit, preparedCoverage, preparedCoverageMaterial, preparedModuleCoverage, preparedNeckMaterial} from './PreparedNativeOutfit';

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

 constructor(readonly fit: MeshyBodyFitAdapter) {}

 install(sources: NativeModuleSource[], profile: HumanProfile) {
  for (const source of sources) validateNativeModule(source, this.fit);
  fail(new Set(sources.map(source => source.asset.id)).size === sources.length,
   'Native module IDs must be unique');
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
  const started = performance.now();
  for (const [id, record] of [...this.records]) {
   if (!nativeModuleEligible(record.source, profile)) this.remove(id);
  }
  this.frames.forEach(frame => frame.removeFromParent());
  this.frames = [];
  const inverseEncoding = this.fit.encoding.clone().invert();
  for (const record of this.records.values()) {
   if (!record.source.binding.dependency) {
    for (const part of record.parts) this.fitPart(record, part, inverseEncoding, profile);
   }
  }
  this.fit.rootForModulesUpdate();
  const garments = [...this.records.values()].filter(record => record.source.asset.type === 'garment')
   .flatMap(record => record.parts.map(part => part.mesh).filter((mesh): mesh is SkinnedMesh => (mesh as SkinnedMesh).isSkinnedMesh));
  const backEquipment = [...this.records.values()].flatMap(record => record.parts
   .filter(part => record.source.binding.rigidEquipment?.parts.some(binding =>
    binding.mesh === part.mesh.name && binding.socket === 'socket_back'))
   .map(part => part.mesh as SkinnedMesh));
  for (const record of this.records.values()) record.hairRig?.configureClearance([...garments, ...backEquipment]);
  this.poseHair();
  this.fit.rootForModulesUpdate();
  const hair = [...this.records.values()].filter(record => record.source.asset.type === 'hair')
   .flatMap(record => record.parts.map(part => part.mesh).filter((mesh): mesh is SkinnedMesh => (mesh as SkinnedMesh).isSkinnedMesh));
  for (const record of this.records.values()) {
   if (record.source.binding.headwearFit) for (const part of record.parts) {
    fitNativeHeadwear(part.mesh as SkinnedMesh, record.source.binding.headwearFit, hair, this.fit);
   }
  }
  for (const [id, record] of [...this.records]) {
   if (record.source.binding.dependency) this.attachDependency(id, record);
  }
  this.restoreMask();
  const prepared = [...this.records.values()].filter(record => record.source.asset.type === 'garment' && record.source.binding.precomputedNative);
  const full = prepared.filter(record => record.source.binding.precomputedNative!.version === 2);
  const footwear = prepared.filter(record => record !== full[0]);
  fail(full.length <= 1 && (!full.length || !footwear.length
   || full[0].source.asset.metadata?.includesFootwear === false
   && footwear.every(record => record.source.asset.metadata?.slot === 'footwear'
    && record.source.binding.precomputedNative!.version === 3)),
   'Prepared full outfits may combine only with explicitly separate footwear');
  if (prepared.length && !full.length) {
   this.mask = preparedModuleCoverage([...this.records.values()].map(record => record.source), this.fit);
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
   this.fitRuns++;
   this.lastFitMilliseconds = performance.now() - started;
   return;
  }
  if (prepared.length) {
   this.mask = preparedCoverage(full[0].source, this.fit, footwear.map(record => record.source));
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
   this.fitRuns++;
   this.lastFitMilliseconds = performance.now() - started;
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
  this.fitRuns++;
  this.lastFitMilliseconds = performance.now() - started;
 }

 private gripArm: {joint: number; rotation: Quaternion}[] = [];

 /** Apply one carry layer over the original animation; equipment changes restore its saved arm. */
 poseEquipmentGrips(
  animationRotations: ReadonlyMap<import('three').Bone, Quaternion>,
  restorePrevious = false,
  enabled = true,
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
   const pose = record.source.binding.rigidEquipment?.gripPose;
   if (!pose) continue;
   for (const [joint, rotation, blend] of [
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
