import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import ts from 'typescript';
import { modelDefinitions, scoreAptitude } from './aptitude-models.mjs';
import { loadTypeScript } from '../load-typescript.mjs';
const nativeRequire = createRequire(import.meta.url);
const engines = new Map();
const digest = text => createHash('sha256').update(text).digest('hex');
const sourceText = url => readFileSync(url, 'utf8').replace(/\r\n/g, '\n');
const originalAptitude = `function aptitude(traits:CoreTraits, job:JobPrototype):number {
    const fit = traitKeys.reduce((sum,key,index)=>sum+job.weights[index]*(1-Math.abs(traits[key]-job.preferences[index])),0);
    return Math.round((.15+.85*fit)*10000);
}`;

/** Compile the real engine in a separate QA compartment; replace only its scoring body.
 * No production source, defaults, clocks, RNG, work arithmetic or validators are changed.
 * Fail closed if the reviewed scoring body changes. Candidate saves need this sidecar.
 */
export function studyEngine(model = 'control') {
    if (!Object.hasOwn(modelDefinitions, model)) throw new Error('Unknown aptitude model');
    if (engines.has(model)) return engines.get(model);
    const root = new URL('../../src/simulation/', import.meta.url);
    const cache = new Map();
    const sources = new Map();
    function load(url) {
        const key = url.href;
        if (cache.has(key)) return cache.get(key).exports;
        const module = { exports: {} };
        cache.set(key, module);
        let text = sourceText(url);
        sources.set(url.pathname.split('/src/').at(-1), digest(text));
        if (url.pathname.endsWith('/simulation/Mechanics.ts') && model !== 'control') {
            if (text.split(originalAptitude).length !== 2) throw new Error('Canonical aptitude changed; review the QA adapter');
            text = text.replace(originalAptitude, `function aptitude(traits:CoreTraits, job:JobPrototype):number {
    return studyScore(traits, job);
}`);
        }
        const compiled = ts.transpileModule(text, { compilerOptions: {
            module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
        } }).outputText;
        new Function('require', 'module', 'exports', 'studyScore', compiled)(
            name => name.startsWith('.') ? load(new URL(name + '.ts', url)) : nativeRequire(name),
            module, module.exports, (traits, job) => scoreAptitude(traits, job, model));
        return module.exports;
    }
    // Control uses the existing unchanged loader, and the isolated compiler supplies audit fingerprints.
    const compiledCore = load(new URL('SimulationCore.ts', root));
    const engine = {
        core: model === 'control' ? loadTypeScript(new URL('SimulationCore.ts', root)) : compiledCore,
        landing: model === 'control' ? loadTypeScript(new URL('Landing.ts', root)) : load(new URL('Landing.ts', root)),
        weather: model === 'control' ? loadTypeScript(new URL('Weather.ts', root)) : load(new URL('Weather.ts', root)),
        identity: { kind: 'aptitude-experiment', version: 1, model,
            sourceHash: digest(JSON.stringify([...sources].sort(([a], [b]) => a.localeCompare(b, 'en')))),
            mappingHash: digest(sourceText(new URL('./aptitude-models.mjs', import.meta.url))) },
        serialize(state) {
            return JSON.stringify({ ...this.identity, canonicalState: this.core.serializeState(state) });
        },
        reconstruct(serialized) {
            const saved = JSON.parse(serialized);
            for (const [key, value] of Object.entries(this.identity)) {
                if (saved[key] !== value) throw new Error('Aptitude experiment identity mismatch');
            }
            return this.core.reconstructState(saved.canonicalState);
        },
    };
    engines.set(model, engine);
    return engine;
}
