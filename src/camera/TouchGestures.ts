export interface TouchActions {
    navigate(x: number, y: number): void;
    rotate(dx: number, dy: number): void;
    zoom(ratio: number): void;
}
interface Contact {x:number;y:number;startX:number;startY:number;moved:boolean}
export class TouchGestures {
    private contacts=new Map<number,Contact>();
    private pinching=false;
    private span=0;
    constructor(private actions:TouchActions,private tapThreshold=10){}
    down(id:number,x:number,y:number){
        this.contacts.set(id,{x,y,startX:x,startY:y,moved:false});
        if(this.contacts.size>=2){this.pinching=true;this.span=this.getSpan();}
    }
    move(id:number,x:number,y:number){
        const contact=this.contacts.get(id);if(!contact)return;
        const dx=x-contact.x,dy=y-contact.y;contact.x=x;contact.y=y;
        contact.moved ||= Math.hypot(x-contact.startX,y-contact.startY)>this.tapThreshold;
        if(this.contacts.size>=2){
            const next=this.getSpan();
            // Report finger separation; the camera inversely maps this to its distance.
            if(this.span>8&&next>8)this.actions.zoom(next/this.span);
            this.span=next;
        }else if(!this.pinching&&contact.moved)this.actions.rotate(dx,dy);
    }
    up(id:number,cancelled=false){
        const contact=this.contacts.get(id);if(!contact)return;
        if(!cancelled&&!this.pinching&&!contact.moved)this.actions.navigate(contact.x,contact.y);
        this.contacts.delete(id);this.span=this.contacts.size>=2?this.getSpan():0;
        // A finger left after a pinch cannot become an accidental tap or swipe.
        if(this.contacts.size===0)this.pinching=false;
    }
    reset(){this.contacts.clear();this.pinching=false;this.span=0;}
    private getSpan(){const [a,b]=this.contacts.values();return a&&b?Math.hypot(a.x-b.x,a.y-b.y):0;}
}
