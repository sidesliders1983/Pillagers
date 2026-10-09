import { readFileSync } from 'node:fs';
import { foodEngine } from './food-engine.mjs';
import { hash } from './aptitude-economy.mjs';
import { scoreAptitude } from './aptitude-models.mjs';
import { profilesFor, scoreProfile } from './profile-models.mjs';
const cache = new Map();
const modelHash = hash(readFileSync(new URL('./profile-models.mjs', import.meta.url), 'utf8').replace(/\r\n/g, '\n'));
const vectorKey = job => JSON.stringify([job.weights, job.preferences]);

/** Compose the existing Food experiment and real Simulation Core; no alternate simulation. */
export function profileEngine({ model = 'A', policy = 'default', economy = 'base' } = {}) {
    if (!['default', 'random', 'aware'].includes(policy) || !['base', 'protected'].includes(economy)) {
        throw new Error('Unknown profile policy/economy');
    }
    const profiles = profilesFor(model);
    const key = [model, policy, economy].join('/');
    if (cache.has(key)) return cache.get(key);
    const roles = new Map(Object.entries(profiles).map(([role, job]) => [vectorKey(job), role]));
    const scoring = model === 'C' ? {
        id: 'profile-C-v1', hash: modelHash,
        score(traits, job) {
            const role = roles.get(vectorKey(job));
            // CPU regions retain their original vectors and scoring in full-world probes.
            return role ? scoreProfile(traits, role, model) : scoreAptitude(traits, job, 'control');
        },
    } : null;
    const base = foodEngine(economy === 'base' ? 'B' : 'C10-safe', scoring);
    const identity = { kind: 'occupation-profiles', version: 1, model, policy, economy,
        modelHash, profileHash: hash(profiles), engine: base.identity,
        adapterHash: hash(readFileSync(new URL('./profile-engine.mjs', import.meta.url), 'utf8').replace(/\r\n/g, '\n')) };
    const engine = {
        ...base, identity, recipe: { ...base.recipe, policy },
        create(seed, fullWorld = false) {
            const state = base.create(seed, fullWorld);
            state.mechanics.config.occupations = structuredClone(profiles);
            return state;
        },
        serialize(state) {
            return JSON.stringify({ identity, state: base.serialize(state) });
        },
        reconstruct(serialized) {
            const saved = JSON.parse(serialized);
            if (hash(saved.identity) !== hash(identity)) throw new Error('Profile experiment identity mismatch');
            const state = base.reconstruct(saved.state);
            if (hash(state.mechanics.config.occupations) !== identity.profileHash) {
                throw new Error('Profile experiment vectors mismatch');
            }
            return state;
        },
    };
    cache.set(key, engine);
    return engine;
}
