import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import ts from 'typescript';
const nativeRequire = createRequire(import.meta.url);
const hash = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
const text = url => readFileSync(url, 'utf8').replace(/\r\n/g, '\n');

/** QA compartment: observes the real annual branches; never adds diagnostics to a save. */
export function populationEngine(candidate = 'baseline15', { detailLimit = 50000, diagnostics = true } = {}) {
    if (!['control30', 'baseline15', 'human-reserve', 'mortality', 'feeding', 'yard-breeding', 'combined'].includes(candidate)) throw new Error('Unknown population candidate');
    const cache = new Map();
    const sources = new Map();
    let rows = [], dropped = 0, counters = {};
    const consumption = new WeakMap();
    let mechanics, livestock, species, weather, family, farmyard, expeditions;
    function record(state, kind, data) {
        if (!diagnostics || state.entityPrefix) return;
        counters[kind] = (counters[kind] ?? 0) + 1;
        if (rows.length >= detailLimit) { dropped++; return; }
        const current = weather.inspectWeather(state);
        rows.push({ kind, winter: state.time.winter, weatherWinter: current.winter,
            weather: current.class, weatherEnabled: current.enabled, ...data });
    }
    function reserveNeed(state, totalNeed) {
        return ['human-reserve', 'combined'].includes(candidate) ? totalNeed - livestock.cattleFoodNeed(state) : totalNeed;
    }
    function fertility(state, id, unavailable, reason, rolled = null, childId = null) {
        const mother = state.personas[id];
        if (mother.dna.sex !== 'female') return;
        const info = state.mechanics.people[id];
        const cattleNeed = livestock.cattleFoodNeed(state);
        const totalNeed = mechanics.foodNeed(state);
        record(state, 'fertility', { id, age: state.time.winter - mother.birthWinter,
            partnerId: mother.partnerId, alive: mother.deathWinter === null,
            away: expeditions.personaAway(state, id), outgoingProxyCare: unavailable.has(id),
            proxyCare: family.isCaregiver(state, id), ownCare: info.childcareUntilWinter > state.time.winter && info.caregiverId === null,
            careUntil: info.childcareUntilWinter, lastBirthWinter: info.lastBirthWinter,
            food: state.stocks.food, humanNeed: totalNeed - cattleNeed, cattleNeed, reserveNeed: reserveNeed(state, totalNeed),
            foodBeforeConsumption: consumption.get(state)?.before ?? null,
            foodAfterConsumption: consumption.get(state)?.after ?? null,
            firstBlocker: reason, rolled, childId });
    }
    function humanMortality(state, id, age, naturalBps, exposureBps, risk, died) {
        record(state, 'human-mortality', { id, age, naturalBps, exposureBps, risk, died,
            sheltered: weather.permanentlySheltered(state, id), away: expeditions.personaAway(state, id) });
    }
    function cattleMortality(state, entry, died) {
        const { animal: c, risk, sheltered, weatherExposureBps } = entry;
        const yard = farmyard.farmyards(state).find(y => y.id === c.farmyardId);
        const age = state.time.winter - c.birthWinter, config = state.landing.config;
        const profile = species.animalProfile(state, c);
        let naturalBps = 0;
        for (const band of profile.mortalityBands) {
            if (band.minAge > age) break;
            naturalBps = band.chanceBps;
        }
        record(state, 'cattle-mortality', { id: c.id, age, sex: c.sex, farmyardId: c.farmyardId,
            sheltered, capacity: config.farmyardCapacity, overcrowding: yard?.overcrowding ?? 0,
            naturalBps, crowdingBps: Math.floor((yard?.overcrowdingUnits ?? 0) * profile.crowdingBps / 10000),
            flatBps: profile.weatherMortalityBps, exposureBps: weatherExposureBps, risk, died });
    }
    function breedingBlock(state, mother) {
        if (candidate === 'feeding') {
            const context = consumption.get(state);
            if (context?.cattle?.shortfall > 0 || context?.residents?.shortfall > 0) return 'feeding-shortfall';
        }
        if (candidate === 'yard-breeding') {
            const yard = farmyard.farmyards(state).find(y => y.id === mother.farmyardId);
            const count = Object.values(state.landing.cattle).filter(c => c.deathWinter === null && c.farmyardId === mother.farmyardId).length;
            if (!yard || count >= state.landing.config.farmyardCapacity) return 'no-yard-space';
        }
        return null;
    }
    function breeding(state, mother, reason, rolled = null, fatherId = null, calfId = null) {
        const context = consumption.get(state);
        record(state, 'cattle-breeding', { id: mother.id, age: state.time.winter - mother.birthWinter,
            sex: mother.sex, farmyardId: mother.farmyardId,
            lastCalvingWinter: mother.lastCalvingWinter, sheltered: livestock.cattleSheltered(state, mother),
            overcrowding: farmyard.farmyards(state).find(y => y.id === mother.farmyardId)?.overcrowding ?? 0,
            cattleShortfall: context?.cattle?.shortfall ?? null, residentShortfall: context?.residents?.shortfall ?? null,
            firstBlocker: reason, rolled, fatherId, calfId });
    }
    function feeding(state, phase) {
        if (phase === 'before') consumption.set(state, { before: state.stocks.food });
        else {
            const context = consumption.get(state);
            context.after = state.stocks.food;
            const events = state.events.slice(-2);
            context.cattle = events.find(e => ['CattleFoodConsumed', 'LivestockFoodConsumed'].includes(e.type))?.details;
            context.residents = events.find(e => e.type === 'FoodConsumed')?.details;
            record(state, 'feeding', { ...context });
        }
    }
    function replace(source, before, after) {
        if (source.split(before).length !== 2) throw new Error('Population diagnostic seam changed: ' + before.slice(0, 90));
        return source.replace(before, after);
    }
    function instrument(source, url) {
        if (url.pathname.endsWith('/simulation/Mortality.ts')) {
            source = replace(source, 'if(!roll(risk))return [];',
                'const died=roll(risk); study.humanMortality(state,id,age,band?.chanceBps??0,weatherExposureBps,risk,died); if(!died)return [];');
        }
        if (url.pathname.endsWith('/simulation/Livestock.ts')) {
            source = replace(source, 'if (mother.lastCalvingWinter !== null && winter - mother.lastCalvingWinter < profile.birthInterval)\n            continue;',
                "if(mother.lastCalvingWinter!==null&&winter-mother.lastCalvingWinter<profile.birthInterval){study.breeding(state,mother,'cooldown');continue;}");
            source = replace(source, 'if (!father || !chance(profile.birthChanceBps)) continue;',
                "if(!father){study.breeding(state,mother,'no-bull');continue;}" +
                "const blocked=study.breedingBlock(state,mother);if(blocked){study.breeding(state,mother,blocked);continue;}" +
                "if(!chance(profile.birthChanceBps)){study.breeding(state,mother,'roll-failed',false,father.id);continue;}");
            source = replace(source, '        landing.cattle[young.id] = young;',
                "        study.breeding(state,mother,'born',true,father.id,young.id);\n        landing.cattle[young.id] = young;");
            source = replace(source, '.filter(({ risk }) => chance(risk));',
                '.filter(entry=>{const died=chance(entry.risk);study.cattleMortality(state,entry,died);return died;});');
        }
        if (url.pathname.endsWith('/simulation/Mechanics.ts')) {
            source = replace(source, '        consumeCattleFood(state);', '        study.feeding(state,"before");\n        consumeCattleFood(state);');
            source = replace(source, "        annualFoodEvent=state.events.at(-1)!;", '        annualFoodEvent=state.events.at(-1)!;\n        study.feeding(state,"after");');
        }
        if (url.pathname.endsWith('/simulation/FamilyMechanics.ts')) {
            source = replace(source, 'if(!canPartner(state,aId,bId)||!roll(state.mechanics!.config.partnershipChanceBps))continue;',
                "if(!canPartner(state,aId,bId))continue;const partnered=roll(state.mechanics!.config.partnershipChanceBps);" +
                "study.record(state,'partnership',{aId,bId,formed:partnered});if(!partnered)continue;");
            const conditions = [
                ['personaAway(state,motherId)', 'away'], ['unavailable.has(motherId)', 'outgoing-proxy-care'],
                ['isCaregiver(state,motherId)', 'proxy-care'], ['mother.deathWinter!==null', 'dead'],
                ["mother.dna.sex!=='female'", 'sex'], ['age<config.fertilityMinAge', 'too-young'],
                ['age>config.fertilityMaxAge', 'too-old'], ['mother.partnerId===null', 'no-partner'],
            ];
            const before = 'if(' + conditions.map(([condition]) => condition).join('||') + ')continue;';
            const after = conditions.map(([condition, reason]) => `if(${condition}){study.fertility(state,motherId,unavailable,'${reason}');continue;}`).join('\n');
            source = replace(source, before, after);
            source = replace(source, "if(personaAway(state,father.id)||father.deathWinter!==null||father.dna.sex!=='male')continue;",
                "if(personaAway(state,father.id)||father.deathWinter!==null||father.dna.sex!=='male'){study.fertility(state,motherId,unavailable,'partner-unavailable');continue;}");
            source = replace(source, 'if(info.lastBirthWinter!==null&&state.time.winter-info.lastBirthWinter<=config.birthCooldownWinters)continue;',
                "if(info.lastBirthWinter!==null&&state.time.winter-info.lastBirthWinter<=config.birthCooldownWinters){study.fertility(state,motherId,unavailable,'cooldown');continue;}");
            source = replace(source, 'if(state.stocks.food<foodNeed()||!roll(config.fertilityChanceBps))continue;',
                "if(state.stocks.food<study.reserveNeed(state,foodNeed())){study.fertility(state,motherId,unavailable,'food');continue;}\n" +
                "if(!roll(config.fertilityChanceBps)){study.fertility(state,motherId,unavailable,'roll-failed',false);continue;}");
            source = replace(source, 'if(!home)continue;', "if(!home){study.fertility(state,motherId,unavailable,'no-household',true);continue;}");
            source = replace(source, '        const dna=generateCharacterDNA(random());',
                "        study.fertility(state,motherId,unavailable,'born',true,id);\n        const dna=generateCharacterDNA(random());");
        }
        return source;
    }
    function load(url) {
        if (cache.has(url.href)) return cache.get(url.href).exports;
        const module = { exports: {} };
        cache.set(url.href, module);
        const original = text(url);
        sources.set(url.pathname.split('/src/').at(-1), hash(original));
        const source = instrument(original, url);
        const compiled = ts.transpileModule(source, { compilerOptions: {
            module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
        } }).outputText;
        new Function('require', 'module', 'exports', 'study', compiled)(
            name => name.startsWith('.') ? load(new URL(name + '.ts', url)) : nativeRequire(name),
            module, module.exports, { fertility, humanMortality, cattleMortality, feeding, breeding, reserveNeed, breedingBlock, record });
        return module.exports;
    }
    const root = new URL('../../src/simulation/', import.meta.url);
    const core = load(new URL('SimulationCore.ts', root));
    const landing = load(new URL('Landing.ts', root));
    mechanics = load(new URL('Mechanics.ts', root));
    livestock = load(new URL('Livestock.ts', root));
    species = load(new URL('LivestockSpecies.ts', root));
    weather = load(new URL('Weather.ts', root));
    family = load(new URL('FamilyMechanics.ts', root));
    farmyard = load(new URL('Farmyards.ts', root));
    expeditions = load(new URL('WorldExpeditions.ts', root));
    const social = load(new URL('PersonalityLifeEvents.ts', root));
    const identity = { kind: 'population-study', version: 1, candidate,
        sourceHash: hash([...sources].sort(([a], [b]) => a.localeCompare(b, 'en'))), hookHash: hash(text(new URL(import.meta.url))) };
    return {
        core, identity,
        create(seed, { landing: landingOverrides = {}, mechanics: mechanicsOverrides = {}, weather: weatherOverrides = {}, fullWorld = false } = {}) {
            if (['mortality', 'combined'].includes(candidate)) {
                mechanicsOverrides = { ...mechanicsOverrides, mortalityBands: mechanics.defaultPrototypeConfig.mortalityBands
                    .map(band => ({...band, chanceBps: band.minAge >= 50 ? band.chanceBps * 3 : band.chanceBps})) };
                const profiles = structuredClone(weather.defaultWeatherConfig.profiles);
                profiles.Harsh.tentMortalityBps = 200;
                profiles.Severe.tentMortalityBps = 800;
                weatherOverrides = {...weatherOverrides, profiles};
            }
            const config = { initialFood: candidate === 'control30' ? 30 : 15, ...landingOverrides };
            if (fullWorld) return core.createCampaign(seed, config, mechanicsOverrides, weatherOverrides, {}, { enabled: true });
            const state = landing.createCampaign(seed, config, mechanicsOverrides);
            weather.initializeWeather(state, weatherOverrides);
            social.initializeSocial(state, { enabled: true });
            return core.reconstructState(core.serializeState(state));
        },
        advance(state, ticks = 1000) { return core.applyCommand(state, { type: 'AdvanceTicks', ticks }); },
        drain() {
            const result = { rows, counters, dropped };
            rows = []; counters = {}; dropped = 0;
            return result;
        },
        serialize(state) { return JSON.stringify({ ...identity, canonical: core.serializeState(state) }); },
        reconstruct(serialized) {
            const data = JSON.parse(serialized);
            if (Object.entries(identity).some(([key, value]) => data[key] !== value)) throw new Error('Population experiment identity mismatch');
            return core.reconstructState(data.canonical);
        },
    };
}
