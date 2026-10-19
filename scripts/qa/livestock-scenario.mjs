import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { livestockStudyCore, studyHash } from './livestock-study-core.mjs';
import { livestockCandidate } from './livestock-candidates.mjs';
import { prepareFoodPolicy } from './food-policy.mjs';
import { gzipSync, gunzipSync } from 'node:zlib';

// Targets are independent domestic Core states. Reuse their measured trajectory across
// player policies, bounded to 64 compressed entries per worker. The full-world oracle
// below verifies identical canonical results, including target RNG and event history.
const cpuCache = new Map();

const speciesIds = ['cattle', 'chicken', 'pig', 'sheep', 'goat', 'goose'];
const bounds = { minX: 0, maxX: 512, minZ: 0, maxZ: 256 };
// Economy has no terrain-dependent rates. Bind the real single rival on a dry QA island.
const world = {
    waterLevel: -1,
    terrain: { bounds, spacing: 8, columns: 65, rows: 33, heights: Array(2145).fill(0) },
    navigation: { bounds, spacing: 8, columns: 65, rows: 33, cells: Array(2145).fill(true) },
    settlement: { center: { x: 64, z: 128 }, harbor: null },
    rivalSite: { version: 1, candidateId: 'study-rival', center: { x: 352, z: 128 },
        bounds: { minX: 288, maxX: 416, minZ: 64, maxZ: 192 } },
};
const alive = state => Object.values(state.landing.cattle).filter(animal => animal.deathWinter === null);
const count = (rows, key) => rows.reduce((counts, row) => {
    counts[row[key]] = (counts[row[key]] ?? 0) + 1;
    return counts;
}, {});

function prepareHerd(core, initial, commands) {
    const preparedCore = { ...core, canApplyCommand: (state, command) =>
        !['AssignCattle', 'AssignLivestock'].includes(command.type) && core.canApplyCommand(state, command) };
    let state = prepareFoodPolicy(preparedCore, initial, 'aware', commands);
    const apply = command => {
        if (!core.canApplyCommand(state, command)) return;
        commands.push({ winter: state.time.winter, ...command });
        state = core.applyCommand(state, command);
    };
    // One-species founding trials: keep the breeding trio together, with spare room for young.
    // Food/housing preparation remains the frozen #78 policy. Every reduction is real slaughter.
    const animals = alive(state);
    if (!animals.length) return state;
    const weight = state.landing.livestock?.version === 2 && animals[0].species !== 'cattle' ?
        state.landing.livestock.profiles[animals[0].species].capacityWeightBps : 10000;
    const yard = [...core.landingSummary(state).farmyards].sort((a, b) => a.id.localeCompare(b.id, 'en'))[0];
    const capacity = yard ? yard.capacity * 10000 :
        state.landing.livestock?.version === 2 ? state.landing.livestock.breeding.unassignedCapacityUnits : 40000;
    const room = Math.floor(capacity / weight);
    const males = animals.filter(animal => animal.sex === 'male').sort((a, b) => b.birthWinter - a.birthWinter);
    const females = animals.filter(animal => animal.sex === 'female').sort((a, b) => b.birthWinter - a.birthWinter);
    const mature = animal => core.inspectLivestock(state, animal.id).stage === 'Adult';
    // Retain a mature male before juveniles; keep fertile females ahead of elderly adults.
    const breederMale = males.find(mature) ?? males[0];
    const adultFemales = females.filter(mature).slice(0, Math.max(2, Math.floor((room - 1) / 2)));
    const replacements = [...females, ...males].filter(animal => !mature(animal));
    const retained = new Set([breederMale, ...adultFemales, ...replacements]
        .filter(Boolean).map(animal => animal.id));
    const keep = new Set([...retained].slice(0, room));
    for (const animal of animals.filter(animal => !keep.has(animal.id)))
        apply({ type: 'SlaughterLivestock', livestockId: animal.id });
    for (const animal of alive(state)) if (animal.farmyardId !== (yard?.id ?? null))
        apply({ type: 'AssignLivestock', livestockId: animal.id, farmyardId: yard?.id ?? null });
    return state;
}

function observe(core, state) {
    const animals = alive(state), people = Object.values(state.personas).filter(person => person.deathWinter === null);
    return { food: state.stocks.food, materials: state.stocks.materials,
        hides: state.specialistStocks?.hides ?? 0, population: people.length,
        children: people.filter(person => core.personaAge(state, person.id) < 16).length,
        adultDescendants: people.filter(person => person.parentIds.length && core.personaAge(state, person.id) >= 16).length,
        species: animals[0]?.species ?? 'extinct', herd: animals.length, sex: count(animals, 'sex'),
        young: animals.filter(animal => core.inspectLivestock(state, animal.id).stage !== 'Adult').length,
        overcrowded: animals.filter(animal => core.inspectLivestock(state, animal.id).overcrowding > 0).length,
        farmyards: core.landingSummary(state).farmyards.length };
}

function annual(core, state, before, offset) {
    const events = state.events.slice(offset);
    const of = (...types) => events.filter(event => types.includes(event.type));
    const sum = (rows, field = 'units') => rows.reduce((total, event) => total + (event.details?.[field] ?? 0), 0);
    const production = resource => sum(of('ResourceProduced', 'LivestockResourceProduced')
        .filter(event => event.details.resource === resource));
    let youngAnimalFeedings = 0, youngFoodRequiredBeforeWeather = 0;
    for (const feeding of of('CattleFoodConsumed', 'LivestockFoodConsumed')) {
        for (const id of feeding.details.cattleIds ?? feeding.details.livestockIds ?? []) {
            const animal = state.landing.cattle[id];
            const profile = animal.species === 'cattle' ? null : state.landing.livestock.profiles[animal.species];
            if (feeding.time.winter - animal.birthWinter >= (profile?.adultAge ?? state.landing.config.cattleAdultAge)) continue;
            youngAnimalFeedings++;
            youngFoodRequiredBeforeWeather += profile?.youngFood ?? state.landing.config.calfFood;
        }
    }
    const result = { ...observe(core, state),
        youngAnimalFeedings, youngFoodRequiredBeforeWeather,
        humanBirths: of('ChildBorn').length, humanDeaths: of('PersonaDied').length,
        animalBirths: of('CattleBorn', 'LivestockBorn').length,
        animalDeaths: of('CattleDied', 'LivestockDied').length,
        slaughters: of('CattleSlaughtered', 'LivestockSlaughtered').length,
        foodProduced: production('food') + sum(of('CattleFoodProduced')),
        animalFoodProduced: sum(of('CattleFoodProduced')) + sum(of('LivestockResourceProduced')
            .filter(event => event.details.resource === 'food')),
        humanConsumed: sum(of('FoodConsumed')), humanShortfall: sum(of('FoodConsumed'), 'shortfall'),
        animalConsumed: sum(of('CattleFoodConsumed', 'LivestockFoodConsumed')),
        animalRequired: sum(of('CattleFoodConsumed', 'LivestockFoodConsumed'), 'required'),
        animalShortfall: sum(of('CattleFoodConsumed', 'LivestockFoodConsumed'), 'shortfall'),
        slaughterFood: sum(of('CattleSlaughtered', 'LivestockSlaughtered'), 'food'),
        foodSpoiled: 0, // Canonical Core has no spoilage rule; do not invent one for the study.
        materialsProduced: production('materials'),
        materialsSpent: sum(of('HouseBuilt', 'BuildingUpgraded'), 'cost') + sum(of('BuildingMaintained')),
        materialsRecovered: sum(of('FoundingLongshipSalvaged'), 'materials') +
            sum(of('BuildingCollapsed', 'BuildingSalvaged'), 'salvage'),
        hidesReceived: sum(of('CattleSlaughtered', 'LivestockSlaughtered'), 'hides'),
        weather: of('FoodConsumed', 'CattleFoodConsumed', 'LivestockFoodConsumed').map(event => event.details),
    };
    result.foodResidual = result.food - (before.food + result.foodProduced + result.slaughterFood -
        result.humanConsumed - result.animalConsumed);
    result.materialsResidual = result.materials - (before.materials + result.materialsProduced +
        result.materialsRecovered - result.materialsSpent);
    result.herdResidual = result.herd - (before.herd + result.animalBirths - result.animalDeaths - result.slaughters);
    assert.equal(result.foodResidual, 0);
    assert.equal(result.materialsResidual, 0);
    assert.equal(result.herdResidual, 0);
    assert.equal(result.hides - before.hides, result.hidesReceived);
    return result;
}

/** Public bounded real-Core measurement. Budgets stop observations, never alter a herd. */
export function runLivestockScenario({ seed = 1, species = 'cattle', policy = 'passive', winters = 40,
    resumeAt = null, maxAnimals = 1000, maxMilliseconds = 180000, onYear = () => {}, fullWorld = false } = {}) {
    if (!['control', ...speciesIds].includes(species)) throw new Error('Unknown study species');
    if (!['passive', 'prepared', 'herd'].includes(policy)) throw new Error('Unknown study policy');
    if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff ||
        !Number.isInteger(winters) || winters < 1 || winters > 100) throw new Error('Invalid study bounds');
    const { core, identity } = livestockStudyCore(seed, species);
    let state = core.createCampaign(seed, {}, {}, { enabled: true }, {}, { enabled: true }, {},
        'summer-800-v1', undefined, species === 'control' ? undefined : { player: livestockCandidate });
    state = core.initializeIslandClans(state, world, 'livestock-study-219');
    const savedWorld = state.world;
    const rootKeys = Object.keys(state);
    let cpu = savedWorld.targetClans['island-rival'];
    const initial = { player: observe(core, state), cpu: observe(core, cpu),
        founderHash: studyHash(state.personas) };
    const ruleConfiguration = { player: state.landing, cpu: cpu.landing,
        mechanics: state.mechanics.config, weather: state.weather.config };
    const normalizedCpu = structuredClone(cpu);
    if (normalizedCpu.landing.livestock?.version === 2)
        delete normalizedCpu.landing.livestock.founding.excludedSpecies;
    const cacheKey = studyHash({ source: identity.sourceHash, initial: normalizedCpu, winters });
    const cachedCpu = !fullWorld ? cpuCache.get(cacheKey) : null;
    if (!fullWorld) delete state.world;
    const started = performance.now(), rows = [], commands = [];
    let status = 'complete', stopReason = null;
    for (let year = 0; year < winters; year++) {
        if (performance.now() - started > maxMilliseconds ||
            alive(state).length > maxAnimals ||
            (cachedCpu?.annual[year - 1]?.herd ?? alive(cpu).length) > maxAnimals) {
            status = 'resource-limit';
            stopReason = performance.now() - started > maxMilliseconds ? 'time-budget' : 'herd-budget';
            break;
        }
        const before = { player: observe(core, state), cpu: observe(core, cpu) };
        const offsets = { player: state.events.length, cpu: cpu.events.length };
        if (policy === 'herd') state = prepareHerd(core, state, commands);
        else if (policy === 'prepared') {
            const preparedCore = { ...core, canApplyCommand: (input, command) =>
                !['AssignCattle', 'AssignLivestock'].includes(command.type) && core.canApplyCommand(input, command) };
            state = prepareFoodPolicy(preparedCore, state, 'aware', commands);
        }
        state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 1000 });
        if (fullWorld) cpu = state.world.targetClans['island-rival'];
        else if (!cachedCpu) cpu = core.applyCommand(cpu, { type: 'AdvanceTicks', ticks: 1000 });
        const row = { year: year + 1, time: { ...state.time },
            player: annual(core, state, before.player, offsets.player),
            cpu: cachedCpu ? cachedCpu.annual[year] : annual(core, cpu, before.cpu, offsets.cpu) };
        rows.push(row);
        onYear(row);
        if (resumeAt === year + 1) {
            state = core.reconstructState(core.serializeState(state));
            if (!fullWorld && !cachedCpu) cpu = core.reconstructState(core.serializeState(cpu));
        }
    }
    if (!fullWorld) {
        if (cachedCpu) {
            cpu = status === 'complete' ?
                core.reconstructState(gunzipSync(cachedCpu.final).toString('utf8')) :
                core.applyCommand(cpu, { type: 'AdvanceTicks', ticks: rows.length * 1000 });
            cpu.landing.livestock = structuredClone(ruleConfiguration.cpu.livestock);
        } else if (status === 'complete') {
            if (cpuCache.size >= 64) cpuCache.delete(cpuCache.keys().next().value);
            cpuCache.set(cacheKey, { annual: rows.map(row => row.cpu),
                final: gzipSync(Buffer.from(core.serializeState(cpu))) });
        }
        state.world = { ...savedWorld, targetClans: { 'island-rival': cpu } };
        // Preserve the full Core factory's serialization order as well as its values.
        state = Object.fromEntries([...rootKeys, ...Object.keys(state).filter(key => !rootKeys.includes(key))]
            .map(key => [key, state[key]]));
    }
    return { version: 1, seed, species, policy, winters, status, stopReason, initial, ruleConfiguration,
        identity: { ...identity, scenarioHash: studyHash(readFileSync(new URL(import.meta.url), 'utf8').replace(/\r\n/g, '\n')),
            foodPolicyHash: studyHash(readFileSync(new URL('./food-policy.mjs', import.meta.url), 'utf8').replace(/\r\n/g, '\n')),
            candidateHash: studyHash(livestockCandidate) },
        execution: { fullWorld, cpuCacheHit: !!cachedCpu },
        annual: rows, commands, elapsedMs: Math.round(performance.now() - started),
        finalStateHash: studyHash(core.serializeState(state)) };
}
