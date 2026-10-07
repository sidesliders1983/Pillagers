import {updateView} from './updateView';
import {GameplaySession} from './GameplaySession';
import {personaAge,occupationIds,occupationAptitude,inspectWork,inspectBuilding,caregiverEligible,canApplyCommand,landingSummary} from '../simulation/SimulationCore';
import type {SimulationState,SimulationCommand} from '../simulation/SimulationCore';
import './gameplay-lab.css';
const esc=(value:unknown)=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const option=(value:string,label:string,selected=false)=>`<option value="${esc(value)}" ${selected?'selected':''}>${esc(label)}</option>`;
const pct=(n:number)=>`${(n/100).toFixed(1)}%`;
const roles=(selected:string|null)=>option('','No occupation',selected===null)+occupationIds.map(role=>option(role,role,role===selected)).join('');
const signed=(n:number)=>n>0?`+${n}`:String(n);
const STORAGE_KEY='pillagers.gameplay-lab.v1';
export class GameplayLab {
    private session=new GameplaySession();
    private root!:HTMLElement;
    private notice='Choose work and infrastructure, or advance one Winter.';
    private selectedPerson:string|null=null;
    private lastFrame:number|null=null;
    private lastPaint=0;
    private sameFounders=false;
    start():void {
        document.title='Pillagers · Gameplay Lab';document.body.className='gameplay-body';
        document.body.innerHTML='<main class="gameplay-lab" id="gameplay-lab"></main>';this.root=document.getElementById('gameplay-lab')!;
        this.root.addEventListener('click',event=>{const button=(event.target as HTMLElement).closest<HTMLButtonElement>('button');if(button)this.click(button);});
        this.root.addEventListener('change',event=>{const target=event.target as HTMLInputElement;if(target.id==='same-founders')this.sameFounders=target.checked;if(target.id==='speed'){this.session.setMinutesPerWinter(Number(target.value));this.lastFrame=null;}if(target.id==='import-file'&&target.files?.[0])void this.importFile(target.files[0]);});
        document.addEventListener('visibilitychange',()=>{if(document.hidden){this.session.setRunning(false);this.lastFrame=null;this.render();}});
        this.render();requestAnimationFrame(time=>this.frame(time));
    }
    private frame(time:number):void {
        try{if(!document.hidden&&this.lastFrame!==null)this.session.elapse(Math.min(250,time-this.lastFrame));}
        catch(error){this.session.setRunning(false);this.notice=String(error);}
        this.lastFrame=time;
        if(this.session.running&&time-this.lastPaint>=500){this.render();this.lastPaint=time;}
        requestAnimationFrame(next=>this.frame(next));
    }
    private button(state:SimulationState,command:SimulationCommand,label:string):string {
        return `<button data-command="${esc(JSON.stringify(command))}" ${canApplyCommand(state,command)?'':'disabled'}>${esc(label)}</button>`;
    }
    private input(id:string):string {return (document.getElementById(id) as HTMLInputElement|HTMLSelectElement).value;}
    private click(button:HTMLButtonElement):void {
        try{
            const action=button.dataset.action,id=button.dataset.id!;
            if(button.dataset.command){this.session.command(JSON.parse(button.dataset.command));this.notice='Action completed.';}
            else if(button.dataset.inspect){this.selectedPerson=button.dataset.inspect;}
            else if(action==='run'){this.session.setRunning(!this.session.running);this.lastFrame=null;}
            else if(action==='occupation')this.session.command({type:'AssignOccupation',personaId:id,occupation:(this.input(`occupation-${id}`)||null) as typeof occupationIds[number]|null});
            else if(action==='specialize')this.session.command({type:'SpecializeBuilding',buildingId:id,occupation:(this.input(`specialization-${id}`)||null) as typeof occupationIds[number]|null});
            else if(action==='residence')this.session.command({type:'AssignResidence',householdId:id,residenceId:this.input(`residence-${id}`)||null});
            else if(action==='cattle')this.session.command({type:'AssignCattle',cattleId:id,farmyardId:this.input('cattle-'+id)||null});
            else if(action==='caregiver')this.session.command({type:'AssignCaregiver',motherId:id,caregiverId:this.input(`caregiver-${id}`)||null});
            else if(action==='restart'){this.session.restartCampaign(this.sameFounders);this.selectedPerson=null;this.notice=this.sameFounders?'Campaign restarted with the same founders, paused.':'Campaign restarted with a new founding party, paused.';this.lastFrame=null;}
            else if(action==='new'){this.session.newCampaign(Number(this.input('seed')));this.selectedPerson=null;this.notice='New campaign, paused.';this.lastFrame=null;}
            else if(action==='save'){localStorage.setItem(STORAGE_KEY,this.session.saveJSON());this.notice='Game saved locally.';}
            else if(action==='load'){const saved=localStorage.getItem(STORAGE_KEY);if(!saved)throw new Error('No local save found.');this.session.loadJSON(saved);this.lastFrame=null;this.notice='Game loaded, paused.';}
            else if(action==='export'){const url=URL.createObjectURL(new Blob([this.session.saveJSON()],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download=`pillagers-winter-${this.session.snapshot().time.winter}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
            else if(action==='import'){this.session.setRunning(false);this.lastFrame=null;this.render();document.getElementById('import-file')!.click();return;}
        }catch(error){this.notice=error instanceof Error?error.message:String(error);}
        this.render();
        if(button.dataset.inspect)document.getElementById('lineage-view')?.scrollIntoView({block:'start'});
    }
    private async importFile(file:File):Promise<void>{try{this.session.loadJSON(await file.text());this.lastFrame=null;this.selectedPerson=null;this.notice='JSON loaded, paused.';}catch(error){this.notice=String(error);}this.render();}
    private render():void {
        const state=this.session.snapshot(),mechanics=state.mechanics!;
        // Keep an in-progress selection and open disclosure stable during live repaint.
        const focused=document.activeElement as HTMLElement|null;
        const focusedId=focused?.id;
        const fields=new Map(Array.from(this.root.querySelectorAll<HTMLInputElement|HTMLSelectElement>('input:not([type=file]),select')).filter(e=>e===focused||this.session.running).map(e=>[e.id,e.value]));
        const open=new Set(Array.from(this.root.querySelectorAll<HTMLDetailsElement>('details[open]')).map(e=>e.id));
        const name=(id:string)=>state.personas[id]?.name??id;
        const inspect=(id:string)=>`<button class="text-button" data-inspect="${esc(id)}">${esc(name(id))}</button>`;
        const people=Object.values(state.personas).map(person=>{
            const workEligible=person.deathWinter===null&&personaAge(state,person.id)>=mechanics.config.workAge;
            const info=mechanics.people[person.id],work=inspectWork(state,person.id),home=Object.values(state.households).find(h=>h.memberIds.includes(person.id));
            const children=Object.values(state.personas).filter(p=>p.parentIds.includes(person.id));
            return `<article class="lab-card" id="person-${esc(person.id)}"><h3>${esc(person.name)}</h3><p>${personaAge(state,person.id)} Winters · ${esc(person.dna.sex)} · ${person.deathWinter===null?'alive':'deceased'}</p><p>Household: ${esc(home?.id??'—')} · Partner: ${person.partnerId?inspect(person.partnerId):'—'}<br>Children: ${children.map(p=>inspect(p.id)).join(', ')||'—'}</p><p>Occupation: <strong>${esc(person.occupation??'none')}</strong> · ${info.occupationLocked?'player choice':'autonomous'}<br>Aptitude ${pct(work.aptitudeBps)} · Productivity ${pct(work.productivityBps)} ${work.reason?`(${esc(work.reason)})`:''}<br>Work progress ${Math.floor(work.progress*100)}% toward the next unit</p><progress value="${work.progress}" max="1"></progress><div class="lab-actions"><label>Occupation<select id="occupation-${esc(person.id)}" ${workEligible?'':'disabled'}>${roles(person.occupation)}</select></label><button data-action="occupation" data-id="${esc(person.id)}" ${workEligible?'':'disabled'}>Assign occupation</button>${workEligible?this.button(state,{type:'ReleaseOccupation',personaId:person.id},'Autonomy'):''}</div>${personaAge(state,person.id)<mechanics.config.workAge?`<p class="lab-muted">Occupation available from ${mechanics.config.workAge} Winters.</p>`:''}${info.childcareUntilWinter>state.time.winter?`<p>Childcare until Winter ${info.childcareUntilWinter} · Caregiver: ${info.caregiverId?esc(name(info.caregiverId)):'mother'} · ${info.caregiverLocked?'player choice':'autonomous'}</p><div class="lab-actions"><label>Caregiver<select id="caregiver-${esc(person.id)}">${option('','Mother',info.caregiverId===null)}${Object.keys(state.personas).filter(id=>id===info.caregiverId||caregiverEligible(state,id)).map(id=>option(id,name(id),id===info.caregiverId)).join('')}</select></label><button data-action="caregiver" data-id="${esc(person.id)}">Assign caregiver</button></div>`:''}<button data-inspect="${esc(person.id)}">View lineage</button><details id="dna-${esc(person.id)}"><summary>DNA and occupation aptitude</summary><p>${Object.entries(person.dna.traits).map(([k,v])=>`${esc(k)} ${Math.round(v*100)}%`).join(' · ')}</p><p>${occupationIds.map(role=>`${esc(role)} ${pct(occupationAptitude(state,person.id,role))}`).join(' · ')}</p></details><details id="history-${esc(person.id)}"><summary>Occupation history (${person.occupationHistory.length})</summary><ul>${person.occupationHistory.map(h=>`<li>${esc(h.occupation)} · ${h.startedAt.winter}:${h.startedAt.tick} → ${h.endedAt?`${h.endedAt.winter}:${h.endedAt.tick}`:'now'}</li>`).join('')}</ul></details></article>`;
        }).join('');
        const households=Object.values(state.households).filter(h=>h.memberIds.length).map(home=>{const residence=home.residenceId?state.residences[home.residenceId]:null;return `<article class="lab-card"><h3>${esc(home.id)}</h3><p>${home.memberIds.map(inspect).join(', ')}</p><p>${esc(residence?.kind??'no residence')} · ${esc(residence?.id??'—')}</p><div class="lab-actions"><label>Residence<select id="residence-${esc(home.id)}">${option('','Tent',!residence||residence.kind==='tent')}${Object.values(state.residences).filter(r=>r.kind==='house'&&canApplyCommand(state,{type:'AssignResidence',householdId:home.id,residenceId:r.id})).map(r=>option(r.id,r.id,home.residenceId===r.id)).join('')}</select></label><button data-action="residence" data-id="${esc(home.id)}">Move</button>${this.button(state,{type:'BuildHouse',householdId:home.id},"Build house ("+mechanics.config.houseCost+" Materials)")}</div></article>`;}).join('');
        const buildings=Object.values(state.buildings).map(building=>{const status=inspectBuilding(state,building.id);return `<article class="lab-card"><h3>${esc(building.id)} · ${esc(building.kind)} ${state.landing&&landingSummary(state).farmyards.some(f=>f.id===building.id)?'· Farmyard':''}</h3><p>${status.occupied?'occupied':'vacant'} · Upkeep ${status.occupied?status.upkeep:0} Materials/Winter<br>Maintenance debt ${status.debtWinters} · Investment ${status.investedMaterials}</p>${building.kind==='house'?`<p>Specialization ${esc(building.specialization??'none')} · Upgrade ${status.upgradeLevel}</p><div class="lab-actions"><label>Specialization<select id="specialization-${esc(building.id)}">${roles(building.specialization)}</select></label><button data-action="specialize" data-id="${esc(building.id)}">Specialize</button>${this.button(state,{type:'UpgradeBuilding',buildingId:building.id},"Upgrade ("+(mechanics.config.upgradeCosts[status.upgradeLevel]??'max')+" Materials)")}</div>`:''}</article>`;}).join('');
        const landing=state.landing?landingSummary(state):null;
        const assets=landing?`<section><h2>Founding assets</h2><div class="lab-grid"><article class="lab-card"><h3>Longship · ${landing.longships}</h3><p>${landing.maritimeCapable?'Maritime capacity retained':'No maritime capacity'}</p>${Object.values(state.landing!.longships).filter(s=>s.salvagedWinter===null).map(s=>this.button(state,{type:'KeepLongship',longshipId:s.id},'Keep')+this.button(state,{type:'SalvageLongship',longshipId:s.id},"Salvage ("+state.landing!.config.longshipSalvage+" Materials)")).join('')}</article><article class="lab-card"><h3>Livestock · ${landing.cattle}</h3><p>Exposed: ${landing.unshelteredCattle}</p>${Object.values(state.landing!.cattle).filter(c=>c.deathWinter===null).map(c=>`<p>${esc(c.id)} · ${c.sex==='female'?'cow':'bull'} · ${state.time.winter-c.birthWinter} Winters · ${c.farmyardId?esc(c.farmyardId):'exposed'} ${this.button(state,{type:'SlaughterCattle',cattleId:c.id},"Slaughter ("+state.landing!.config.slaughterFood+" Food)")}</p><div class="lab-actions"><label>Farmyard<select id="cattle-${esc(c.id)}">${option('','Exposed / unassigned',c.farmyardId===null)}${landing.farmyards.map(f=>option(f.id,`${f.householdId} · ${f.id}`,c.farmyardId===f.id)).join('')}</select></label><button data-action="cattle" data-id="${esc(c.id)}">Assign livestock</button></div>`).join('')}${landing.farmyards.map(f=>`<p>${esc(f.id)}: ${f.occupants}/${f.capacity} · Overcrowding ${f.overcrowding}</p>`).join('')}<p class="lab-muted">A permanent home becomes a Farmyard while a farmer lives there. Assign livestock individually.</p></article></div></section>`:'';
        const selected=this.selectedPerson&&state.personas[this.selectedPerson];
        const lineage=selected?`<h3>${esc(selected.name)}</h3><p>Parents: ${selected.parentIds.map(inspect).join(', ')||'no recorded parents'}</p><p>Partner: ${selected.partnerId?inspect(selected.partnerId):'—'}</p><p>Children: ${Object.values(state.personas).filter(p=>p.parentIds.includes(selected.id)).map(p=>inspect(p.id)).join(', ')||'—'}</p><p>Family groups: ${Object.values(state.families).filter(f=>f.memberIds.includes(selected.id)).map(f=>esc(f.id)).join(', ')||'—'}</p>`:'<p>Select a resident to inspect their parents, partner and children.</p>';
        updateView(this.root,`<header><a href="/">← Fjordside</a><h1>Pillagers · Gameplay Lab</h1><p>${state.time.winter===800?'WINTER 800 — THE LANDING':`WINTER ${state.time.winter}`} · Tick ${state.time.tick}/1000 · ${Object.values(state.personas).filter(p=>p.deathWinter===null).length} residents</p><div class="lab-stocks"><strong>Food ${state.stocks.food} <small>${signed(this.session.trend.food)}</small></strong><strong>Materials ${state.stocks.materials} <small>${signed(this.session.trend.materials)}</small></strong><span>Δ last action</span></div><progress value="${state.time.tick}" max="1000"></progress><div class="lab-actions"><button data-action="run">${this.session.running?'Pause':'Start'}</button>${this.button(state,{type:'AdvanceWinter'},'+1 Winter')}<label>Speed<select id="speed">${[1,3,5].map(m=>option(String(m),`${m} minutes / Winter`,m===this.session.minutesPerWinter)).join('')}</select></label><label>Seed<input id="seed" type="number" min="0" max="4294967295" value="${state.seed}"></label><button data-action="new">New campaign from seed</button></div><div class="lab-actions"><label><input id="same-founders" type="checkbox" ${this.sameFounders?'checked':''}> Use the same founders</label><button data-action="restart">Restart campaign</button></div><div class="lab-actions"><button data-action="save">Save locally</button><button data-action="load">Load locally</button><button data-action="export">JSON export</button><button data-action="import">JSON import</button><input id="import-file" type="file" accept="application/json,.json" hidden></div><p class="lab-notice" role="status">${esc(this.notice)}</p><p class="lab-muted">Pauses when you leave this tab. No offline progress. Prototype balance.</p></header>${assets}<section><h2>Households</h2><div class="lab-grid">${households}</div></section><section><h2>Buildings</h2><div class="lab-grid">${buildings||'<p>No permanent buildings yet.</p>'}</div></section><section id="lineage-view"><h2>Lineage</h2>${lineage}</section><section><h2>Residents</h2><div class="lab-grid">${people}</div></section><section><h2>Events (${state.events.length})</h2><p>Chronological · latest 100 events. Export JSON for the complete history.</p><ol class="lab-events">${state.events.slice(-100).map(e=>`<li><time>${e.time.winter}:${e.time.tick}</time> <strong>${esc(e.type)}</strong> ${e.personaId?esc(name(e.personaId)):''}<details id="event-${esc(e.id)}"><summary>Details</summary><pre>${esc(JSON.stringify(e.details??{},null,2))}</pre></details></li>`).join('')}</ol></section>`,new Set(fields.keys()));
        for(const [id,value] of fields){const field=document.getElementById(id) as HTMLInputElement|HTMLSelectElement|null;if(field)field.value=value;}
        for(const id of open){const detail=document.getElementById(id) as HTMLDetailsElement|null;if(detail)detail.open=true;}
        if(focusedId)document.getElementById(focusedId)?.focus({preventScroll:true});
    }
}
