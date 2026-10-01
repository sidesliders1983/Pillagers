import { AnimationMixer, Bone, Color, Group, Material, MeshStandardMaterial, SkinnedMesh, Vector3 } from 'three';
import { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { HumanProfile } from '../characters/UniversalHumanProfile';

export type HumanAnimation='Idle'|'Walk'|'Run';
/** Per-character skeleton and materials; shared immutable source geometry and textures. */
export class UniversalHuman {
    readonly root=new Group();
    private mixer:AnimationMixer;
    private meshes:SkinnedMesh[]=[];
    private bones:Bone[]=[];
    private rest=new Map<Bone,Vector3>();
    private materials:Material[]=[];
    private animation:HumanAnimation='Idle';
    constructor(private asset:GLTF,profile:HumanProfile,skinTone:string){
        const body=clone(asset.scene);this.root.add(body);
        body.traverse(object=>{
            if((object as Bone).isBone){const bone=object as Bone;this.bones.push(bone);this.rest.set(bone,bone.position.clone());}
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
        // Restore neutral pose before adapting bind translations and rebuilding inverse bind matrices.
        this.mixer.stopAllAction();
        for(const bone of this.bones){
            bone.position.copy(this.rest.get(bone)!);
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
        this.setAnimation(this.animation);
    }
    setAnimation(name:HumanAnimation){
        const clip=this.asset.animations.find(clip=>clip.name===name);
        if(!clip)throw new Error(`Universal Human is missing ${name}.`);
        this.animation=name;this.mixer.stopAllAction();this.mixer.clipAction(clip).reset().play();
    }
    update(delta:number){this.mixer.update(delta);}
    dispose(){this.mixer.stopAllAction();this.mixer.uncacheRoot(this.mixer.getRoot());for(const skeleton of new Set(this.meshes.map(mesh=>mesh.skeleton)))skeleton.dispose();for(const material of this.materials)material.dispose();}
}
