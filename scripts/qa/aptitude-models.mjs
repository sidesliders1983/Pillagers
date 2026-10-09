import { loadTypeScript } from '../load-typescript.mjs';
const { traitKeys } = loadTypeScript(new URL('../../src/characters/CharacterDNA.ts', import.meta.url));
const clamp = value => Math.max(1500, Math.min(12500, Math.round(value)));

export const modelDefinitions = {
    control: { description: 'Canonical 15% floor + 85% weighted closeness', maximumBps: 10000 },
    expanded: { description: 'Common 2.5x expansion around 75%, bounded to 15–125%',
        centerBps: 7500, gain: 2.5, minimumBps: 1500, maximumBps: 12500 },
    quadratic: { description: 'Squared per-trait closeness, gain 1.7; centered at canonical expected role mean',
        gain: 1.7, minimumBps: 1500, maximumBps: 12500 },
    contrast: { description: 'Squared normalized weights; preferences stretched 2x around 0.5; centered at canonical expected role mean',
        preferenceGain: 2, minimumBps: 1500, maximumBps: 12500 },
};
const moments = new WeakMap();
function parameters(job) {
    if (moments.has(job)) return moments.get(job);
    const weightTotal = job.weights.reduce((sum, weight) => sum + weight ** 2, 0);
    const contrasted = { weights: job.weights.map(weight => weight ** 2 / weightTotal),
        preferences: job.preferences.map(value => Math.max(0, Math.min(1, .5 + 2 * (value - .5)))) };
    // Exact expectation of the real rounded-uniform generator, before final score rounding/clamps.
    const expected = (profile, power = 1) => profile.weights.reduce((sum, weight, index) => {
        let mean = 0;
        for (let hundredth = 0; hundredth <= 100; hundredth++) {
            const probability = hundredth === 0 || hundredth === 100 ? .005 : .01;
            mean += probability * (1 - Math.abs(hundredth / 100 - profile.preferences[index])) ** power;
        }
        return sum + weight * mean;
    }, 0);
    const result = { contrasted, linear: expected(job), quadratic: expected(job, 2),
        contrast: expected(contrasted) };
    moments.set(job, result);
    return result;
}
export function scoreAptitude(traits, job, model) {
    if (!Object.hasOwn(modelDefinitions, model)) throw new Error('Unknown aptitude model');
    const closeness = (profile, power = 1) => traitKeys.reduce((sum, key, index) =>
        sum + profile.weights[index] * (1 - Math.abs(traits[key] - profile.preferences[index])) ** power, 0);
    const linear = Math.round((.15 + .85 * closeness(job)) * 10000);
    if (model === 'control') return linear;
    if (model === 'expanded') return clamp(7500 + 2.5 * (linear - 7500));
    const means = parameters(job);
    const canonicalMean = .15 + .85 * means.linear;
    const candidate = model === 'quadratic'
        ? canonicalMean + 1.7 * (closeness(job, 2) - means.quadratic)
        : canonicalMean + .85 * (closeness(means.contrasted) - means.contrast);
    return clamp(candidate * 10000);
}
