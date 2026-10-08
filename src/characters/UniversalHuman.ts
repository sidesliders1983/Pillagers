import { AnimationAction, AnimationMixer, Bone, Box3, BufferAttribute, BufferGeometry, Color, Group, InterleavedBufferAttribute, Material, MeshStandardMaterial, Quaternion, SkinnedMesh, Vector3 } from 'three';
import { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { HumanProfile } from './UniversalHumanProfile';
import { SoftBodySpring } from '../character-lab/SoftBodySpring';
import { appearanceModules, clothingLayer, disposeModules } from '../character-lab/AppearanceModules';
import { skinTexture, tintSkinVertexColors } from '../character-lab/SkinTint';
import { CharacterFitSystem } from './CharacterFitSystem';
import { attachmentVersion, ModuleMetadata, validateModule } from './AttachmentContract';
import { registeredAppearanceMetadata } from './CharacterAssets';
import { characterContract } from './CharacterContract';
import { disposeGarment, fitGarment } from './GarmentFit';

import { ValidatedBodySurfaceCalibration } from './BodySurfaceCalibration';

export type HumanAnimation=typeof characterContract.animations[number];
/** Per-character skeleton/materials; vertex palettes own geometry, other source geometry stays shared. */
export class UniversalHuman {
    readonly root=new Group();
    readonly fit:CharacterFitSystem;
    private equipped=new Map<string,{metadata:ModuleMetadata;source:Group;object:Group}>();
    private mixer:AnimationMixer;
    private meshes:SkinnedMesh[]=[];
    private bones:Bone[]=[];
    private rest=new Map<Bone,Vector3>();
    private restRotation=new Map<Bone,Quaternion>();
    private materials:Material[]=[];
    private sourceMaps=new Map<MeshStandardMaterial,import('three').Texture>();
    private tintMaps:import('three').Texture[]=[];
    private vertexPalettes=new Map<SkinnedMesh,{geometry:BufferGeometry;source:BufferAttribute|InterleavedBufferAttribute}>();
    private skinTone:string|null=null;
    private animation:HumanAnimation='Idle';
    private action:AnimationAction|null=null;
    private belly=new SoftBodySpring(55,9);
    private breasts=new SoftBodySpring(100,12);
    private softness={belly:0,breasts:0};
    private elapsed=0;
    private previousPosition:Vector3|null=null;
    private previousVelocity=new Vector3();
    private modules=new Group();
    private garment:SkinnedMesh|null=null;
    private motion={cadence:1,stride:1,footfall:1};
    get clips(){return this.asset.animations;}
    constructor(private asset:GLTF,profile:HumanProfile,skinTone:string,private hairAsset:Group|null=null,private beardAsset:Group|null=null,garments:Array<{metadata:ModuleMetadata;source:Group}>=[],private presentation:{technicalWaistWrap:boolean}={technicalWaistWrap:true},calibration?:ValidatedBodySurfaceCalibration){
        const body=clone(asset.scene);this.root.add(body);
        body.traverse(object=>{
            if((object as Bone).isBone){const bone=object as Bone;this.bones.push(bone);this.rest.set(bone,bone.position.clone());this.restRotation.set(bone,bone.quaternion.clone());}
            if((object as SkinnedMesh).isSkinnedMesh){
                const mesh=object as SkinnedMesh;mesh.castShadow=true;mesh.receiveShadow=true;
                // Skeleton.clone shares the inverse array. Detach it before adapting
                // bind matrices, or the pinned character and cached source are changed too.
                mesh.skeleton.boneInverses=mesh.skeleton.boneInverses.map(matrix=>matrix.clone());
                const copy=(material:Material)=>{const m=material.clone();if((m as MeshStandardMaterial).isMeshStandardMaterial){const standard=m as MeshStandardMaterial;standard.flatShading=true;if(standard.map)this.sourceMaps.set(standard,standard.map);}this.materials.push(m);return m;};
                mesh.material=Array.isArray(mesh.material)?mesh.material.map(copy):copy(mesh.material);
                const mats=Array.isArray(mesh.material)?mesh.material:[mesh.material],palette=mesh.geometry.getAttribute('color');
                // A shared COLOR_0 cannot safely mix textured and palette-only material groups.
                // Capture per-instance geometry before canonical fit records its coverage source.
                if(palette&&(palette.itemSize===3||palette.itemSize===4)&&palette.count===mesh.geometry.getAttribute('position').count&&mats.every(material=>{
                    const standard=material as MeshStandardMaterial;return standard.isMeshStandardMaterial&&standard.vertexColors&&!standard.map;
                })){
                    const source=palette.clone(),geometry=mesh.geometry.clone();mesh.geometry=geometry;
                    this.vertexPalettes.set(mesh,{geometry,source});
                }
                this.meshes.push(mesh);
            }
        });
        if(!this.meshes.length)throw new Error('Universal Human GLB has no skinned mesh.');
        this.fit=new CharacterFitSystem(this.root,this.meshes,this.bones,calibration);
        for(const garment of garments){validateModule(garment.metadata);this.fit.equipmentProportion(garment.metadata);this.equipped.set(garment.metadata.id,{...garment,object:new Group()});}
        this.mixer=new AnimationMixer(body);this.apply(profile,skinTone);this.setAnimation('Idle');
    }
    apply(profile:HumanProfile,skinTone:string,refreshAppearance=true){
        if(this.equipped.size)refreshAppearance=true;
        const retint=this.skinTone!==skinTone;
        if(retint){for(const texture of this.tintMaps)texture.dispose();this.tintMaps=[];this.skinTone=skinTone;}
        if(refreshAppearance){this.disposeAppearance();this.modules=new Group();}this.motion=profile.motion;
        // Bind inverses must be measured in the asset's origin frame, never in
        // the translated/rotated world or comparison container.
        const parent=this.root.parent,position=this.root.position.clone(),rotation=this.root.quaternion.clone();
        this.root.removeFromParent();this.root.position.set(0,0,0);this.root.quaternion.identity();
        const actionTime=this.action?.time??0;
        this.root.userData.universalHumanProfile=profile;
        this.softness={belly:profile.weights.Overweight,breasts:profile.weights.Feminine};
        this.belly.reset();this.breasts.reset();this.previousPosition=null;this.previousVelocity.set(0,0,0);
        // Restore neutral pose before adapting bind translations and rebuilding inverse bind matrices.
        this.mixer.stopAllAction();this.action=null;this.root.scale.y=1;
        for(const bone of this.bones){
            bone.position.copy(this.rest.get(bone)!);
            bone.quaternion.copy(this.restRotation.get(bone)!);
            const source=bone.userData.morphTranslations;
            const deltas=typeof source==='string'?JSON.parse(source):source;
            if(deltas)for(const [key,weight] of Object.entries(profile.weights)){
                const delta=deltas[key];if(delta)bone.position.addScaledVector(new Vector3(...delta as [number,number,number]),weight);
            }
        }
        for(const mesh of this.meshes){
            for(const [key,weight] of Object.entries(profile.weights)){
                const index=mesh.morphTargetDictionary?.[key];
                if(index!==undefined&&mesh.morphTargetInfluences)mesh.morphTargetInfluences[index]=weight;
            }
            mesh.frustumCulled=false;
            const palette=this.vertexPalettes.get(mesh);
            if(palette){
                if(retint){
                    const tinted=tintSkinVertexColors(palette.source,skinTone);
                    palette.geometry.setAttribute('color',tinted);
                    // A coverage mask owns indices, but must retain the current instance palette.
                    if(mesh.geometry!==palette.geometry)mesh.geometry.setAttribute('color',tinted);
                }
                continue;
            }
            // Legacy source albedo keeps its existing selective skin-pixel tint path.
            const mats=Array.isArray(mesh.material)?mesh.material:[mesh.material];
            for(const mat of mats)if((mat as MeshStandardMaterial).isMeshStandardMaterial){
                const standard=mat as MeshStandardMaterial,source=this.sourceMaps.get(standard);
                if(!retint)continue;
                const tinted=source?skinTexture(source,skinTone):null;
                standard.map=tinted??source??null;standard.color.set('#ffffff');
                if(tinted)this.tintMaps.push(tinted);
                standard.needsUpdate=true;
            }
        }
        this.root.updateMatrixWorld(true);
        const skeletons=new Set(this.meshes.map(mesh=>mesh.skeleton));
        for(const skeleton of skeletons)skeleton.calculateInverses();
        this.fit.refit();
        const head=this.bones.find(b=>b.name==='Head');
        if(head&&refreshAppearance&&(this.hairAsset||this.beardAsset)){
            const cage=this.fit.cages.get('HEAD_CAGE')!,bounds=this.fit.headFrame!.bounds,skull=cage.points.map(point=>point.clone());
            if(!bounds.isEmpty()){
                const size=bounds.getSize(new Vector3());
                const lod=Number(this.meshes[0].userData.lod??0);
                const appearance=appearanceModules(profile.appearance,size,lod,profile.appearanceFit,this.hairAsset,skull.map(p=>p.sub(bounds.getCenter(new Vector3()))),this.beardAsset,undefined,this.fit.cages,undefined,this.fit.bodyContactSurface?{kind:'body-triangles',surface:this.fit.bodyContactSurface,centre:bounds.getCenter(new Vector3())}:{kind:'legacy-convex'});
                appearance.position.copy(bounds.getCenter(new Vector3()));this.root.add(appearance);this.root.updateMatrixWorld(true);head.attach(appearance);
                for(const kind of ['hair','beard'] as const){const module=appearance.getObjectByName(kind==='hair'?'GeneratedHair':'GeneratedBeard') as Group|undefined;
                    if(module)this.fit.attach(registeredAppearanceMetadata(kind,kind==='hair'?profile.appearance.hairStyle:profile.appearance.beardStyle),module);
                }
                this.modules.userData.appearanceObject=appearance;
            }
        }
        if(head&&refreshAppearance&&!this.hairAsset&&!this.beardAsset){
            const appearance=new Group();appearance.name='Appearance';appearance.userData.beardAsset='pending';
            head.add(appearance);this.modules.userData.appearanceObject=appearance;
        }
        if(refreshAppearance&&this.presentation.technicalWaistWrap&&![...this.equipped.values()].some(module=>module.metadata.type==='garment'))for(const body of this.meshes){const garment=clothingLayer(body,profile.appearanceFit.clothing);if(garment){body.parent!.add(garment);this.garment=garment;
            this.fit.attach({version:attachmentVersion,id:'technical-waist-wrap',type:'garment',anchor:'socket_waist',fitCage:'PELVIS_CAGE',fitMode:'drape',slot:'lower',covers:['PELVIS'],clearance:.004,authoringFrame:'canonical'},garment);break;}}
        if(refreshAppearance)for(const module of this.equipped.values())this.installModule(module.metadata,module.source);
        this.root.scale.y=.8;this.setAnimation(this.animation);
        const active=this.action as AnimationAction|null;if(active)active.time=actionTime;
        this.root.position.copy(position);this.root.quaternion.copy(rotation);if(parent)parent.add(this.root);
        this.root.updateMatrixWorld(true);
        this.fit.updateDebug();
    }
    /** Extension point shared by Lab and World; callers supply registered assets. */
    equip(metadata:ModuleMetadata,source:Group){
        validateModule(metadata);this.fit.equipmentProportion(metadata);
        if('fitContactZones' in metadata&&metadata.type!=='beard')throw new Error('Contact-zone fitting is implemented only for the beard consumer.');
        for(const [id,module] of this.equipped)if(module.metadata.type===metadata.type&&(metadata.type==='hair'||metadata.type==='beard'||module.metadata.slot===metadata.slot))this.equipped.delete(id);
        this.equipped.set(metadata.id,{metadata,source,object:new Group()});
        this.apply(this.root.userData.universalHumanProfile,this.skinTone!);return this.equipped.get(metadata.id)!.object;
    }
    unequip(id:string){this.equipped.delete(id);this.apply(this.root.userData.universalHumanProfile,this.skinTone!);}
    private installModule(metadata:ModuleMetadata,source:Group){
        if('fitContactZones' in metadata&&metadata.type!=='beard')throw new Error('Contact-zone fitting is implemented only for the beard consumer.');
        let object:Group;
        const profile=this.root.userData.universalHumanProfile as HumanProfile;
        if(metadata.type==='beard'&&(profile.age<18||profile.masculinity<.5))return;
        if(metadata.type==='hair'||metadata.type==='beard'||metadata.type==='mask'&&metadata.fitMode==='conform'){
            for(const [id,module] of this.fit.modules)if(module.metadata.type===metadata.type){disposeGarment(module.object as Group);this.fit.modules.delete(id);}
            const cage=this.fit.cages.get('HEAD_CAGE')!,frame=this.fit.headFrame!,centre=frame.bounds.getCenter(new Vector3());
            const appearance=appearanceModules({...profile.appearance,beardStyle:metadata.type==='beard'?(metadata.sourceStyle??'short') as HumanProfile['appearance']['beardStyle']:'none'},frame.bounds.getSize(new Vector3()),2,profile.appearanceFit,metadata.type!=='beard'?source:null,cage.points.map(p=>p.clone().sub(centre)),metadata.type==='beard'?source:null,metadata,this.fit.cages,this.fit.contactVolume(metadata),this.fit.bodyContactSurface?{kind:'body-triangles',surface:this.fit.bodyContactSurface,centre}:{kind:'legacy-convex'});
            appearance.position.copy(centre);this.root.add(appearance);this.root.updateMatrixWorld(true);
            object=appearance.getObjectByName(metadata.type==='beard'?'GeneratedBeard':'GeneratedHair') as Group;
            this.fit.attach(metadata,object,true);appearance.removeFromParent();this.equipped.get(metadata.id)!.object=object;return;
        }
        if(metadata.type==='garment')object=fitGarment(source,metadata,this.meshes[0],this.fit,profile.appearanceFit.clothing);
        else{
            object=source.clone(true);object.traverse(child=>{const mesh=child as import('three').Mesh;if(mesh.isMesh){mesh.geometry=mesh.geometry.clone();mesh.material=Array.isArray(mesh.material)?mesh.material.map(m=>m.clone()):mesh.material.clone();}});
        }
        this.fit.attach(metadata,object,metadata.type==='garment');this.equipped.get(metadata.id)!.object=object;
        const covers=[...this.equipped.values()].flatMap(module=>module.metadata.covers??[]),bands=Object.assign({},...[...this.equipped.values()].map(module=>module.metadata.coverageBands??{}));this.fit.maskBody(covers,bands);
    }
    setAnimation(name:HumanAnimation){
        const clip=this.asset.animations.find(clip=>clip.name===name);
        if(!clip)throw new Error(`Universal Human is missing ${name}.`);
        if(this.action && this.animation===name)return;
        const previous=this.action;this.animation=name;this.action=this.mixer.clipAction(clip);this.action.reset().setEffectiveWeight(1).play();
        if(previous)previous.crossFadeTo(this.action,.2,false);
        this.mixer.timeScale=this.motion.cadence;
    }
    get animationState(){return {animation:this.animation,time:this.action?.time??0};}
    /** Reproducible clip-local pose, sampled once; springs are reset rather than retaining an earlier simulation. */
    sampleAnimation(name:HumanAnimation,time:number){
        if(!Number.isFinite(time)||time<0||time>60)throw new Error('Clip time must be between 0 and 60 seconds.');
        const clip=this.asset.animations.find(clip=>clip.name===name);
        if(!clip)throw new Error(`Universal Human is missing ${name}.`);
        this.mixer.stopAllAction();this.action=null;this.setAnimation(name);
        this.action!.time=time%clip.duration;
        this.elapsed=0;this.belly.reset();this.breasts.reset();this.previousPosition=null;this.previousVelocity.set(0,0,0);
        for(const mesh of this.meshes)for(const axis of ['BellyJiggle','BreastJiggle']){
            const index=mesh.morphTargetDictionary?.[axis];if(index!==undefined&&mesh.morphTargetInfluences)mesh.morphTargetInfluences[index]=0;
        }
        if(this.garment?.morphTargetInfluences&&this.meshes[0].morphTargetInfluences)this.garment.morphTargetInfluences.splice(0,this.garment.morphTargetInfluences.length,...this.meshes[0].morphTargetInfluences);
        this.update(0);this.root.updateMatrixWorld(true);for(const mesh of this.meshes)mesh.skeleton.update();this.fit.updateDebug();
    }
    update(delta:number){
        for(const bone of this.bones)bone.quaternion.copy(this.restRotation.get(bone)!);
        const dt=Math.max(0,Math.min(.1,delta));this.mixer.update(dt);this.elapsed+=dt;
        for(const bone of this.bones)if(/^(UpperLeg|LowerLeg|UpperArm|LowerArm)_/.test(bone.name)){
            const arm=/Arm_/.test(bone.name),amplitude=arm? this.motion.stride+.08*(1-this.motion.stride):this.motion.stride;
            bone.quaternion.slerp(this.restRotation.get(bone)!,1-amplitude);
        }
        if(!dt)return;
        const position=this.root.getWorldPosition(new Vector3());
        const velocity=this.previousPosition?position.clone().sub(this.previousPosition).divideScalar(dt):new Vector3();
        const acceleration=velocity.clone().sub(this.previousVelocity).divideScalar(dt);
        this.previousPosition=position;this.previousVelocity.copy(velocity);
        const clip=this.asset.animations.find(clip=>clip.name===this.animation)!;
        const amplitude=this.animation==='Run'?.65:this.animation==='Walk'?.38:.035;
        const footfall=Math.sin(this.elapsed*this.motion.cadence/clip.duration*Math.PI*4)*amplitude*this.motion.footfall;
        const inertia=Math.max(-.4,Math.min(.4,-acceleration.y*.015));
        const belly=this.softness.belly?this.belly.step(dt,footfall+inertia)*this.softness.belly:0;
        const breasts=this.softness.breasts?this.breasts.step(dt,footfall+inertia)*this.softness.breasts:0;
        for(const mesh of this.meshes){
            for(const [name,value] of [['BellyJiggle',belly],['BreastJiggle',breasts]] as const){
                const index=mesh.morphTargetDictionary?.[name];
                if(index!==undefined&&mesh.morphTargetInfluences)mesh.morphTargetInfluences[index]=value;
            }
        }
        if(this.garment?.morphTargetInfluences&&this.meshes[0].morphTargetInfluences)this.garment.morphTargetInfluences.splice(0,this.garment.morphTargetInfluences.length,...this.meshes[0].morphTargetInfluences);
        this.fit.updateDebug();
    }
    private disposeAppearance(){
        for(const {object} of this.fit.modules.values())if(object!==this.garment)disposeGarment(object as Group);
        this.fit.forgetModules();this.fit.maskBody();
        const appearance=this.modules.userData.appearanceObject as Group|undefined;if(appearance)disposeModules(appearance);
        if(this.garment){this.garment.geometry.dispose();(this.garment.material as Material).dispose();this.garment.removeFromParent();this.garment=null;}
        disposeModules(this.modules);
    }
    dispose(){this.disposeAppearance();this.fit.dispose();for(const {geometry} of this.vertexPalettes.values())geometry.dispose();this.vertexPalettes.clear();for(const texture of this.tintMaps)texture.dispose();this.mixer.stopAllAction();this.mixer.uncacheRoot(this.mixer.getRoot());for(const skeleton of new Set(this.meshes.map(mesh=>mesh.skeleton)))skeleton.dispose();for(const material of this.materials)material.dispose();}
}



