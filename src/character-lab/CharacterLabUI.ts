import { CharacterDNA, cloneDNA, editHeritage, traitKeys, heritageKeys, TraitKey, HeritageKey, nextMasculinity, appearanceFitLimits, AppearanceFit } from '../characters/CharacterDNA';
import { Phenotype } from '../characters/Phenotype';
import { heritageLabels } from '../characters/heritageProfiles';
import { occupations, occupationScores, occupationFit, OccupationKey } from '../characters/occupationFit';
import { characterName, fullName } from '../characters/naming/generateName';
import { availableHairStyles } from './GeneratedHair';
import { availableBeardStyles } from './GeneratedBeard';
import { universalHumanProfile } from '../characters/UniversalHumanProfile';
import { fitPresetLabels } from '../characters/FitPresets';
import { goldenCharacters } from '../characters/GoldenCharacters';
import { serializeCharacterDNA } from '../characters/CharacterDNA';
import { LabBodyPresentation, LabBodyPreset, defaultLabBodyPresentation, previewLabBodyPresentation, labBodyRanges, labBodyOppositePairs, resolveLabBodyProfile } from '../characters/LabBodyPresentation';
import { goldenLabBody, labBodyAsset, labCandidatePresetNames } from '../characters/LabBodySources';
import { characterAsset } from '../characters/CharacterAssets';
import { CharacterPresentation, defaultCharacterPresentation, presentationChoices, resolveCharacterPresentation } from '../characters/CharacterPresentation';

const traitInfo:Record<TraitKey,{label:string;low:string;high:string}>={
    physicality:{label:'Physicality',low:'Slight / delicate',high:'Powerful / imposing'},
    agility:{label:'Agility',low:'Deliberate / grounded',high:'Quick / nimble'},
    intelligence:{label:'Intelligence',low:'Instinctive',high:'Analytical'},
    cunning:{label:'Cunning',low:'Straightforward',high:'Crafty / opportunistic'},
    temperament:{label:'Temperament',low:'Calm / restrained',high:'Fierce / volatile'},
};
export type LabAction=`animation-${string}`|'reroll-name'|'reroll'|'randomize'|'defaults'|'pin'|'unpin'|'copy'|'export'|'import'|'export-glb'|'export-static-glb'|'reset-view'|'overview'|'idle'|'walk'|'run'|'lod0'|'lod1'|'lod2'|`debug-${'sockets'|'landmarks'|'cages'|'coverage'|'bounds'}`|`preset-${keyof typeof fitPresetLabels}`|`golden-${string}`|`view-${'front'|'side'|'back'}`|'freeze-pose'|'play'|'golden-base'|'reset-presentation'|'snapshot-export'|'snapshot-import'|'reset-lab'|'reset-body';
export class CharacterLabUI {
    private dna:CharacterDNA;
    private presentation:CharacterPresentation={...defaultCharacterPresentation};
    private body:LabBodyPresentation={...defaultLabBodyPresentation};
    constructor(root:HTMLElement,dna:CharacterDNA,private onDNA:(dna:CharacterDNA)=>void,private onAction:(action:LabAction)=>void,private onPresentation:(value:CharacterPresentation)=>void=()=>{},private onBody:(value:LabBodyPresentation)=>void=()=>{}){
        this.dna=cloneDNA(dna);
        root.innerHTML=`<div class="lab">
            <nav class="lab-nav"><div><span class="lab-eyebrow">PILLAGERS / DEVELOPMENT</span><h1>Character Lab <small>v0.4</small></h1></div><a href="/meshy-preview">All Meshy animations</a><a href="/environment-lab">Environment Lab</a><a href="/asset-lab">Asset optimization lab</a><a href="/">Back to the fjord <span aria-hidden="true">↗</span></a></nav>
            <div class="lab-layout">
                <section class="lab-panel lab-controls" aria-label="Character controls">
                    <div class="lab-section-heading"><h2>01 <span>Identity</span></h2><span class="lab-badge">DNA</span></div>
                    <div class="lab-identity"><label>Sex (derived)<output id="lab-sex" aria-live="polite"></output></label>
                    <label>Seed<input id="lab-seed" type="number" min="0" max="4294967295" step="1"></label></div>
                    <div class="lab-slider"><label for="lab-age">Age <output id="lab-age-value"></output></label><input id="lab-age" type="range" min="6" max="100" step="1"><div class="lab-extremes"><span>Child</span><span>Elder</span></div></div>
                    <div class="lab-slider"><label for="lab-masculinity">Femininity ↔ Masculinity <output id="lab-masculinity-value"></output></label><input id="lab-masculinity" type="range" min="0" max="100" step="1"><div class="lab-extremes"><span id="lab-femininity-share">Femininity</span><span id="lab-masculinity-share">Masculinity</span></div></div>
                    <div class="lab-slider"><label for="lab-height">Adult height <output id="lab-height-value"></output></label><input id="lab-height" type="range" min="116" max="160" step="1"><div class="lab-extremes"><span>116 cm</span><span>160 cm</span></div></div>
                    <p class="lab-note">Up to 49% masculinity is female; from 51% is male. Exactly 50% is skipped. One mesh and rig from child to elder. Auto assigns hair and adult male beards from the profile. Manual Lab choices preserve this identity.</p>
                    <div class="lab-button-row"><button data-action="reroll">Reroll seed</button><button data-action="randomize">Randomize character</button></div>
                    <div class="lab-naming"><h2>Personal name</h2><strong id="lab-name"></strong><label>Name culture (dominant heritage)<select id="lab-culture" disabled>${heritageKeys.map(key=>`<option value="${key}">${heritageLabels[key]}</option>`).join('')}</select></label><label>Name variation seed<input id="lab-name-seed" type="number" min="0" max="4294967295" step="1"></label><button data-action="reroll-name">Reroll name</button><p class="lab-note">The largest heritage share determines the naming grammar; compatible minority ingredients add subtle variation. Name variation leaves appearance unchanged.</p><details><summary>Name derivation</summary><pre id="lab-name-derivation"></pre></details></div>
                    <div class="lab-section-heading"><h2>02 <span>Core traits</span></h2><span class="lab-badge">5 AXES</span></div>
                    ${traitKeys.filter(key=>key!=='physicality').map(key=>`<div class="lab-slider"><label for="trait-${key}">${traitInfo[key].label}<output id="value-${key}"></output></label><input id="trait-${key}" data-trait="${key}" type="range" min="0" max="100" step="1"><div class="lab-extremes"><span>${traitInfo[key].low}</span><span>${traitInfo[key].high}</span></div></div>`).join('')}
                    <p class="lab-note">Traits express disposition. Intelligence and Cunning do not change facial anatomy.</p>
                    <button class="lab-text-button" data-action="defaults">Reset DNA to defaults</button>
                </section>
                <section class="lab-stage" aria-label="Live character preview">
                    <div class="lab-stage-heading"><span class="lab-eyebrow">LIVE PHENOTYPE</span><span id="lab-dominant"></span></div>
                    <canvas id="lab-preview" aria-label="Universal Human. Drag to rotate, scroll or pinch to zoom."></canvas>
                    <div class="lab-source-controls"><label>Body source<select id="lab-body-source"><option value="meshy">Meshy Human · textured</option><option value="golden-v04-preview">v0.4 · new body preview</option><option value="published">Published body · existing modules</option></select></label><p class="lab-note" id="lab-source-status"></p></div>
                    <label class="lab-source-controls">Animation<select id="lab-animation" aria-label="Available animations"></select></label>
                    <div class="lab-button-row lab-model-tools" aria-label="Level of detail"><button data-action="lod0">LOD0</button><button data-action="lod1">LOD1</button><button data-action="lod2">LOD2</button></div>
                    <div class="lab-character-labels"><span id="lab-current-label"></span><span id="lab-comparison-label" hidden></span></div>
                    <div class="lab-button-row lab-model-tools" aria-label="Fixed views"><button data-action="view-front">Front</button><button data-action="view-side">Side</button><button data-action="view-back">Back</button><button data-action="overview">RTS</button></div><div class="lab-pose-controls"><label>Clip time (seconds)<input id="lab-pose-time" type="number" min="0" max="60" step="0.05" value="0"></label><button data-action="freeze-pose">Freeze pose</button><button data-action="play">Play</button></div><div class="lab-preview-tools"><span>Drag to rotate · Pinch / scroll to zoom</span><div><button data-action="reset-view">Reset view</button></div></div>
                    <div class="lab-dimensions" id="lab-dimensions"></div>
                    <details class="lab-panel lab-fit-debug"><summary>Attachment &amp; Fit debug · v0.1</summary>
                        <div class="lab-button-row">${['sockets','landmarks','cages','coverage','bounds'].map(key=>`<button data-action="debug-${key}" aria-pressed="false">${key}</button>`).join('')}</div>
                        <p class="lab-note">Blue: sockets · pink: surface landmarks · wireframes: fit cages / coverage. Overlays follow the animated rig. Physicality is retained only for legacy compatibility.</p>
                        <label>Fit test preset<select id="lab-fit-preset"><option value="">Choose a test profile</option>${Object.entries(fitPresetLabels).map(([key,label])=>`<option value="${key}">${label}</option>`).join('')}</select></label>
                        <label>Golden Character<select id="lab-golden-character"><option value="">Choose a fixed regression character</option>${goldenCharacters.map(({id,label})=>`<option value="${id}">${label}</option>`).join('')}</select></label>
                        <details><summary>Contract and equipped module metadata</summary><pre id="lab-fit-metadata"></pre></details>
                    </details>
                    <div class="lab-panel lab-body-controls" aria-label="Body presentation"><h2>Body presentation · Lab override</h2><p class="lab-note" id="lab-body-status"></p><label>Build preset<select id="lab-body-preset"><option value="auto">Auto · source DNA</option><option value="neutral">Neutral · technical</option>${labCandidatePresetNames.map(id=>`<option value="${id}" disabled>${id[0].toUpperCase()+id.slice(1)} · preview</option>`).join('')}</select></label><div class="lab-slider"><label for="lab-body-height">Displayed adult height<output id="lab-body-height-value"></output></label><input id="lab-body-height" type="range" min="1.16" max="1.60" step="0.01"></div>
                    ${Object.entries(labBodyRanges).map(([key,[min,max]])=>`<div class="lab-slider"><label for="lab-body-${key}">${key.replace(/([a-z])([A-Z])/g,'$1 $2')}<output id="lab-body-value-${key}"></output></label><input id="lab-body-${key}" data-body-axis="${key}" type="range" min="${min}" max="${max}" step="0.01"></div>`).join('')}<button data-action="reset-body">Restore source DNA body</button><p class="lab-note">Existing visual morphs only; body-build strength stays at 60%. Real sex, age, personality, growth and movement retain their DNA meaning. Independent torso/arm/leg controls await authored targets. Head, hand and foot scale stays locked.</p></div>
                    <div class="lab-panel lab-module-controls" aria-label="Presentation modules"><h2>Presentation modules</h2><p class="lab-note">Current registry assets are available for inspection. Their v0.4 visual review is pending. These choices belong to this Lab view, not CharacterDNA.</p>
                    ${(['hair','beard','garment','equipment'] as const).map(type=>{const key=type==='garment'?'outfit':type;return `<label>${key[0].toUpperCase()+key.slice(1)}<select id="lab-module-${key}" data-presentation="${key}"><option value="auto">Auto · profile</option><option value="none">None</option>${presentationChoices(type).map(({id,label})=>`<option value="${id}">${label}</option>`).join('')}</select></label>`;}).join('')}
                    <label>Hair / beard colour<select id="lab-hair-color-mode"><option value="auto">Auto · heritage and age</option><option value="manual">Manual colour</option></select><input id="lab-hair-color" type="color" value="#986e55" aria-label="Manual hair and beard colour"></label>
                    <label>Equipment carry<select id="lab-equipment-socket" data-presentation="equipmentSocket"><option value="auto">Auto · authored grip</option></select></label><p id="lab-module-status" class="lab-note"></p><p id="lab-beard-eligibility" class="lab-note"></p><label class="lab-checkbox"><input id="lab-technical-waist" type="checkbox">Technical waist demonstrator</label><div class="lab-button-row"><button data-action="golden-base">Golden base view</button><button data-action="reset-presentation">Reset to Auto</button></div></div>
                    <div class="lab-panel" aria-label="Appearance size ratios"><h2>Appearance size</h2>
                    ${Object.entries(appearanceFitLimits).map(([key,[min,max]])=>`<div class="lab-slider"><label for="fit-${key}">${key==='hair'?'Hair clearance':key[0].toUpperCase()+key.slice(1)+' ratio'} <output id="fit-${key}-value">100%</output></label><input id="fit-${key}" data-appearance-fit="${key}" type="range" min="${min*100}" max="${max*100}" value="100" step="1"></div>`).join('')}
                    <p class="lab-note">Hair: 1.0 uses the shared head fit; higher values add clearance. Clothing cannot shrink below the safe fit. Auto follows the profile; manual presentation choices are independent. Current assets still require v0.4 review.</p></div>
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
                    <details class="lab-json"><summary>CharacterDNA JSON</summary><textarea id="lab-json" spellcheck="false" aria-label="CharacterDNA JSON"></textarea><div class="lab-button-row"><button data-action="copy">Copy</button><button data-action="export">Export JSON</button><button data-action="export-glb">Rigged character GLB</button><button data-action="export-static-glb">Static posed GLB</button><button data-action="import">Apply JSON</button></div><p class="lab-note">Rigged export keeps bones and animation. Static export freezes the current pose with geometric facet normals and no animation.</p></details>
                    <details class="lab-snapshot"><summary>Reproducible Lab snapshot</summary><textarea id="lab-snapshot" spellcheck="false" aria-label="Lab test snapshot JSON"></textarea><div class="lab-button-row"><button data-action="snapshot-export">Capture / export snapshot</button><button data-action="snapshot-import">Apply snapshot</button><button data-action="reset-lab">Reset Lab</button></div><p class="lab-note">Includes DNA, body overrides, presentation asset hashes, frozen clip time and camera. DNA export above remains identity only.</p></details><details class="lab-derived"><summary>Derived phenotype</summary><pre id="lab-phenotype"></pre></details>
                    <p id="lab-status" class="lab-status" role="status" aria-live="polite">One seed. One identity. Many possible lives.</p>
                </section>
            </div>
        </div>`;
        root.querySelectorAll('[aria-label="Level of detail"] button').forEach(button=>button.setAttribute('aria-pressed',String((button as HTMLButtonElement).dataset.action==='lod2')));
        root.addEventListener('click',event=>{const button=(event.target as HTMLElement).closest<HTMLButtonElement>('button[data-action]');if(button){if(button.dataset.action!.startsWith('debug-'))button.setAttribute('aria-pressed',String(button.getAttribute('aria-pressed')!=='true'));else if(button.hasAttribute('aria-pressed'))button.parentElement!.querySelectorAll('button').forEach(sibling=>sibling.setAttribute('aria-pressed',String(sibling===button)));this.onAction(button.dataset.action as LabAction);}});
        root.addEventListener('input',event=>{
            const input=event.target as HTMLInputElement;
            if(input.dataset.bodyAxis||input.id==='lab-body-height'){const next:LabBodyPresentation={...this.body,morphology:{...this.body.morphology},morphs:{...this.body.morphs}};if(input.id==='lab-body-height')next.morphology!.height=Number(input.value);else{const key=input.dataset.bodyAxis as keyof typeof labBodyRanges;next.morphs![key]=Number(input.value);for(const [a,b] of labBodyOppositePairs){if(key===a)next.morphs![b]=0;if(key===b)next.morphs![a]=0;}}this.onBody(next);return;}
            if(input.id==='lab-hair-color'){if(this.presentation.hairColor!==null)this.onPresentation({...this.presentation,hairColor:input.value});return;}
            const next=cloneDNA(this.dna);
            if(input.dataset.appearanceFit)next.appearanceFit={...(next.appearanceFit??{hair:1,beard:1,clothing:1}),[input.dataset.appearanceFit]:Number(input.value)/100};
            else if(input.dataset.trait)next.traits[input.dataset.trait as TraitKey]=Number(input.value)/100;
            else if(input.dataset.heritage)next.heritage=editHeritage(next.heritage,input.dataset.heritage as HeritageKey,Number(input.value)/100);
            else if(input.id==='lab-age')next.age=Number(input.value);
            else if(input.id==='lab-masculinity'||input.id==='lab-height'){
                const profile=universalHumanProfile(next);
                next.morphology={masculinity:input.id==='lab-masculinity'?nextMasculinity(Number(input.value),profile.masculinity):profile.masculinity,height:input.id==='lab-height'?Number(input.value)/100:profile.height};
            }
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
            const choice=event.target as HTMLInputElement;
            if(choice.id==='lab-animation'){this.onAction(`animation-${choice.value}`);return;}
            if(choice.id==='lab-body-source'){this.onBody(choice.value==='meshy'?{version:1,preset:'auto',source:'meshy'}:choice.value===goldenLabBody.source?{...previewLabBodyPresentation}:{...defaultLabBodyPresentation});return;}
            if(choice.id==='lab-body-preset'){this.onBody({version:1,preset:choice.value as LabBodyPreset,...(this.body.source?{source:this.body.source}:{})});return;}
            if(choice.dataset.presentation){this.onPresentation({...this.presentation,[choice.dataset.presentation]:choice.value});return;}
            if(choice.id==='lab-hair-color-mode'){this.onPresentation({...this.presentation,hairColor:choice.value==='auto'?null:(document.getElementById('lab-hair-color') as HTMLInputElement).value});return;}
            if(choice.id==='lab-technical-waist'){this.onPresentation({...this.presentation,technicalWaistWrap:choice.checked});return;}
            if((event.target as HTMLElement).id==='lab-fit-preset'){const select=event.target as HTMLSelectElement;if(select.value)this.onAction(`preset-${select.value}` as LabAction);select.value='';}
            if((event.target as HTMLElement).id==='lab-golden-character'){const select=event.target as HTMLSelectElement;if(select.value)this.onAction(`golden-${select.value}`);select.value='';}
            if((event.target as HTMLElement).id==='lab-seed'&&!(event.target as HTMLInputElement).value){(event.target as HTMLInputElement).value=String(this.dna.seed);}
        });
    }
    update(dna:CharacterDNA,phenotype:Phenotype,comparison:CharacterDNA|null,presentation:CharacterPresentation=defaultCharacterPresentation,bodyPresentation:LabBodyPresentation=defaultLabBodyPresentation){
        this.dna=cloneDNA(dna);this.presentation={...presentation};this.body=bodyPresentation;
        const input=(id:string,value:string)=>{(document.getElementById(id) as HTMLInputElement).value=value;};
        const text=(id:string,value:string)=>{document.getElementById(id)!.textContent=value;};
        text('lab-sex',dna.sex==='female'?'Female':'Male');input('lab-seed',String(dna.seed));input('lab-age',String(dna.age));text('lab-age-value',`${dna.age} years`);
        const selected=resolveCharacterPresentation(dna,presentation,labBodyAsset(bodyPresentation.source??'published',2)),body=selected.profile,displayed=resolveLabBodyProfile(dna,bodyPresentation),candidate=bodyPresentation.source===goldenLabBody.source;
        input('lab-body-source',bodyPresentation.source??'published');
        text('lab-source-status',bodyPresentation.source==='meshy'?'Meshy Human · original textures, age/DNA proportions and all three LODs.':candidate?'New body preview · LOD2. Sampled joints and motion pass; compound shape review remains open. New v0.4 modules use the Imagegen → Meshy pipeline; older modules are unavailable.':'Published body with the existing hair, beard and clothing modules.');
        document.querySelectorAll<HTMLButtonElement>('[aria-label="Level of detail"] button').forEach(button=>button.disabled=candidate&&button.dataset.action!=='lod2');
        document.querySelectorAll<HTMLOptionElement>('#lab-body-preset option').forEach(option=>{if(labCandidatePresetNames.includes(option.value as typeof labCandidatePresetNames[number]))option.disabled=!candidate;});
        input('lab-body-preset',bodyPresentation.preset);input('lab-body-height',String(displayed.profile.height));text('lab-body-height-value',`${Math.round(displayed.profile.height*100)} cm`);
        text('lab-body-status',displayed.status==='unsupported-age'?'Adult override paused below age 18; the original child/teen body continues to grow.':displayed.status==='override'?`Lab body override displayed. Source DNA adult height ${Math.round(body.height*100)} cm; real age ${dna.age} and sex rules unchanged.`:'Source DNA body displayed. These controls are independent authoring overrides.');
        for(const key of Object.keys(labBodyRanges) as (keyof typeof labBodyRanges)[]){input(`lab-body-${key}`,String(displayed.rawControls[key]));text(`lab-body-value-${key}`,displayed.rawControls[key].toFixed(2));}
        document.querySelectorAll<HTMLInputElement|HTMLSelectElement>('.lab-body-controls input,.lab-body-controls select').forEach(control=>control.disabled=dna.age<18);
        for(const [key,type] of [['hair','hair'],['beard','beard'],['outfit','garment'],['equipment','equipment']] as const){
            const select=document.getElementById('lab-module-'+key) as HTMLSelectElement;
            const entries=presentationChoices(type,labBodyAsset(bodyPresentation.source??'published',2));
            select.replaceChildren(...[{id:'auto',label:'Auto · profile'},{id:'none',label:'None'},...entries].map(entry=>new Option(entry.label,entry.id)));
            select.value=presentation[key];
        }
        const carry=document.getElementById('lab-equipment-socket') as HTMLSelectElement;
        const sockets=selected.equipmentId?Object.keys(characterAsset(selected.equipmentId).metadata?.equipmentBindings?.sockets??{}):[];
        carry.replaceChildren(new Option('Auto · authored grip','auto'),...sockets.map(socket=>new Option(socket.replace('socket_','').replaceAll('_',' '),socket)));
        carry.value=presentation.equipmentSocket;carry.disabled=!selected.equipmentId;
        input('lab-hair-color-mode',presentation.hairColor===null?'auto':'manual');input('lab-hair-color',presentation.hairColor??body.appearance.color);
        (document.getElementById('lab-hair-color') as HTMLInputElement).disabled=presentation.hairColor===null;
        (document.getElementById('lab-technical-waist') as HTMLInputElement).checked=presentation.technicalWaistWrap;
        const eligible=body.age>=18&&body.masculinity>.5;(document.getElementById('lab-module-beard') as HTMLSelectElement).disabled=!eligible;
        text('lab-beard-eligibility',eligible?'Beards are eligible for this adult male.':'Beards are hidden: male characters must be at least 18. A saved choice never bypasses this rule.');input('lab-masculinity',String(body.masculinity*100));text('lab-masculinity-value',`${Math.round(body.masculinity*100)}% M`);text('lab-femininity-share',`Femininity ${Math.round((1-body.masculinity)*100)}%`);text('lab-masculinity-share',`Masculinity ${Math.round(body.masculinity*100)}%`);input('lab-height',String(body.height*100));text('lab-height-value',`${Math.round(body.height*100)} cm`);
        for(const key of Object.keys(appearanceFitLimits) as (keyof AppearanceFit)[]){const value=body.appearanceFit[key];input(`fit-${key}`,String(value*100));text(`fit-${key}-value`,key==='hair'?`${value.toFixed(2)} × · +${Math.round((value-1)*100)}% head radius`:`${Math.round(value*100)}%`);}
        (document.getElementById('fit-beard') as HTMLInputElement).disabled=!availableBeardStyles.includes(body.appearance.beardStyle);
        (document.getElementById('fit-hair') as HTMLInputElement).disabled=!availableHairStyles.includes(body.appearance.hairStyle);
        if(!availableBeardStyles.includes(body.appearance.beardStyle))text('fit-beard-value',body.appearance.beardStyle==='none'?'Not applicable':'Reference asset pending');
        for(const id of ['lab-module-hair','lab-module-outfit','lab-module-equipment','lab-hair-color-mode','fit-clothing'])(document.getElementById(id) as HTMLInputElement).disabled=false;
        (document.getElementById('lab-technical-waist') as HTMLInputElement).disabled=candidate||bodyPresentation.source==='meshy';
        (document.getElementById('lab-module-beard') as HTMLSelectElement).disabled=!eligible;
        (document.getElementById('lab-hair-color') as HTMLInputElement).disabled=presentation.hairColor===null;
        (document.getElementById('fit-hair') as HTMLInputElement).disabled=!selected.hairId;
        (document.getElementById('fit-beard') as HTMLInputElement).disabled=!selected.beardId;
        if(bodyPresentation.source==='meshy'){
            for(const id of ['lab-module-hair','lab-module-beard','lab-module-outfit','lab-module-equipment','lab-hair-color-mode','lab-hair-color','fit-hair','fit-beard','fit-clothing','lab-equipment-socket'])(document.getElementById(id) as HTMLInputElement).disabled=true;
        }
        document.querySelectorAll<HTMLButtonElement>('[data-action^="debug-"]').forEach(button=>button.disabled=bodyPresentation.source==='meshy');
        const breasts=document.getElementById('lab-body-Breasts') as HTMLInputElement;breasts.disabled=dna.age<18||bodyPresentation.source==='meshy';
        text('lab-module-status',bodyPresentation.source==='meshy'?'This body uses its authored shirt and underwear. Additional appearance modules need Meshy-specific fitting.':candidate?'New v0.4 Imagegen → Meshy modules only. Preview modules remain subject to independent fit and motion review.':'Legacy library inspection.');
        (document.querySelector('[data-action="reset-presentation"]') as HTMLButtonElement).disabled=false;
        const name=characterName(dna);text('lab-name',fullName(name));input('lab-culture',name.dominantCulture);input('lab-name-seed',String(dna.naming?.seed??0));text('lab-name-derivation',JSON.stringify(name.derivation,null,2));
        for(const key of traitKeys.filter(key=>key!=='physicality')){input(`trait-${key}`,String(dna.traits[key]*100));text(`value-${key}`,`${Math.round(dna.traits[key]*100)}%`);}
        for(const key of heritageKeys){input(`heritage-${key}`,String(dna.heritage[key]*100));text(`heritage-value-${key}`,`${(dna.heritage[key]*100).toFixed(1)}%`);}
        const dominant=heritageKeys.reduce((a,b)=>dna.heritage[a]>=dna.heritage[b]?a:b);
        text('lab-dominant',`${heritageLabels[dominant]} ${Math.round(dna.heritage[dominant]*100)}% · mixed heritage`);
        text('lab-current-label',`CURRENT · ${fullName(name)} · Seed ${dna.seed}`);text('lab-comparison-label',comparison?`PINNED · ${fullName(characterName(comparison))} · Seed ${comparison.seed}`:'');
        document.getElementById('lab-comparison-label')!.hidden=!comparison;document.getElementById('lab-unpin')!.hidden=!comparison;
        text('lab-pin',comparison?'Replace comparison':'Pin comparison');
        document.getElementById('lab-dimensions')!.innerHTML=`<div><span>Displayed adult target height</span><strong>${Math.round(displayed.profile.height*100)}<small> cm</small></strong></div><div><span>Masculinity</span><strong>${Math.round(body.masculinity*100)}<small> %</small></strong></div><div><span>DNA weight tendency</span><strong>${body.weightDeviation<0?"Underweight":body.weightDeviation>0?"Overweight":"Balanced"}<small> ${Math.round(Math.abs(body.weightDeviation)*100)}%</small></strong></div><div><span>Life stage</span><strong>${body.stage}</strong></div><div><span>Hair / beard</span><strong>${selected.hairId?.replace('hair/','')??'none'}<small>${selected.hairId?' · registry asset':' · no module'} / ${body.appearance.beardStyle}${selected.beardId?' · registry asset':''}</small></strong></div><div><span>Hair colour</span><strong style="color:${body.appearance.color}">${body.appearance.color}<small> · ${Math.round(body.appearance.greyAmount*100)}% grey</small></strong></div><div><span>Outfit</span><strong>${selected.outfitId?.replace('garment/','').replaceAll('-',' ')??'none'}<small> · ${presentation.outfit==='auto'?'seed assigned':'Lab choice'}</small></strong></div><div><span>Learning tendency</span><strong>${phenotype.learningRate.toFixed(2)}<small> ×</small></strong></div><div><span>Movement tendency</span><strong>${phenotype.movementSpeed.toFixed(2)}<small> ×</small></strong></div>`;
        const scores=occupationScores(dna.traits);
        text('lab-fit-summary',`${scores[0].label} currently fits best${comparison?' · dark ticks show the pinned character':''}.`);
        for(const {key,fit} of scores){text(`fit-value-${key}`,`${(fit*100).toFixed(1)}%`);document.getElementById(`fit-bar-${key}`)!.style.width=`${fit*100}%`;
            const marker=document.getElementById(`fit-reference-${key}`)!;marker.hidden=!comparison;if(comparison){const value=occupationFit(comparison,key);marker.style.left=`${value*100}%`;marker.title=`Pinned: ${(value*100).toFixed(1)}%`;}}
        input('lab-json',serializeCharacterDNA(dna));text('lab-phenotype',JSON.stringify({...phenotype,universalHuman:body,displayedUniversalHuman:displayed.profile,bodySource:bodyPresentation.source??'published'},null,2));
    }
    getPoseTime(){return (document.getElementById('lab-pose-time') as HTMLInputElement).valueAsNumber;}
    getSnapshotJSON(){return (document.getElementById('lab-snapshot') as HTMLTextAreaElement).value;}
    setSnapshotJSON(value:string){(document.getElementById('lab-snapshot') as HTMLTextAreaElement).value=value;(document.querySelector('.lab-snapshot') as HTMLDetailsElement).open=true;}
    getJSON(){return (document.getElementById('lab-json') as HTMLTextAreaElement).value;}
    selectJSON(){(document.querySelector('.lab-json') as HTMLDetailsElement).open=true;const area=document.getElementById('lab-json') as HTMLTextAreaElement;area.focus();area.select();}
    status(message:string,error=false){const status=document.getElementById('lab-status')!;status.textContent=message;status.classList.toggle('is-error',error);}
}
