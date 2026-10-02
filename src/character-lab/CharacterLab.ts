import './character-lab.css';
import { CharacterDNA, defaultDNA, cloneDNA, parseCharacterDNA, serializeCharacterDNA, deserializeCharacterDNA } from '../characters/CharacterDNA';
import { goldenCharacterDNA } from '../characters/GoldenCharacters';
import { generatePhenotype } from '../characters/generatePhenotype';
import { dominantHeritage } from '../characters/CharacterDNA';
import { generateCharacterDNA } from '../characters/generateCharacterDNA';
import { CharacterPreview } from './CharacterPreview';
import { CharacterLabUI, LabAction } from './CharacterLabUI';
import { FitPreset, fitPreset } from '../characters/FitPresets';
import { FitDebugOptions } from '../characters/CharacterFitSystem';

export class CharacterLab {
    private dna=defaultDNA();
    private comparison:CharacterDNA|null=null;
    private preview!:CharacterPreview;
    private ui!:CharacterLabUI;
    start(){
        document.body.className='character-lab';document.title='Character Lab · Pillagers';
        document.body.replaceChildren();const root=document.createElement('main');document.body.append(root);
        this.ui=new CharacterLabUI(root,this.dna,dna=>{this.dna=parseCharacterDNA(dna);this.update();},action=>{void this.action(action).catch(error=>this.ui.status(error.message,true));});
        this.preview=new CharacterPreview(document.getElementById('lab-preview') as HTMLCanvasElement,(message,error)=>this.ui.status(message,error));this.update();
    }
    private update(){const phenotype=generatePhenotype(this.dna);this.preview.setCharacter(phenotype,this.dna);this.ui.update(this.dna,phenotype,this.comparison);}
    private newSeed(){const array=new Uint32Array(1);crypto.getRandomValues(array);return array[0]===this.dna.seed?(array[0]+1)>>>0:array[0];}
    private async action(action:LabAction){
        if(action.startsWith('debug-')){this.preview.toggleFitDebug(action.slice(6) as keyof FitDebugOptions);return;}
        if(action.startsWith('preset-')){this.dna=fitPreset(action.slice(7) as FitPreset,this.dna);this.update();return;}
        if(action.startsWith('golden-')){this.dna=goldenCharacterDNA(action.slice(7));this.update();this.ui.status('Fixed Golden Character loaded.');return;}
        if(action==='reroll-name'){this.dna={...this.dna,naming:{culture:dominantHeritage(this.dna.heritage),seed:((this.dna.naming?.seed??0)+1)>>>0}};this.update();this.ui.status('Name rerolled; appearance and traits kept.');}
        else if(action==='reroll'){this.dna={...this.dna,seed:this.newSeed()};this.update();this.ui.status('Seed rerolled; traits, age, sex and heritage kept.');}
        else if(action==='randomize'){
            this.dna=generateCharacterDNA(this.newSeed());
            this.update();this.ui.status('New character generated. No occupation assigned.');
        }else if(action==='defaults'){this.dna=defaultDNA();this.update();this.ui.status('Default DNA restored.');}
        else if(action==='pin'){this.comparison=cloneDNA(this.dna);this.preview.setComparison(generatePhenotype(this.comparison),this.comparison);this.ui.update(this.dna,generatePhenotype(this.dna),this.comparison);this.ui.status('Comparison pinned. Edit the current character to compare.');}
        else if(action==='unpin'){this.comparison=null;this.preview.setComparison(null);this.ui.update(this.dna,generatePhenotype(this.dna),null);this.ui.status('Comparison removed.');}
        else if(action==='reset-view')this.preview.resetView();
        else if(action==='overview')this.preview.overview();
        else if(action==='idle'||action==='walk'||action==='run')this.preview.setAnimation(action==='idle'?'Idle':action==='walk'?'Walk':'Run');
        else if(action==='lod0'||action==='lod1'||action==='lod2')this.preview.setLOD(Number(action.slice(-1)));
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

