import './character-lab.css';
import { CharacterDNA, defaultDNA, cloneDNA, parseCharacterDNA, normalizeHeritage, traitKeys, heritageKeys, CoreTraits, HeritageMix } from '../characters/CharacterDNA';
import { generatePhenotype } from '../characters/generatePhenotype';
import { seededRandom } from '../characters/seededRandom';
import { dominantHeritage } from '../characters/CharacterDNA';
import { CharacterPreview } from './CharacterPreview';
import { CharacterLabUI, LabAction } from './CharacterLabUI';
export class CharacterLab {
    private dna=defaultDNA();
    private comparison:CharacterDNA|null=null;
    private preview!:CharacterPreview;
    private ui!:CharacterLabUI;
    start(){
        document.body.className='character-lab';document.title='Character Lab · Pillagers';
        document.body.replaceChildren();const root=document.createElement('main');document.body.append(root);
        this.ui=new CharacterLabUI(root,this.dna,dna=>{this.dna=parseCharacterDNA(dna);this.update();},action=>{void this.action(action).catch(error=>this.ui.status(error.message,true));});
        this.preview=new CharacterPreview(document.getElementById('lab-preview') as HTMLCanvasElement);this.update();
    }
    private update(){const phenotype=generatePhenotype(this.dna);this.preview.setCharacter(phenotype);this.ui.update(this.dna,phenotype,this.comparison);}
    private newSeed(){const array=new Uint32Array(1);crypto.getRandomValues(array);return array[0]===this.dna.seed?(array[0]+1)>>>0:array[0];}
    private async action(action:LabAction){
        if(action==='reroll-name'){this.dna={...this.dna,naming:{culture:dominantHeritage(this.dna.heritage),seed:((this.dna.naming?.seed??0)+1)>>>0}};this.update();this.ui.status('Name rerolled; appearance and traits kept.');}
        else if(action==='reroll'){this.dna={...this.dna,seed:this.newSeed()};this.update();this.ui.status('Seed rerolled; traits, age, sex and heritage kept.');}
        else if(action==='randomize'){
            const seed=this.newSeed(),random=seededRandom(seed,'lab-randomize');
            this.dna={seed,sex:random()<.5?'male':'female',age:18+Math.floor(random()*63),traits:Object.fromEntries(traitKeys.map(key=>[key,Math.round(random()*100)/100])) as CoreTraits,heritage:normalizeHeritage(Object.fromEntries(heritageKeys.map(key=>[key,.05+random()])) as HeritageMix)};
            this.update();this.ui.status('New character generated. No occupation assigned.');
        }else if(action==='defaults'){this.dna=defaultDNA();this.update();this.ui.status('Default DNA restored.');}
        else if(action==='pin'){this.comparison=cloneDNA(this.dna);this.preview.setComparison(generatePhenotype(this.comparison));this.ui.update(this.dna,generatePhenotype(this.dna),this.comparison);this.ui.status('Comparison pinned. Edit the current character to compare.');}
        else if(action==='unpin'){this.comparison=null;this.preview.setComparison(null);this.ui.update(this.dna,generatePhenotype(this.dna),null);this.ui.status('Comparison removed.');}
        else if(action==='reset-view')this.preview.resetView();
        else if(action==='overview')this.preview.overview();
        else if(action==='import'){const dna=parseCharacterDNA(JSON.parse(this.ui.getJSON()));this.dna=dna;this.update();this.ui.status('DNA imported; heritage normalized to 100%.');}
        else if(action==='copy'){
            const json=JSON.stringify(this.dna,null,2);
            if(navigator.clipboard&&window.isSecureContext){try{await navigator.clipboard.writeText(json);this.ui.status('CharacterDNA copied.');return;}catch{/* LAN/manual copy fallback below. */}}
            this.ui.selectJSON();const copied=document.execCommand('copy');this.ui.status(copied?'CharacterDNA copied.':'JSON selected. Copy it with your device copy action.');
        }else if(action==='export'){
            const url=URL.createObjectURL(new Blob([JSON.stringify(this.dna,null,2)],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download=`pillagers-dna-${this.dna.seed}.json`;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);this.ui.status('CharacterDNA exported.');
        }
    }
}
