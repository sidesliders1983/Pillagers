import { heritageKeys, normalizeHeritage, dominantHeritage, HeritageKey, CharacterDNA } from '../CharacterDNA';
import { seededRandom } from '../seededRandom';
import { GeneratedName, NamingContext } from './NameProfile';
import { nameProfiles, norseParents } from './nameProfiles';
const pick = <T>(values:T[], random:()=>number):T => values[Math.floor(random()*values.length)];
export function generateName(context:NamingContext):GeneratedName {
    if(!heritageKeys.includes(context.culture))throw new Error('Unknown naming culture.');
    if(context.sex!=='male'&&context.sex!=='female')throw new Error('Invalid naming sex.');
    if(!Number.isInteger(context.seed)||context.seed<0||context.seed>4294967295)throw new Error('Name seed must be an unsigned 32-bit integer.');
    const profile=nameProfiles[context.culture],mix=normalizeHeritage(context.heritage);
    const random=seededRandom(context.seed,'name-v0.2');
    const patterns=context.sex==='male'?profile.malePatterns:profile.femalePatterns;
    const weights=patterns.map(pattern=>.8/patterns.length+.2*(pattern.affinity??[]).reduce((sum,key)=>sum+mix[key],0));
    let draw=random()*weights.reduce((sum,value)=>sum+value,0),pattern=patterns[patterns.length-1];
    for(let i=0;i<patterns.length;i++){draw-=weights[i];if(draw<0){pattern=patterns[i];break;}}
    // Culture anchors 80% of draws. Heritage contributes only compatible loans;
    // unsupported combinations fall back to the local pool rather than random syllables.
    const sample=random();let cumulative=0,source:HeritageKey=context.culture;
    for(const key of heritageKeys){cumulative+=.2*mix[key]+(key===context.culture?.8:0);if(sample<cumulative){source=key;break;}}
    const loans=profile.loans[source];
    if(source!==context.culture&&(!loans?.length||!pattern.id.endsWith('compound')))source=context.culture;
    const start=pick(source===context.culture?pattern.starts:loans!,random),ending=pick(pattern.endings,random);
    const name:GeneratedName={givenName:start+ending,dominantCulture:context.culture,derivation:{version:'0.2',patternId:pattern.id,sourceProfiles:[source,context.culture],components:[start,ending],familyRule:profile.familyRule}};
    if(profile.familyRule==='norse-patronymic'){
        const supplied=context.family?.father;
        if(supplied&&(!/^[\p{L}]+$/u.test(supplied.givenName)||!/^[\p{L}]+$/u.test(supplied.genitive)))throw new Error('Parent name and genitive must contain letters only.');
        const parent=supplied??pick(norseParents,seededRandom(context.seed,'name-parent-v0.2'));
        name.patronymic=parent.genitive+(context.sex==='male'?'son':'dóttir');
        name.derivation.parentSource=supplied?'provided':'synthetic';
    }
    return name;
}
export function fullName(name:GeneratedName):string {
    return [name.givenName,name.patronymic,name.familyName,name.epithet?`“${name.epithet}”`:undefined].filter(Boolean).join(' ');
}
export function characterName(dna:CharacterDNA):GeneratedName {
    return generateName({heritage:dna.heritage,sex:dna.sex,culture:dominantHeritage(dna.heritage),seed:(dna.seed^(dna.naming?.seed??0))>>>0});
}
