import { Group, SkinnedMesh } from 'three';
import { GLTF, GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CharacterDNA, parseCharacterDNA } from './CharacterDNA';
import { generatePhenotype } from './generatePhenotype';
import { universalHumanProfile } from './UniversalHumanProfile';
import { UniversalHuman, HumanAnimation } from './UniversalHuman';
import { characterAssetURL, characterAssets, characterAsset, characterAssetFitsBody } from './CharacterAssets';
import { EquipmentSocket, ModuleMetadata, validateModule, moduleAtEquipmentSocket } from './AttachmentContract';
import { CharacterPresentation, resolveCharacterPresentation } from './CharacterPresentation';
import { goldenLabBody, labBodyAsset, validateLabBodyUsage, labBodySurfaceCalibration } from './LabBodySources';
import { validateBodySurfaceCalibration, ValidatedBodySurfaceCalibration } from './BodySurfaceCalibration';
import { LabBodyPresentation, defaultLabBodyPresentation, resolveLabBodyProfile } from './LabBodyPresentation';

/** Cached immutable sources; every create call owns its skeleton, mixer and materials. */
export class CharacterFactory {
    private sources=new Map<string,Promise<GLTF>>();
    private ready=new Map<string,GLTF>();
    private surfaceCalibrations=new WeakMap<GLTF,ValidatedBodySurfaceCalibration>();
    private modules=new Map<string,{metadata:ModuleMetadata;path:string}>();
    constructor(private load:(path:string)=>Promise<GLTF>=path=>new GLTFLoader().loadAsync(path)){
        for(const asset of characterAssets)if(asset.metadata)this.registerModule(asset.metadata,characterAssetURL(asset.id,2));
    }
    registerModule(metadata:ModuleMetadata,path:string){validateModule(metadata);if(!path)throw new Error('A module needs an asset path.');this.modules.set(metadata.id,{metadata,path});}
    async equip(character:UniversalHuman,id:string,socket?:EquipmentSocket){
        const module=this.modules.get(id);if(!module)throw new Error('Unknown registered module: '+id);
        const body=character.root.userData.bodySource;
        const asset=characterAssets.find(asset=>asset.id===id);
        if(body?.source===goldenLabBody.source){
            if(!asset||!characterAssetFitsBody(asset,body)||module.metadata!==asset.metadata||module.path!==characterAssetURL(id,2))throw new Error('Module is not registered and calibrated for this exact v0.4 body source.');
        }else if(asset?.scope)throw new Error('New v0.4 modules cannot be fitted to a legacy body.');
        const metadata=moduleAtEquipmentSocket(module.metadata,socket);
        const source=await this.asset(module.path);return character.equip(metadata,source.scene);
    }
    unequip(character:UniversalHuman,id:string){character.unequip(id);}
    private asset(path:string){
        let pending=this.sources.get(path);
        if(!pending){pending=this.load(path).then(asset=>{this.ready.set(path,asset);return asset;}).catch(error=>{this.sources.delete(path);throw error;});this.sources.set(path,pending);}
        return pending;
    }
    /** Legacy third argument disables the full appearance for bare authoring/tests. */
    async create(dna:CharacterDNA,lod:number,choices:boolean|CharacterPresentation=true,bodyPresentation:LabBodyPresentation=defaultLabBodyPresentation){
        dna=parseCharacterDNA(dna);
        // Preserve the legacy boolean authoring API; explicit Lab state owns its overrides.
        const bodyProfile=resolveLabBodyProfile(dna,bodyPresentation),identity=labBodyAsset(bodyProfile.body.source??'published',lod),v04=identity.source===goldenLabBody.source;
        const resolved=resolveCharacterPresentation(dna,typeof choices==='boolean'?{hair:choices?'auto':'none',beard:choices?'auto':'none',outfit:choices?'auto':'none',technicalWaistWrap:!v04}:choices,identity);
        const bodyAsset=validateLabBodyUsage(identity.source,lod,resolved.presentation),profile={...bodyProfile.profile,appearance:resolved.profile.appearance},path=!v04&&resolved.hairId?characterAssetURL(resolved.hairId,lod):null;
        const beardPath=!v04&&resolved.beardId?characterAssetURL(resolved.beardId,lod):null;
        const ids=v04?[resolved.hairId,resolved.beardId,resolved.outfitId,resolved.equipmentId]:[resolved.outfitId,resolved.equipmentId];
        const selectedModules=ids.filter((id):id is string=>!!id).map(id=>{
            const asset=characterAsset(id),module=this.modules.get(id);
            if(!module||!characterAssetFitsBody(asset,identity)||module.metadata!==asset.metadata||module.path!==characterAssetURL(id,2))throw new Error('Module registration differs from its compatible canonical catalog: '+id);
            return module;
        });
        const [body,appearance,beard,...moduleSources]=await Promise.all([this.asset(bodyAsset.url),path?this.asset(path):null,beardPath?this.asset(beardPath):null,...selectedModules.map(module=>this.asset(module.path))]);
        if(appearance)appearance.scene.userData.referenceAsset={style:profile.appearance.hairStyle,path,provenance:path!.replace('.glb','.provenance.json')};
        if(beard)beard.scene.userData.referenceAsset={style:profile.appearance.beardStyle,path:beardPath,provenance:beardPath!.replace('.glb','.provenance.json')};
        const authoredSurface=await labBodySurfaceCalibration(bodyAsset.source);
        let calibration=authoredSurface===undefined?undefined:this.surfaceCalibrations.get(body);
        if(authoredSurface!==undefined&&!calibration){
            const meshes:SkinnedMesh[]=[];body.scene.traverse(node=>{if((node as SkinnedMesh).isSkinnedMesh)meshes.push(node as SkinnedMesh);});
            calibration=validateBodySurfaceCalibration(authoredSurface,bodyAsset.sha256,meshes);this.surfaceCalibrations.set(body,calibration);
        }
        const character=new UniversalHuman(body,profile,generatePhenotype(dna).skinTone,appearance?.scene??null,beard?.scene??null,selectedModules.map((module,index)=>({metadata:module.metadata.type==='equipment'&&resolved.equipmentSocket?moduleAtEquipmentSocket(module.metadata,resolved.equipmentSocket as EquipmentSocket):module.metadata,source:moduleSources[index]!.scene})),{technicalWaistWrap:resolved.presentation.technicalWaistWrap},calibration);
        character.root.userData.bodySource={id:bodyAsset.id,source:bodyAsset.source,path:bodyAsset.path,sha256:bodyAsset.sha256,styleVersion:bodyAsset.styleVersion,status:bodyAsset.status};
        character.root.userData.outfit=resolved.outfitId?.replace('garment/','')??null;
        character.root.userData.presentation={...resolved.presentation};
        character.root.userData.bodyPresentation=bodyProfile.body;character.root.userData.bodyPresentationStatus=bodyProfile.status;
        character.root.userData.selectedAssets={hair:resolved.hairId,beard:resolved.beardId,outfit:resolved.outfitId,equipment:resolved.equipmentId};
        return character;
    }
    async createWorld(dna:CharacterDNA){await this.asset(characterAssetURL('body/universal-human',2));return this.createWorldReady(dna);}
    /** Annual respawns reuse the already-loaded source, so there is no empty slot while fetching. */
    createWorldReady(dna:CharacterDNA){
        dna=parseCharacterDNA(dna);
        const source=this.ready.get(characterAssetURL('body/universal-human',2));
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
        dna=parseCharacterDNA(dna);
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

