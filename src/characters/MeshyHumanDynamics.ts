import {Bone,Vector3} from 'three';
import {HumanProfile} from './UniversalHumanProfile';
/** Smooth, rig-specific proportional adaptation; original geometry/textures remain shared. */
export function meshyBoneProportion(name:string,profile:HumanProfile):number|null{
 const child=profile.weights.Child,weight=profile.weights.Overweight-profile.weights.Underweight;
 const build=profile.weights.Powerful-profile.weights.Slight,masculine=profile.weights.Masculine;
 const feminine=profile.weights.Feminine,agile=profile.weights.Agile;
 const role=name.replace(/^mixamorig:?/,'');
 if(role==='Head')return 1+child*.34;
 if(role==='Neck')return 1-child*.08;
 if(role==='Spine')return 1-child*.08+weight*.10+build*.07;
 if(role==='Spine1'||role==='Spine2')return 1-child*.13-feminine*.08+weight*.06+build*.06+masculine*.04-agile*.025;
 if(/Shoulder$/.test(role))return 1-child*.18-feminine*.12+build*.06+masculine*.04;
 if(/(ForeArm|Arm)$/.test(role))return 1-child*.24-feminine*.10+weight*.04+build*.08-agile*.025;
 if(/Hand$/.test(role))return 1-child*.08;
 if(/(UpLeg|Leg)$/.test(role))return 1-child*.18+weight*.035+build*.04+profile.weights.Grounded*.03+profile.weights.LegRatio*.3;
 if(/Foot$/.test(role))return 1-child*.07;
 if(/Hips$/.test(role))return 1;
 return null;
}
export function applyMeshyProportions(bones:Bone[],scales:Map<Bone,Vector3>,profile:HumanProfile){
 const factors=new Map<Bone,number>();
 const factor=(bone:Bone):number=>{
  if(factors.has(bone))return factors.get(bone)!;
  const parent=bone.parent as Bone|null,inherited=parent?.isBone?factor(parent):1;
  const value=meshyBoneProportion(bone.name,profile)??inherited;factors.set(bone,value);return value;
 };
 for(const bone of bones){const parent=bone.parent as Bone|null;bone.scale.copy(scales.get(bone)!).multiplyScalar(factor(bone)/(parent?.isBone?factor(parent):1));}
}

