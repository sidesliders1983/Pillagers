import { CharacterDNA, parseCharacterDNA } from './CharacterDNA';
import { identitySample } from './seededRandom';

export const humanMorphNames = ['Masculine','Feminine','Powerful','Slight','Agile','Grounded','Tall','Short','Overweight','Underweight','Age','HeadWidth','HeadLength','Jaw','Nose','LegRatio','ShoulderSlope','Asymmetry'] as const;
export type HumanMorph = typeof humanMorphNames[number];
export type HumanProfile = { height:number; adultAge:number; masculinity:number; weightDeviation:number; weights:Record<HumanMorph,number> };

/** Anatomy depends only on physical axes and named seed samples. Masculinity determines sex and body shape on the shared mesh. */
export function universalHumanProfile(input:CharacterDNA):HumanProfile {
    const dna=parseCharacterDNA(input), sample=(name:string)=>identitySample(dna.seed,`human.${name}`);
    const masculinity=dna.morphology?.masculinity??(dna.sex==='male'?.51:.49);
    const height=dna.morphology?.height??((1.65+sample('height')*.25)*.8);
    const adultAge=Math.max(18,dna.age);
    // Fictional caricature rule: intelligence reduces susceptibility; a stable
    // seed sample chooses the direction, biased toward a large belly.
    const tendency=sample('weightTendency');
    const susceptibility=(1-dna.traits.intelligence)**1.35;
    const weightDeviation=susceptibility*(tendency<.2?-(.65+.35*tendency/.2):.65+.35*(tendency-.2)/.8);
    const Overweight=Math.max(0,weightDeviation),Underweight=Math.max(0,-weightDeviation);
    const signed=(v:number)=>[Math.min(1,Math.max(0,v)),Math.min(1,Math.max(0,-v))];
    const [Masculine,Feminine]=signed((masculinity-.5)*2);
    const [Powerful,Slight]=signed((dna.traits.physicality-.5)*2);
    const [Agile,Grounded]=signed((dna.traits.agility-.5)*2);
    const [Tall,Short]=signed((height-1.44)/(height>=1.44?.24:.28));
    return {height,adultAge,masculinity,weightDeviation,weights:{Masculine,Feminine,Powerful,Slight,Agile,Grounded,Tall,Short,Overweight,Underweight,Age:Math.max(0,(adultAge-50)/50),
        HeadWidth:(sample('headWidth')-.5)*.6,HeadLength:(sample('headLength')-.5)*.6,Jaw:(sample('jaw')-.5)*.6,Nose:(sample('nose')-.5)*.6,
        LegRatio:(sample('legRatio')-.5)*.5,ShoulderSlope:(sample('shoulderSlope')-.5)*.4,Asymmetry:(sample('asymmetry')-.5)*.35}};
}

