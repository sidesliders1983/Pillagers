import { characterAppearance, CharacterAppearance } from './CharacterAppearance';
import { AppearanceFit, CharacterDNA, parseCharacterDNA } from './CharacterDNA';
import { identitySample } from './seededRandom';

export const humanMorphNames = ['Masculine','Feminine','Breasts','Powerful','Slight','Agile','Grounded','Tall','Short','Overweight','Underweight','Age','HeadWidth','HeadLength','Jaw','Nose','LegRatio','ShoulderSlope','Asymmetry','BellyJiggle','BreastJiggle','Child','ChildPower','ChildAgility','FemininePower','MasculineAgility','TallSlight','ElderHeavy'] as const;
export type HumanMorph = typeof humanMorphNames[number];
export type HumanProfile = { seed:number; height:number; adultAge:number; masculinity:number; weightDeviation:number; age:number; stage:string; appearance:CharacterAppearance; appearanceFit:AppearanceFit; motion:{cadence:number;stride:number;footfall:number}; weights:Record<HumanMorph,number> };

/** Anatomy depends only on physical axes and named seed samples. Masculinity determines sex and body shape on the shared mesh. */
export function universalHumanProfile(input:CharacterDNA):HumanProfile {
    const dna=parseCharacterDNA(input), sample=(name:string)=>identitySample(dna.seed,`human.${name}`);
    const masculinity=dna.morphology?.masculinity??(dna.sex==='male'?.51:.49);
    const height=dna.morphology?.height??((1.65+sample('height')*.25)*.8);
    const adultAge=Math.max(18,dna.age);
    const Child=Math.max(0,Math.min(1,(18-dna.age)/12)),maturity=1-Child*.85;
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
    return {seed:dna.seed,height,adultAge,masculinity,weightDeviation,age:dna.age,stage:dna.age<13?"child":dna.age<18?"teen":dna.age>50?"elder":"adult",appearance:characterAppearance(dna),appearanceFit:dna.appearanceFit??{hair:1,beard:1,clothing:1},motion:{cadence:(1+Child*.2-Math.max(0,dna.age-50)/50*.25)*(1+(dna.traits.agility-.5)*.12),stride:1-Child*.55-Math.max(0,dna.age-50)/50*.3,footfall:(.7+dna.traits.physicality*.6)*(1-Child*.45)},weights:{Masculine:Masculine*maturity,Feminine:Feminine*maturity,Breasts:Feminine*(1-Child)**2,Powerful:Powerful*maturity,Slight:Slight*maturity,Agile:Agile*maturity,Grounded:Grounded*maturity,Tall,Short,Overweight:Overweight*(1-Child*.5),Underweight:Underweight*(1-Child*.5),Age:Math.max(0,(adultAge-50)/50),
        HeadWidth:(sample('headWidth')-.5)*.6,HeadLength:(sample('headLength')-.5)*.6,Jaw:(sample('jaw')-.5)*.6,Nose:(sample('nose')-.5)*.6,
        LegRatio:(sample('legRatio')-.5)*.5,ShoulderSlope:(sample('shoulderSlope')-.5)*.4,Asymmetry:(sample('asymmetry')-.5)*.35,BellyJiggle:0,BreastJiggle:0,Child,ChildPower:Child*Powerful,ChildAgility:Child*Agile,FemininePower:Feminine*Powerful*maturity,MasculineAgility:Masculine*Agile*maturity,TallSlight:Tall*Slight,ElderHeavy:Math.max(0,(adultAge-50)/50)*Overweight}};
}



