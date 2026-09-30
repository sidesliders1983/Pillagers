import { PerspectiveCamera, Scene, Raycaster, Vector2, Vector3, Mesh, BoxGeometry, MeshBasicMaterial, Object3D } from 'three';
import { CharacterDNA, traitKeys, heritageKeys } from '../characters/CharacterDNA';
import { Phenotype } from '../characters/Phenotype';
import { characterName, fullName } from '../characters/naming/generateName';
import { heritageLabels } from '../characters/heritageProfiles';
import { Villager } from '../entities/Villager';
type Character={dna:CharacterDNA;phenotype:Phenotype;villager:Villager};
export class CharacterProfileCard {
    private card=document.createElement('section');
    private selected:Character|null=null;
    private ray=new Raycaster();private pointer=new Vector2();private anchor=new Vector3();
    private charactersByRoot=new Map<Object3D,Character>();
    constructor(private camera:PerspectiveCamera,private canvas:HTMLCanvasElement,private scene:Scene,characters:Character[]){
        this.card.id='character-profile';this.card.className='character-profile';this.card.hidden=true;
        for(const edge of ['top','right','bottom','left'])this.card.style.setProperty(`--safe-${edge}`,`env(safe-area-inset-${edge}, 0px)`);
        this.card.setAttribute('aria-label','Selected character profile');this.card.setAttribute('aria-live','polite');
        document.body.append(this.card);
        // A generous invisible silhouette makes small RTS characters touchable.
        const geometry=new BoxGeometry(1,1,1),material=new MeshBasicMaterial({visible:false});
        for(const character of characters){
            const root=character.villager.visual,pick=new Mesh(geometry,material);
            pick.name='character-hit-area';pick.scale.set(Math.max(.75,character.phenotype.shoulderWidth*1.5),character.phenotype.height,.75);
            pick.position.y=character.phenotype.height/2;root.add(pick);this.charactersByRoot.set(root,character);
        }
        this.card.addEventListener('click',event=>{if((event.target as HTMLElement).closest('button'))this.clear();});
        window.addEventListener('keydown',event=>{if(event.key==='Escape')this.clear();});
    }
    select(x:number,y:number):boolean {
        const rect=this.canvas.getBoundingClientRect();this.pointer.set((x-rect.left)/rect.width*2-1,-(y-rect.top)/rect.height*2+1);
        this.scene.updateMatrixWorld(true);this.camera.updateMatrixWorld();this.ray.setFromCamera(this.pointer,this.camera);
        // The nearest world hit wins, so buildings block characters behind them.
        const hit=this.ray.intersectObjects(this.scene.children,true).find(hit=>hit.object instanceof Mesh);
        let node:Object3D|null=hit?.object??null,character:Character|undefined;
        while(node&&!character){character=this.charactersByRoot.get(node);node=node.parent;}
        if(!character){this.clear();return false;}
        this.selected=character;
        const {dna}=character,name=characterName(dna);
        this.card.innerHTML='<button class="profile-close" aria-label="Close character profile">×</button><span class="profile-eyebrow">FJORDSIDE / INHABITANT</span><h2></h2><p class="profile-identity"></p><h3>Character traits</h3><dl class="profile-traits"></dl><h3>Heritage profile</h3><div class="profile-heritage"></div>';
        this.card.querySelector('h2')!.textContent=fullName(name);
        this.card.querySelector('.profile-identity')!.textContent=`${dna.age} years · ${dna.sex==='male'?'Male':'Female'} · ${heritageLabels[name.dominantCulture]}`;
        const traits=this.card.querySelector('dl')!;
        for(const key of traitKeys){const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=key[0].toUpperCase()+key.slice(1);dd.textContent=`${Math.round(dna.traits[key]*100)}%`;traits.append(dt,dd);}
        const heritage=this.card.querySelector('.profile-heritage')!;
        const sorted=[...heritageKeys].filter(key=>dna.heritage[key]>0).sort((a,b)=>dna.heritage[b]-dna.heritage[a]);
        const minor=document.createElement('details');minor.className='profile-minor';
        const summary=document.createElement('summary');summary.textContent=`+ ${Math.max(0,sorted.length-3)} minor ancestries`;minor.append(summary);
        for(const [index,key] of sorted.entries()){
            const row=document.createElement('div'),label=document.createElement('span'),value=document.createElement('strong');
            label.textContent=heritageLabels[key];value.textContent=`${(dna.heritage[key]*100).toFixed(1)}%`;row.append(label,value);(index<3?heritage:minor).append(row);
        }
        if(sorted.length>3)heritage.append(minor);
        this.card.dataset.characterId=String(character.villager.id);this.card.hidden=false;this.update();return true;
    }
    private clear(){this.selected=null;this.card.hidden=true;delete this.card.dataset.characterId;}
    update(){
        if(!this.selected)return;
        const rect=this.canvas.getBoundingClientRect();
        this.anchor.copy(this.selected.villager.visual.position);this.anchor.y+=this.selected.phenotype.height+.35;this.anchor.project(this.camera);
        if(this.anchor.z< -1||this.anchor.z>1||Math.abs(this.anchor.x)>1||Math.abs(this.anchor.y)>1){this.card.hidden=true;return;}
        this.card.hidden=false;
        const x=rect.left+(this.anchor.x+1)*rect.width/2,y=rect.top+(1-this.anchor.y)*rect.height/2;
        const width=this.card.offsetWidth,height=this.card.offsetHeight;
        const style=getComputedStyle(this.card),safe=(edge:string)=>Math.max(8,parseFloat(style.getPropertyValue(`--safe-${edge}`))||0);
        this.card.style.left=`${Math.max(safe('left'),Math.min(innerWidth-width-safe('right'),x-width/2))}px`;
        this.card.style.top=`${Math.max(safe('top'),Math.min(innerHeight-height-safe('bottom'),y-height))}px`;
        this.card.style.setProperty('--profile-anchor',`${Math.max(12,Math.min(width-12,x-parseFloat(this.card.style.left)))}px`);
    }
}
