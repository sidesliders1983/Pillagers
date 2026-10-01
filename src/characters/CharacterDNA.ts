export const traitKeys = ['physicality', 'agility', 'intelligence', 'cunning', 'temperament'] as const;
export type TraitKey = typeof traitKeys[number];
export type CoreTraits = Record<TraitKey, number>;
export const heritageKeys = ['scandinavian', 'angloSaxon', 'gaelic', 'finnic', 'sami', 'baltic'] as const;
export type HeritageKey = typeof heritageKeys[number];
export type HeritageMix = Record<HeritageKey, number>;
export const appearanceFitLimits = {hair:[1,1.3],beard:[.75,1.5],clothing:[1,1.3]} as const;
export type AppearanceFit = Record<keyof typeof appearanceFitLimits,number>;
export type CharacterDNA = {
    seed: number;
    sex: 'male' | 'female';
    age: number;
    traits: CoreTraits;
    heritage: HeritageMix;
    naming?: { culture: HeritageKey; seed: number };
    morphology?: { masculinity: number; height: number };
    appearanceFit?: AppearanceFit;
};
export function sexFromMasculinity(masculinity:number):CharacterDNA['sex'] {
    if (!Number.isFinite(masculinity)||masculinity<0||masculinity>1||masculinity===.5) throw new Error('Masculinity must be 0–49% or 51–100%; exactly 50% is not allowed.');
    return masculinity<.5?'female':'male';
}
export function nextMasculinity(percent:number,previous:number):number {
    const value=Math.max(0,Math.min(100,Math.round(percent)));
    return (value===50?(previous<.5?51:49):value)/100;
}
export function normalizeHeritage(input: Partial<HeritageMix>): HeritageMix {
    const values = heritageKeys.map(key => typeof input[key] === 'number' && Number.isFinite(input[key]) ? Math.max(0, input[key]!) : 0);
    const total = values.reduce((sum, value) => sum + value, 0);
    if (!Number.isFinite(total)) {
        const maximum = Math.max(...values), scaled = values.map(value => value / maximum);
        const scaledTotal = scaled.reduce((sum, value) => sum + value, 0);
        return Object.fromEntries(heritageKeys.map((key, i) => [key, scaled[i] / scaledTotal])) as HeritageMix;
    }
    return Object.fromEntries(heritageKeys.map((key, i) => [key, total > 0 ? values[i] / total : 1 / heritageKeys.length])) as HeritageMix;
}
export function dominantHeritage(input: Partial<HeritageMix>): HeritageKey {
    const mix=normalizeHeritage(input);
    return heritageKeys.reduce((a,b)=>mix[a]>=mix[b]?a:b);
}
// Keep the edited percentage exact, rescaling the other five proportionally.
export function editHeritage(mix: HeritageMix, key: HeritageKey, value: number): HeritageMix {
    const current = normalizeHeritage(mix), selected = Math.max(0, Math.min(1, value));
    const others = 1 - current[key];
    return Object.fromEntries(heritageKeys.map(k => [k, k === key ? selected : others > 1e-9 ? current[k] / others * (1-selected) : (1-selected) / 5])) as HeritageMix;
}
export function defaultDNA(): CharacterDNA {
    return {seed: 1983, sex: 'male', age: 32,
        traits: {physicality: .55, agility: .55, intelligence: .55, cunning: .4, temperament: .4},
        heritage: {scandinavian: .5, angloSaxon: .2, gaelic: .15, finnic: .05, sami: .05, baltic: .05}};
}
export function cloneDNA(dna: CharacterDNA): CharacterDNA { return {...dna, traits: {...dna.traits}, heritage: {...dna.heritage}, ...(dna.naming ? {naming:{...dna.naming}} : {}), ...(dna.morphology ? {morphology:{...dna.morphology}} : {}), ...(dna.appearanceFit ? {appearanceFit:{...dna.appearanceFit}} : {})}; }
export function parseCharacterDNA(value: unknown): CharacterDNA {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('DNA must be a JSON object.');
    const data = value as Record<string, unknown>;
    if (data.morphology===undefined&&data.sex !== 'male' && data.sex !== 'female') throw new Error('Sex must be male or female for legacy DNA without morphology.');
    if (!Number.isInteger(data.seed) || Number(data.seed) < 0 || Number(data.seed) > 4294967295) throw new Error('Seed must be an unsigned 32-bit integer.');
    if (typeof data.age !== 'number' || !Number.isFinite(data.age) || data.age < 0 || data.age > 100) throw new Error('Age must be between 0 and 100.');
    if (!data.traits || typeof data.traits !== 'object') throw new Error('All five traits are required.');
    const traits = data.traits as Record<string, unknown>;
    for (const key of traitKeys) if (typeof traits[key] !== 'number' || !Number.isFinite(traits[key]) || Number(traits[key]) < 0 || Number(traits[key]) > 1) throw new Error(`${key} must be between 0 and 1.`);
    if (!data.heritage || typeof data.heritage !== 'object' || Array.isArray(data.heritage)) throw new Error('Heritage must be a mixed profile object.');
    const heritage = data.heritage as Record<string, unknown>;
    for (const key of Object.keys(heritage)) {
        if (!heritageKeys.includes(key as HeritageKey)) throw new Error(`Unknown heritage: ${key}.`);
        if (typeof heritage[key] !== 'number' || !Number.isFinite(heritage[key]) || Number(heritage[key]) < 0) throw new Error(`${key} heritage must be a non-negative number.`);
    }
    let appearanceFit: AppearanceFit|undefined;
    if(data.appearanceFit!==undefined){
        if(!data.appearanceFit||typeof data.appearanceFit!=='object'||Array.isArray(data.appearanceFit))throw new Error('Appearance fit must contain hair, beard and clothing ratios.');
        const fit=data.appearanceFit as Record<string,unknown>;
        for(const [key,[min,max]] of Object.entries(appearanceFitLimits)){
            if(typeof fit[key]!=='number'||!Number.isFinite(fit[key])||Number(fit[key])<min||Number(fit[key])>max)throw new Error(`${key} ratio must be between ${min} and ${max}.`);
        }
        appearanceFit={hair:Number(fit.hair),beard:Number(fit.beard),clothing:Number(fit.clothing)};
    }
    let naming: CharacterDNA['naming'];
    if(data.naming!==undefined){
        if(!data.naming||typeof data.naming!=='object'||Array.isArray(data.naming))throw new Error('Naming must contain a culture and seed.');
        const config=data.naming as Record<string,unknown>;
        if(!heritageKeys.includes(config.culture as HeritageKey))throw new Error('Unknown naming culture.');
        if(!Number.isInteger(config.seed)||Number(config.seed)<0||Number(config.seed)>4294967295)throw new Error('Name seed must be an unsigned 32-bit integer.');
        naming={culture:dominantHeritage(heritage as Partial<HeritageMix>),seed:Number(config.seed)};
    }
    let morphology: CharacterDNA['morphology'];
    if (data.morphology !== undefined) {
        if (!data.morphology || typeof data.morphology !== 'object' || Array.isArray(data.morphology)) throw new Error('Morphology must contain masculinity and height.');
        const m = data.morphology as Record<string, unknown>;
        if (typeof m.masculinity !== 'number' || !Number.isFinite(m.masculinity) || m.masculinity < 0 || m.masculinity > 1) throw new Error('Masculinity must be between 0 and 1.');
        sexFromMasculinity(m.masculinity);
        if (typeof m.height !== 'number' || !Number.isFinite(m.height) || m.height < 1.16 || m.height > 1.6) throw new Error('Adult height must be between 1.16 and 1.60 metres.');
        morphology = {masculinity:m.masculinity,height:m.height};
    }
    return {seed: Number(data.seed), sex: morphology?sexFromMasculinity(morphology.masculinity):data.sex as CharacterDNA['sex'], age: data.age, traits: Object.fromEntries(traitKeys.map(key => [key, traits[key]])) as CoreTraits, heritage: normalizeHeritage(heritage as Partial<HeritageMix>), ...(naming?{naming}:{}), ...(morphology?{morphology}:{}), ...(appearanceFit?{appearanceFit}:{})};
}

