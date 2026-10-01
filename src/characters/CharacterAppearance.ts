import { CharacterDNA, parseCharacterDNA } from './CharacterDNA';
import { generatePhenotype } from './generatePhenotype';
import { identitySample } from './seededRandom';
import { weightedChoice } from './heritageProfiles';

export const hairStyles=['short','medium','long','tied','bun','braid'] as const;
export const beardStyles=['none','stubble','short','medium','long','split-braid','braid'] as const;
export type HairStyle=typeof hairStyles[number];
export type BeardStyle=typeof beardStyles[number];
export type CharacterAppearance={hairStyle:HairStyle;beardStyle:BeardStyle;color:string;greyAmount:number};

/** Independent named streams keep colour stable when style likelihood changes. */
export function characterAppearance(input:CharacterDNA):CharacterAppearance {
    const dna=parseCharacterDNA(input),m=dna.morphology?.masculinity??(dna.sex==='male'?.51:.49);
    const f=1-m,a=dna.traits.agility,p=dna.traits.physicality;
    const weights=[1.2+m+a*.4,1+f*.3,.4+f*1.2,.6+a*.8,.3+f*.7,.35+f*.8+dna.heritage.scandinavian*.5+dna.heritage.gaelic*.3];
    const hairStyle=hairStyles[weightedChoice(weights.map(v=>v/weights.reduce((x,y)=>x+y,0)),identitySample(dna.seed,'appearance.hair-style'))];
    let beardStyle:BeardStyle='none';
    if(dna.sex==='male'&&dna.age>=18&&identitySample(dna.seed,'beard-presence')>.35){
        const maturity=Math.min(1,(dna.age-18)/20);
        const w=[1.3-maturity,.8,.3+maturity,.12+maturity*(.6+p*.3),.12+maturity*.4,.12+maturity*.5];
        const length=weightedChoice(w.map(v=>v/w.reduce((x,y)=>x+y,0)),identitySample(dna.seed,'appearance.beard-style'));
        beardStyle=beardStyles[length+1];
    }
    return {hairStyle,beardStyle,color:generatePhenotype(dna).hairColor,greyAmount:Math.max(0,Math.min(1,(dna.age-45)/40))};
}
