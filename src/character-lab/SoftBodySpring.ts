/** Bounded damped spring. Fixed substeps keep it stable across mobile frame rates. */
export class SoftBodySpring {
    position=0;
    velocity=0;
    constructor(private stiffness:number,private damping:number){}
    reset(){this.position=0;this.velocity=0;}
    step(delta:number,target:number){
        const duration=Math.max(0,Math.min(.1,delta)),steps=Math.ceil(duration*120);
        if(!steps)return this.position;
        const dt=duration/steps;
        for(let i=0;i<steps;i++){
            this.velocity+=(this.stiffness*(target-this.position)-this.damping*this.velocity)*dt;
            this.position+=this.velocity*dt;
            if(Math.abs(this.position)>.9){this.position=Math.sign(this.position)*.9;this.velocity=0;}
        }
        return this.position;
    }
}
