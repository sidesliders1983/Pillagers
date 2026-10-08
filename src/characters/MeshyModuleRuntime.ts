import {BufferAttribute, Color, Group, Matrix4, Mesh, MeshStandardMaterial, Quaternion, SkinnedMesh, Vector3} from 'three';
import type {GLTF} from 'three/addons/loaders/GLTFLoader.js';
import {MeshyBodyFitAdapter,anchorPoint} from './MeshyBodyFitAdapter';
import {ModuleBindingV2} from './BodyFitAdapter';
import {maskedBodyGeometry} from './BodyCoverage';
import {sewModuleOpenings, weldModuleOpeningCorners} from './ModuleRims';
import {CharacterAsset,assetMeasurement} from './CharacterAssets';
import {HumanProfile} from './UniversalHumanProfile';
export interface NativeModuleSource {asset:CharacterAsset;source:GLTF;binding:ModuleBindingV2;}
function fail(ok:unknown,message:string):asserts ok {if(!ok)throw new Error(message);}
/** Validation is performed at the factory boundary, before an instance owns fitted geometry. */
export function validateNativeModule(source:NativeModuleSource,fit:MeshyBodyFitAdapter){
 const {asset,binding,source:gltf}=source,lod=binding.lods?.[fit.body.lod],metadata=asset.metadata!;
 fail(metadata.version==='pillagers-fit/0.2'&&binding.version===metadata.version&&binding.id===asset.id&&binding.moduleSha256===assetMeasurement(asset.lods[2]).sha256&&binding.rigSignature===fit.body.rigSignature&&binding.rigSignature===metadata.nativeBinding?.rigSignature,'Stale native module or rig binding');
 fail(lod&&lod.bodySha256===fit.body.sha256&&lod.topology===fit.topologySignature,'Binding does not match this exact body/LOD topology');
 fail(binding.coordinateFrame?.up==='+Y'&&binding.coordinateFrame.front==='+Z'&&binding.coordinateFrame.unit==='metre'&&binding.coordinateFrame.origin==='Meshy source bind','Invalid native module coordinate frame');
 fail(gltf.animations.length===0,'Modules must not duplicate body clips');
 fail(binding.supportedAges&&binding.supportedAges.min>=0&&binding.supportedAges.max<=100&&binding.supportedAges.min<=binding.supportedAges.max,'Invalid supported module ages');
 let count=0;gltf.scene.traverse(node=>{if((node as Mesh).isMesh){const mesh=node as Mesh,p=mesh.geometry.getAttribute('position');count+=p.count;fail(mesh.name.startsWith('Module_')&&!((mesh as SkinnedMesh).isSkinnedMesh),'Module export contains a helper or copied rig');const materials=Array.isArray(mesh.material)?mesh.material:[mesh.material];for(const material of materials){const m=material as MeshStandardMaterial;fail(!m.map&&!m.normalMap&&!m.alphaMap&&!m.transparent&&m.opacity===1&&m.color.equals(new Color(0xffffff))&&mesh.geometry.getAttribute('color'),'Native modules require opaque mapless COLOR_0');}}});
 fail(binding.dependency?lod.anchors.length===0&&lod.vertexAnchors.length===0:lod.vertexAnchors.length===count&&lod.vertexAnchors.every(v=>Number.isInteger(v)&&v>=0&&v<lod.anchors.length),'Module/body correspondence count differs');
 for(const anchor of lod.anchors)anchorPoint(fit.source,anchor);
 fail(lod.weights.length===lod.anchors.length&&lod.weights.every(value=>value.joints.length===4&&value.weights.length===4&&value.joints.every(j=>Number.isInteger(j)&&j>=0&&j<44)&&value.weights.every(w=>Number.isFinite(w)&&w>=0&&w<=1)&&Math.abs(value.weights.reduce((a,b)=>a+b,0)-1)<.00001),'Invalid source-bound native weights');
 const groups=Object.values(binding.regions??{});const known=new Set(groups.flatMap(region=>[...region.contact,...region.free]));
 fail(known.size===count&&[...known].every(v=>Number.isInteger(v)&&v>=0&&v<count),'Every render vertex needs a declared contact/free region');
 fail(groups.every(region=>region.boundary.every(v=>Number.isInteger(v)&&v>=0&&v<count)),'Invalid locked boundary');
 fail(binding.seams?.every(seam=>seam.length>=2&&seam.every(v=>Number.isInteger(v)&&v>=0&&v<count)),'Invalid sewn seam');
 fail(lod.coverageTriangles.every(t=>Number.isInteger(t)&&t>=0&&t<fit.source.triangles)&&new Set(lod.coverageTriangles).size===lod.coverageTriangles.length,'Invalid source coverage mask');
 if(binding.dependency)fail(metadata.dependency?.module===binding.dependency.module&&metadata.dependency.frame===binding.dependency.frame,'Garment dependency differs from the registry');
 fail((binding.coverageClipPlanes??[]).every(p=>p.regions.length>0&&p.regions.every(r=>typeof r==='string')&&(!p.regionMatch||['all','any'].includes(p.regionMatch))&&p.normal.length===3&&p.normal.every(Number.isFinite)&&Math.hypot(...p.normal)>.9&&Math.hypot(...p.normal)<1.1&&Number.isFinite(p.constant)),'Invalid body opening cut planes');
 fail((binding.coverageRimContacts??[]).every(v=>Number.isInteger(v)&&v>=0&&v<count&&groups.some(r=>r.contact.includes(v))&&Math.hypot(...lod.anchors[lod.vertexAnchors[v]].offset)<.000001),'Invalid shared body/garment rim contact');
 return source;
}
/** Owned geometry/colour, shared native skeleton. No fitting runs in the animation loop. */
export class MeshyModuleRuntime {
 private records=new Map<string,{source:NativeModuleSource;group:Group;mesh:Mesh}>();private mask:import('three').BufferGeometry|null=null;private profile?:HumanProfile;private frames:Group[]=[];
 fitRuns=0;lastFitMilliseconds=0;
 constructor(readonly fit:MeshyBodyFitAdapter){}
 install(sources:NativeModuleSource[],profile:HumanProfile){
  for(const source of sources)validateNativeModule(source,this.fit);
  this.clear();this.profile=profile;
  for(const source of sources){const {asset,binding}=source;if(profile.age<binding.supportedAges.min||profile.age>binding.supportedAges.max||(asset.type==='beard'&&(profile.age<18||profile.masculinity<=.5)))continue;
   let original:Mesh|undefined;source.source.scene.traverse(node=>{if((node as Mesh).isMesh){fail(!original,'One mesh per native proof export is required');original=node as Mesh;}});fail(original,'Native module mesh is missing');
   const geometry=original.geometry.clone(),material=new MeshStandardMaterial({color:0xffffff,vertexColors:true,roughness:1,flatShading:true,side:(original.material as MeshStandardMaterial).side}),mesh=binding.dependency?new Mesh(geometry,material):new SkinnedMesh(geometry,material);
   mesh.name=original.name;mesh.castShadow=true;mesh.frustumCulled=false;const group=new Group();group.name=asset.id;group.add(mesh);this.fit.bodyRoot.add(group);this.records.set(asset.id,{source,group,mesh});this.fit.modules.set(asset.id,group);
  }
  this.refit(profile);
 }
 refit(profile:HumanProfile){
  const started=performance.now();this.profile=profile;
  for(const [id,record] of [...this.records])if(profile.age<record.source.binding.supportedAges.min||profile.age>record.source.binding.supportedAges.max||(record.source.asset.type==='beard'&&(profile.age<18||profile.masculinity<=.5)))this.remove(id);
  this.frames.forEach(frame=>frame.removeFromParent());this.frames=[];
  const inverseEncoding=this.fit.encoding.clone().invert(),bodyIndices=this.fit.mesh.geometry.getAttribute('skinIndex'),bodyWeights=this.fit.mesh.geometry.getAttribute('skinWeight');
  for(const {source,mesh} of this.records.values()){
   if(source.binding.dependency)continue;
   let base:Mesh|undefined;source.source.scene.traverse(n=>{if((n as Mesh).isMesh)base=n as Mesh;});fail(base,'Native module source is missing');mesh.geometry.dispose();mesh.geometry=base.geometry.clone();
   const p=mesh.geometry.getAttribute('position'),anchors=source.binding.lods[this.fit.body.lod].vertexAnchors.map(v=>source.binding.lods[this.fit.body.lod].anchors[v]),joints:number[]=[],weights:number[]=[];
   anchors.forEach((anchor,v)=>{
    const point=anchorPoint(this.fit.source,anchor).add(new Vector3(...anchor.offset)).applyMatrix4(inverseEncoding);p.setXYZ(v,point.x,point.y,point.z);
    const weightsForVertex=source.binding.lods[this.fit.body.lod].weights[source.binding.lods[this.fit.body.lod].vertexAnchors[v]];
    joints.push(...weightsForVertex.joints);weights.push(...weightsForVertex.weights);
   });p.needsUpdate=true;mesh.geometry.setAttribute('skinIndex',new BufferAttribute(new Uint16Array(joints),4));mesh.geometry.setAttribute('skinWeight',new BufferAttribute(new Float32Array(weights),4));
   (mesh as SkinnedMesh).bind(this.fit.nativeSkeleton,this.fit.mesh.bindMatrix);(mesh as SkinnedMesh).bindMatrixInverse.copy(this.fit.mesh.bindMatrixInverse);
   const sewn=sewModuleOpenings(mesh.geometry,source.binding,this.fit);if(sewn!==mesh.geometry){mesh.geometry.dispose();mesh.geometry=sewn;}mesh.geometry.computeBoundingSphere();
   if(source.asset.type==='hair'||source.asset.type==='beard'){const c=mesh.geometry.getAttribute('color'),color=new Color(profile.appearance.color);for(let v=0;v<c.count;v++)c.setXYZ(v,color.r,color.g,color.b);c.needsUpdate=true;}
  }
  this.fit.rootForModulesUpdate();
  for(const [id,record] of [...this.records]){
   const dependency=record.source.binding.dependency;if(!dependency)continue;
   const garment=this.records.get(dependency.module),frame=garment?.source.binding.garmentFrames[dependency.frame];if(!garment||!frame){this.remove(id);continue;}
   const garmentMesh=garment.mesh as SkinnedMesh;fail(Number.isInteger(frame.vertex)&&frame.vertex>=0&&frame.vertex<garmentMesh.geometry.getAttribute('position').count,'Invalid garment socket vertex');
   const indices=garmentMesh.geometry.getAttribute('skinIndex'),weights=garmentMesh.geometry.getAttribute('skinWeight');let influence=0;for(let j=1;j<4;j++)if(weights.getComponent(frame.vertex,j)>weights.getComponent(frame.vertex,influence))influence=j;
   const bone=this.fit.nativeSkeleton.bones[indices.getComponent(frame.vertex,influence)],socket=new Group();socket.name=dependency.frame;
   const point=garmentMesh.getVertexPosition(frame.vertex,new Vector3());garmentMesh.localToWorld(point);bone.worldToLocal(point);socket.position.copy(point);
   socket.quaternion.copy(bone.getWorldQuaternion(new Quaternion()).invert().multiply(this.fit.bodyRoot.getWorldQuaternion(new Quaternion())).multiply(new Quaternion(...frame.quaternion)));bone.add(socket);socket.add(record.group);record.group.position.set(0,0,.025);record.group.quaternion.identity();this.frames.push(socket);
  }
  this.restoreMask();const covered=new Set<number>();for(const record of this.records.values())for(const t of record.source.binding.lods[this.fit.body.lod].coverageTriangles)covered.add(t);
  const planes=[...this.records.values()].flatMap(r=>r.source.binding.coverageClipPlanes??[]);
  if(covered.size||planes.length){const rims=[...this.records.values()].flatMap(r=>(r.source.binding.coverageRimContacts??[]).map(v=>{const lod=r.source.binding.lods[this.fit.body.lod];return lod.anchors[lod.vertexAnchors[v]];}));this.mask=maskedBodyGeometry(this.fit.sourceGeometry,this.fit.source,covered,planes,rims);this.fit.mesh.geometry=this.mask;}
  if (this.mask) {
      for (const record of this.records.values()) {
          weldModuleOpeningCorners(this.mask, record.mesh.geometry, this.fit.encoding);
      }
  }
  this.fitRuns++;this.lastFitMilliseconds=performance.now()-started;
 }
 private restoreMask(){this.fit.mesh.geometry=this.fit.sourceGeometry;if(this.mask){this.mask.dispose();this.mask=null;}}
 private remove(id:string){const record=this.records.get(id);if(!record)return;record.group.removeFromParent();record.mesh.geometry.dispose();for(const material of Array.isArray(record.mesh.material)?record.mesh.material:[record.mesh.material])material.dispose();this.records.delete(id);this.fit.modules.delete(id);}
 clear(){this.frames.forEach(frame=>frame.removeFromParent());this.frames=[];for(const id of [...this.records.keys()])this.remove(id);this.restoreMask();}
 snapshot(){return {bindings:[...this.records.values()].map(r=>({id:r.source.asset.id,...r.source.asset.metadata!.nativeBinding})),fitRuns:this.fitRuns,lastFitMilliseconds:this.lastFitMilliseconds};}
}
