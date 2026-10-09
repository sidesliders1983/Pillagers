import { modelDefinitions, scoreAptitude } from './aptitude-models.mjs';
import { loadTypeScript } from '../load-typescript.mjs';
const core = loadTypeScript(new URL('../../src/simulation/SimulationCore.ts', import.meta.url));

export function sampleAptitudes({ seedStart = 0, seedCount = 100, models = ['control'] } = {}) {
    if (!Number.isSafeInteger(seedStart) || seedStart < 0 ||
        !Number.isSafeInteger(seedCount) || seedCount < 1 || seedStart + seedCount > 4294967296) {
        throw new Error('Invalid founder seed range');
    }
    if (!models.length || new Set(models).size !== models.length || models.some(model =>
        !Object.hasOwn(modelDefinitions, model))) throw new Error('Unknown aptitude model');
    const rows = [];
    for (let seed = seedStart; seed < seedStart + seedCount; seed++) {
        const state = core.createCampaign(seed);
        for (const id of state.landing.founderIds) {
            const person = state.personas[id];
            for (const model of models) rows.push({
                campaignSeed: seed, personaId: id, name: person.name, dnaSeed: person.dna.seed,
                sex: person.dna.sex, age: core.personaAge(state, id), traits: { ...person.dna.traits },
                assignedOccupation: person.occupation, parentIds: [...person.parentIds], model,
                aptitudes: Object.fromEntries(core.occupationIds.map(role =>
                    [role, model === 'control' ? core.occupationAptitude(state, id, role)
                        : scoreAptitude(person.dna.traits, state.mechanics.config.occupations[role], model)])),
            });
        }
    }
    return rows;
}
