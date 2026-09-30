export const traitKeys = ['physicality', 'agility', 'intelligence', 'cunning', 'temperament'] as const;
export type TraitKey = typeof traitKeys[number];
export type CoreTraits = Record<TraitKey, number>;
export const heritageKeys = ['scandinavian', 'angloSaxon', 'gaelic', 'finnic', 'sami', 'baltic'] as const;
export type HeritageKey = typeof heritageKeys[number];
export type HeritageMix = Record<HeritageKey, number>;
export type CharacterDNA = {
    seed: number;
    sex: 'male' | 'female';
    age: number;
    traits: CoreTraits;
    heritage: HeritageMix;
    naming?: { culture: HeritageKey; seed: number };
};
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
export function cloneDNA(dna: CharacterDNA): CharacterDNA { return {...dna, traits: {...dna.traits}, heritage: {...dna.heritage}, ...(dna.naming ? {naming:{...dna.naming}} : {})}; }
export function parseCharacterDNA(value: unknown): CharacterDNA {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('DNA must be a JSON object.');
    const data = value as Record<string, unknown>;
    if (data.sex !== 'male' && data.sex !== 'female') throw new Error('Sex must be male or female.');
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
    let naming: CharacterDNA['naming'];
    if(data.naming!==undefined){
        if(!data.naming||typeof data.naming!=='object'||Array.isArray(data.naming))throw new Error('Naming must contain a culture and seed.');
        const config=data.naming as Record<string,unknown>;
        if(!heritageKeys.includes(config.culture as HeritageKey))throw new Error('Unknown naming culture.');
        if(!Number.isInteger(config.seed)||Number(config.seed)<0||Number(config.seed)>4294967295)throw new Error('Name seed must be an unsigned 32-bit integer.');
        naming={culture:dominantHeritage(heritage as Partial<HeritageMix>),seed:Number(config.seed)};
    }
    return {seed: Number(data.seed), sex: data.sex, age: data.age, traits: Object.fromEntries(traitKeys.map(key => [key, traits[key]])) as CoreTraits, heritage: normalizeHeritage(heritage as Partial<HeritageMix>), ...(naming?{naming}:{})};
}
