import { Group } from 'three';
import { GLTF, GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CharacterDNA } from './CharacterDNA';
import { generatePhenotype } from './generatePhenotype';
import { universalHumanProfile } from './UniversalHumanProfile';
import { UniversalHuman, HumanAnimation } from './UniversalHuman';
import { hairAssetPath } from '../character-lab/GeneratedHair';

/** Cached immutable sources; every create call owns its skeleton, mixer and materials. */
export class CharacterFactory {
    private sources=new Map<string,Promise<GLTF>>();
    constructor(private load:(path:string)=>Promise<GLTF>=path=>new GLTFLoader().loadAsync(path)){}
    private asset(path:string){
        let pending=this.sources.get(path);
        if(!pending){pending=this.load(path).catch(error=>{this.sources.delete(path);throw error;});this.sources.set(path,pending);}
        return pending;
    }
    async create(dna:CharacterDNA,lod:number,hair=true){
        const profile=universalHumanProfile(dna),path=hair?hairAssetPath(profile.appearance.hairStyle,lod):null;
        const [body,appearance]=await Promise.all([this.asset(`/universal-human/UniversalHuman_LOD${lod}.glb`),path?this.asset(path):null]);
        if(appearance)appearance.scene.userData.referenceAsset={style:profile.appearance.hairStyle,path,provenance:path!.replace('.glb','.provenance.json')};
        return new UniversalHuman(body,profile,generatePhenotype(dna).skinTone,appearance?.scene??null);
    }
    async createWorld(dna:CharacterDNA){return new WorldCharacter(await this.create(dna,2,false),()=>this.create(dna,1,false),dna.seed);}
}
export const characterFactory=new CharacterFactory();

export function movementState(speed:number):HumanAnimation{return speed<.03?'Idle':speed<1.4?'Walk':'Run';}
export function worldLOD(distance:number,current:number){return current===1?(distance>28?2:1):(distance<22?1:2);}
export class WorldCharacter {
    readonly root=new Group();
    private models=new Map<number,UniversalHuman>();
    private pending:Promise<void>|null=null;
    private disposed=false;
    lod=2;
    state:HumanAnimation='Idle';
    constructor(body:UniversalHuman,private close:()=>Promise<UniversalHuman>,seed:number){
        this.models.set(2,body);this.root.add(body.root);this.root.userData.character={seed,state:this.state,lod:this.lod};
    }
    setMovementSpeed(speed:number){this.setState(movementState(speed));}
    setState(state:HumanAnimation){if(this.state!==state){this.state=state;this.models.get(this.lod)!.setAnimation(state);}}
    update(delta:number,distance:number){
        const desired=worldLOD(distance,this.lod);
        if(desired===1&&!this.models.has(1)&&!this.pending&&!this.disposed){
            this.pending=this.close().then(model=>{if(this.disposed){model.dispose();return;}this.models.set(1,model);model.root.visible=false;this.root.add(model.root);}).catch(error=>{console.error('Close character LOD failed',error);}).finally(()=>{this.pending=null;});
        }
        if(desired!==this.lod&&this.models.has(desired)){
            this.models.get(this.lod)!.root.visible=false;this.lod=desired;
            const model=this.models.get(this.lod)!;model.root.visible=true;model.setAnimation(this.state);
        }
        Object.assign(this.root.userData.character,{lod:this.lod,state:this.state});
        this.models.get(this.lod)!.update(delta);
    }
    dispose(){this.disposed=true;for(const model of this.models.values())model.dispose();this.root.clear();}
}

