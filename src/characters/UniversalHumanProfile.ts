import { CharacterDNA, parseCharacterDNA } from './CharacterDNA';
import { identitySample } from './seededRandom';

export const humanMorphNames = ['Masculine','Feminine','Powerful','Slight','Agile','Grounded','Tall','Short','Age','HeadWidth','HeadLength','Jaw','Nose','LegRatio','ShoulderSlope','Asymmetry'] as const;
export type HumanMorph = typeof humanMorphNames[number];
export type HumanProfile = { height:number; adultAge:number; masculinity:number; weights:Record<HumanMorph,number> };

/** Anatomy depends only on physical axes and named seed samples. Sex controls identity, not mesh selection. */
export function universalHumanProfile(input:CharacterDNA):HumanProfile {
    const dna=parseCharacterDNA(input), sample=(name:string)=>identitySample(dna.seed,`human.${name}`);
    const masculinity=dna.morphology?.masculinity??.5;
    const height=dna.morphology?.height??(1.65+sample('height')*.25);
    const adultAge=Math.max(18,dna.age);
    const signed=(v:number)=>[Math.min(1,Math.max(0,v)),Math.min(1,Math.max(0,-v))];
    const [Masculine,Feminine]=signed((masculinity-.5)*2);
    const [Powerful,Slight]=signed((dna.traits.physicality-.5)*2);
    const [Agile,Grounded]=signed((dna.traits.agility-.5)*2);
    const [Tall,Short]=signed((height-1.8)/(height>=1.8?.3:.35));
    return {height,adultAge,masculinity,weights:{Masculine,Feminine,Powerful,Slight,Agile,Grounded,Tall,Short,Age:Math.max(0,(adultAge-40)/60),
        HeadWidth:(sample('headWidth')-.5)*.6,HeadLength:(sample('headLength')-.5)*.6,Jaw:(sample('jaw')-.5)*.6,Nose:(sample('nose')-.5)*.6,
        LegRatio:(sample('legRatio')-.5)*.5,ShoulderSlope:(sample('shoulderSlope')-.5)*.4,Asymmetry:(sample('asymmetry')-.5)*.35}};
}

export const humanPresets={
    heavy:{physicality:.95,agility:.15,masculinity:.75},
    nimble:{physicality:.2,agility:.95,masculinity:.35},
    balanced:{physicality:.5,agility:.5,masculinity:.5},
} as const;
