import {Color,MathUtils} from 'three';
import {groundTreatmentConfig as config} from '../config/GroundTreatmentConfig';
import {buildingDistance,buildings,pathWeight} from './SettlementLayout';
import {seededRandom} from '../config/worldConfig';
/** CPU material fields; height/shore inputs remain owned by the canonical terrain. */
export function groundTreatment(heightAt:(x:number,z:number)=>number,shoreAt:(x:number)=>number,seed=config.seed){
 const random=seededRandom(seed),offsetX=random()*100,offsetZ=random()*100;
 const colors=Object.fromEntries(Object.entries(config.colors).map(([key,value])=>[key,new Color(value)]));
 return (x:number,z:number,target?:Color)=>{
  const height=heightAt(x,z),coast=z-shoreAt(x);
  const slope=Math.hypot(heightAt(x+1,z)-heightAt(x-1,z),heightAt(x,z+1)-heightAt(x,z-1))/2;
  const clearing=Math.exp(-((x-1)**2/175+(z-1)**2/95));
  const foundation=Math.max(...buildings.map(b=>1-MathUtils.smoothstep(buildingDistance(x,z,b),.3,3)));
  const worn=Math.max(pathWeight(x,z),clearing*.5,foundation*.95);
  const shore=1-MathUtils.smoothstep(coast,config.shoreStart,config.shoreEnd);
  const wet=shore*(1-MathUtils.smoothstep(height,-.1,.55));
  const rock=MathUtils.smoothstep(slope,config.rockSlopeStart,config.rockSlopeEnd)*(1-shore)*(1-worn);
  const organic=MathUtils.clamp(.5+.23*Math.sin((x+offsetX)*.13+(z+offsetZ)*.07)+.22*Math.cos((z+offsetZ)*.18-(x+offsetX)*.04),0,1);
  if(target)target.copy(colors.grass).lerp(colors.moss,organic*.75).lerp(colors.rock,rock).lerp(colors.earth,worn*.88).lerp(colors.sand,shore).lerp(colors.wet,wet*.8);
  return {shore,wet,worn,rock,organic};
 };
}
