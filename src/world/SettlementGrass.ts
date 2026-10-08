import {Color,Matrix4,Quaternion,Vector3} from 'three';
import type {Scene} from 'three';
import type {WorldLighting} from '../core/WorldLighting';
import {GrassField} from '../vendor/boona13-grass/GrassField';
import {settlementGrassConfig as config} from '../config/SettlementGrassConfig';
import {seededRandom} from '../config/worldConfig';
import {groundTreatment} from './GroundTreatment';
import {heightAt,shoreAt,surfaceHeightAt} from './Terrain';

/** Uses published GrassField geometry/shaders; only adapts placement and uniforms. */
export class SettlementGrass{
 private readonly source:GrassField;
 private readonly sunDirection=new Vector3();
 readonly mesh;
 constructor(scene:Scene,quality='standard'){
  this.source=new GrassField(scene,{
   groundSize:config.size,spacing:quality==='standard'?config.standardSpacing:config.lowSpacing,
   bladeHeight:config.bladeHeight,bladeWidth:config.bladeWidth,
   segments:quality==="standard"?config.standardSegments:config.lowSegments,
   bladesPerTuft:quality==="standard"?config.standardBlades:config.lowBlades,seed:config.seed,
   baseColor:new Color(config.base).convertLinearToSRGB(),tipColor:new Color(config.tip).convertLinearToSRGB(),
   windSpeed:config.windSpeed,windStrength:config.windStrength,gustStrength:config.gustStrength,
  });
  this.mesh=this.source.mesh;this.mesh.name='Sourced settlement grass (boona13)';
  const matrix=new Matrix4(),position=new Vector3(),rotation=new Quaternion(),scale=new Vector3(),color=new Color();
  const sample=groundTreatment(heightAt,shoreAt,config.seed),random=seededRandom(config.seed+1);
  const birth=this.mesh.geometry.getAttribute('birthTime');let accepted=0;
  for(let i=0;i<this.source.count;i++){
   this.mesh.getMatrixAt(i,matrix);matrix.decompose(position,rotation,scale);
   const {x,z}=position;
   if(Math.abs(x)>12||z>8||z<-6||z-shoreAt(x)<3||surfaceHeightAt(x,z)<.55)continue;
   const fields=sample(x,z);
   if(fields.worn>.35||fields.rock>.65)continue;
   const coverage=(1-fields.shore)*(1-fields.worn)*(1-fields.rock);
   if(random()>coverage*.18)continue;
   // Canonical triangle interpolation is the placement authority, not another heightmap.
   position.y=surfaceHeightAt(x,z)-.01;
   matrix.compose(position,rotation,scale);this.mesh.setMatrixAt(accepted,matrix);
   this.mesh.getColorAt(i,color);this.mesh.setColorAt(accepted,color);
   birth.setX(accepted,-1);accepted++;
  }
  this.mesh.count=accepted;this.mesh.instanceMatrix.needsUpdate=true;
  if(this.mesh.instanceColor)this.mesh.instanceColor.needsUpdate=true;
  birth.needsUpdate=true;
 }
 update(time:number,lighting:WorldLighting){
  this.source.update(time);
  this.source.setSunDirection(this.sunDirection.copy(lighting.directional.position).sub(lighting.directional.target.position));
  const gain=lighting.mode==='night'?.3:1;
  this.source.setLightColors(
   lighting.directional.color.clone().convertLinearToSRGB().multiplyScalar(.34*gain),
   new Color().setRGB(.48,.58,.34).multiplyScalar(gain),
   new Color().setRGB(.12,.14,.1).multiplyScalar(gain),
  );
 }
 dispose(){this.source.dispose();}
}
