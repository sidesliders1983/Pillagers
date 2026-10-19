import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import ts from 'typescript';

const nativeRequire = createRequire(import.meta.url);
export const studyHash = value => createHash('sha256').update(
    typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value),
).digest('hex');

/** QA-only species contrast, before the real founding factory records any animals.
 * Only the player seed is overridden. CPU selection, exclusions and every economic
 * operation use unchanged Core. This adapter is never imported by the game.
 */
let shared;
export function livestockStudyCore(seed, species) {
    if (shared) {
        shared.trial.seed = seed;
        shared.trial.species = species;
        return { core: shared.core, identity: { ...shared.identity,
            forcedPlayerSpecies: species, forcedPlayerSeed: seed } };
    }
    const trial = { seed, species };
    const cache = new Map(), sources = new Map();
    function load(url) {
        if (cache.has(url.href)) return cache.get(url.href);
        const module = { exports: {} };
        cache.set(url.href, module.exports);
        let source = readFileSync(url, 'utf8').replace(/\r\n/g, '\n');
        sources.set(url.pathname.split('/src/').at(-1), studyHash(source));
        if (url.pathname.endsWith('/simulation/FoundingLivestock.ts')) {
            const original = "const species = founding.version === 2 ? candidates[Math.floor(random() * candidates.length)] : 'cattle';";
            if (source.split(original).length !== 2) throw new Error('Founding study seam changed');
            source = source.replace(original, original.replace('const species', 'let species') +
                '\nif (founding.version === 2 && state.seed === trial.seed && trial.species !== "control" &&' +
                ' !founding.founding.excludedSpecies) species = trial.species;');
        }
        const compiled = ts.transpileModule(source, { compilerOptions: {
            module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
        } }).outputText;
        new Function('require', 'module', 'exports', 'trial', compiled)(
            name => name.startsWith('.') ? load(new URL(name + '.ts', url)) : nativeRequire(name),
            module, module.exports, trial,
        );
        return module.exports;
    }
    const core = load(new URL('../../src/simulation/SimulationCore.ts', import.meta.url));
    const identity = {
        sourceHash: studyHash([...sources].sort(([a], [b]) => a.localeCompare(b, 'en'))),
        adapterHash: studyHash(readFileSync(new URL(import.meta.url), 'utf8').replace(/\r\n/g, '\n')),
    };
    shared = { core, identity, trial };
    return { core, identity: { ...identity, forcedPlayerSpecies: species, forcedPlayerSeed: seed } };
}
