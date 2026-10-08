import './character-lab.css';
import { CharacterDNA, defaultDNA, parseCharacterDNA, serializeCharacterDNA, deserializeCharacterDNA } from '../characters/CharacterDNA';
import { goldenCharacterDNA } from '../characters/GoldenCharacters';
import { generatePhenotype } from '../characters/generatePhenotype';
import { dominantHeritage } from '../characters/CharacterDNA';
import { generateCharacterDNA } from '../characters/generateCharacterDNA';
import { CharacterPreview } from './CharacterPreview';
import { CharacterLabUI, LabAction } from './CharacterLabUI';
import { FitPreset, fitPreset } from '../characters/FitPresets';
import { FitDebugOptions } from '../characters/CharacterFitSystem';
import { CharacterPresentation, defaultCharacterPresentation, parseCharacterPresentation } from '../characters/CharacterPresentation';
import { LabTestSnapshot, parseLabSnapshot } from './LabSnapshot';
import { goldenLabBody } from '../characters/LabBodySources';
import { LabBodyPresentation, defaultLabBodyPresentation, previewLabBodyPresentation, parseLabBodyPresentation } from '../characters/LabBodyPresentation';

export class CharacterLab {
    private dna=defaultDNA();
    private comparison:LabTestSnapshot|null=null;
    private presentation:CharacterPresentation={...defaultCharacterPresentation,hair:'none',beard:'none',outfit:'none'};
    private body:LabBodyPresentation={version:1,preset:'auto',source:'meshy'};
    private preview!:CharacterPreview;
    private ui!:CharacterLabUI;
    async start(){
        if(new URLSearchParams(location.search).get('model')==='cow'){const {CowCharacterPreview}=await import('./CowCharacterPreview');await new CowCharacterPreview().start();return;}
        document.body.className='character-lab';document.title='Character Lab · Pillagers';
        document.body.replaceChildren();const root=document.createElement('main');document.body.append(root);
        this.ui=new CharacterLabUI(root,this.dna,dna=>{this.dna=parseCharacterDNA(dna);this.update();},action=>{void this.action(action).catch(error=>this.ui.status(error.message,true));},presentation=>{try{this.presentation=parseCharacterPresentation(presentation);this.update();}catch(error){this.ui.status((error as Error).message,true);}},body=>{try{const next=parseLabBodyPresentation(body);if((next.source??'published')!==(this.body.source??'published'))this.presentation=next.source===goldenLabBody.source||next.source==='meshy'?{...defaultCharacterPresentation,hair:'none',beard:'none',outfit:'none'}:{...defaultCharacterPresentation};this.body=next;this.update();}catch(error){this.ui.status((error as Error).message,true);}});
        this.preview=new CharacterPreview(document.getElementById('lab-preview') as HTMLCanvasElement,(message,error)=>this.ui.status(message,error));this.update();
    }
    private update(){const phenotype=generatePhenotype(this.dna);this.preview.setCharacter(phenotype,this.dna,this.presentation,this.body);this.ui.update(this.dna,phenotype,this.comparison?.dna??null,this.presentation,this.body);}
    private newSeed(){const array=new Uint32Array(1);crypto.getRandomValues(array);return array[0]===this.dna.seed?(array[0]+1)>>>0:array[0];}
    private async action(action:LabAction){
        if(action.startsWith('animation-')){this.preview.setAnimation(action.slice(10));return;}
        if(action.startsWith('view-')){this.preview.fixedView(action.slice(5) as 'front'|'side'|'back');return;}
        if(action==='freeze-pose'){this.preview.setPose(this.ui.getPoseTime());return;}
        if(action==='play'){this.preview.resume();return;}
        if(action==='golden-base'){this.presentation={...this.presentation,hair:'none',beard:'none',outfit:'none',technicalWaistWrap:false};this.update();this.ui.status('Body-only Golden presentation.');return;}
        if(action==='reset-presentation'){this.presentation=this.body.source===goldenLabBody.source?{...defaultCharacterPresentation,hair:'none',beard:'none',outfit:'none'}:{...defaultCharacterPresentation};this.update();return;}
        if(action==='reset-body'){this.body={...defaultLabBodyPresentation,...(this.body.source?{source:this.body.source}:{})};this.update();return;}
        if(action==='reset-lab'){this.body={version:1,preset:'auto',source:'meshy'};this.dna=defaultDNA();this.presentation={...defaultCharacterPresentation,hair:'none',beard:'none',outfit:'none'};this.comparison=null;this.preview.setComparison(null);this.preview.setAnimation('Idle');this.preview.resetView();this.update();return;}
        if(action==='snapshot-export'){
            const snapshot=this.preview.captureSnapshot(),json=JSON.stringify(snapshot,null,2);this.ui.setSnapshotJSON(json);
            const url=URL.createObjectURL(new Blob([json],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download=`pillagers-lab-${this.dna.seed}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);this.ui.status('Frozen Lab snapshot exported; CharacterDNA unchanged.');return;
        }
        if(action==='snapshot-import'){
            const snapshot=parseLabSnapshot(JSON.parse(this.ui.getSnapshotJSON()));this.dna=snapshot.dna;this.presentation=snapshot.presentation;this.body=snapshot.body;this.preview.restoreReviewState(snapshot);this.update();this.ui.status('Lab snapshot applied with its exact registered assets, camera and clip time.');return;
        }
        if(action.startsWith('debug-')){this.preview.toggleFitDebug(action.slice(6) as keyof FitDebugOptions);return;}
        if(action.startsWith('preset-')){this.dna=fitPreset(action.slice(7) as FitPreset,this.dna);this.update();return;}
        if(action.startsWith('golden-')){this.dna=goldenCharacterDNA(action.slice(7));this.update();this.ui.status('Fixed Golden Character loaded.');return;}
        if(action==='reroll-name'){this.dna={...this.dna,naming:{culture:dominantHeritage(this.dna.heritage),seed:((this.dna.naming?.seed??0)+1)>>>0}};this.update();this.ui.status('Name rerolled; appearance and traits kept.');}
        else if(action==='reroll'){this.dna={...this.dna,seed:this.newSeed()};this.update();this.ui.status('Seed rerolled; traits, age, sex and heritage kept.');}
        else if(action==='randomize'){
            this.dna=generateCharacterDNA(this.newSeed());
            this.update();this.ui.status('New character generated. No occupation assigned.');
        }else if(action==='defaults'){this.dna=defaultDNA();this.update();this.ui.status('Default DNA restored.');}
        else if(action==='pin'){this.comparison=this.preview.captureSnapshot();this.ui.setSnapshotJSON(JSON.stringify(this.comparison,null,2));this.preview.setComparison(this.comparison);this.ui.update(this.dna,generatePhenotype(this.dna),this.comparison.dna,this.presentation,this.body);this.ui.status('Full presentation and frozen pose pinned. Edit this character independently.');}
        else if(action==='unpin'){this.comparison=null;this.preview.setComparison(null);this.ui.update(this.dna,generatePhenotype(this.dna),null,this.presentation,this.body);this.ui.status('Comparison removed.');}
        else if(action==='reset-view')this.preview.resetView();
        else if(action==='overview')this.preview.overview();
        else if(action==='idle'||action==='walk'||action==='run')this.preview.setAnimation(action==='idle'?'Idle':action==='walk'?'Walk':'Run');
        else if(action==='lod0'||action==='lod1'||action==='lod2')this.preview.setLOD(Number(action.slice(-1)));
        else if(action==='export-static-glb'){await this.preview.exportStaticGLB();this.ui.status('Static posed GLB exported with geometric facet normals; no rig or animation.');}
        else if(action==='export-glb'){await this.preview.exportGLB();this.ui.status('Character GLB exported with appearance and shared rig.');}
        else if(action==='import'){const dna=deserializeCharacterDNA(this.ui.getJSON());this.dna=dna;this.update();this.ui.status('DNA v1 imported; heritage normalized to 100%.');}
        else if(action==='copy'){
            const json=serializeCharacterDNA(this.dna);
            if(navigator.clipboard&&window.isSecureContext){try{await navigator.clipboard.writeText(json);this.ui.status('CharacterDNA copied.');return;}catch{/* LAN/manual copy fallback below. */}}
            this.ui.selectJSON();const copied=document.execCommand('copy');this.ui.status(copied?'CharacterDNA copied.':'JSON selected. Copy it with your device copy action.');
        }else if(action==='export'){
            const url=URL.createObjectURL(new Blob([serializeCharacterDNA(this.dna)],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download=`pillagers-dna-${this.dna.seed}.json`;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);this.ui.status('CharacterDNA exported.');
        }
    }
}
