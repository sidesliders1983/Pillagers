import {Color,Float32BufferAttribute,Group,Mesh,MeshStandardMaterial,PlaneGeometry} from 'three';
import {FjordWaterConfig,fjordWaterConfig} from '../config/FjordWaterConfig';
import {surfaceHeightAt} from './Terrain';
/** Actual rendered terrain height, shared with movement and shoreline rendering. */
export function waterDepthAt(x:number,z:number,level=fjordWaterConfig.level){if(![x,z,level].every(Number.isFinite))throw new RangeError('Water depth requires finite coordinates and water level.');return level-surfaceHeightAt(x,z);}
export class FjordWater {
 readonly mesh=new Group();private time={value:0};private geometry:PlaneGeometry;private material:MeshStandardMaterial;
 constructor(readonly config:FjordWaterConfig={...fjordWaterConfig}){
  const segments=config.quality==='low'?90:180;this.geometry=new PlaneGeometry(180,180,segments,segments);this.geometry.rotateX(-Math.PI/2);this.geometry.translate(0,config.level,-35);
  const position=this.geometry.getAttribute('position'),depth=new Float32Array(position.count);
  for(let i=0;i<position.count;i++)depth[i]=waterDepthAt(position.getX(i),position.getZ(i),config.level);
  this.geometry.setAttribute('waterDepth',new Float32BufferAttribute(depth,1));
  this.material=new MeshStandardMaterial({color:0xffffff,roughness:.94,metalness:0});
  this.material.onBeforeCompile=shader=>{
   Object.assign(shader.uniforms,{fjordTime:this.time,fjordDeep:{value:new Color(config.deep)},fjordShallow:{value:new Color(config.shallow)},fjordFoam:{value:new Color(config.foam)},fjordAmplitude:{value:config.amplitude},fjordWaveLength:{value:config.wavelength},fjordSpeed:{value:config.speed},fjordFoamWidth:{value:config.foamWidth},fjordFoamIntensity:{value:config.foamIntensity}});
   shader.vertexShader='attribute float waterDepth; varying float vWaterDepth; varying vec2 vWaterXZ; uniform float fjordTime; uniform float fjordAmplitude; uniform float fjordWaveLength; uniform float fjordSpeed;\n'+shader.vertexShader;
   shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
    vWaterDepth=waterDepth;vWaterXZ=position.xz;
    float wave=sin(position.x*6.28318/fjordWaveLength+position.z*.31+fjordTime*fjordSpeed)+.35*sin(position.z*.63-position.x*.2+fjordTime*fjordSpeed*.71);
    transformed.y+=wave*fjordAmplitude*smoothstep(0.0,0.5,waterDepth);
   `);
   shader.fragmentShader='varying float vWaterDepth; varying vec2 vWaterXZ; uniform float fjordTime; uniform float fjordSpeed; uniform vec3 fjordDeep; uniform vec3 fjordShallow; uniform vec3 fjordFoam; uniform float fjordFoamWidth; uniform float fjordFoamIntensity;\n'+shader.fragmentShader;
   shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
    float shoreDepth=max(0.0,vWaterDepth);
    float shallow=1.0-smoothstep(0.03,0.65,shoreDepth);
    float ripple=sin(vWaterXZ.x*.73+vWaterXZ.y*.51+fjordTime*fjordSpeed)*sin(vWaterXZ.y*.91-vWaterXZ.x*.17-fjordTime*fjordSpeed*.7);
    vec3 waterColor=mix(fjordDeep,fjordShallow,shallow)*(1.0+ripple*.025);
    float edge=1.0-smoothstep(0.0,max(.01,fjordFoamWidth*.35),shoreDepth);
    float foam=edge*fjordFoamIntensity*(.6+.4*sin(vWaterXZ.x*1.7+vWaterXZ.y*.63+fjordTime*fjordSpeed*1.6));
    diffuseColor.rgb*=mix(waterColor,fjordFoam,foam);
   `);
  };
  this.material.customProgramCacheKey=()=> 'fjord-water-v1';
  const surface=new Mesh(this.geometry,this.material);surface.receiveShadow=true;surface.name='Candidate fjord water';this.mesh.add(surface);
 }
 update(time:number){this.time.value=time;}
 dispose(){this.geometry.dispose();this.material.dispose();}
}
