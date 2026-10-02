import { Group } from 'three';
import { GLTF, GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CharacterDNA } from './CharacterDNA';
import { generatePhenotype } from './generatePhenotype';
import { universalHumanProfile } from './UniversalHumanProfile';
import { UniversalHuman, HumanAnimation } from './UniversalHuman';
import { hairAssetPath } from '../character-lab/GeneratedHair';
import { beardAssetPath } from '../character-lab/GeneratedBeard';

/** Cached immutable sources; every create call owns its skeleton, mixer and materials. */
export class CharacterFactory {
    private sources=new Map<string,Promise<GLTF>>();
    private ready=new Map<string,GLTF>();
    constructor(private load:(path:string)=>Promise<GLTF>=path=>new GLTFLoader().loadAsync(path)){}
    private asset(path:string){
        let pending=this.sources.get(path);
        if(!pending){pending=this.load(path).then(asset=>{this.ready.set(path,asset);return asset;}).catch(error=>{this.sources.delete(path);throw error;});this.sources.set(path,pending);}
        return pending;
    }
    async create(dna:CharacterDNA,lod:number,hair=true){
        const profile=universalHumanProfile(dna),path=hair?hairAssetPath(profile.appearance.hairStyle,lod):null;
        const beardPath=hair?beardAssetPath(profile.appearance.beardStyle,lod):null;
        const [body,appearance,beard]=await Promise.all([this.asset(`/universal-human/UniversalHuman_LOD${lod}.glb`),path?this.asset(path):null,beardPath?this.asset(beardPath):null]);
        if(appearance)appearance.scene.userData.referenceAsset={style:profile.appearance.hairStyle,path,provenance:path!.replace('.glb','.provenance.json')};
        if(beard)beard.scene.userData.referenceAsset={style:profile.appearance.beardStyle,path:beardPath,provenance:beardPath!.replace('.glb','.provenance.json')};
        return new UniversalHuman(body,profile,generatePhenotype(dna).skinTone,appearance?.scene??null,beard?.scene??null);
    }
    async createWorld(dna:CharacterDNA){await this.asset('/universal-human/UniversalHuman_LOD2.glb');return this.createWorldReady(dna);}
    /** Annual respawns reuse the already-loaded source, so there is no empty slot while fetching. */
    createWorldReady(dna:CharacterDNA){
        const source=this.ready.get('/universal-human/UniversalHuman_LOD2.glb');
        if(!source)throw new Error('Load the world body before synchronous respawn.');
        // Ten mobile prototype inhabitants do not need an additional close-view rig.
        // Fixed LOD2 avoids deferred parsing, skin tinting and GPU uploads on first zoom.
        return new WorldCharacter(new UniversalHuman(source,universalHumanProfile(dna),generatePhenotype(dna).skinTone),null,dna.seed,dna);
    }
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
    constructor(body:UniversalHuman,private close:(()=>Promise<UniversalHuman>)|null,seed:number,private dna:CharacterDNA|null=null){
        this.models.set(2,body);this.root.add(body.root);this.root.userData.character={seed,state:this.state,lod:this.lod};
    }
    setMovementSpeed(speed:number){this.setState(movementState(speed));}
    applyDNA(dna:CharacterDNA){
        // Preserve the reference captured by the close-LOD loader.
        if(this.dna)Object.assign(this.dna,dna);else this.dna=dna;
        this.root.userData.character.seed=dna.seed;
        for(const model of this.models.values())model.apply(universalHumanProfile(dna),generatePhenotype(dna).skinTone,false);
    }
    setState(state:HumanAnimation){if(this.state!==state){this.state=state;this.models.get(this.lod)!.setAnimation(state);}}
    update(delta:number,distance:number){
        const desired=this.close?worldLOD(distance,this.lod):2;
        if(desired===1&&this.close&&!this.models.has(1)&&!this.pending&&!this.disposed){
            this.pending=this.close().then(model=>{if(this.disposed){model.dispose();return;}if(this.dna)model.apply(universalHumanProfile(this.dna),generatePhenotype(this.dna).skinTone);this.models.set(1,model);model.root.visible=false;this.root.add(model.root);}).catch(error=>{console.error('Close character LOD failed',error);}).finally(()=>{this.pending=null;});
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

