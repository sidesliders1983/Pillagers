import { renderCharacterProfile } from './CharacterProfileContent';
import { PerspectiveCamera, Scene, Raycaster, Vector2, Vector3, Mesh, BoxGeometry, MeshBasicMaterial, Object3D } from 'three';
import { CharacterDNA } from '../characters/CharacterDNA';
import { Phenotype } from '../characters/Phenotype';
import { characterName, fullName } from '../characters/naming/generateName';
import { Villager } from '../entities/Villager';
type Character={dna:CharacterDNA;phenotype:Phenotype;villager:Villager};
export class CharacterProfileCard {
    private card=document.createElement('section');
    private selected:Character|null=null;
    private ray=new Raycaster();private pointer=new Vector2();private anchor=new Vector3();
    private charactersByRoot=new Map<Object3D,Character>();
    private geometry=new BoxGeometry(1,1,1);
    private material=new MeshBasicMaterial({visible:false});
    private escape = (event: KeyboardEvent) => { if (event.key === 'Escape') this.clear(); };
    constructor(private camera:PerspectiveCamera,private canvas:HTMLCanvasElement,private scene:Scene,characters:Character[]){
        this.card.id='character-profile';this.card.className='character-profile';this.card.hidden=true;
        for(const edge of ['top','right','bottom','left'])this.card.style.setProperty(`--safe-${edge}`,`env(safe-area-inset-${edge}, 0px)`);
        this.card.setAttribute('aria-label','Selected character profile');this.card.setAttribute('aria-live','polite');
        document.body.append(this.card);
        // A generous invisible silhouette makes small RTS characters touchable.
        for(const character of characters)this.attach(character);
        this.card.addEventListener('click',event=>{if((event.target as HTMLElement).closest('button'))this.clear();});
        window.addEventListener('keydown',this.escape);
    }
    private attach(character:Character){
        const root=character.villager.visual,pick=new Mesh(this.geometry,this.material);
        pick.name='character-hit-area';root.add(pick);this.charactersByRoot.set(root,character);this.refresh(character);
    }
    replace(previous:Object3D,character:Character){
        previous.getObjectByName('character-hit-area')?.removeFromParent();
        this.charactersByRoot.delete(previous);if(this.selected===character)this.clear();this.attach(character);
    }
    refresh(character:Character){
        const pick=character.villager.visual.getObjectByName('character-hit-area');
        if(pick){pick.scale.set(Math.max(.75,character.phenotype.shoulderWidth*1.5),character.phenotype.height,.75);pick.position.y=character.phenotype.height/2;}
        if(this.selected===character)this.renderCard(character);
    }
    dispose(){window.removeEventListener('keydown',this.escape);this.geometry.dispose();this.material.dispose();this.card.remove();this.charactersByRoot.clear();}
    select(x:number,y:number):boolean {
        const rect=this.canvas.getBoundingClientRect();this.pointer.set((x-rect.left)/rect.width*2-1,-(y-rect.top)/rect.height*2+1);
        this.scene.updateMatrixWorld(true);this.camera.updateMatrixWorld();this.ray.setFromCamera(this.pointer,this.camera);
        // The nearest world hit wins, so buildings block characters behind them.
        const hit=this.ray.intersectObjects(this.scene.children,true).find(hit=>hit.object instanceof Mesh);
        let node:Object3D|null=hit?.object??null,character:Character|undefined;
        while(node&&!character){character=this.charactersByRoot.get(node);node=node.parent;}
        if(!character){this.clear();return false;}
        this.selected=character;this.renderCard(character);this.update();return true;
    }
    private renderCard(character:Character){
        const {dna}=character,name=characterName(dna);
        renderCharacterProfile(this.card, dna, fullName(name), String(character.villager.id));
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
