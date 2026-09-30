import { HeritageKey, HeritageMix, heritageKeys, normalizeHeritage } from './CharacterDNA';
export const heritageLabels: Record<HeritageKey, string> = {
    scandinavian: 'Scandinavian', angloSaxon: 'Anglo-Saxon', gaelic: 'Gaelic / Celtic', finnic: 'Finnic', sami: 'Sámi', baltic: 'Baltic',
};
// Illustrative art priors, not empirical ethnicity/genetics claims. Every category
// remains possible in every profile; cognition and occupation never use heritage.
export const heritageProfiles: Record<HeritageKey, {hair: number[]; eyes: number[]; skin: number[]}> = {
    scandinavian: {hair: [.35,.34,.2,.11], eyes: [.42,.33,.25], skin: [.4,.35,.25]},
    angloSaxon: {hair: [.26,.39,.22,.13], eyes: [.34,.36,.3], skin: [.36,.37,.27]},
    gaelic: {hair: [.22,.35,.25,.18], eyes: [.32,.38,.3], skin: [.38,.34,.28]},
    finnic: {hair: [.32,.34,.25,.09], eyes: [.4,.3,.3], skin: [.37,.36,.27]},
    sami: {hair: [.24,.36,.31,.09], eyes: [.32,.32,.36], skin: [.33,.37,.3]},
    baltic: {hair: [.28,.36,.26,.1], eyes: [.36,.34,.3], skin: [.35,.36,.29]},
};
export const hairShades = ['#b8a079', '#786052', '#49443f', '#986e55'];
export const eyeShades = ['#7e969a', '#8b8971', '#6e6054'];
export const skinShades = ['#e3c4a6', '#d3ad8a', '#bd9574'];
export function mixedProbabilities(mix: HeritageMix, category: 'hair' | 'eyes' | 'skin') {
    const normalized = normalizeHeritage(mix);
    return heritageProfiles.scandinavian[category].map((_, index) => heritageKeys.reduce((sum, key) => sum + heritageProfiles[key][category][index] * normalized[key], 0));
}
export function weightedChoice(weights: number[], sample: number) {
    let accumulated = 0;
    for (let i=0;i<weights.length;i++) { accumulated += weights[i]; if (sample < accumulated) return i; }
    return weights.length - 1;
}
