import {Color,Group,Vector3} from 'three';
import {FjordWaterConfig,fjordWaterConfig} from '../config/FjordWaterConfig';
import type {WorldLighting} from '../core/WorldLighting';
import {WaterPlane} from '../vendor/boona13-water/WaterPlane';
import {WaterMask} from '../vendor/boona13-water/WaterMask';
import {shoreAt,surfaceHeightAt} from './Terrain';
/** Actual rendered terrain height, shared with movement and shoreline rendering. */
export function waterDepthAt(x:number,z:number,level=fjordWaterConfig.level){
 if(![x,z,level].every(Number.isFinite))throw new RangeError('Water depth requires finite coordinates and water level.');
 return level-surfaceHeightAt(x,z);
}
/** Pillagers adapter for the pinned MIT water source. Its GLSL is unchanged. */
export class FjordWater {
 readonly mesh=new Group();
 private readonly source:WaterPlane;
 private readonly mask:WaterMask;
 private readonly deep:Color;
 private readonly shallow:Color;
 private readonly sky=new Color();
 private readonly skyHigh=new Color();
 private readonly sunDirection=new Vector3();
 constructor(readonly config:FjordWaterConfig={...fjordWaterConfig}){
  const low=config.quality==='low';
  this.mask=new WaterMask(low?256:512,config.size);
  // The source height texture adds to surface elevation, rather than representing
  // bathymetry. Keep its flat default for a level fjord; encode real depth in its mask.
  const texture=this.mask.getTexture(),data=texture.image.data as Float32Array,res=this.mask.resolution;
  for(let z=0;z<res;z++)for(let x=0;x<res;x++){
   const depth=waterDepthAt((x+.5)/res*config.size-config.size/2,(z+.5)/res*config.size-config.size/2,config.level);
   const v=Math.max(0,Math.min(1,(depth+.03)/(config.shallowDepth+.03)));
   const i=(z*res+x)*4;data[i]=data[i+1]=data[i+2]=v;data[i+3]=1;
  }
  texture.needsUpdate=true;
  this.deep=new Color(config.deep).convertLinearToSRGB();this.shallow=new Color(config.shallow).convertLinearToSRGB();
  this.source=new WaterPlane({size:config.size,segments:low?config.lowSegments:config.standardSegments,
   mask:this.mask,surfaceOffset:0,deepColor:this.deep,shallowColor:this.shallow});
  this.source.mesh.position.y=config.level;
  this.source.mesh.name='Sourced fjord water (boona13)';this.mesh.add(this.source.mesh);
  this.source.setFlowSpeed(config.speed);this.source.setRippleBoost(config.normalStrength);
  this.source.setSpecular(config.specularPower,config.specularIntensity);
  this.source.setReflectionStrength(config.reflectionStrength);this.source.setShoreGlow(config.shoreGlow);this.source.setOpacity(config.opacity);
  // Reuse upstream intersection foam. Put centres inland so only a narrow,
  // low-strength fringe of each existing foam field touches water.
  const count=48,spacing=116/(count-1),radius=spacing+config.foamWidth,foam=new Float32Array(count*3);
  for(let i=0;i<count;i++){
   const x=-58+i*spacing;let wet=shoreAt(x)-2,dry=shoreAt(x)+4;
   for(let j=0;j<20;j++){const z=(wet+dry)/2;if(waterDepthAt(x,z,config.level)>0)wet=z;else dry=z;}
   foam.set([x,(wet+dry)/2+radius-config.foamWidth,radius],i*3);
  }
  this.source.setFoamSources(foam,count);
 }
 update(time:number,lighting?:WorldLighting){
  this.source.update(time);
  if(lighting){
   const gain=lighting.mode==='night'?this.config.nightTint:1;
   this.source.setColors(this.deep.clone().multiplyScalar(gain),this.shallow.clone().multiplyScalar(gain));
   this.sky.copy(lighting.fog.color).convertLinearToSRGB().multiplyScalar(lighting.mode==='night'?.65:.55);
   this.skyHigh.copy(this.sky).multiplyScalar(1.25);
   this.source.setSkyColors(this.sky,this.skyHigh);
   // Upstream expects surface-to-light direction, not an absolute position.
   this.sunDirection.copy(lighting.directional.position).sub(lighting.directional.target.position);
   this.source.setSunDirection(this.sunDirection);
  }
 }
 dispose(){this.source.dispose();this.mask.dispose();}
}
