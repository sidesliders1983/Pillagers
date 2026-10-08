import {AnimationAction, AnimationMixer, Bone, Box3, Group, LoopOnce, LoopRepeat, Material, Mesh, MeshStandardMaterial, Color, Object3D, SkinnedMesh, Vector3} from 'three';
import {GLTF, GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {clone} from 'three/addons/utils/SkeletonUtils.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {CharacterDNA, parseCharacterDNA} from './CharacterDNA';
import {generatePhenotype} from './generatePhenotype';
import {SoftBodySpring} from '../character-lab/SoftBodySpring';
import {meshyHumanAssetIdentity} from './MeshyHumanAssetIdentity';
import {applyMeshyProportions} from './MeshyHumanDynamics';
import {HumanProfile, universalHumanProfile} from './UniversalHumanProfile';
export const meshyAnimationClips={
 Idle:'Idle_02',Walk:'Walking',Run:'Running',Attack:'Attack',
 Death:'Fall_Dead_from_Abdominal_Injury',InjuredWalk:'Unsteady_Walk',Talk:'Talk_Passionately',
 Listen:'Listening_Gesture',Farm:'Pull_Radish',
} as const;
export type MeshyAnimation=keyof typeof meshyAnimationClips;
export const meshyOneShotClips=new Set<string>(['Attack','Fall_Dead_from_Abdominal_Injury']);
/** Cached source geometry and clips; each resident owns bones, materials and mixer. */
export class MeshyHumanFactory {
 private sources=new Map<number,Promise<GLTF>>();
 private loader=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
 constructor(private load:(url:string)=>Promise<GLTF>=url=>this.loader.loadAsync(url)){}
 async create(input:CharacterDNA,lod=0,profile?:HumanProfile){
  if(![0,1,2].includes(lod))throw new Error('Invalid Meshy human LOD');
  const dna=parseCharacterDNA(input);let source=this.sources.get(lod);
  if(!source){source=this.load('/game-assets/human/Human_LOD'+lod+'.glb?v='+meshyHumanAssetIdentity[lod].sha256.slice(0,12)).catch(error=>{this.sources.delete(lod);throw error;});this.sources.set(lod,source);}
  return new MeshyHuman(await source,dna,lod,profile);
 }
 async createWorld(dna:CharacterDNA){return this.create(dna,2);}
}
export class MeshyHuman {
 readonly fit=undefined;
 readonly root=new Group();readonly clips:GLTF['animations'];
 private belly=new SoftBodySpring(55,9);private elapsed=0;
 private bones:Bone[]=[];private rest=new Map<Bone,{position:Vector3;rotation:import('three').Quaternion;scale:Vector3}>();private scales=new Map<Bone,Vector3>();private profile!:HumanProfile;private basePosition=new Vector3();
 state:MeshyAnimation='Idle';private body:Object3D;private mixer:AnimationMixer;
 private skinUniform={value:new Color()};
 private action:AnimationAction|null=null;private materials:Material[]=[];private baseHeight:number;private disposed=false;
 constructor(source:GLTF,dna:CharacterDNA,readonly lod:number,profile?:HumanProfile){
  this.body=clone(source.scene);this.root.add(this.body);this.clips=source.animations;
  this.body.updateMatrixWorld(true);
  const bounds=new Box3().setFromObject(this.body),centre=bounds.getCenter(new Vector3());
  const frame=this.body.userData.pillagersFrame as {height:number;offset:number[]}|undefined;
  this.baseHeight=frame?.height??bounds.max.y-bounds.min.y;
  if(!Number.isFinite(this.baseHeight)||this.baseHeight<=0)throw new Error('Human has invalid bounds');
  this.body.position.add(frame?new Vector3().fromArray(frame.offset):new Vector3(-centre.x,-bounds.min.y,-centre.z));
  this.basePosition.copy(this.body.position);
  this.body.traverse(node=>{
   if((node as Bone).isBone){const bone=node as Bone;this.bones.push(bone);this.rest.set(bone,{position:bone.position.clone(),rotation:bone.quaternion.clone(),scale:bone.scale.clone()});this.scales.set(bone,bone.scale.clone());}
   if((node as Mesh).isMesh){
    const mesh=node as Mesh;mesh.castShadow=true;mesh.receiveShadow=true;
    const copy=(material:Material)=>{const result=material.clone();this.materials.push(result);
     if((result as MeshStandardMaterial).isMeshStandardMaterial){
      result.onBeforeCompile=shader=>{
       shader.uniforms.pillagersSkinTone=this.skinUniform;
       shader.fragmentShader='uniform vec3 pillagersSkinTone;\n'+shader.fragmentShader;
       shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
#ifdef USE_MAP
 vec3 sourceSkin=sRGBTransferOETF(vec4(sampledDiffuseColor.rgb,1.0)).rgb;
 if(sourceSkin.r>=60.0/255.0 && sourceSkin.r>=sourceSkin.g*1.18 && sourceSkin.r>=sourceSkin.b*1.25){
  float skinShade=clamp(sourceSkin.r/(205.0/255.0),0.55,1.12);
  vec3 targetSkin=sRGBTransferOETF(vec4(pillagersSkinTone,1.0)).rgb;
  vec3 blendedSkin=mix(sourceSkin,min(vec3(1.0),targetSkin*skinShade),0.20);
  diffuseColor.rgb=diffuse*sRGBTransferEOTF(vec4(blendedSkin,1.0)).rgb;
 }
#endif`);
      };
      result.customProgramCacheKey=()=> 'pillagers-meshy-skin-20-v1';
     }
     return result;};
    mesh.material=Array.isArray(mesh.material)?mesh.material.map(copy):copy(mesh.material);
   }
  });
  this.mixer=new AnimationMixer(this.body);
  this.root.userData.bodySource={id:'body/meshy-human',source:'meshy',lod};
  this.root.userData.capabilities={morphology:true,appearance:false};
  this.applyDNA(dna,profile);this.setAnimation('Idle');
 }
 applyDNA(input:CharacterDNA,override?:HumanProfile){
  const dna=parseCharacterDNA(input),profile=override??universalHumanProfile(dna);
  const height=profile.height*(1-.35*profile.weights.Child);
  const skinTone=generatePhenotype(dna).skinTone;this.skinUniform.value.set(skinTone);this.root.userData.skinTint={tone:skinTone,strength:.2};
  this.profile=profile;this.belly.reset();this.elapsed=0;this.root.userData.universalHumanProfile=profile;this.mixer.timeScale=profile.motion.cadence;
  const clip=this.action?.getClip(),time=this.action?.time??0;
  this.mixer.stopAllAction();
  for(const bone of this.bones){const rest=this.rest.get(bone)!;bone.position.copy(rest.position);bone.quaternion.copy(rest.rotation);bone.scale.copy(rest.scale);}
  applyMeshyProportions(this.bones,this.scales,profile);
  // Measure in a neutral local frame, independent of world placement and current animation.
  const parent=this.root.parent,position=this.root.position.clone(),rotation=this.root.quaternion.clone();
  this.root.removeFromParent();this.root.position.set(0,0,0);this.root.quaternion.identity();
  this.body.position.copy(this.basePosition);this.body.scale.setScalar(1);this.root.updateMatrixWorld(true);
  const bounds=new Box3().setFromObject(this.body,true),neutralHeight=bounds.max.y-bounds.min.y;
  this.body.scale.setScalar(height/neutralHeight);this.body.position.y-=bounds.min.y*height/neutralHeight;
  this.root.position.copy(position);this.root.quaternion.copy(rotation);if(parent)parent.add(this.root);
  if(clip){this.action=this.mixer.clipAction(clip);this.action.reset().play();this.action.time=time;this.mixer.update(0);this.shapePose();}

  this.root.userData.character={seed:dna.seed,state:this.state,lod:this.lod,height};
 }
 setMovementSpeed(speed:number){this.setAnimation(speed<.03?'Idle':speed<1.4?'Walk':'Run');}
 setAnimation(state:MeshyAnimation){this.playClip(meshyAnimationClips[state],state);}
 playClip(name:string,state:MeshyAnimation='Idle'){
  const semantic=Object.entries(meshyAnimationClips).find(([,clip])=>clip===name)?.[0] as MeshyAnimation|undefined;if(semantic)state=semantic;
  const clip=this.clips.find(clip=>clip.name===name);if(!clip)throw new Error('Missing human animation: '+name);
  if(this.action?.getClip()===clip){this.state=state;return;}
  const next=this.mixer.clipAction(clip),once=meshyOneShotClips.has(name);
  next.reset().setLoop(once?LoopOnce:LoopRepeat,once?1:Infinity);next.clampWhenFinished=once;
  next.play();if(this.action)this.action.crossFadeTo(next,.15,false);
  this.action=next;this.state=state;this.root.userData.character.state=state;this.root.userData.clip=name;
 }
 sample(time:number){
  if(!this.action||!Number.isFinite(time)||time<0)throw new Error('Invalid animation sample');
  this.mixer.stopAllAction();for(const bone of this.bones)bone.quaternion.copy(this.rest.get(bone)!.rotation);this.action.reset().play();
  this.action.time=Math.min(time,this.action.getClip().duration);this.mixer.update(0);this.shapePose();
 }
 get animationState(){return {animation:this.state,time:this.action?.time??0};}
 sampleAnimation(animation:string,time:number){this.playClip(meshyAnimationClips[animation as MeshyAnimation]??animation);this.sample(time);}
 get duration(){return this.action?.getClip().duration??0;}
 private shapePose(){
  applyMeshyProportions(this.bones,this.scales,this.profile);
  const moving=this.state==='Walk'||this.state==='Run';
  for(const bone of this.bones){
   if(moving&&/(Arm|ForeArm|UpLeg|Leg)$/.test(bone.name))bone.quaternion.slerp(this.rest.get(bone)!.rotation,1-this.profile.motion.stride);
   if(/Shoulder$/.test(bone.name))bone.rotateZ(this.profile.weights.ShoulderSlope*.3);
   if(/(Arm|UpLeg)$/.test(bone.name))bone.scale.multiplyScalar(1+(bone.name.includes('Left')?1:-1)*this.profile.weights.Asymmetry*.15);
   if(bone.name.endsWith('Spine2'))bone.rotateX(this.profile.weights.Age*.10);
  }
 }
 update(delta:number,_distance?:number){if(!this.disposed){for(const bone of this.bones)bone.quaternion.copy(this.rest.get(bone)!.rotation);this.mixer.update(delta);this.shapePose();
  this.elapsed+=Math.max(0,delta);const moving=this.state==='Walk'||this.state==='Run';
  const bounce=this.belly.step(delta,moving?Math.sin(this.elapsed*this.profile.motion.cadence*8)*this.profile.motion.footfall:0)*this.profile.weights.Overweight;
  const waist=this.bones.find(bone=>bone.name.endsWith('Spine'));if(waist)waist.scale.z*=1+bounce*.025;}}
 dispose(){
  if(this.disposed)return;this.disposed=true;this.mixer.stopAllAction();this.mixer.uncacheRoot(this.body);
  for(const material of this.materials)material.dispose();
  this.body.traverse(node=>{if((node as SkinnedMesh).isSkinnedMesh)(node as SkinnedMesh).skeleton.dispose();});this.root.clear();
 }
}
export const meshyHumanFactory=new MeshyHumanFactory();


