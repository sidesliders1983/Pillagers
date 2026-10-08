import {AxesHelper, Bone, Box3, BufferGeometry, Group, Matrix4, Mesh, MeshBasicMaterial, Quaternion, SkinnedMesh, SphereGeometry, Triangle, Vector3} from 'three';
import {CoverageZone, SocketName} from './AttachmentContract';
import {BodyFitAdapter, BodySurface, bodyFitVersion, SurfaceAnchor} from './BodyFitAdapter';
import {meshyHumanAssetIdentity} from './MeshyHumanAssetIdentity';
import {meshyNativeRig,meshyRigSignature} from './MeshyNativeRig';
import type {FitDebugOptions} from './CharacterFitSystem';
const parents:Record<SocketName,string>={socket_head_top:'Head',socket_face:'Head',socket_jaw:'Head',socket_neck:'Neck',socket_back_head:'Head',socket_chest:'Spine2',socket_back:'Spine2',socket_shoulder_L:'LeftShoulder',socket_shoulder_R:'RightShoulder',socket_waist:'Hips',socket_hip_L:'Hips',socket_hip_R:'Hips',socket_hand_L:'LeftHand',socket_hand_R:'RightHand',socket_forearm_L:'LeftForeArm',socket_forearm_R:'RightForeArm'};
/** A topology fingerprint supplements the exact GLB identity, including split render corners. */
export function surfaceTopology(surface:BodySurface){let h=2166136261;for(const value of [...surface.positions,...surface.indices]){const word=Math.round(value*1e7);h=Math.imul(h^word,16777619);}return (h>>>0).toString(16).padStart(8,'0');}
export function nativeRegion(mesh: SkinnedMesh, vertex: number, point: Vector3): CoverageZone {
    // Some original neck vertices are weighted to an arm. Their geometric region
    // must still protect exposed neck skin from the sleeve coverage planes.
    if (point.y > 1.45 && Math.abs(point.x) < 0.16) return 'HEAD';
    if (point.y > 1.365 && point.y <= 1.45 && Math.abs(point.x) < 0.13) return 'NECK';

    const indices = mesh.geometry.getAttribute('skinIndex');
    const weights = mesh.geometry.getAttribute('skinWeight');
    let name = '';
    let largestWeight = -1;
    for (let influence = 0; influence < 4; influence++) {
        const weight = weights.getComponent(vertex, influence);
        if (weight > largestWeight) {
            largestWeight = weight;
            name = mesh.skeleton.bones[indices.getComponent(vertex, influence)].name;
        }
    }

    const side = point.x >= 0 ? 'L' : 'R';
    if (/Foot|Toe/.test(name)) return 'FEET';
    if (/Hand|ForeArm/.test(name)) return `LOWER_ARM_${side}`;
    if (/Arm|Shoulder/.test(name)) return `UPPER_ARM_${side}`;
    if (/UpLeg/.test(name)) return `UPPER_LEG_${side}`;
    if (/Leg/.test(name)) return `LOWER_LEG_${side}`;
    if (/Head|headfront/.test(name)) return 'HEAD';
    if (/Neck/.test(name)) return 'NECK';
    if (/Spine2|Spine1/.test(name)) return 'TORSO_UPPER';
    if (/Spine/.test(name)) return 'TORSO_LOWER';
    return 'PELVIS';
}
const sourceSurfaces=new WeakMap<BufferGeometry,BodySurface>();
const surfaceFacets=new WeakMap<BodySurface,{triangle:Triangle;ids:number[];min:Vector3;max:Vector3}[]>();
export function closestSurface(surface:BodySurface,point:Vector3,zones?:readonly CoverageZone[]):SurfaceAnchor {
 let facets=surfaceFacets.get(surface);if(!facets){facets=[];for(let t=0;t<surface.indices.length;t+=3){const ids=surface.indices.slice(t,t+3),triangle=new Triangle(...ids.map(v=>new Vector3().fromArray(surface.positions,v*3)) as [Vector3,Vector3,Vector3]),box=new Box3().setFromPoints([triangle.a,triangle.b,triangle.c]);facets.push({triangle,ids:[...ids],min:box.min,max:box.max});}surfaceFacets.set(surface,facets);}
 let best=-1,distance=Infinity,bary=new Vector3(),hit=new Vector3(),q=new Vector3();
 facets.forEach((f,t)=>{if(zones&&!f.ids.every(v=>zones.includes(surface.regions[v])))return;
  const dx=Math.max(f.min.x-point.x,0,point.x-f.max.x),dy=Math.max(f.min.y-point.y,0,point.y-f.max.y),dz=Math.max(f.min.z-point.z,0,point.z-f.max.z);if(dx*dx+dy*dy+dz*dz>distance)return;
  f.triangle.closestPointToPoint(point,q);const d=q.distanceToSquared(point);if(d<distance){distance=d;best=t;hit.copy(q);f.triangle.getBarycoord(q,bary);}});
 if(best<0)throw new Error('No body surface in the declared semantic region');
 bary.set(Math.max(0,bary.x),Math.max(0,bary.y),Math.max(0,bary.z));bary.divideScalar(bary.x+bary.y+bary.z);
 return {triangle:best,barycentric:bary.toArray(),offset:point.clone().sub(hit).toArray()};
}
export function anchorPoint(surface:BodySurface,anchor:SurfaceAnchor){
 if(!Number.isInteger(anchor.triangle)||anchor.triangle<0||anchor.triangle>=surface.triangles||anchor.barycentric.length!==3||Math.abs(anchor.barycentric.reduce((a,b)=>a+b,0)-1)>1e-5||anchor.barycentric.some(n=>!Number.isFinite(n)||n<-.00001)||anchor.offset.some(n=>!Number.isFinite(n)))throw new Error('Invalid body triangle correspondence');
 const point=new Vector3();for(let k=0;k<3;k++)point.addScaledVector(new Vector3().fromArray(surface.positions,surface.indices[anchor.triangle*3+k]*3),anchor.barycentric[k]);return point;
}
/** Native Meshy surfaces are captured before DNA/animation; masking never edits them. */
export class MeshyBodyFitAdapter implements BodyFitAdapter {
 readonly version=bodyFitVersion;readonly body;readonly nativeSkeleton;readonly sockets=new Map<SocketName,Group>();readonly debug=new Group();
 readonly modules=new Map<string,Group>();revision=0;readonly sourceGeometry:BufferGeometry;readonly source:BodySurface;readonly encoding:Matrix4;
 private anchors=new Map<SocketName,SurfaceAnchor>();private debugOptions?:FitDebugOptions;private topology:string;
 constructor(readonly mesh:SkinnedMesh,private root:Group,readonly bodyRoot:Group,lod:number){
  this.nativeSkeleton=mesh.skeleton;this.sourceGeometry=mesh.geometry;this.body={id:'body/meshy-human',sha256:meshyHumanAssetIdentity[lod].sha256,lod,rigSignature:meshyRigSignature};
  root.updateMatrixWorld(true);
  if(mesh.skeleton.bones.length!==meshyNativeRig.length)throw new Error('Meshy native rig identity differs');
  mesh.skeleton.bones.forEach((bone,j)=>{const expected=meshyNativeRig[j];if(bone.name!==expected.name||bone.parent?.name!==expected.parent||bone.matrixWorld.elements.some((v,k)=>Math.abs(v-expected.matrix[k])>1e-5))throw new Error('Meshy native bind frame differs: '+bone.name);});
  // Meshopt stores the body's dequantization in inverse binds. Modules use the
  // very same skeleton by converting their metre positions back to this space.
  this.encoding=mesh.skeleton.bones[0].matrixWorld.clone().multiply(mesh.skeleton.boneInverses[0]);
  let source=sourceSurfaces.get(mesh.geometry);if(!source){
  const positions:number[]=[],regions:CoverageZone[]=[],p=mesh.geometry.getAttribute('position');
  for(let v=0;v<p.count;v++){const point=mesh.getVertexPosition(v,new Vector3());positions.push(...point.toArray());regions.push(nativeRegion(mesh,v,point));}
  const indices=Array.from(mesh.geometry.index!.array);source=Object.freeze({positions:Object.freeze(positions),indices:Object.freeze(indices),regions:Object.freeze(regions),triangles:indices.length/3});sourceSurfaces.set(mesh.geometry,source);}
  this.source=source;this.topology=surfaceTopology(this.source);
  const bounds=new Box3().setFromArray([...this.source.positions]),bonePoint=(name:string)=>mesh.skeleton.bones.find(b=>b.name==='mixamorig'+name)!.getWorldPosition(new Vector3());
  const targets:Record<SocketName,Vector3>={
   socket_head_top:new Vector3(0,bounds.max.y+.01,0),socket_face:bonePoint('Head').add(new Vector3(0,.07,.2)),socket_jaw:bonePoint('Head').add(new Vector3(0,-.04,.17)),socket_back_head:bonePoint('Head').add(new Vector3(0,.07,-.2)),socket_neck:bonePoint('Neck').add(new Vector3(0,0,.2)),
   socket_chest:bonePoint('Spine2').add(new Vector3(0,0,.3)),socket_back:bonePoint('Spine2').add(new Vector3(0,0,-.3)),socket_waist:bonePoint('Hips').add(new Vector3(0,.05,.3)),
   socket_shoulder_L:bonePoint('LeftArm').add(new Vector3(0,.06,.03)),socket_shoulder_R:bonePoint('RightArm').add(new Vector3(0,.06,.03)),
   socket_hip_L:bonePoint('LeftUpLeg').add(new Vector3(.12,0,0)),socket_hip_R:bonePoint('RightUpLeg').add(new Vector3(-.12,0,0)),
   socket_hand_L:bonePoint('LeftHand'),socket_hand_R:bonePoint('RightHand'),socket_forearm_L:bonePoint('LeftForeArm'),socket_forearm_R:bonePoint('RightForeArm')};
  for(const name of Object.keys(parents) as SocketName[]){
   const region:CoverageZone[]=name.includes('head')||name==='socket_face'||name==='socket_jaw'?['HEAD']:name==='socket_neck'?['NECK']:name.includes('hand')||name.includes('forearm')?[name.endsWith('_L')?'LOWER_ARM_L':'LOWER_ARM_R']:name.includes('shoulder')?[name.endsWith('_L')?'UPPER_ARM_L':'UPPER_ARM_R']:name==='socket_waist'||name.includes('hip')?['PELVIS','TORSO_LOWER','UPPER_LEG_L','UPPER_LEG_R']:['TORSO_UPPER'];
   const anchor=closestSurface(this.source,targets[name],region);anchor.offset=[0,0,0];this.anchors.set(name,anchor);
   const socket=new Group();socket.name=name;socket.userData.binding={parent:'mixamorig'+parents[name],mirror:name.endsWith('_L')?name.replace('_L','_R'):name.endsWith('_R')?name.replace('_R','_L'):null,anchor,body:this.body};mesh.skeleton.bones.find(b=>b.name==='mixamorig'+parents[name])!.add(socket);this.sockets.set(name,socket);
  }
  this.debug.name='MeshyFitDebug';this.debug.visible=false;root.add(this.debug);
 }
 surface(state:'source'|'posed'):BodySurface {
  if(state==='source')return this.source;this.root.updateMatrixWorld(true);this.nativeSkeleton.update();
  const positions:number[]=[];for(let v=0;v<this.source.positions.length/3;v++)positions.push(...this.mesh.getVertexPosition(v,new Vector3()).toArray());return {...this.source,positions};
 }
 refit(){
  this.root.updateMatrixWorld(true);this.nativeSkeleton.update();const posed=this.surface('posed');
  for(const [name,socket] of this.sockets){const p=anchorPoint(posed,this.anchors.get(name)!);this.mesh.localToWorld(p);socket.parent!.worldToLocal(p);socket.position.copy(p);socket.quaternion.copy(socket.parent!.getWorldQuaternion(new Quaternion()).invert().multiply(this.bodyRoot.getWorldQuaternion(new Quaternion())));socket.scale.setScalar(1);}
  this.revision++;this.setDebug(this.debugOptions??{sockets:false,landmarks:false,cages:false,coverage:false,bounds:false});
 }
 socketFrame(name:SocketName){const socket=this.sockets.get(name);if(!socket)throw new Error('Unknown Meshy socket');this.root.updateMatrixWorld(true);const matrix=this.root.matrixWorld.clone().invert().multiply(socket.matrixWorld),p=new Vector3(),q=new Quaternion(),s=new Vector3();matrix.decompose(p,q,s);return {position:p.toArray(),quaternion:q.toArray(),scale:s.toArray()};}
 rootForModulesUpdate(){this.root.updateMatrixWorld(true);this.nativeSkeleton.update();}
 get topologySignature(){return this.topology;}
 setDebug(options:FitDebugOptions){
  this.debugOptions={...options};this.debug.visible=Object.values(options).some(Boolean);
  this.debug.traverse(o=>{if((o as Mesh).isMesh){(o as Mesh).geometry.dispose();const m=(o as Mesh).material;for(const x of Array.isArray(m)?m:[m])x.dispose();}});this.debug.clear();
  if(options.sockets||options.landmarks)for(const socket of this.sockets.values()){const marker=new Mesh(new SphereGeometry(.009,6,4),new MeshBasicMaterial({color:0xd45137,depthTest:false}));marker.position.fromArray(this.socketFrame(socket.name as SocketName).position);marker.add(new AxesHelper(.06));this.debug.add(marker);}
  if(options.cages||options.coverage||options.bounds){const posed=this.surface('posed'),inverse=this.root.matrixWorld.clone().invert();const geometry=new BufferGeometry();geometry.setFromPoints(Array.from({length:this.source.positions.length/3},(_,v)=>new Vector3().fromArray(posed.positions,v*3).applyMatrix4(this.mesh.matrixWorld).applyMatrix4(inverse)));geometry.setIndex([...this.source.indices]);const wire=new Mesh(geometry,new MeshBasicMaterial({color:0x41766b,wireframe:true,transparent:true,opacity:.25}));this.debug.add(wire);}
 }
 moduleSnapshot:()=>object=()=>({bindings:[]});
 snapshot(){return {...this.moduleSnapshot(),version:this.version,body:this.body,revision:this.revision,coordinateFrame:{front:'+Z',up:'+Y',origin:'Meshy source bind',scale:this.bodyRoot.scale.toArray(),groundOffset:this.bodyRoot.position.toArray()},rigSignature:meshyRigSignature,topology:this.topology,sockets:Object.fromEntries([...this.sockets.keys()].map(name=>[name,{...this.socketFrame(name),...this.sockets.get(name)!.userData.binding}])),modules:[...this.modules.keys()],runtimeFit:'equip/body-change only'};}
 dispose(){this.setDebug({sockets:false,landmarks:false,cages:false,coverage:false,bounds:false});this.debug.removeFromParent();for(const socket of this.sockets.values())socket.removeFromParent();}
}
