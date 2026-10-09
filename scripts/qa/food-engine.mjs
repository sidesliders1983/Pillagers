import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { studyEngine } from './aptitude-engine.mjs';
import { hash } from './aptitude-economy.mjs';
import { foodScenarios } from './food-recipes.mjs';
const nativeRequire = createRequire(import.meta.url);
const engines = new Map();
const text = url => readFileSync(url, 'utf8').replace(/\r\n/g, '\n');

export function normalFoodNeed(state) {
    const config = state.mechanics.config;
    const residents = Object.values(state.personas).filter(person => person.deathWinter === null)
        .reduce((sum, person) => sum + (state.time.winter - person.birthWinter < config.foodAdultAge
            ? config.childFood : config.adultFood), 0);
    const cattle = Object.values(state.landing.cattle).filter(animal => animal.deathWinter === null)
        .reduce((sum, animal) => sum + (state.time.winter - animal.birthWinter < state.landing.config.cattleAdultAge
            ? state.landing.config.calfFood : state.landing.config.adultCattleFood), 0);
    return residents + cattle;
}
function cleanState(state) {
    const { qaFood, ...canonical } = state;
    return canonical;
}

/** A separate QA compartment: only the declared experiment hooks change real engine execution. */
export function foodEngine(scenario) {
    if (!Object.hasOwn(foodScenarios, scenario)) throw new Error('Unknown Food scenario');
    if (engines.has(scenario)) return engines.get(scenario);
    const recipe = foodScenarios[scenario];
    const control = studyEngine('control');
    const enabled = recipe.spoilageBps !== 0 || recipe.capacity !== null;
    const cache = new Map();
    const sources = new Map();
    const groupCache = new WeakMap();
    const emptyLedger = () => ({ spoiled: 0, workLost: { farmer: 0, fisher: 0, hunter: 0 } });
    const factor = (state, id) => {
        const role = state.personas[id].occupation;
        if (!recipe.capacity || !['farmer', 'fisher', 'hunter'].includes(role)) return 10000;
        let groups = groupCache.get(state);
        if (!groups || groups.winter !== state.time.winter) {
            groups = { winter: state.time.winter, farmer: 0, fisher: 0, hunter: 0 };
            for (const person of Object.values(state.personas)) {
                if (Object.hasOwn(groups, person.occupation) && core.inspectWork(state, person.id).reason === null) {
                    groups[person.occupation]++;
                }
            }
            groupCache.set(state, groups);
        }
        const count = groups[role];
        if (count <= recipe.capacity.fullWorkers) return 10000;
        let capacityBps = recipe.capacity.fullWorkers * 10000;
        for (let index = 0; index < count - recipe.capacity.fullWorkers; index++) {
            capacityBps += recipe.capacity.marginalBps[index] ?? recipe.capacity.floorBps;
        }
        return Math.floor(capacityBps / count);
    };
    const limitWork = (state, id, efficiency, units) => {
        if (!state.qaFood) return efficiency;
        const limited = Math.floor(efficiency * factor(state, id) / 10000);
        const role = state.personas[id].occupation;
        if (Object.hasOwn(state.qaFood.workLost, role)) state.qaFood.workLost[role] += units * (efficiency - limited);
        return limited;
    };
    const spoil = state => {
        if (!state.qaFood) return;
        const protectedFood = recipe.protectedWinters * normalFoodNeed(state);
        const spoiled = Math.floor(Math.max(0, state.stocks.food - protectedFood) * recipe.spoilageBps / 10000);
        state.qaFood.spoiled += spoiled;
        if (spoiled === 0) return;
        const before = state.stocks.food;
        state.stocks.food -= spoiled;
        state.events.push({ id: 'event-' + (state.events.length + 1), time: { ...state.time }, type: 'FoodSpoiled',
            details: { units: spoiled, before, remaining: state.stocks.food, protectedFood, rateBps: recipe.spoilageBps,
                phase: 'after-complete-domestic-Winter' } });
    };
    function load(url) {
        if (cache.has(url.href)) return cache.get(url.href).exports;
        const module = { exports: {} };
        cache.set(url.href, module);
        let source = text(url);
        sources.set(url.pathname.split('/src/').at(-1), hash(source));
        if (url.pathname.endsWith('/simulation/Mechanics.ts')) {
            const work = '        const efficiency=work.productivityBps;\n';
            if (source.split(work).length !== 2) throw new Error('Work boundary changed; review Food experiment');
            source = source.replace(work, '        const efficiency=studyCapacity(state,id,work.productivityBps,job.unitsPerWinter);\n');
            const boundary = '        determineWeather(state);\n';
            if (source.split(boundary).length !== 2) throw new Error('Winter boundary changed; review Food experiment');
            source = source.replace(boundary, boundary + '        studySpoilage(state);\n');
        }
        const compiled = ts.transpileModule(source, { compilerOptions: {
            module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
        } }).outputText;
        new Function('require', 'module', 'exports', 'studySpoilage', 'studyCapacity', compiled)(
            name => name.startsWith('.') ? load(new URL(name + '.ts', url)) : nativeRequire(name),
            module, module.exports, spoil, limitWork);
        return module.exports;
    }
    const root = new URL('../../src/simulation/', import.meta.url);
    const core = enabled ? load(new URL('SimulationCore.ts', root)) : control.core;
    const landing = enabled ? load(new URL('Landing.ts', root)) : control.landing;
    const weather = enabled ? load(new URL('Weather.ts', root)) : control.weather;
    const identity = { kind: 'food-calibration', version: 1, scenario, recipeHash: hash(JSON.stringify(recipe)),
        sourceHash: enabled ? hash(JSON.stringify([...sources].sort(([a], [b]) => a.localeCompare(b, 'en')))) : control.identity.sourceHash,
        hookHash: hash(text(new URL('./food-engine.mjs', import.meta.url))) };
    const engine = {
        core, recipe, identity,
        create(seed, fullWorld = false) {
            const state = fullWorld ? core.createCampaign(seed) : landing.createCampaign(seed);
            if (!fullWorld) weather.initializeWeather(state);
            if (enabled) state.qaFood = emptyLedger();
            return state;
        },
        ledger(state) { return state.qaFood || emptyLedger(); },
        work(state, id) {
            const work = core.inspectWork(state, id);
            const capacityBps = factor(state, id);
            return { ...work, capacityBps, actualProductivityBps: Math.floor(work.productivityBps * capacityBps / 10000) };
        },
        canonicalHash(state) { return hash(core.serializeState(cleanState(state))); },
        domesticHash(state) { return hash({ ...cleanState(state), world: undefined }); },
        serialize(state) {
            return JSON.stringify({ ...identity, recipe, canonicalState: core.serializeState(cleanState(state)), ledger: state.qaFood || null });
        },
        reconstruct(serialized) {
            const saved = JSON.parse(serialized);
            if (Object.entries(identity).some(([key, value]) => saved[key] !== value) || hash(JSON.stringify(saved.recipe)) !== identity.recipeHash) {
                throw new Error('Food experiment identity mismatch');
            }
            const state = core.reconstructState(saved.canonicalState);
            if (enabled) {
                if (!Number.isSafeInteger(saved.ledger?.spoiled) || saved.ledger.spoiled < 0) throw new Error('Invalid experiment ledger');
                if (!saved.ledger.workLost || Object.keys(saved.ledger.workLost).join(',') !== 'farmer,fisher,hunter' ||
                    Object.values(saved.ledger.workLost).some(value => !Number.isSafeInteger(value) || value < 0)) throw new Error('Invalid capacity ledger');
                state.qaFood = structuredClone(saved.ledger);
            }
            return state;
        },
    };
    engines.set(scenario, engine);
    return engine;
}
