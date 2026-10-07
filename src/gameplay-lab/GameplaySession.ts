import {createCampaign,applyCommand,serializeState,reconstructState} from '../simulation/SimulationCore';
import type {SimulationCommand,SimulationState} from '../simulation/SimulationCore';
/** Browser pacing is transient; only explicit commands change canonical state. */
export class GameplaySession {
    private state:SimulationState;
    private fractionalTicks=0;
    trend={food:0,materials:0};
    running=false;
    minutesPerWinter=3;
    constructor(seed=32){this.state=createCampaign(seed);}
    snapshot():SimulationState{return structuredClone(this.state);}
    setRunning(running:boolean):void {this.running=running;}
    setMinutesPerWinter(minutes:number):void {if(![1,3,5].includes(minutes))throw new Error('Choose 1, 3 or 5 minutes per Winter');this.minutesPerWinter=minutes;}
    command(command:SimulationCommand):void {const next=applyCommand(this.state,command);this.trend={food:next.stocks.food-this.state.stocks.food,materials:next.stocks.materials-this.state.stocks.materials};this.state=next;}
    saveJSON():string{return serializeState(this.state);}
    loadJSON(serialized:string):void {const state=reconstructState(serialized);if(!state.mechanics)throw new Error('This save has no gameplay mechanics');this.replace(state);}
    newCampaign(seed:number,weatherEnabled=true):void {this.replace(createCampaign(seed,{}, {},{enabled:weatherEnabled}));}
    restartCampaign(sameFounders=false,drawSeed:()=>number=()=>crypto.getRandomValues(new Uint32Array(1))[0],weatherEnabled=this.state.weather?.config.enabled??false):void {
        let seed=sameFounders?this.state.seed:drawSeed();
        if(!sameFounders&&seed===this.state.seed)seed=(seed+1)>>>0;
        this.replace(createCampaign(seed,this.state.landing?.config,this.state.mechanics?.config,{...this.state.weather?.config,enabled:weatherEnabled}));
    }
    private replace(state:SimulationState):void {this.state=state;this.running=false;this.fractionalTicks=0;this.trend={food:0,materials:0};}
    elapse(milliseconds:number):void {
        if(!Number.isFinite(milliseconds)||milliseconds<0)throw new Error('Invalid active elapsed time');
        if(!this.running)return;
        const ticks=this.fractionalTicks+milliseconds*this.state.ticksPerWinter/(this.minutesPerWinter*60000);
        const whole=Math.floor(ticks+1e-9);
        if(whole)this.command({type:'AdvanceTicks',ticks:whole});
        this.fractionalTicks=Math.max(0,ticks-whole);
    }
}
