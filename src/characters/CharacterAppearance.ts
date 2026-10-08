import { CharacterDNA, parseCharacterDNA } from './CharacterDNA';
import { generatePhenotype } from './generatePhenotype';
import { identitySample } from './seededRandom';
import { weightedChoice } from './heritageProfiles';
import { availableHairStyles, availableBeardStyles } from './CharacterAssets';
import type { HairStyle, BeardStyle } from './AppearanceTypes';
export type { HairStyle, BeardStyle } from './AppearanceTypes';

export const hairStyles:readonly HairStyle[]=availableHairStyles;
export const beardStyles:readonly BeardStyle[]=['none',...availableBeardStyles];
export type CharacterAppearance={hairStyle:HairStyle;beardStyle:BeardStyle;color:string;greyAmount:number};

/** Independent named streams keep colour stable when style likelihood changes. */
export function characterAppearance(input:CharacterDNA):CharacterAppearance {
    const dna=parseCharacterDNA(input),m=dna.morphology?.masculinity??(dna.sex==='male'?.51:.49);
    const f=1-m,a=dna.traits.agility,p=dna.traits.physicality;
    const hairWeights:Record<HairStyle,number>={short:1.2+m+a*.4,medium:1+f*.3,long:.4+f*1.2,tied:.6+a*.8,bun:.3+f*.7,braid:.35+f*.8+dna.heritage.scandinavian*.5+dna.heritage.gaelic*.3};
    const weights=hairStyles.map(style=>hairWeights[style]);
    const hairStyle=hairStyles[weightedChoice(weights.map(v=>v/weights.reduce((x,y)=>x+y,0)),identitySample(dna.seed,'appearance.hair-style'))];
    let beardStyle:BeardStyle='none';
    if(dna.sex==='male'&&dna.age>=18&&identitySample(dna.seed,'beard-presence')>.35){
        const maturity=Math.min(1,(dna.age-18)/20);
        const beardWeights:Record<Exclude<BeardStyle,'none'>,number>={stubble:1.3-maturity,short:.8,medium:.3+maturity,long:.12+maturity*(.6+p*.3),'split-braid':.12+maturity*.4,braid:.12+maturity*.5};
        const w=availableBeardStyles.map(style=>beardWeights[style as Exclude<BeardStyle,'none'>]);
        const length=weightedChoice(w.map(v=>v/w.reduce((x,y)=>x+y,0)),identitySample(dna.seed,'appearance.beard-style'));
        beardStyle=beardStyles[length+1];
    }
    return {hairStyle,beardStyle,color:generatePhenotype(dna).hairColor,greyAmount:Math.max(0,Math.min(1,(dna.age-45)/40))};
}
