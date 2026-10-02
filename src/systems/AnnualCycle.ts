import { CharacterDNA } from '../characters/CharacterDNA';
import { generateCharacterDNA } from '../characters/generateCharacterDNA';
export const YEAR_DURATION_MS=60_000;
export const START_YEAR=1200;
export const MAX_PERSONA_AGE=60;
export const RESPAWN_AGE=5;

/** Monotonic wall time, independent of frame count, movement dt and visualization. */
export class AnnualCycle {
    year=START_YEAR;
    progress=0;
    paused=false;
    private completed=0;
    constructor(private startedAt:number){}
    pause(){this.paused=true;this.progress=0;}
    resume(now:number){this.startedAt=now-this.completed*YEAR_DURATION_MS;this.paused=false;this.progress=0;}
    update(now:number,onYear:(year:number)=>void){
        if(this.paused)return;
        const elapsed=Math.max(0,now-this.startedAt),completed=Math.floor(elapsed/YEAR_DURATION_MS);
        while(this.completed<completed){this.completed++;this.year=START_YEAR+this.completed;onYear(this.year);if(this.paused)break;}
        this.progress=this.paused?0:(elapsed%YEAR_DURATION_MS)/YEAR_DURATION_MS;
    }
}
export function agePersona(dna:CharacterDNA,year:number,slot:number){
    if(dna.age+1<MAX_PERSONA_AGE)return {dna:{...dna,age:dna.age+1},replaced:false};
    const seed=(dna.seed^Math.imul(year,2246822519)^Math.imul(slot+1,3266489917))>>>0;
    return {dna:{...generateCharacterDNA(seed),age:RESPAWN_AGE},replaced:true};
}
