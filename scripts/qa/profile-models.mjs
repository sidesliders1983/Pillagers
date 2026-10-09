import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { loadTypeScript } from '../load-typescript.mjs';
import { scoreAptitude } from './aptitude-models.mjs';
const { defaultPrototypeConfig, occupationIds } = loadTypeScript(
    new URL('../../src/simulation/Mechanics.ts', import.meta.url));
const { traitKeys } = loadTypeScript(new URL('../../src/characters/CharacterDNA.ts', import.meta.url));

export const candidateProfiles = {
    farmer: { weights: [.30, .10, .15, .05, .40], preferences: [.75, .35, .45, .20, .10] },
    herder: { weights: [.10, .10, .15, .15, .50], preferences: [.35, .55, .40, .70, .05] },
    fisher: { weights: [.15, .40, .10, .25, .10], preferences: [.50, .90, .35, .80, .35] },
    hunter: { weights: [.25, .35, .05, .30, .05], preferences: [.85, .80, .30, .90, .60] },
    textileWorker: { weights: [.05, .45, .20, .05, .25], preferences: [.20, .90, .55, .15, .15] },
    smith: { weights: [.40, .10, .35, .05, .10], preferences: [.95, .35, .90, .15, .45] },
    woodworker: { weights: [.30, .20, .35, .05, .10], preferences: [.80, .65, .65, .20, .20] },
    boatbuilder: { weights: [.15, .15, .50, .10, .10], preferences: [.45, .55, .95, .65, .35] },
    trader: { weights: [.05, .10, .25, .45, .15], preferences: [.20, .40, .75, .95, .30] },
    leatherAndJewelleryMaker: {
        weights: [.05, .35, .35, .15, .10], preferences: [.25, .60, .90, .70, .50],
    },
};
export const profileModels = {
    A: { description: 'Current profiles and canonical linear scoring' },
    B: { description: 'Differentiated profiles and canonical linear scoring' },
    C: { description: 'Differentiated profiles; 1.5x deviations from candidate expected role mean, centered at legacy expected role mean',
        gain: 1.5, minimumBps: 1500, maximumBps: 10000 },
};

/** Exact rounded-uniform founder marginal expectation, before final score rounding. */
function expectedFit(job) {
    const closeness = preference => {
        let mean = 0;
        for (let hundredth = 0; hundredth <= 100; hundredth++) {
            const probability = hundredth === 0 || hundredth === 100 ? .005 : .01;
            mean += probability * (1 - Math.abs(hundredth / 100 - preference));
        }
        return mean;
    };
    return 1500 + 8500 * job.weights.reduce((sum, weight, index) =>
        sum + weight * closeness(job.preferences[index]), 0);
}
const means = Object.fromEntries(occupationIds.map(role => [role, {
    legacy: expectedFit(defaultPrototypeConfig.occupations[role]),
    candidate: expectedFit(candidateProfiles[role]),
}]));
export function profilesFor(model) {
    if (!Object.hasOwn(profileModels, model)) throw new Error('Unknown profile model');
    return Object.fromEntries(occupationIds.map(role => [role, {
        ...structuredClone(defaultPrototypeConfig.occupations[role]),
        ...(model === 'A' ? {} : structuredClone(candidateProfiles[role])),
    }]));
}
export function scoreProfile(traits, role, model) {
    const job = model === 'A' ? defaultPrototypeConfig.occupations[role] : candidateProfiles[role];
    if (!job || !Object.hasOwn(profileModels, model)) throw new Error('Unknown profile role/model');
    if (model !== 'C') return scoreAptitude(traits, job, 'control');
    const fit = traitKeys.reduce((sum, key, index) =>
        sum + job.weights[index] * (1 - Math.abs(traits[key] - job.preferences[index])), 0);
    const linear = 1500 + 8500 * fit;
    const score = means[role].legacy + profileModels.C.gain * (linear - means[role].candidate);
    return Math.max(1500, Math.min(10000, Math.round(score)));
}
export function archivedCohort(kind = 'founders') {
    if (!['founders', 'descendants'].includes(kind)) throw new Error('Unknown cohort');
    const path = new URL('../../docs/qa/occupation-aptitude-v03/' + kind + '.json.gz', import.meta.url);
    return JSON.parse(gunzipSync(readFileSync(path))).filter(row => row.model === 'control');
}
export function evaluateProfiles(cohort) {
    return cohort.flatMap(person => Object.keys(profileModels).map(model => ({
        ...person, model, aptitudes: Object.fromEntries(occupationIds.map(role =>
            [role, scoreProfile(person.traits, role, model)])),
    })));
}
export function sampleProfiles({ seedStart = 0, seedCount = 100, kind = 'founders' } = {}) {
    if (!Number.isSafeInteger(seedStart) || seedStart < 0 || !Number.isSafeInteger(seedCount) ||
        seedCount < 1 || seedStart + seedCount > 100) throw new Error('Archived seed range is 0–99');
    const cohort = archivedCohort(kind).filter(person =>
        person.campaignSeed >= seedStart && person.campaignSeed < seedStart + seedCount);
    return evaluateProfiles(cohort);
}
