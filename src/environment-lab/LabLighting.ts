import {Box3,Mesh,Scene,Vector3,WebGLRenderer} from 'three';
import {WorldLighting} from '../core/WorldLighting';
import {lightingConfig} from '../config/lightingConfig';

export type LabLight='day'|'sun10'|'sun20'|'sun30'|'sun20-front'|'night';
/** Native, static art-direction study. World defaults and authored materials stay intact. */
export class LabLighting {
 private choice:LabLight='day';
 constructor(private scene:Scene,private renderer:WebGLRenderer,readonly world:WorldLighting,private person:import('three').Object3D){}
 select(choice:LabLight,low=false,fill=.65,exposure=lightingConfig.day.exposure,radius=lightingConfig.day.shadowRadius){
  this.choice=choice;
  const pilot=choice.startsWith('sun');
  // The standalone Lab person was not a caster in the recorded baseline.
  this.person.traverse(node=>{if(node instanceof Mesh){node.castShadow=pilot;node.receiveShadow=pilot;}});
  if(!pilot){this.world.setMode(choice==='night'?'night':'day');return;}
  const elevation=choice==='sun10'?10:choice==='sun30'?30:20;
  const azimuth=choice==='sun20-front'?135:Math.atan2(-28,18)*180/Math.PI;
  const alt=elevation*Math.PI/180,az=azimuth*Math.PI/180;
  const direction=new Vector3(Math.sin(az)*Math.cos(alt),Math.sin(alt),Math.cos(az)*Math.cos(alt));
  this.world.setMode('day',{...lightingConfig.day,sun:0xffecd6,sunIntensity:2.8,ambientSky:0xbfd4ee,ambientGround:0x716c65,ambient:fill,exposure,sunPosition:direction.toArray(),shadowMapSize:low?1024:2048,shadowNormalBias:.02,shadowRadius:radius});
  const bounds=new Box3();this.scene.updateMatrixWorld(true);
  this.scene.traverseVisible(node=>{if(node instanceof Mesh&&(node.castShadow||node.receiveShadow))bounds.union(new Box3().setFromObject(node));});
  // No visible casters/receivers: retain the valid native fallback frustum.
  if(bounds.isEmpty())return;
  const light=this.world.directional,target=bounds.getCenter(new Vector3());
  light.target.position.copy(target);light.target.updateMatrixWorld(true);light.position.copy(target).addScaledVector(direction,200);light.updateMatrixWorld(true);
  light.shadow.updateMatrices(light);
  // Bound both real receivers and casters in light space; low-altitude shadows share this coverage.
  const viewBox=bounds.clone().applyMatrix4(light.shadow.camera.matrixWorldInverse),camera=light.shadow.camera;
  Object.assign(camera,{left:viewBox.min.x-3,right:viewBox.max.x+3,bottom:viewBox.min.y-3,top:viewBox.max.y+3,near:Math.max(.1,-viewBox.max.z-3),far:-viewBox.min.z+3});
  camera.updateProjectionMatrix();light.shadow.bias=-.00005;light.shadow.needsUpdate=true;this.renderer.shadowMap.needsUpdate=true;
 }
 describe(){
  const light=this.world.directional,direction=light.position.clone().sub(light.target.position).normalize(),shadow=light.shadow,camera=shadow.camera;
  return{preset:this.choice,elevation:Math.asin(direction.y)*180/Math.PI,azimuth:Math.atan2(direction.x,direction.z)*180/Math.PI,azimuthConvention:'atan2(x,z), +Z = 0°, +X = 90°',target:light.target.position.toArray(),position:light.position.toArray(),direction:direction.toArray(),sun:{colour:light.color.getHexString(),intensity:light.intensity},fill:{sky:this.world.ambient.color.getHexString(),ground:this.world.ambient.groundColor.getHexString(),intensity:this.world.ambient.intensity},exposure:this.renderer.toneMappingExposure,shadow:{map:shadow.mapSize.toArray(),frustum:{left:camera.left,right:camera.right,top:camera.top,bottom:camera.bottom,near:camera.near,far:camera.far},bias:shadow.bias,normalBias:shadow.normalBias,radius:shadow.radius,type:'native PCF'},materialTreatment:'Unchanged source maps and parameters'};
 }
 label(){const d=this.describe();return `${this.choice==='day'?'Current day':this.choice==='night'?'Night':'Low sun'} · ${d.elevation.toFixed(0)}° elevation · ${d.azimuth.toFixed(1)}° azimuth · direct ${d.sun.intensity} · sky fill ${d.fill.intensity} · exposure ${d.exposure} · ${d.shadow.map[0]}px PCF shadows · radius ${d.shadow.radius}`;}
}
