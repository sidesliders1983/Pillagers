import { AnimationMixer, Bone, Box3, Color, Group, Material, MeshStandardMaterial, Quaternion, SkinnedMesh, Vector3 } from 'three';
import { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { HumanProfile } from '../characters/UniversalHumanProfile';
import { SoftBodySpring } from './SoftBodySpring';
import { appearanceModules, clothingLayer, disposeModules } from './AppearanceModules';

export type HumanAnimation='Idle'|'Walk'|'Run';
/** Per-character skeleton and materials; shared immutable source geometry and textures. */
export class UniversalHuman {
    readonly root=new Group();
    private mixer:AnimationMixer;
    private meshes:SkinnedMesh[]=[];
    private bones:Bone[]=[];
    private rest=new Map<Bone,Vector3>();
    private restRotation=new Map<Bone,Quaternion>();
    private materials:Material[]=[];
    private animation:HumanAnimation='Idle';
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
    constructor(private asset:GLTF,profile:HumanProfile,skinTone:string,private hairAsset:Group|null=null){
        const body=clone(asset.scene);this.root.add(body);
        body.traverse(object=>{
            if((object as Bone).isBone){const bone=object as Bone;this.bones.push(bone);this.rest.set(bone,bone.position.clone());this.restRotation.set(bone,bone.quaternion.clone());}
            if((object as SkinnedMesh).isSkinnedMesh){
                const mesh=object as SkinnedMesh;mesh.castShadow=true;mesh.receiveShadow=true;
                // Skeleton.clone shares the inverse array. Detach it before adapting
                // bind matrices, or the pinned character and cached source are changed too.
                mesh.skeleton.boneInverses=mesh.skeleton.boneInverses.map(matrix=>matrix.clone());
                const copy=(material:Material)=>{const m=material.clone();if((m as MeshStandardMaterial).isMeshStandardMaterial)(m as MeshStandardMaterial).flatShading=true;this.materials.push(m);return m;};
                mesh.material=Array.isArray(mesh.material)?mesh.material.map(copy):copy(mesh.material);
                this.meshes.push(mesh);
            }
        });
        if(!this.meshes.length)throw new Error('Universal Human GLB has no skinned mesh.');
        this.mixer=new AnimationMixer(body);this.apply(profile,skinTone);this.setAnimation('Idle');
    }
    apply(profile:HumanProfile,skinTone:string){
        this.disposeAppearance();this.modules=new Group();this.motion=profile.motion;
        this.root.userData.universalHumanProfile=profile;
        this.softness={belly:profile.weights.Overweight,breasts:profile.weights.Feminine};
        this.belly.reset();this.breasts.reset();this.previousPosition=null;this.previousVelocity.set(0,0,0);
        // Restore neutral pose before adapting bind translations and rebuilding inverse bind matrices.
        this.mixer.stopAllAction();this.root.scale.y=1;
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
            // Albedo stays on the image-generated material. Heritage gently tints the whole base surface.
            const mats=Array.isArray(mesh.material)?mesh.material:[mesh.material];
            const tint=new Color(skinTone).lerp(new Color('#ffffff'),.78);
            for(const mat of mats)if((mat as MeshStandardMaterial).isMeshStandardMaterial)(mat as MeshStandardMaterial).color.copy(tint);
        }
        this.root.updateMatrixWorld(true);
        const skeletons=new Set(this.meshes.map(mesh=>mesh.skeleton));
        for(const skeleton of skeletons)skeleton.calculateInverses();
        const head=this.bones.find(b=>b.name==='Head');
        if(head){
            const bounds=new Box3(),skull:Vector3[]=[];
            for(const mesh of this.meshes){const p=mesh.geometry.attributes.position;
                for(let i=0;i<p.count;i++)if(p.getY(i)>1.56&&Math.abs(p.getX(i))<.18){const point=mesh.getVertexPosition(i,new Vector3());bounds.expandByPoint(point);skull.push(point);}
            }
            if(!bounds.isEmpty()){
                const size=bounds.getSize(new Vector3());
                const lod=Number(this.meshes[0].userData.lod??0);
                const appearance=appearanceModules(profile.appearance,size,lod,profile.appearanceFit,this.hairAsset,skull.map(p=>p.sub(bounds.getCenter(new Vector3()))));
                appearance.position.copy(bounds.getCenter(new Vector3()));this.root.add(appearance);this.root.updateMatrixWorld(true);head.attach(appearance);

                this.modules.userData.appearanceObject=appearance;
            }
        }
        for(const body of this.meshes){const garment=clothingLayer(body,profile.appearanceFit.clothing);if(garment){body.parent!.add(garment);this.garment=garment;break;}}
        this.root.scale.y=.8;this.setAnimation(this.animation);
    }
    setAnimation(name:HumanAnimation){
        const clip=this.asset.animations.find(clip=>clip.name===name);
        if(!clip)throw new Error(`Universal Human is missing ${name}.`);
        this.animation=name;this.mixer.stopAllAction();this.mixer.clipAction(clip).reset().play();
        this.mixer.timeScale=this.motion.cadence;
    }
    update(delta:number){
        const dt=Math.max(0,Math.min(.1,delta));this.mixer.update(dt);this.elapsed+=dt;
        for(const bone of this.bones)if(/^(UpperLeg|LowerLeg|UpperArm|LowerArm)_/.test(bone.name))bone.quaternion.slerp(this.restRotation.get(bone)!,1-this.motion.stride);
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
    }
    private disposeAppearance(){
        const appearance=this.modules.userData.appearanceObject as Group|undefined;if(appearance)disposeModules(appearance);
        if(this.garment){this.garment.geometry.dispose();(this.garment.material as Material).dispose();this.garment.removeFromParent();this.garment=null;}
        disposeModules(this.modules);
    }
    dispose(){this.disposeAppearance();this.mixer.stopAllAction();this.mixer.uncacheRoot(this.mixer.getRoot());for(const skeleton of new Set(this.meshes.map(mesh=>mesh.skeleton)))skeleton.dispose();for(const material of this.materials)material.dispose();}
}



