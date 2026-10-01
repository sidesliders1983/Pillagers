import { CharacterDNA, cloneDNA, editHeritage, traitKeys, heritageKeys, TraitKey, HeritageKey } from '../characters/CharacterDNA';
import { Phenotype } from '../characters/Phenotype';
import { heritageLabels } from '../characters/heritageProfiles';
import { occupations, occupationScores, occupationFit, OccupationKey } from '../characters/occupationFit';
import { characterName, fullName } from '../characters/naming/generateName';

const traitInfo:Record<TraitKey,{label:string;low:string;high:string}>={
    physicality:{label:'Physicality',low:'Slight / delicate',high:'Powerful / imposing'},
    agility:{label:'Agility',low:'Deliberate / grounded',high:'Quick / nimble'},
    intelligence:{label:'Intelligence',low:'Instinctive',high:'Analytical'},
    cunning:{label:'Cunning',low:'Straightforward',high:'Crafty / opportunistic'},
    temperament:{label:'Temperament',low:'Calm / restrained',high:'Fierce / volatile'},
};
export type LabAction='reroll-name'|'reroll'|'randomize'|'defaults'|'pin'|'unpin'|'copy'|'export'|'import'|'reset-view'|'overview';
export class CharacterLabUI {
    private dna:CharacterDNA;
    constructor(root:HTMLElement,dna:CharacterDNA,private onDNA:(dna:CharacterDNA)=>void,private onAction:(action:LabAction)=>void){
        this.dna=cloneDNA(dna);
        root.innerHTML=`<div class="lab">
            <nav class="lab-nav"><div><span class="lab-eyebrow">PILLAGERS / DEVELOPMENT</span><h1>Character Lab <small>v0.2</small></h1></div><a href="/asset-lab">Asset optimization lab</a><a href="/">Back to the fjord <span aria-hidden="true">↗</span></a></nav>
            <div class="lab-layout">
                <section class="lab-panel lab-controls" aria-label="Character controls">
                    <div class="lab-section-heading"><h2>01 <span>Identity</span></h2><span class="lab-badge">DNA</span></div>
                    <div class="lab-identity"><label>Sex<select id="lab-sex"><option value="male">Male</option><option value="female">Female</option></select></label>
                    <label>Seed<input id="lab-seed" type="number" min="0" max="4294967295" step="1"></label></div>
                    <div class="lab-slider"><label for="lab-age">Age <output id="lab-age-value"></output></label><input id="lab-age" type="range" min="0" max="100" step="1"><div class="lab-extremes"><span>Young</span><span>Old</span></div></div>
                    <div class="lab-button-row"><button data-action="reroll">Reroll seed</button><button data-action="randomize">Randomize character</button></div>
                    <div class="lab-naming"><h2>Personal name</h2><strong id="lab-name"></strong><label>Name culture (dominant heritage)<select id="lab-culture" disabled>${heritageKeys.map(key=>`<option value="${key}">${heritageLabels[key]}</option>`).join('')}</select></label><label>Name variation seed<input id="lab-name-seed" type="number" min="0" max="4294967295" step="1"></label><button data-action="reroll-name">Reroll name</button><p class="lab-note">The largest heritage share determines the naming grammar; compatible minority ingredients add subtle variation. Name variation leaves appearance unchanged.</p><details><summary>Name derivation</summary><pre id="lab-name-derivation"></pre></details></div>
                    <div class="lab-section-heading"><h2>02 <span>Core traits</span></h2><span class="lab-badge">5 AXES</span></div>
                    ${traitKeys.map(key=>`<div class="lab-slider"><label for="trait-${key}">${traitInfo[key].label}<output id="value-${key}"></output></label><input id="trait-${key}" data-trait="${key}" type="range" min="0" max="100" step="1"><div class="lab-extremes"><span>${traitInfo[key].low}</span><span>${traitInfo[key].high}</span></div></div>`).join('')}
                    <p class="lab-note">Traits express disposition. Intelligence and Cunning do not change facial anatomy.</p>
                    <button class="lab-text-button" data-action="defaults">Reset DNA to defaults</button>
                </section>
                <section class="lab-stage" aria-label="Live character preview">
                    <div class="lab-stage-heading"><span class="lab-eyebrow">LIVE PHENOTYPE</span><span id="lab-dominant"></span></div>
                    <canvas id="lab-preview" aria-label="Procedural character mannequin. Drag to rotate, scroll or pinch to zoom."></canvas>
                    <div class="lab-character-labels"><span id="lab-current-label"></span><span id="lab-comparison-label" hidden></span></div>
                    <div class="lab-preview-tools"><span>Drag to rotate · Pinch / scroll to zoom</span><div><button data-action="reset-view">Reset view</button><button data-action="overview">RTS view</button></div></div>
                    <div class="lab-dimensions" id="lab-dimensions"></div>
                    <div class="lab-compare"><div><strong>Keep an identity beside you.</strong><p>Pin this character, then change a trait or reroll the seed.</p></div><button id="lab-pin" data-action="pin">Pin comparison</button><button id="lab-unpin" data-action="unpin" hidden>Remove</button></div>
                </section>
                <section class="lab-panel lab-results" aria-label="Heritage and occupation fit">
                    <div class="lab-section-heading"><h2>03 <span>Heritage mix</span></h2><span class="lab-badge" id="heritage-total">100%</span></div>
                    ${heritageKeys.map(key=>`<div class="lab-heritage-row"><label for="heritage-${key}">${heritageLabels[key]}<output id="heritage-value-${key}"></output></label><input id="heritage-${key}" data-heritage="${key}" type="range" min="0" max="100" step=".1"></div>`).join('')}
                    <p class="lab-note">Changing one share redistributes the rest. Profiles overlap; heritage shifts probabilities, not rigid appearance templates.</p>
                    <div class="lab-section-heading"><h2>04 <span>Occupation fit</span></h2><span class="lab-badge">TENDENCIES</span></div>
                    <p class="lab-fit-intro" id="lab-fit-summary"></p>
                    <div class="lab-fit-list">${(Object.keys(occupations) as OccupationKey[]).map(key=>`<div class="lab-fit-row"><div><span>${occupations[key].label}</span><output id="fit-value-${key}"></output></div><div class="lab-fit-track"><div id="fit-bar-${key}" class="lab-fit-fill"></div><span id="fit-reference-${key}" class="lab-fit-reference" hidden></span></div></div>`).join('')}</div>
                    <p class="lab-note">A low fit never rules out a profession. These are design scores, not assigned jobs or progression.</p>
                    <details class="lab-json"><summary>CharacterDNA JSON</summary><textarea id="lab-json" spellcheck="false" aria-label="CharacterDNA JSON"></textarea><div class="lab-button-row"><button data-action="copy">Copy</button><button data-action="export">Export JSON</button><button data-action="import">Apply JSON</button></div></details>
                    <details class="lab-derived"><summary>Derived phenotype</summary><pre id="lab-phenotype"></pre></details>
                    <p id="lab-status" class="lab-status" role="status" aria-live="polite">One seed. One identity. Many possible lives.</p>
                </section>
            </div>
        </div>`;
        root.addEventListener('click',event=>{const button=(event.target as HTMLElement).closest<HTMLButtonElement>('button[data-action]');if(button)this.onAction(button.dataset.action as LabAction);});
        root.addEventListener('input',event=>{
            const input=event.target as HTMLInputElement;
            const next=cloneDNA(this.dna);
            if(input.dataset.trait)next.traits[input.dataset.trait as TraitKey]=Number(input.value)/100;
            else if(input.dataset.heritage)next.heritage=editHeritage(next.heritage,input.dataset.heritage as HeritageKey,Number(input.value)/100);
            else if(input.id==='lab-sex')next.sex=input.value as 'male'|'female';
            else if(input.id==='lab-age')next.age=Number(input.value);
            else if(input.id==='lab-culture')next.naming={culture:input.value as HeritageKey,seed:next.naming?.seed??0};
            else if(input.id==='lab-name-seed'){
                if(!Number.isFinite(input.valueAsNumber))return;
                next.naming={culture:next.naming?.culture??'scandinavian',seed:Math.max(0,Math.min(4294967295,Math.floor(input.valueAsNumber)))};
            }
            else if(input.id==='lab-seed'){
                if(!Number.isFinite(input.valueAsNumber))return;
                next.seed=Math.max(0,Math.min(4294967295,Math.floor(input.valueAsNumber)));
            }else return;
            this.onDNA(next);
        });
        root.addEventListener('change',event=>{
            if((event.target as HTMLElement).id==='lab-seed'&&!(event.target as HTMLInputElement).value){(event.target as HTMLInputElement).value=String(this.dna.seed);}
        });
    }
    update(dna:CharacterDNA,phenotype:Phenotype,comparison:CharacterDNA|null){
        this.dna=cloneDNA(dna);
        const input=(id:string,value:string)=>{(document.getElementById(id) as HTMLInputElement).value=value;};
        const text=(id:string,value:string)=>{document.getElementById(id)!.textContent=value;};
        input('lab-sex',dna.sex);input('lab-seed',String(dna.seed));input('lab-age',String(dna.age));text('lab-age-value',`${dna.age} years`);
        const name=characterName(dna);text('lab-name',fullName(name));input('lab-culture',name.dominantCulture);input('lab-name-seed',String(dna.naming?.seed??0));text('lab-name-derivation',JSON.stringify(name.derivation,null,2));
        for(const key of traitKeys){input(`trait-${key}`,String(dna.traits[key]*100));text(`value-${key}`,`${Math.round(dna.traits[key]*100)}%`);}
        for(const key of heritageKeys){input(`heritage-${key}`,String(dna.heritage[key]*100));text(`heritage-value-${key}`,`${(dna.heritage[key]*100).toFixed(1)}%`);}
        const dominant=heritageKeys.reduce((a,b)=>dna.heritage[a]>=dna.heritage[b]?a:b);
        text('lab-dominant',`${heritageLabels[dominant]} ${Math.round(dna.heritage[dominant]*100)}% · mixed heritage`);
        text('lab-current-label',`CURRENT · ${fullName(name)} · Seed ${dna.seed}`);text('lab-comparison-label',comparison?`PINNED · ${fullName(characterName(comparison))} · Seed ${comparison.seed}`:'');
        document.getElementById('lab-comparison-label')!.hidden=!comparison;document.getElementById('lab-unpin')!.hidden=!comparison;
        text('lab-pin',comparison?'Replace comparison':'Pin comparison');
        document.getElementById('lab-dimensions')!.innerHTML=`<div><span>Height</span><strong>${Math.round(phenotype.height*100)}<small> cm</small></strong></div><div><span>Shoulders</span><strong>${Math.round(phenotype.shoulderWidth*100)}<small> cm</small></strong></div><div><span>Learning tendency</span><strong>${phenotype.learningRate.toFixed(2)}<small> ×</small></strong></div><div><span>Movement tendency</span><strong>${phenotype.movementSpeed.toFixed(2)}<small> ×</small></strong></div>`;
        const scores=occupationScores(dna.traits);
        text('lab-fit-summary',`${scores[0].label} currently fits best${comparison?' · dark ticks show the pinned character':''}.`);
        for(const {key,fit} of scores){text(`fit-value-${key}`,`${(fit*100).toFixed(1)}%`);document.getElementById(`fit-bar-${key}`)!.style.width=`${fit*100}%`;
            const marker=document.getElementById(`fit-reference-${key}`)!;marker.hidden=!comparison;if(comparison){const value=occupationFit(comparison,key);marker.style.left=`${value*100}%`;marker.title=`Pinned: ${(value*100).toFixed(1)}%`;}}
        input('lab-json',JSON.stringify(dna,null,2));text('lab-phenotype',JSON.stringify(phenotype,null,2));
    }
    getJSON(){return (document.getElementById('lab-json') as HTMLTextAreaElement).value;}
    selectJSON(){(document.querySelector('.lab-json') as HTMLDetailsElement).open=true;const area=document.getElementById('lab-json') as HTMLTextAreaElement;area.focus();area.select();}
    status(message:string,error=false){const status=document.getElementById('lab-status')!;status.textContent=message;status.classList.toggle('is-error',error);}
}
