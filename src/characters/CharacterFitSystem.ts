import { Quaternion, Bone, Box3, Box3Helper, BufferGeometry, Float32BufferAttribute, Group, Matrix4, Mesh, MeshBasicMaterial, Object3D, SkinnedMesh, SphereGeometry, Vector3 } from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import { attachmentVersion, cageNames, CageName, CoverageZone, coverageZones, FitVolume, LandmarkName, ModuleMetadata, socketDefinitions, SocketName, validateModule } from './AttachmentContract';

import { BodyContactSurface, createBodyContactSurface } from './BodyContactSurface';
import { requireValidatedBodySurfaceCalibration, ValidatedBodySurfaceCalibration } from './BodySurfaceCalibration';

export type FitDebugOptions={sockets:boolean;landmarks:boolean;cages:boolean;coverage:boolean;bounds:boolean};
export const noFitDebug:FitDebugOptions={sockets:false,landmarks:false,cages:false,coverage:false,bounds:false};
type SurfaceAnchor={mesh:SkinnedMesh;vertex:number};
const targets:Record<LandmarkName,readonly number[]>={
    HEAD_TOP:[0,1.81,0],FOREHEAD:[0,1.74,.12],TEMPLE_L:[.1,1.73,.03],TEMPLE_R:[-.1,1.73,.03],EAR_L:[.11,1.69,0],EAR_R:[-.11,1.69,0],OCCIPUT:[0,1.73,-.12],CHIN:[0,1.59,.08],JAW_L:[.07,1.62,.06],JAW_R:[-.07,1.62,.06],UNDER_CHIN:[0,1.58,.02],NECK_FRONT:[0,1.52,.05],NECK_BACK:[0,1.52,-.05],
    CLAVICLE_L:[.15,1.43,.02],CLAVICLE_R:[-.15,1.43,.02],CHEST_CENTER:[0,1.32,.12],BACK_CENTER:[0,1.32,-.09],WAIST_FRONT:[0,1.03,.12],WAIST_BACK:[0,1.03,-.1],HIP_L:[.17,.87,0],HIP_R:[-.17,.87,0],
    HAND_GRIP_L:[.42,.83,.06],HAND_GRIP_R:[-.42,.83,.06],FOREARM_L:[.329,1,.01],FOREARM_R:[-.329,1,.01],
};
const cageZones:Record<CageName,CoverageZone[]>={HEAD_CAGE:['HEAD'],LOWER_FACE_CAGE:['HEAD','NECK'],TORSO_CAGE:['TORSO_UPPER','TORSO_LOWER'],PELVIS_CAGE:['PELVIS']};
const colors=[0xe78562,0xefc764,0x73b7d5,0x78b995,0xbc83ca,0xd79f69,0x87b5dc,0xe181af,0xc8c079,0x7da7b5,0xd19185,0x899ccb,0xb9bc72,0x8cab88];

/** Canonical topology anchors, resolved once per immutable LOD mesh. */
export function bodyZone(mesh:SkinnedMesh,vertex:number):CoverageZone {
    const position=mesh.geometry.attributes.position,y=position.getY(vertex),side=position.getX(vertex)>=0?'L':'R';
    const indices=mesh.geometry.attributes.skinIndex,weights=mesh.geometry.attributes.skinWeight;
    let bone='',largest=-1;
    for(let k=0;k<4;k++){const weight=weights?.getComponent(vertex,k)??0;if(weight>largest){largest=weight;bone=mesh.skeleton.bones[indices?.getComponent(vertex,k)??0]?.name??'';}}
    if(/^(Toe|Foot)_/.test(bone))return 'FEET';
    if(/^(Hand|LowerArm)_/.test(bone))return `LOWER_ARM_${side}`;
    if(/^(UpperArm|UpperArmTwist|Clavicle)_/.test(bone))return `UPPER_ARM_${side}`;
    if(/^(LowerLeg)_/.test(bone))return `LOWER_LEG_${side}`;
    if(/^(UpperLeg|UpperLegTwist)_/.test(bone))return `UPPER_LEG_${side}`;
    if(y>1.56&&Math.abs(position.getX(vertex))<.18)return 'HEAD';
    if(y>1.47)return 'NECK';
    if(y>1.17)return 'TORSO_UPPER';
    if(y>1.0)return 'TORSO_LOWER';
    return 'PELVIS';
}

export class CharacterFitSystem {
    readonly version=attachmentVersion;
    readonly sockets=new Map<SocketName,Group>();
    readonly landmarks=new Map<LandmarkName,Vector3>();
    readonly cages=new Map<CageName,FitVolume>();
    /** Collision envelope and stable authored module frame are deliberately distinct. */
    headFrame:FitVolume|null=null;
    private contactSurface:BodyContactSurface|undefined;
    get bodyContactSurface(){return this.contactSurface;}
    /** Immutable neutral rig calibration, captured before any DNA morphology. */
    readonly canonicalJoints=new Map<string,Vector3>();
    readonly modules=new Map<string,{metadata:ModuleMetadata;object:Object3D}>();
    readonly debug=new Group();
    revision=0;
    private anchors=new Map<LandmarkName,SurfaceAnchor>();
    private regions=new Map<CageName,SurfaceAnchor[]>();
    private headFrameRegion:SurfaceAnchor[]=[];
    private calibratedCoverage=new Map<SkinnedMesh,readonly CoverageZone[]>();
    private debugOptions={...noFitDebug};
    private markers=new Map<LandmarkName,Mesh>();
    private sourceGeometries=new Map<SkinnedMesh,BufferGeometry>();
    private rootInverse=new Matrix4();
    private fixedCoreRadii=new Map<string,{neutral:number;current:number}>();
    constructor(private root:Group,private meshes:SkinnedMesh[],bones:Bone[],private calibration?:ValidatedBodySurfaceCalibration){
        if(calibration)requireValidatedBodySurfaceCalibration(calibration,meshes);
        root.updateMatrixWorld(true);
        for(const bone of bones)this.canonicalJoints.set(bone.name,root.worldToLocal(bone.getWorldPosition(new Vector3())));
        this.debug.name='AttachmentFitDebug';this.debug.visible=false;root.add(this.debug);
        for(const mesh of meshes)this.sourceGeometries.set(mesh,mesh.geometry);
        if(calibration){
            calibration.meshes.forEach((entry,mi)=>this.calibratedCoverage.set(meshes[mi],entry.coverage));
            for(const [name,anchor] of Object.entries(calibration.landmarks))this.anchors.set(name as LandmarkName,{mesh:meshes[anchor.mesh],vertex:anchor.vertex});
            for(const name of cageNames)this.regions.set(name,calibration.meshes.flatMap((entry,mi)=>entry.cages[name].map(vertex=>({mesh:meshes[mi],vertex}))));
            this.headFrameRegion=calibration.meshes.flatMap((entry,mi)=>entry.headModuleFrame.map(vertex=>({mesh:meshes[mi],vertex})));
        }else{
        for(const [name,target] of Object.entries(targets)){
            let best:SurfaceAnchor|undefined,distance=Infinity;const point=new Vector3(...target as [number,number,number]);
            for(const mesh of meshes){const p=mesh.geometry.attributes.position;
                for(let i=0;i<p.count;i++){const candidate=new Vector3().fromBufferAttribute(p,i),d=candidate.distanceToSquared(point);
                    if(d<distance){distance=d;best={mesh,vertex:i};}
                }
            }if(best)this.anchors.set(name as LandmarkName,best);
        }
        for(const name of cageNames){const region:SurfaceAnchor[]=[];
            for(const mesh of meshes){const p=mesh.geometry.attributes.position;
                for(let vertex=0;vertex<p.count;vertex++){
                    const zone=bodyZone(mesh,vertex);
                    if(!cageZones[name].includes(zone))continue;
                    if(name==='LOWER_FACE_CAGE'&&(p.getY(vertex)>1.68||p.getZ(vertex)<-.04))continue;
                    region.push({mesh,vertex});
                }
            }this.regions.set(name,region);
        }
        }
        for(const [name,definition] of Object.entries(socketDefinitions)){
            const bone=bones.find(b=>b.name===definition.bone);if(!bone)throw new Error(`Rig is missing ${definition.bone} for ${name}`);
            const socket=new Group();socket.name=name;socket.userData.attachmentContract=attachmentVersion;bone.add(socket);this.sockets.set(name as SocketName,socket);
        }
    }
    coverageZone(mesh:SkinnedMesh,vertex:number):CoverageZone { return this.calibratedCoverage.get(mesh)?.[vertex]??bodyZone(mesh,vertex); }
    private point(anchor:SurfaceAnchor,animated=false){
        const point=anchor.mesh.getVertexPosition(anchor.vertex,new Vector3());
        if(animated)point.applyMatrix4(anchor.mesh.matrixWorld).applyMatrix4(this.rootInverse);return point;
    }
    /** Called in neutral bind pose after morphology changes, never from the frame loop. */
    refit(){
        for(const mesh of this.meshes)mesh.skeleton.update();
        for(const [name,anchor] of this.anchors)this.landmarks.set(name,this.point(anchor));
        for(const [name,region] of this.regions){
            const all=region.map(anchor=>this.point(anchor)),canonical=region.map(anchor=>new Vector3().fromBufferAttribute(this.sourceGeometries.get(anchor.mesh)!.attributes.position,anchor.vertex));
            const bounds=new Box3().setFromPoints(all),canonicalBounds=new Box3().setFromPoints(canonical);
            // 26 support directions give a small hull while preserving extrema.
            const chosen=new Set<number>();
            for(let x=-1;x<=1;x++)for(let y=-1;y<=1;y++)for(let z=-1;z<=1;z++){
                if(!x&&!y&&!z)continue;let maximum=-Infinity,index=0;const direction=new Vector3(x,y,z);
                all.forEach((point,i)=>{const dot=point.dot(direction);if(dot>maximum){maximum=dot;index=i;}});chosen.add(index);
            }
            const points=name==='HEAD_CAGE'?all:[...chosen].map(i=>all[i]);
            if(bounds.isEmpty()||points.length<4)throw new Error(`Not enough body surface for ${name}`);
            this.cages.set(name,{name,points,bounds,canonicalBounds});
        }
        const frameRegion=this.headFrameRegion;
        this.headFrame=frameRegion.length?{name:'HEAD_CAGE',points:frameRegion.map(anchor=>this.point(anchor)),bounds:new Box3().setFromPoints(frameRegion.map(anchor=>this.point(anchor))),canonicalBounds:new Box3().setFromPoints(frameRegion.map(anchor=>new Vector3().fromBufferAttribute(this.sourceGeometries.get(anchor.mesh)!.attributes.position,anchor.vertex)))}:this.cages.get('HEAD_CAGE')!;
        this.root.updateMatrixWorld(true);
        for(const [name,definition] of Object.entries(socketDefinitions)){
            if(!('landmark' in definition))continue;
            const socket=this.sockets.get(name as SocketName)!,point=this.landmarks.get(definition.landmark as LandmarkName)!.clone();
            this.root.localToWorld(point);socket.parent!.worldToLocal(point);socket.position.copy(point);
            // Socket axes stay +Y up/+Z front in the neutral character frame.
            socket.quaternion.copy(socket.parent!.getWorldQuaternion(socket.quaternion)).invert();
        }
        this.captureFixedCoreRadii();this.revision++;
        this.contactSurface=this.calibration?createBodyContactSurface(this.calibration,this.meshes,{sourceSHA256:this.calibration.sourceSHA256,root:this.root,getRevision:()=>this.revision,sourceGeometries:this.sourceGeometries}):undefined;
        this.rebuildDebug();
    }
    /**
     * Optional source-authored fitting subset, in the same authoring-root metre
     * frame as cages. Collision cages/headFrame remain complete and unchanged.
     * Resolve only in neutral bind pose after refit, never in the frame loop.
     */
    contactVolume(metadata:ModuleMetadata):FitVolume|undefined {
        validateModule(metadata);
        if(!('fitContactZones' in metadata))return undefined;
        if(!this.calibration)throw new Error('Explicit contact zones require source-validated body calibration.');
        const name=metadata.fitCage!,zones=new Set(metadata.fitContactZones!);
        const points:Vector3[]=[],canonical:Vector3[]=[];
        this.calibration.meshes.forEach((entry,mi)=>{
            const mesh=this.meshes[mi],source=this.sourceGeometries.get(mesh);
            const position=source?.getAttribute('position'),index=source?.index;
            if(!position||position.itemSize!==3||entry.name!==mesh.name||!index||entry.neutralPositions.length!==position.count*3||entry.triangleIndices.length!==index.count)
                throw new Error('Contact volume source topology/correspondence mismatch.');
            // Check captured neutral geometry rather than a reversible masked
            // clone's index. The constructor already validated the actual clone.
            for(let i=0;i<position.count;i++)for(let axis=0;axis<3;axis++){
                const actual=position.getComponent(i,axis);
                if(!Number.isFinite(actual)||actual!==entry.neutralPositions[i*3+axis])throw new Error('Stale contact volume neutral POSITION correspondence.');
            }
            for(let i=0;i<index.count;i++)if(index.getX(i)!==entry.triangleIndices[i])throw new Error('Stale contact volume triangle correspondence.');
            for(const vertex of entry.cages[name]){
                if(!zones.has(entry.coverage[vertex]))continue;
                const current=this.point({mesh,vertex});
                const neutral=new Vector3().fromArray(entry.neutralPositions,vertex*3);
                if(![current.x,current.y,current.z,neutral.x,neutral.y,neutral.z].every(Number.isFinite))throw new Error('Nonfinite contact region position.');
                points.push(current);canonical.push(neutral);
            }
        });
        const bounds=new Box3().setFromPoints(points),canonicalBounds=new Box3().setFromPoints(canonical);
        const sufficient=(values:Vector3[],box:Box3)=>{
            if(values.length<4||box.isEmpty())return false;
            const scale=box.getSize(new Vector3()).length();
            if(!Number.isFinite(scale)||scale<=0)return false;
            // Split corners alone do not imply a usable three-dimensional region.
            const a=values[0],b=values.find(p=>p.distanceToSquared(a)>(scale*1e-10)**2);
            if(!b)return false;
            const ab=b.clone().sub(a),c=values.find(p=>ab.clone().cross(p.clone().sub(a)).length()>scale*scale*1e-10);
            if(!c)return false;
            const normal=ab.cross(c.clone().sub(a));
            return values.some(p=>Math.abs(normal.dot(p.clone().sub(a)))>scale*scale*scale*1e-10);
        };
        if(!sufficient(points,bounds)||!sufficient(canonical,canonicalBounds))throw new Error('Insufficient three-dimensional contact region.');
        return {name,points,bounds,canonicalBounds};
    }
    /** Neutral, rotation/translation-invariant size; full calibrated core remains
     * authoritative when the displayed body has a reversible coverage mask. */
    private captureFixedCoreRadii(){
        this.fixedCoreRadii.clear();if(!this.calibration)return;
        const radius=(points:Vector3[])=>{const centre=points.reduce((sum,p)=>sum.add(p),new Vector3()).multiplyScalar(1/points.length);return Math.sqrt(points.reduce((sum,p)=>sum+p.distanceToSquared(centre),0)/points.length);};
        this.root.updateMatrixWorld(true);const inverse=this.root.matrixWorld.clone().invert();
        for(const core of ['hand_L','hand_R'] as const){
            const neutral:Vector3[]=[],current:Vector3[]=[];
            this.calibration.meshes.forEach((entry,mi)=>{
                const mesh=this.meshes[mi],source=this.sourceGeometries.get(mesh)!,p=source.getAttribute('position'),index=source.index;
                if(!p||!index||p.count*3!==entry.neutralPositions.length||index.count!==entry.triangleIndices.length)throw new Error('Stale fixed-core source topology.');
                for(let i=0;i<index.count;i++)if(index.getX(i)!==entry.triangleIndices[i])throw new Error('Stale fixed-core full triangle correspondence.');
                const local=mesh.matrixWorld.clone().premultiply(inverse);
                for(const vertex of entry.cores[core]){
                    for(let axis=0;axis<3;axis++)if(p.getComponent(vertex,axis)!==entry.neutralPositions[vertex*3+axis])throw new Error('Stale fixed-core neutral POSITION correspondence.');
                    const a=new Vector3().fromBufferAttribute(p,vertex).applyMatrix4(local),b=mesh.getVertexPosition(vertex,new Vector3()).applyMatrix4(local);
                    if(![...a.toArray(),...b.toArray()].every(Number.isFinite))throw new Error('Nonfinite fixed-core surface.');neutral.push(a);current.push(b);
                }
            });
            const a=radius(neutral),b=radius(current);if(!Number.isFinite(a)||!Number.isFinite(b)||a<=1e-6||b<=1e-6)throw new Error('Invalid fixed-core radius.');this.fixedCoreRadii.set(core,{neutral:a,current:b});
        }
    }
    equipmentProportion(metadata:ModuleMetadata){
        validateModule(metadata);const reference=metadata.equipmentBindings?.proportions;if(!reference)return 1;
        if(this.calibration&&!this.fixedCoreRadii.has(reference.bodyCore))this.captureFixedCoreRadii();
        const measured=this.fixedCoreRadii.get(reference.bodyCore);
        if(!this.calibration||reference.sourceSHA256!==this.calibration.sourceSHA256||!measured)throw new Error('Equipment proportion needs this source-validated fixed core.');
        if(Math.abs(measured.neutral-reference.referenceRadius)>Math.max(1e-8,measured.neutral*1e-6))throw new Error('Equipment reference radius differs from the measured complete source core.');
        const ratio=measured.current/reference.referenceRadius;if(!Number.isFinite(ratio)||ratio<=0)throw new Error('Nonfinite equipment proportion.');return ratio;
    }
    /** Attach a fitted object while preserving its established bind-frame placement. */
    attach(metadata:ModuleMetadata,object:Object3D,preserveFrame=true){
        validateModule(metadata);const proportion=this.equipmentProportion(metadata);const previous=this.modules.get(metadata.id);if(previous&&previous.object!==object)previous.object.removeFromParent();
        object.userData.attachmentMetadata=metadata;
        const socket=this.sockets.get(metadata.anchor)!;
        if(metadata.type==='garment'){this.root.add(object);}else if(preserveFrame){this.root.updateMatrixWorld(true);socket.attach(object);}else{socket.add(object);object.position.set(0,0,0);object.quaternion.identity();}
        if(metadata.type==='equipment'&&metadata.equipmentBindings){
            const bindings=metadata.equipmentBindings,carry=bindings.sockets[metadata.anchor as keyof typeof bindings.sockets]!;
            const matrix=(frame:typeof bindings.grip)=>new Matrix4().compose(new Vector3(...frame.position),new Quaternion(...frame.quaternion),new Vector3(1,1,1));
            const sizedCarry=new Matrix4().compose(new Vector3(...carry.position).multiplyScalar(proportion),new Quaternion(...carry.quaternion),new Vector3(proportion,proportion,proportion));
            sizedCarry.multiply(matrix(bindings.grip).invert()).decompose(object.position,object.quaternion,object.scale);
            object.userData.equipmentProportion=proportion;
        }
        this.modules.set(metadata.id,{metadata,object});this.rebuildDebug();return object;
    }
    forgetModules(){this.modules.clear();}
    snapshot(){return {version:this.version,coordinateFrame:{front:'+Z',up:'+Y',origin:'feet/root bind origin'},revision:this.revision,
        sockets:[...this.sockets.keys()],landmarks:Object.fromEntries([...this.landmarks].map(([key,p])=>[key,p.toArray()])),
        bodySurfaceCalibration:this.calibration?{version:this.calibration.version,sourceSHA256:this.calibration.sourceSHA256,cores:this.calibration.meshes.map(entry=>Object.fromEntries(Object.entries(entry.cores).map(([key,ids])=>[key,ids.length])))}:null,
        headFrame:this.headFrame?{min:this.headFrame.bounds.min.toArray(),max:this.headFrame.bounds.max.toArray(),vertices:this.headFrame.points.length}:null,
        cages:Object.fromEntries([...this.cages].map(([key,cage])=>[key,{min:cage.bounds.min.toArray(),max:cage.bounds.max.toArray(),vertices:cage.points.length}])),
        modules:[...this.modules.values()].map(module=>module.metadata)};}
    /** Reversible index-only masking; source geometry and its morphs remain immutable. */
    maskBody(covers:CoverageZone[]=[],bands:ModuleMetadata['coverageBands']={}){
        for(const mesh of this.meshes){const source=this.sourceGeometries.get(mesh)!;
            if(mesh.geometry!==source)mesh.geometry.dispose();
            if(!covers.length){mesh.geometry=source;continue;}
            const geometry=source.clone(),index=source.index,count=index?.count??source.attributes.position.count,kept:number[]=[];
            for(let i=0;i<count;i+=3){const ids=[0,1,2].map(k=>index?index.getX(i+k):i+k);
                if(ids.every(id=>{const zone=this.coverageZone(mesh,id),band=bands?.[zone],y=source.attributes.position.getY(id);return covers.includes(zone)&&(!band||y>=(band.minY??-Infinity)&&y<=(band.maxY??Infinity));}))continue;kept.push(...ids);
            }geometry.setIndex(kept);mesh.geometry=geometry;
        }
    }
    setDebug(options:Partial<FitDebugOptions>){Object.assign(this.debugOptions,options);this.rebuildDebug();}
    private clearDebug(){this.debug.traverse(object=>{if((object as Mesh).geometry)(object as Mesh).geometry.dispose();const material=(object as Mesh).material;if(material)for(const m of Array.isArray(material)?material:[material])m.dispose();});this.debug.clear();this.markers.clear();}
    private moduleBounds(object:Object3D){
        const box=new Box3();object.updateWorldMatrix(true,true);
        object.traverse(child=>{const mesh=child as Mesh;if(!mesh.isMesh)return;const index=mesh.geometry.index,count=index?.count??mesh.geometry.attributes.position.count,used=new Set<number>();
            for(let i=0;i<count;i++)used.add(index?index.getX(i):i);
            const local=new Matrix4().multiplyMatrices(this.rootInverse,mesh.matrixWorld);
            for(const id of used)box.expandByPoint(mesh.getVertexPosition(id,new Vector3()).applyMatrix4(local));
        });return box;
    }
    private rebuildDebug(){
        this.clearDebug();const options=this.debugOptions;this.debug.visible=Object.values(options).some(Boolean);if(!this.debug.visible)return;
        this.root.updateMatrixWorld(true);this.rootInverse.copy(this.root.matrixWorld).invert();
        if(options.landmarks)for(const [name,point] of this.landmarks){const marker=new Mesh(new SphereGeometry(.008,6,4),new MeshBasicMaterial({color:0xff4777,depthTest:false}));marker.name=name;marker.position.copy(point);this.markers.set(name,marker);this.debug.add(marker);}
        if(options.sockets)for(const [name,socket] of this.sockets){const marker=new Mesh(new SphereGeometry(.012,6,4),new MeshBasicMaterial({color:0x32c9ff,wireframe:true,depthTest:false}));marker.name=`debug_${name}`;marker.userData.socket=socket;this.debug.add(marker);}
        if(options.cages)for(const [name,cage] of this.cages){const geometry=new ConvexGeometry(cage.points),mesh=new Mesh(geometry,new MeshBasicMaterial({color:colors[cageNames.indexOf(name)],wireframe:true,transparent:true,opacity:.5,depthTest:false}));mesh.name=name;
            const p=geometry.attributes.position,region=this.regions.get(name)!;mesh.userData.surfaceAnchors=[];
            for(let i=0;i<p.count;i++){const point=new Vector3().fromBufferAttribute(p,i);let best=region[0],distance=Infinity;
                for(const anchor of region){const d=this.point(anchor).distanceToSquared(point);if(d<distance){distance=d;best=anchor;}}
                mesh.userData.surfaceAnchors.push(best);
            }this.debug.add(mesh);}
        if(options.coverage)for(const body of this.meshes){const geometry=body.geometry.clone(),p=geometry.attributes.position,colorsArray:number[]=[];
            for(let i=0;i<p.count;i++){const color=colors[coverageZones.indexOf(this.coverageZone(body,i))];colorsArray.push(((color>>16)&255)/255,((color>>8)&255)/255,(color&255)/255);}
            geometry.setAttribute('color',new Float32BufferAttribute(colorsArray,3));const mesh=new SkinnedMesh(geometry,new MeshBasicMaterial({vertexColors:true,wireframe:true,transparent:true,opacity:.65,depthTest:false}));mesh.bind(body.skeleton,body.bindMatrix);mesh.morphTargetInfluences=body.morphTargetInfluences?.slice();this.debug.add(mesh);
        }
        if(options.bounds)for(const {object} of this.modules.values()){const helper=new Box3Helper(this.moduleBounds(object),0x64c566);helper.userData.moduleObject=object;this.debug.add(helper);}
        this.updateDebug();
    }
    /** Animation updates only visible debug markers, never fits modules or rebuilds cages. */
    updateDebug(){
        if(!this.debug.visible)return;this.root.updateMatrixWorld(true);this.rootInverse.copy(this.root.matrixWorld).invert();for(const mesh of this.meshes)mesh.skeleton.update();
        for(const [name,marker] of this.markers)marker.position.copy(this.point(this.anchors.get(name)!,true));
        for(const object of this.debug.children){const socket=object.userData.socket as Object3D|undefined;if(socket)object.position.copy(this.root.worldToLocal(socket.getWorldPosition(new Vector3())));
            const anchors=object.userData.surfaceAnchors as SurfaceAnchor[]|undefined;if(anchors){const p=(object as Mesh).geometry.attributes.position;anchors.forEach((anchor,i)=>{const point=this.point(anchor,true);p.setXYZ(i,point.x,point.y,point.z);});p.needsUpdate=true;}
            if((object as SkinnedMesh).isSkinnedMesh){const debugMesh=object as SkinnedMesh;debugMesh.morphTargetInfluences=this.meshes[0].morphTargetInfluences?.slice();}
            const module=object.userData.moduleObject as Object3D|undefined;if(module)(object as Box3Helper).box.copy(this.moduleBounds(module));
        }
    }
    dispose(){this.clearDebug();this.debug.removeFromParent();for(const socket of this.sockets.values())socket.removeFromParent();this.maskBody();this.modules.clear();}
}
