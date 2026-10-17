import {
 AnimationAction, AnimationMixer, Bone, Box3, Group, LoopOnce, LoopRepeat, Material,
 Mesh, MeshStandardMaterial, Color, Object3D, SkinnedMesh, Vector3, Quaternion,
} from 'three';
import {GLTF, GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {clone} from 'three/addons/utils/SkeletonUtils.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {assetDigest} from './AssetDigest';
import {MeshyModuleRuntime,NativeModuleSource,nativeModuleEligible} from './MeshyModuleRuntime';
import {ModuleBindingV2, NativeBodyIdentity, NativeBodySource} from './BodyFitAdapter';
import {meshyRigSignature} from './MeshyNativeRig';
import {resolveCharacterPresentation,parseCharacterPresentation,CharacterPresentation} from './CharacterPresentation';
import {characterAsset,characterAssetURL,assetMeasurement} from './CharacterAssets';
import {MeshyBodyFitAdapter} from './MeshyBodyFitAdapter';
import {CharacterDNA, parseCharacterDNA} from './CharacterDNA';
import {generatePhenotype} from './generatePhenotype';
import {SoftBodySpring} from '../character-lab/SoftBodySpring';
import {meshyHumanAssetIdentity} from './MeshyHumanAssetIdentity';
import {humanExtraAnimations} from './HumanExtraAnimations';
import {applyMeshyProportions,meshyBoneProportion} from './MeshyHumanDynamics';
import {HumanProfile, universalHumanProfile} from './UniversalHumanProfile';
// One current exact snapshot per live binding, shared weakly across residents.
// Comparing complete JSON detects in-place edits without retaining its large cages in every human key.
const bindingDependencies = new WeakMap<ModuleBindingV2, { json: string; revision: number }>();
function bindingDependencyRevision(binding: ModuleBindingV2) {
 const json = JSON.stringify(binding), previous = bindingDependencies.get(binding);
 if (previous?.json === json) return previous.revision;
 const revision = (previous?.revision ?? 0) + 1;
 bindingDependencies.set(binding, { json, revision });
 return revision;
}
export const meshyAnimationClips={
 Idle:'Idle_02',Walk:'Walking',Run:'Running',Attack:'Attack',
 Death:'Fall_Dead_from_Abdominal_Injury',InjuredWalk:'Unsteady_Walk',Talk:'Talk_Passionately',
 Listen:'Listening_Gesture',Farm:'Pull_Radish',Doze:'Sit_and_Doze_Off',
} as const;
export type MeshyAnimation=keyof typeof meshyAnimationClips;
export const meshyOneShotClips=new Set<string>(['Attack','Fall_Dead_from_Abdominal_Injury']);
/** Validate staged URLs and freeze the declared identities before any bytes are loaded. */
export function validateMeshyBodySource(source: NativeBodySource): NativeBodySource {
 const hash = (value: unknown) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
 const localPath = (value: unknown, extension: string) => {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')
   || /[?#\\\u0000-\u001f]/.test(value)) return false;
  try {
   const decoded = decodeURIComponent(value);
   return !/[?#\\\u0000-\u001f]/.test(decoded) && !decoded.startsWith('//')
    && !decoded.split('/').some(part => part === '.' || part === '..')
    && decoded.endsWith(extension);
  } catch { return false; }
 };
 if (!source || source.id !== 'body/meshy-human' || source.reviewOnly !== true
  || source.rigSignature !== meshyRigSignature || !Array.isArray(source.lods)
  || source.lods.length !== 3 || new Set(source.lods.map(value => value.lod)).size !== 3
  || source.lods.some(value => ![0, 1, 2].includes(value.lod)
   || !localPath(value.path, '.glb') || !hash(value.sha256))
  || !source.provenance || !localPath(source.provenance.path, '.json')
  || !hash(source.provenance.sha256)) {
  throw new Error('Invalid review-only Meshy body source descriptor');
 }
 return Object.freeze({...source,
  lods: Object.freeze(source.lods.map(value => Object.freeze({...value}))),
  provenance: Object.freeze({...source.provenance}),
 });
}
export interface MeshyHumanFactoryOptions {bodySource?: NativeBodySource;}

/** Cached source geometry and clips; each resident owns bones, materials and mixer. */
export class MeshyHumanFactory {
 private sources = new Map<number, Promise<GLTF>>();
 private extraAnimations?: Promise<GLTF>;
 private modules = new Map<string, Promise<NativeModuleSource>>();
 private loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
 private readonly bodySource?: NativeBodySource;
 private provenanceVerified?: Promise<void>;

 constructor(
  private load: (url: string) => Promise<GLTF> = url => this.loadVerified(url),
  private loadBinding: (url: string) => Promise<ArrayBuffer> = async url => {
   const response = await fetch(url);
   if (!response.ok) throw new Error('Could not load Meshy sidecar: ' + url);
   return response.arrayBuffer();
  },
  options: MeshyHumanFactoryOptions = {},
 ) {
  this.bodySource = options.bodySource && validateMeshyBodySource(options.bodySource);
 }

 private bodyIdentity(lod: number): NativeBodyIdentity {
  if (!this.bodySource) {
   return {id: 'body/meshy-human', sha256: meshyHumanAssetIdentity[lod].sha256,
    lod, rigSignature: meshyRigSignature};
  }
  const source = this.bodySource.lods.find(value => value.lod === lod)!;
  return {id: this.bodySource.id, ...source, rigSignature: this.bodySource.rigSignature,
   provenance: this.bodySource.provenance, reviewOnly: true};
 }

 private verifyBodyProvenance() {
  const provenance = this.bodySource?.provenance;
  if (!provenance) return Promise.resolve();
  if (!this.provenanceVerified) {
   this.provenanceVerified = this.loadBinding(provenance.path + '?v=' + provenance.sha256.slice(0, 12))
    .then(async bytes => {
     if (await assetDigest(bytes) !== provenance.sha256) {
      throw new Error('Review body provenance bytes differ from the frozen identity');
     }
    }).catch(error => {
     this.provenanceVerified = undefined;
     throw error;
    });
  }
  return this.provenanceVerified;
 }

 private async loadVerified(url: string): Promise<GLTF> {
  const path = url.split('?')[0];
  const expected = path === humanExtraAnimations.path ? humanExtraAnimations.sha256 :
   this.bodySource?.lods.find(asset => asset.path === path)?.sha256 ??
   meshyHumanAssetIdentity.find(asset => asset.path === path)?.sha256 ?? assetMeasurement(path).sha256;
  const response = await fetch(url);
  if (!response.ok) throw new Error('Could not load Meshy asset: ' + path);
  const bytes = await response.arrayBuffer();
  if (await assetDigest(bytes) !== expected)
   throw new Error('Meshy asset bytes differ from the frozen identity: ' + path);
  const source = await this.loader.parseAsync(bytes, '');
  if (meshyHumanAssetIdentity.some(asset => asset.path === path)) {
   try {
    this.extraAnimations ??= this.loadVerified(humanExtraAnimations.path +
     '?v=' + humanExtraAnimations.sha256.slice(0, 12)).catch(error => {
      this.extraAnimations = undefined;
      throw error;
     });
    const extra = await this.extraAnimations;
    for (const clip of extra.animations) {
     for (const track of clip.tracks) {
      const name = track.name.slice(0, track.name.lastIndexOf('.'));
      if (!source.scene.getObjectByName(name))
       throw new Error('Additional animation target absent from native body: ' + name);
     }
    }
    source.animations.push(...extra.animations.map(clip => clip.clone()));
   } catch (error) {
    // A missing extension must not discard the verified native body or its original clips.
    source.scene.userData.animationExtensionError = String(error);
   }
  }
  return source;
 }
 async create(input: CharacterDNA, lod = 0, profile?: HumanProfile,
  presentation: unknown = {hair: 'none', beard: 'none', outfit: 'none', equipment: 'none'}) {
  if (![0, 1, 2].includes(lod)) throw new Error('Invalid Meshy human LOD');
  const dna = parseCharacterDNA(input);
  const identity = this.bodyIdentity(lod);
  const selected = resolveCharacterPresentation(dna, presentation, identity);
  await this.verifyBodyProvenance();
  let source = this.sources.get(lod);
  if (!source) {
   const path = identity.path ?? meshyHumanAssetIdentity[lod].path;
   source = this.load(path + '?v=' + identity.sha256.slice(0, 12)).catch(error => {
    this.sources.delete(lod);
    throw error;
   });
   this.sources.set(lod, source);
  }
  const model = new MeshyHuman(await source, dna, lod,
   {...(profile ?? selected.profile), appearance: selected.profile.appearance}, identity);
  try {
   await this.equip(model, selected.presentation);
   return model;
  } catch (error) {
   model.dispose();
   throw error;
  }
 }

 async equip(model: MeshyHuman, value: unknown) {
  const identity = this.bodyIdentity(model.lod);
  if (model.fit.body.sha256 !== identity.sha256 || model.fit.body.id !== identity.id
   || model.fit.body.reviewOnly !== identity.reviewOnly) {
   throw new Error('This factory does not own the selected body source');
  }
  const request = ++model.equipRevision;
  const selected = resolveCharacterPresentation(model.dna, value, model.fit.body);
  const ids = [selected.hairId, selected.beardId, selected.headwearId, ...selected.garmentIds, selected.equipmentId]
   .filter((id): id is string => !!id);
  const sources = await Promise.all(ids.map(id => {
   let promise = this.modules.get(id);
   if (!promise) {
    const asset = characterAsset(id);
    const binding = asset.metadata?.nativeBinding;
    if (!binding) throw new Error('This module has no native Meshy binding');
    promise = Promise.all([
     this.load(characterAssetURL(id, model.lod)),
     this.loadBinding(binding.path + '?v=' + binding.sha256.slice(0, 12)),
    ]).then(async ([source, bytes]) => {
     if (await assetDigest(bytes) !== binding.sha256) {
      throw new Error('Stale native module binding bytes: ' + id);
     }
     return {asset, source, binding: JSON.parse(new TextDecoder().decode(bytes)) as ModuleBindingV2};
    }).catch(error => {
     this.modules.delete(id);
     throw error;
    });
    this.modules.set(id, promise);
   }
   return promise;
  }));
  if (request !== model.equipRevision || model.isDisposed) return;
  model.setNativeModules(sources, selected.presentation, selected.profile.appearance);
 }

 async createWorld(dna: CharacterDNA, profile?: HumanProfile) {
  if (this.bodySource) throw new Error('A review-only body cannot create a world resident');
  return this.create(dna, 2, profile);
 }
}
export class MeshyHuman {
 readonly fit:MeshyBodyFitAdapter;readonly modules:MeshyModuleRuntime;dna!:CharacterDNA;equipRevision=0;
 get isDisposed(){return this.disposed;}
 private nativeSources: NativeModuleSource[] = [];
 private lastNeutralFit?: string;
 private normalizedBody?: string;
 private dependencyIds = new WeakMap<object, number>();
 private nextDependencyId = 0;
 private fitRetained = false;
 private dependencyId(value: object) {
  let id = this.dependencyIds.get(value);
  if (id === undefined) { id = ++this.nextDependencyId; this.dependencyIds.set(value, id); }
  return id;
 }
 private geometryDependencies(geometry: import('three').BufferGeometry) {
  const attribute = (value: import('three').BufferAttribute | import('three').InterleavedBufferAttribute) =>
   [this.dependencyId(value), 'data' in value ? value.data.version : value.version, value.count, value.itemSize];
  return [this.dependencyId(geometry), geometry.index && attribute(geometry.index),
   Object.entries(geometry.attributes).map(([name, value]) => [name, attribute(value)]),
   Object.entries(geometry.morphAttributes).map(([name, values]) => [name, values?.map(attribute)])];
 }
 /** One last-result key per human. Full binding data detects even in-place coverage edits.
  * Geometry identity/version, native rig, scale and exact neutral bone factors are required;
  * age/heritage/name metadata alone is not a neutral fitting input. Pose shaping is still applied every time. */
 private bodyFitDependencies(dna: CharacterDNA, profile: HumanProfile) {
  // Heritage is normalized again by the existing parser and can drift by one ULP.
  // It does not enter neutral body fitting: its skin output is updated every call,
  // and installed hair/beard colour is guarded separately below. Names are metadata.
  const {age: _age, heritage: _heritage, naming: _naming, ...identity} = dna;
  return [identity, this.fit.version, this.fit.body, this.fit.encoding.elements,
   this.baseHeight, this.basePosition.toArray(), this.geometryDependencies(this.fit.sourceGeometry),
   this.fit.mesh.bindMatrix.elements, this.fit.mesh.position.toArray(),
   this.fit.mesh.quaternion.toArray(), this.fit.mesh.scale.toArray(), this.fit.mesh.morphTargetInfluences,
   this.fit.nativeSkeleton.boneInverses.map(matrix => matrix.elements),
   this.bones.map(bone => [this.dependencyId(bone), bone.name, this.rest.get(bone),
    meshyBoneProportion(bone.name, profile)]),
   profile.height * (1 - .35 * profile.weights.Child), profile.appearanceFit,
   this.root.scale.toArray(), this.body.position.toArray(), this.body.quaternion.toArray(), this.body.scale.toArray()];
 }
 private neutralFitSignature(dna: CharacterDNA, profile: HumanProfile) {
  const meshes = (root: Object3D) => {
   const values: unknown[] = [];
   root.traverse(node => {
    if ((node as Mesh).isMesh) values.push([node.uuid, this.geometryDependencies((node as Mesh).geometry),
     node.position.toArray(), node.quaternion.toArray(), node.scale.toArray()]);
   });
   return values;
  };
  return JSON.stringify([this.bodyFitDependencies(dna, profile),
   this.nativeSources.map(source => [source.asset, this.dependencyId(source.binding),
    bindingDependencyRevision(source.binding), meshes(source.source.scene), nativeModuleEligible(source, profile)]),
   this.nativeSources.some(source => source.asset.type === 'hair' || source.asset.type === 'beard')
    ? profile.appearance.color : null,
   this.fit.revision, this.modules.fitRuns, this.geometryDependencies(this.fit.mesh.geometry),
   [...this.fit.modules].map(([id, group]) => [id, group.uuid, group.position.toArray(),
    group.quaternion.toArray(), group.scale.toArray(), meshes(group)]),
   [...this.fit.sockets].map(([id, socket]) => [id, socket.position.toArray(),
    socket.quaternion.toArray(), socket.scale.toArray()])]);
 }
 get lastFitRetained() { return this.fitRetained; }
 /** Same cached-bound policy as ordinary animation frames; actual shape changes invalidate it. */
 get boundsShapeSignature() {
  return JSON.stringify([this.fit.revision, this.modules.fitRuns, this.nativeNeutral,
   this.profile.weights, this.profile.motion.stride, this.body.scale.toArray(), this.body.position.toArray()]);
 }
 setNativeModules(sources: NativeModuleSource[], presentation: CharacterPresentation,
  appearance: HumanProfile['appearance']) {
  this.lastNeutralFit = undefined;
  this.profile = {...this.profile, appearance};
  const pose = this.bones.map(bone => ({bone, position: bone.position.clone(),
   rotation: bone.quaternion.clone(), scale: bone.scale.clone()}));
  try {
   for (const bone of this.bones) {
    const rest = this.rest.get(bone)!;
    bone.position.copy(rest.position);
    bone.quaternion.copy(rest.rotation);
    bone.scale.copy(rest.scale);
   }
   applyMeshyProportions(this.bones, this.scales, this.profile);
   this.fit.refit();
   this.modules.install(sources, this.profile);
  } finally {
   for (const saved of pose) {
    saved.bone.position.copy(saved.position);
    saved.bone.quaternion.copy(saved.rotation);
    saved.bone.scale.copy(saved.scale);
   }
   this.root.updateMatrixWorld(true);
   this.fit.nativeSkeleton.update();
  }
  if (!this.nativeNeutral) this.modules.poseEquipmentGrips(this.animationRotations, true, this.carryPoseEnabled);
  this.modules.poseHair();
  this.nativeSources = sources;
  this.root.userData.presentation = presentation;
  this.updateSelectedAssets();
  // Installing modules cannot validate a body that was externally scaled/edited
  // after height normalization. Such a frame must take the complete path next time.
  if (!this.nativeNeutral && this.normalizedBody === JSON.stringify(this.bodyFitDependencies(this.dna, this.profile)))
   this.lastNeutralFit = this.neutralFitSignature(this.dna, this.profile);
 }
 private updateSelectedAssets() {
  const installed = this.nativeSources.filter(source => this.fit.modules.has(source.asset.id));
  const assetOfType = (type: string) => installed.find(source => source.asset.type === type)?.asset.id ?? null;
  const garmentAt = (...slots: string[]) => installed.find(source =>
   source.asset.type === 'garment' && slots.includes(source.asset.metadata?.slot ?? ''))?.asset.id ?? null;
  this.root.userData.selectedAssets = {
   hair: assetOfType('hair'), beard: assetOfType('beard'), headwear: assetOfType('headwear'),
   outfit: garmentAt('full'), shoes: garmentAt('footwear'),
   trousers: garmentAt('lower'), top: garmentAt('upper', 'over'),
   equipment: assetOfType('equipment'),
  };
 }
 readonly root=new Group();readonly clips:GLTF['animations'];
 private belly=new SoftBodySpring(55,9);private elapsed=0;
 private bones:Bone[]=[];private rest=new Map<Bone,{position:Vector3;rotation:import('three').Quaternion;scale:Vector3}>();private scales=new Map<Bone,Vector3>();private profile!:HumanProfile;private basePosition=new Vector3();
 state:MeshyAnimation='Idle';private body:Object3D;private mixer:AnimationMixer;
 private skinUniform={value:new Color()};
 private skinTintStrength = {value: .2};
 private playbackRateOverride: number | null = null;
 private nativeNeutral = false;
 private animationRotations = new Map<Bone, Quaternion>();
 private action:AnimationAction|null=null;private materials:Material[]=[];private baseHeight:number;private disposed=false;
 constructor(source:GLTF,dna:CharacterDNA,readonly lod:number,profile?:HumanProfile,identity?:NativeBodyIdentity){
  this.body=clone(source.scene);this.root.add(this.body);this.clips=source.animations;
  this.body.updateMatrixWorld(true);
  const bounds=new Box3().setFromObject(this.body),centre=bounds.getCenter(new Vector3());
  const frame=this.body.userData.pillagersFrame as {height:number;offset:number[]}|undefined;
  this.baseHeight=frame?.height??bounds.max.y-bounds.min.y;
  if(!Number.isFinite(this.baseHeight)||this.baseHeight<=0)throw new Error('Human has invalid bounds');
  this.body.position.add(frame?new Vector3().fromArray(frame.offset):new Vector3(-centre.x,-bounds.min.y,-centre.z));
  this.basePosition.copy(this.body.position);
  this.body.traverse(node=>{
   if ((node as Bone).isBone) {
    const bone = node as Bone;
    this.bones.push(bone);
    this.rest.set(bone, {
     position: bone.position.clone(), rotation: bone.quaternion.clone(), scale: bone.scale.clone(),
    });
    this.scales.set(bone, bone.scale.clone());
    this.animationRotations.set(bone, bone.quaternion.clone());
   }
   if((node as Mesh).isMesh){
    const mesh=node as Mesh;mesh.castShadow=true;mesh.receiveShadow=true;
    const copy=(material:Material)=>{const result=material.clone();this.materials.push(result);
     if((result as MeshStandardMaterial).isMeshStandardMaterial){
      result.onBeforeCompile=shader=>{
       shader.uniforms.pillagersSkinTone=this.skinUniform;
       shader.uniforms.pillagersSkinTintStrength=this.skinTintStrength;
       shader.fragmentShader='uniform vec3 pillagersSkinTone;\nuniform float pillagersSkinTintStrength;\n'+shader.fragmentShader;
       shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
#ifdef USE_MAP
 vec3 sourceSkin=sRGBTransferOETF(vec4(sampledDiffuseColor.rgb,1.0)).rgb;
 if(sourceSkin.r>=60.0/255.0 && sourceSkin.r>=sourceSkin.g*1.18 && sourceSkin.r>=sourceSkin.b*1.25){
  float skinShade=clamp(sourceSkin.r/(205.0/255.0),0.55,1.12);
  vec3 targetSkin=sRGBTransferOETF(vec4(pillagersSkinTone,1.0)).rgb;
  vec3 blendedSkin=mix(sourceSkin,min(vec3(1.0),targetSkin*skinShade),pillagersSkinTintStrength);
  diffuseColor.rgb=diffuse*sRGBTransferEOTF(vec4(blendedSkin,1.0)).rgb;
 }
#endif`);
      };
      result.customProgramCacheKey=()=> 'pillagers-meshy-skin-review-v2';
     }
     return result;};
    mesh.material=Array.isArray(mesh.material)?mesh.material.map(copy):copy(mesh.material);
   }
  });
  this.mixer=new AnimationMixer(this.body);
  let skin:SkinnedMesh|undefined;this.body.traverse(node=>{if((node as SkinnedMesh).isSkinnedMesh){if(skin)throw new Error('Meshy Human requires one native body skin');skin=node as SkinnedMesh;}});
  if(!skin)throw new Error('Meshy Human is missing its native skin');
  // Capture bind surfaces before height normalization and DNA proportions.
  const offset=this.body.position.clone();this.body.position.set(0,0,0);
  this.fit=new MeshyBodyFitAdapter(skin,this.root,this.body as Group,lod,identity);this.body.position.copy(offset);
  this.modules=new MeshyModuleRuntime(this.fit);this.fit.moduleSnapshot=()=>this.modules.snapshot();
  this.root.userData.bodySource={...this.fit.body,source:'meshy'};
  this.root.userData.capabilities={morphology:true,appearance:true,fitSizes:false,garmentSockets:true};
  this.applyDNA(dna,profile);this.setAnimation('Idle');
 }
 /** forceRefit retains the complete original fitting path for verification and fallback. */
 applyDNA(input:CharacterDNA,override?:HumanProfile,options:{forceRefit?:boolean}={}){
  const wasNativeNeutral = this.nativeNeutral;
  this.nativeNeutral = false;
  this.root.userData.nativeNeutralPose = false;
  this.skinTintStrength.value = .2;
  const dna=parseCharacterDNA(input);this.dna=dna;this.equipRevision++;
  const presentation=this.root.userData.presentation,appearance=presentation?resolveCharacterPresentation(dna,presentation,this.fit.body).profile.appearance:undefined,profile={...(override??universalHumanProfile(dna)),...(appearance?{appearance}:{})};
  const retain = !options.forceRefit && !wasNativeNeutral && !this.disposed &&
   this.lastNeutralFit === this.neutralFitSignature(dna, profile);
  this.fitRetained = retain;
  const height=profile.height*(1-.35*profile.weights.Child);
  const skinTone=generatePhenotype(dna).skinTone;this.skinUniform.value.set(skinTone);this.root.userData.skinTint={tone:skinTone,strength:.2};
  this.profile = profile;
  this.belly.reset();
  this.elapsed = 0;
  this.root.userData.universalHumanProfile = profile;
  this.mixer.timeScale = this.playbackRateOverride ?? profile.motion.cadence;
  const clip=this.action?.getClip(),time=this.action?.time??0;
  this.mixer.stopAllAction();
  for(const bone of this.bones){const rest=this.rest.get(bone)!;bone.position.copy(rest.position);bone.quaternion.copy(rest.rotation);bone.scale.copy(rest.scale);}
  applyMeshyProportions(this.bones,this.scales,profile);
  if (!retain) {
   // Measure in a neutral local frame, independent of world placement and current animation.
   const parent=this.root.parent,position=this.root.position.clone(),rotation=this.root.quaternion.clone();
   this.root.removeFromParent();this.root.position.set(0,0,0);this.root.quaternion.identity();
   this.body.position.copy(this.basePosition);this.body.scale.setScalar(1);this.root.updateMatrixWorld(true);
   // Clothing masks can hide the feet. Always measure height on the complete source body.
   const maskedGeometry = this.fit.mesh.geometry;
   this.fit.mesh.geometry = this.fit.sourceGeometry;
   let bounds: Box3;
   try { bounds = new Box3().setFromObject(this.fit.mesh, true); }
   finally { this.fit.mesh.geometry = maskedGeometry; }
   const neutralHeight = bounds.max.y - bounds.min.y;
   this.body.scale.setScalar(height/neutralHeight);this.body.position.y-=bounds.min.y*height/neutralHeight;
   this.root.position.copy(position);this.root.quaternion.copy(rotation);if(parent)parent.add(this.root);
   this.fit.refit();this.modules.refit(profile);
  }
  this.updateSelectedAssets();
  if (clip) {
   this.action = this.mixer.clipAction(clip);
   this.action.reset().play();
   this.action.time = time;
   this.mixer.update(0);
   this.captureAnimationRotations();
   this.shapePose();
   this.modules.poseHair();
  }

  this.root.userData.character={seed:dna.seed,state:this.state,lod:this.lod,height};
  if (!retain) {
   this.normalizedBody = JSON.stringify(this.bodyFitDependencies(dna, profile));
   this.lastNeutralFit = this.neutralFitSignature(dna, profile);
  }
  return retain;
 }
 /** Labs use the original GLB speed; world residents use DNA cadence by default. */
 setPlaybackRate(rate: number | null) {
  if (rate !== null && (!Number.isFinite(rate) || rate <= 0)) {
   throw new Error('Playback rate must be positive or null for DNA cadence.');
  }
  this.playbackRateOverride = rate;
  this.mixer.timeScale = rate ?? this.profile.motion.cadence;
 }
 setMovementSpeed(speed:number){this.setAnimation(speed<.03?'Idle':speed<1.4?'Walk':'Run');}
 setAnimation(state:MeshyAnimation){this.playClip(meshyAnimationClips[state],state);}
 playClip(name:string,state:MeshyAnimation='Idle'){
  if (this.nativeNeutral) this.applyDNA(this.dna, this.profile);
  const semantic=Object.entries(meshyAnimationClips).find(([,clip])=>clip===name)?.[0] as MeshyAnimation|undefined;if(semantic)state=semantic;
  const clip=this.clips.find(clip=>clip.name===name);if(!clip)throw new Error('Missing human animation: '+name);
  if(this.action?.getClip()===clip){this.state=state;return;}
  const next=this.mixer.clipAction(clip),once=meshyOneShotClips.has(name);
  next.reset().setLoop(once?LoopOnce:LoopRepeat,once?1:Infinity);next.clampWhenFinished=once;
  next.play();if(this.action)this.action.crossFadeTo(next,.15,false);
  this.action=next;this.state=state;this.root.userData.character.state=state;this.root.userData.clip=name;
 }
 sample(time: number) {
  if (!this.action || !Number.isFinite(time) || time < 0) {
   throw new Error('Invalid animation sample');
  }
  this.mixer.stopAllAction();
  for (const bone of this.bones) bone.quaternion.copy(this.rest.get(bone)!.rotation);
  this.action.reset().play();
  this.action.time = Math.min(time, this.action.getClip().duration);
  this.mixer.update(0);
  this.captureAnimationRotations();
  this.shapePose();
  this.modules.poseHair();
 }
 /** Restore the exact source skeleton and scale for reference views and initial review. */
 sampleNativeNeutral() {
  this.mixer.stopAllAction();
  this.action = null;
  this.nativeNeutral = true;
  this.normalizedBody = undefined;
  this.lastNeutralFit = undefined;
  this.fitRetained = false;
  this.root.userData.nativeNeutralPose = true;
  this.root.userData.nativeNeutralHeight = this.baseHeight;
  this.skinTintStrength.value = 0;
  this.root.userData.skinTint = {...this.root.userData.skinTint, strength: 0};
  this.belly.reset();
  this.elapsed = 0;
  for (const bone of this.bones) {
   const rest = this.rest.get(bone)!;
   bone.position.copy(rest.position);
   bone.quaternion.copy(rest.rotation);
   bone.scale.copy(rest.scale);
  }
  this.body.scale.setScalar(1);
  this.body.position.copy(this.basePosition);
  this.fit.refit();
  this.modules.refit(this.profile);
  this.captureAnimationRotations();
  this.root.userData.clip = 'NativeNeutral';
  this.root.userData.character = {...this.root.userData.character, state: 'NativeNeutral', height: this.baseHeight};
 }
 get animationState(){return {animation:this.nativeNeutral?'NativeNeutral':this.state,time:this.action?.time??0};}
 sampleAnimation(animation:string,time:number){
  if(animation==='NativeNeutral'){
   if(time!==0)throw new Error('Native neutral pose must use time zero');
   this.sampleNativeNeutral();return;
  }
  this.playClip(meshyAnimationClips[animation as MeshyAnimation]??animation);this.sample(time);
 }
 get duration(){return this.action?.getClip().duration??0;}
 private get carryPoseEnabled() {
  return ['Idle_02', 'Walking', 'Running'].includes(this.action?.getClip().name ?? '');
 }
 private shapePose(){
  applyMeshyProportions(this.bones,this.scales,this.profile);
  const moving=this.state==='Walk'||this.state==='Run';
  for(const bone of this.bones){
   if(moving&&/(Arm|ForeArm|UpLeg|Leg)$/.test(bone.name))bone.quaternion.slerp(this.rest.get(bone)!.rotation,1-this.profile.motion.stride);
   if(/Shoulder$/.test(bone.name))bone.rotateZ(this.profile.weights.ShoulderSlope*.3);
   if(/(Arm|UpLeg)$/.test(bone.name))bone.scale.multiplyScalar(1+(bone.name.includes('Left')?1:-1)*this.profile.weights.Asymmetry*.15);
   if(bone.name.endsWith('Spine2'))bone.rotateX(this.profile.weights.Age*.10);
  }
  this.modules.poseEquipmentGrips(this.animationRotations, false, this.carryPoseEnabled);
 }
 private captureAnimationRotations() {
  for (const bone of this.bones) this.animationRotations.get(bone)!.copy(bone.quaternion);
 }
 update(delta: number, _distance?: number) {
  if (this.disposed || this.nativeNeutral) return;
  // The mixer skips unchanged tracks. Restore its last output, then apply DNA shaping once.
  for (const bone of this.bones) bone.quaternion.copy(this.animationRotations.get(bone)!);
  this.mixer.update(delta);
  this.captureAnimationRotations();
  this.shapePose();
  this.modules.poseHair();

  this.elapsed += Math.max(0, delta);
  const moving = this.state === 'Walk' || this.state === 'Run';
  const target = moving
   ? Math.sin(this.elapsed * this.profile.motion.cadence * 8) * this.profile.motion.footfall
   : 0;
  const bounce = this.belly.step(delta, target) * this.profile.weights.Overweight;
  const waist = this.bones.find(bone => bone.name.endsWith('Spine'));
  if (waist) waist.scale.z *= 1 + bounce * .025;
 }
 dispose(){
  if(this.disposed)return;this.disposed=true;this.lastNeutralFit=undefined;this.normalizedBody=undefined;this.mixer.stopAllAction();this.mixer.uncacheRoot(this.body);
  this.modules.clear();this.fit.dispose();
  for(const material of this.materials)material.dispose();
  this.body.traverse(node=>{if((node as SkinnedMesh).isSkinnedMesh)(node as SkinnedMesh).skeleton.dispose();});this.root.clear();
 }
}
export const meshyHumanFactory=new MeshyHumanFactory();


