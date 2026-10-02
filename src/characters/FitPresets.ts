import { CharacterDNA, cloneDNA, defaultDNA } from './CharacterDNA';

export const fitPresetLabels={feminine:'Very feminine adult',masculine:'Very masculine adult',agile:'High Agility',short:'Short adult',tall:'Tall adult',older:'Older adult',child:'Child',overweight:'Large belly',underweight:'Underweight',legacy:'Legacy high Physicality (ignored)'} as const;
export type FitPreset=keyof typeof fitPresetLabels;
/** Same seed and heritage keep preset comparisons reproducible. */
export function fitPreset(key:FitPreset,input:CharacterDNA=defaultDNA()):CharacterDNA {
    const dna=cloneDNA(input);dna.age=32;dna.morphology={masculinity:.77,height:1.5};dna.sex='male';dna.appearanceFit={hair:1,beard:1,clothing:1};
    if(key==='feminine'){dna.morphology.masculinity=.01;dna.sex='female';}
    if(key==='masculine')dna.morphology.masculinity=1;
    if(key==='agile')dna.traits.agility=1;
    if(key==='short')dna.morphology.height=1.16;
    if(key==='tall')dna.morphology.height=1.6;
    if(key==='older')dna.age=90;
    if(key==='child')dna.age=6;
    if(key==='legacy')dna.traits.physicality=1;
    if(key==='overweight'){dna.seed=1983;dna.traits.intelligence=0;}
    if(key==='underweight'){dna.seed=1731203494;dna.traits.intelligence=0;dna.traits.agility=1;}
    return dna;
}
