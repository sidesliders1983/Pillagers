import {Euler,PMREMGenerator,Quaternion,Scene,Vector3,WebGLRenderer,WebGLRenderTarget} from 'three';
import {HDRLoader} from 'three/addons/loaders/HDRLoader.js';
/** Optional native image-based lighting. The scene background and water shader remain separate. */
export class LabEnvironment {
 private target:WebGLRenderTarget|null=null;
 private pending:Promise<void>|null=null;
 private alive=true;
 private enabled=false;
 private night=false;
 private direction=new Vector3();
 private failure='';
 constructor(private scene:Scene,private renderer:WebGLRenderer,private status:HTMLElement){}
 async set(enabled:boolean,night:boolean,direction:Vector3){
  this.enabled=enabled;this.night=night;this.direction.copy(direction).normalize();
  if(enabled&&!night&&!this.target){
   this.status.textContent='Loading Poly Haven HDR material lighting…';
   if(!this.pending)this.pending=this.load().catch(error=>{this.failure=error instanceof Error?error.message:String(error);}).finally(()=>{this.pending=null;});
   await this.pending;
  }
  if(!this.alive)return;
  const active=enabled&&this.enabled&&!this.night&&!!this.target;
  this.scene.environment=active?this.target!.texture:null;this.scene.environmentIntensity=.15;
  // Source peak at pixel (614,230), 1024×512, HDRLoader flipY=true.
  // Native r180 WebGLMaterials negates XYZ Euler angles for the left-handed sampling frame.
  const longitude=36.03515625*Math.PI/180,elevation=8.96484375*Math.PI/180;
  const sourceSun=new Vector3(Math.cos(longitude)*Math.cos(elevation),Math.sin(elevation),Math.sin(longitude)*Math.cos(elevation));
  const sampling=new Euler().setFromQuaternion(new Quaternion().setFromUnitVectors(this.direction,sourceSun),'XYZ');
  this.scene.environmentRotation.set(-sampling.x,-sampling.y,-sampling.z,'XYZ');
  this.status.textContent=this.failure?'HDR loading failed: '+this.failure:this.night?'HDR disabled at night (daylight source)':active?'HDR ON · Poly Haven Lonely Road Afternoon Pure Sky · native PMREM · intensity 0.15 · background unchanged':'HDR OFF · background unchanged';
 }
 private async load(){
  const source=await new HDRLoader().loadAsync(import.meta.env.BASE_URL+'lighting/lonely-road/lonely_road_afternoon_puresky_1k.hdr');
  if(!this.alive){source.dispose();return;}
  const generator=new PMREMGenerator(this.renderer);
  try{this.target=generator.fromEquirectangular(source);this.failure='';}finally{source.dispose();generator.dispose();}
 }
 describe(){return{requested:this.enabled,active:!!this.scene.environment,loaded:!!this.target,source:'lonely_road_afternoon_puresky_1k.hdr',intensity:this.scene.environmentIntensity,rotation:this.scene.environmentRotation.toArray(),alignment:'HDR peak aligned to the native directional light using Scene.environmentRotation',background:'Unchanged Color',sourceTexture:'disposed after PMREM',failure:this.failure};}
 dispose(){this.alive=false;this.scene.environment=null;this.target?.dispose();this.target=null;}
}
