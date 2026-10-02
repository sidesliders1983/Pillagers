import { CharacterDNA, cloneDNA, parseCharacterDNA } from './CharacterDNA';

export interface GoldenCharacter {readonly id:string;readonly label:string;readonly dna:CharacterDNA;}
function freeze<T>(value:T):T {if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}
// Do not derive fixtures from mutable defaults or interactive presets.
const base:CharacterDNA={schemaVersion:1,seed:1983,sex:'male',age:32,
    traits:{physicality:.55,agility:.55,intelligence:.55,cunning:.4,temperament:.4},
    heritage:{scandinavian:.5,angloSaxon:.2,gaelic:.15,finnic:.05,sami:.05,baltic:.05}};
const adult={...base,morphology:{masculinity:.77,height:1.5},appearanceFit:{hair:1,beard:1,clothing:1}};
function fixture(id:string,label:string,dna:CharacterDNA):GoldenCharacter {return {id:`golden_${id}_01`,label,dna:parseCharacterDNA(dna)};}
/** Permanent identities; selecting one never inherits the currently edited Lab DNA. */
export const goldenCharacters:readonly GoldenCharacter[]=freeze([
    fixture('neutral','Neutral adult',base),
    fixture('feminine','Very feminine adult',{...adult,morphology:{masculinity:.01,height:1.5}}),
    fixture('masculine','Very masculine adult',{...adult,morphology:{masculinity:1,height:1.5}}),
    fixture('agile','High Agility',{...adult,traits:{...base.traits,agility:1}}),
    fixture('short','Short adult',{...adult,morphology:{masculinity:.77,height:1.16}}),
    fixture('tall','Tall adult',{...adult,morphology:{masculinity:.77,height:1.6}}),
    fixture('older','Older adult',{...adult,age:90}),
    fixture('child','Child',{...adult,age:6}),
    fixture('overweight','Large belly',{...adult,traits:{...base.traits,intelligence:0}}),
    fixture('underweight','Underweight',{...adult,seed:1731203494,traits:{...base.traits,intelligence:0,agility:1}}),
    fixture('legacy','Legacy high Physicality (ignored)',{...adult,traits:{...base.traits,physicality:1}}),
    {id:'golden_mixed_01',label:'Extreme mixed female (reported seed)',dna:parseCharacterDNA({
        ...base,seed:1731203494,sex:'female',age:37,traits:{physicality:.42,agility:1,intelligence:.01,cunning:.85,temperament:.91},
        heritage:{scandinavian:.08662437355074398,angloSaxon:.18462755635531963,gaelic:.2341570529372296,finnic:.11036877115601645,sami:.21732351112642678,baltic:.16689873487426365},
        morphology:{masculinity:.19,height:1.3315829434245825}})},
]);
export function goldenCharacterDNA(id:string):CharacterDNA {const fixture=goldenCharacters.find(item=>item.id===id);if(!fixture)throw new Error(`Unknown Golden Character: ${id}`);return cloneDNA(fixture.dna);}
