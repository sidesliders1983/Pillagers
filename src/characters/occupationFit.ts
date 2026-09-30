import { CharacterDNA, CoreTraits, traitKeys } from './CharacterDNA';
export const occupations = {
    blacksmith: {label:'Blacksmith', weights:[.4,.1,.25,.05,.2], preferences:[.85,.5,.8,.3,.55]},
    warrior: {label:'Warrior', weights:[.35,.3,.1,.05,.2], preferences:[.9,.8,.55,.4,.75]},
    scout: {label:'Scout', weights:[.1,.4,.15,.3,.05], preferences:[.5,.95,.7,.8,.25]},
    trader: {label:'Trader', weights:[.05,.1,.3,.35,.2], preferences:[.4,.6,.8,.85,.25]},
    farmer: {label:'Farmer', weights:[.3,.2,.2,.05,.25], preferences:[.7,.6,.6,.35,.25]},
    healer: {label:'Healer / Seer', weights:[.05,.15,.45,.1,.25], preferences:[.4,.65,.95,.5,.1]},
} as const;
export type OccupationKey = keyof typeof occupations;
export function occupationFit(character: Pick<CharacterDNA,'traits'>, occupation: OccupationKey): number {
    const {weights,preferences} = occupations[occupation];
    const fit = traitKeys.reduce((sum,key,index) => sum + weights[index]*(1-Math.abs(Math.max(0,Math.min(1,character.traits[key]))-preferences[index])),0);
    // A floor encodes possibility; fit is a design tendency, never an assigned job.
    return Math.max(0,Math.min(1,.15+fit*.85));
}
export function occupationScores(traits: CoreTraits) {
    return (Object.keys(occupations) as OccupationKey[]).map(key => ({key,label:occupations[key].label,fit:occupationFit({traits},key)})).sort((a,b)=>b.fit-a.fit);
}
