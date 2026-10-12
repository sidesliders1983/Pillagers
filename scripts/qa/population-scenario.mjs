import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { populationEngine } from './population-engine.mjs';
import { prepareFoodPolicy } from './food-policy.mjs';
const hash = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
const sum = (rows, field) => rows.reduce((total, row) => total + (row[field] ?? 0), 0);
const counts = (rows, field) => rows.reduce((result, row) => {
    const key = row[field] ?? 'none';
    result[key] = (result[key] ?? 0) + 1;
    return result;
}, {});

/** Actual Core commands and annual decisions; run limits stop observation, never alter animals. */
export function runPopulationScenario({ seed, candidate = 'baseline15', policy = 'passive', winters = 80,
    resumeAt = null, maxCattle = 2000, maxMilliseconds = 120000, fullWorld = false,
    onYear = () => {}, detailLimit = 200000 } = {}) {
    if (!Number.isSafeInteger(winters) || winters < 1 || winters > 100) throw new Error('Invalid study Winters');
    if (!['passive', 'prepared', 'herd'].includes(policy)) throw new Error('Unknown study policy');
    const engine = populationEngine(candidate, { detailLimit });
    let remainingDetails = detailLimit;
    const core = engine.core;
    let state = engine.create(seed, { fullWorld });
    const started = performance.now();
    const ruleConfiguration = { landing: structuredClone(state.landing.config), mechanics: structuredClone(state.mechanics.config),
        weather: structuredClone(state.weather.config), social: structuredClone(state.social.config) };
    const founderIds = new Set(state.landing.founderIds);
    const founderHash = hash(state.personas);
    const arrivalAges = Object.fromEntries(Object.values(state.personas).map(p => [p.id, core.personaAge(state, p.id)]));
    const annual = [], decisions = [], commands = [];
    let status = 'complete', stopReason = null;
    const observe = () => {
        const residents = Object.values(state.personas).filter(p => p.deathWinter === null);
        const cattle = Object.values(state.landing.cattle).filter(c => c.deathWinter === null);
        const ages = group => counts(group.map(c => ({ stage: state.time.winter - c.birthWinter < 1 ? 'calf'
            : state.time.winter - c.birthWinter < 3 ? 'young-adult' : 'adult' })), 'stage');
        return { winter: state.time.winter, elapsedWinter: state.time.winter - 800,
            food: state.stocks.food, materials: state.stocks.materials, population: residents.length,
            livingFounders: residents.filter(p => founderIds.has(p.id)).length,
            adultDescendants: residents.filter(p => !founderIds.has(p.id) && core.personaAge(state, p.id) >= 16).length,
            children: residents.filter(p => core.personaAge(state, p.id) < 16).length,
            cattle: cattle.length, cattleSex: counts(cattle, 'sex'), cattleAges: ages(cattle),
            houses: Object.keys(state.buildings).length, farmyards: core.landingSummary(state).farmyards.length };
    };
    annual.push(observe());
    for (let year = 0; year < winters; year++) {
        if (annual.at(-1).cattle > maxCattle || performance.now() - started > maxMilliseconds) {
            status = 'resource-limit';
            stopReason = annual.at(-1).cattle > maxCattle ? 'herd-observation-budget' : 'elapsed-time-budget';
            break;
        }
        const before = { ...state.stocks }, cattleBefore = annual.at(-1).cattle;
        const offset = state.events.length;
        if (policy !== 'passive') {
            // Prepared housing without assignments isolates shelter from the otherwise identical herd policy.
            const policyCore = policy === 'prepared' ? { ...core,
                canApplyCommand: (input, command) => command.type !== 'AssignCattle' && core.canApplyCommand(input, command) } : core;
            state = prepareFoodPolicy(policyCore, state, 'aware', commands);
        }
        const workers = Object.values(state.personas).filter(p => p.deathWinter === null)
            .map(p => ({ id: p.id, occupation: p.occupation, ...core.inspectWork(state, p.id) }));
        state = engine.advance(state);
        const trace = engine.drain();
        const events = state.events.slice(offset);
        const ofType = type => events.filter(e => e.type === type);
        const units = (type, field = 'units') => ofType(type).reduce((n, e) => n + (e.details?.[field] ?? 0), 0);
        const production = resource => ofType('ResourceProduced').filter(e => e.details.resource === resource)
            .reduce((n, e) => n + e.details.units, 0);
        const foodProduction = production('food') + units('CattleFoodProduced');
        const foodReceipts = units('CattleSlaughtered', 'food');
        const foodConsumption = units('FoodConsumed') + units('CattleFoodConsumed');
        const cattleBirths = ofType('CattleBorn').length, cattleDeaths = ofType('CattleDied').length;
        const slaughters = ofType('CattleSlaughtered').length;
        const peopleRisk = trace.rows.filter(row => row.kind === 'human-mortality');
        const cattleRisk = trace.rows.filter(row => row.kind === 'cattle-mortality');
        const fertility = trace.rows.filter(row => row.kind === 'fertility');
        const breeding = trace.rows.filter(row => row.kind === 'cattle-breeding');
        const row = { ...observe(),
            weather: peopleRisk[0]?.weather ?? cattleRisk[0]?.weather ?? null,
            weatherWinter: peopleRisk[0]?.weatherWinter ?? cattleRisk[0]?.weatherWinter ?? null,
            births: ofType('ChildBorn').length, deaths: ofType('PersonaDied').length,
            partnerships: ofType('PartnershipFormed').length,
            availablePartnershipRolls: trace.rows.filter(r => r.kind === 'partnership').length,
            cattleBirths, cattleDeaths, slaughters, cattleProduced: units('CattleFoodProduced'),
            foodProduction, foodConsumption, foodReceipts,
            humanConsumed: units('FoodConsumed'), humanShortfall: units('FoodConsumed', 'shortfall'),
            cattleRequired: units('CattleFoodConsumed', 'required'), cattleConsumed: units('CattleFoodConsumed'),
            cattleShortfall: units('CattleFoodConsumed', 'shortfall'),
            materialsProduced: production('materials'),
            materialsSpent: units('HouseBuilt', 'cost') + units('BuildingUpgraded', 'cost') + units('BuildingMaintained'),
            materialsRecovered: units('FoundingLongshipSalvaged', 'materials') + units('BuildingCollapsed', 'salvage') + units('BuildingSalvaged', 'salvage'),
            exposedResidentWinters: peopleRisk.filter(p => !p.sheltered).length,
            shelteredResidentWinters: peopleRisk.filter(p => p.sheltered).length,
            expectedHumanDeaths: sum(peopleRisk, 'risk') / 10000,
            exposedCattleWinters: cattleRisk.filter(c => !c.sheltered).length,
            shelteredCattleWinters: cattleRisk.filter(c => c.sheltered).length,
            overcrowdedAnimalWinters: cattleRisk.filter(c => c.overcrowding > 0).length,
            expectedCattleDeaths: sum(cattleRisk, 'risk') / 10000,
            cattleRiskComponents: { natural: sum(cattleRisk, 'naturalBps'), exposure: sum(cattleRisk, 'exposureBps'),
                crowding: sum(cattleRisk, 'crowdingBps'), flat: sum(cattleRisk, 'flatBps') },
            fertilityBlockers: counts(fertility, 'firstBlocker'), eligibleCowWinters: breeding.length,
            breedingBlockers: counts(breeding, 'firstBlocker'),
            cattleOnlyReserveBlocks: fertility.filter(p => p.firstBlocker === 'food' && p.food >= p.humanNeed).length,
            workers: counts(workers.filter(p => p.reason === null), 'occupation'),
            careBurden: workers.filter(p => p.reason === 'childcare').length,
            traceDropped: trace.dropped };
        row.foodResidual = row.food - (before.food + foodProduction + foodReceipts - foodConsumption);
        row.materialsResidual = row.materials - (before.materials + row.materialsProduced + row.materialsRecovered - row.materialsSpent);
        row.cattleResidual = row.cattle - (cattleBefore + cattleBirths - cattleDeaths - slaughters);
        assert.equal(row.foodResidual, 0);
        assert.equal(row.materialsResidual, 0);
        assert.equal(row.cattleResidual, 0);
        annual.push(row);
        decisions.push(...trace.rows.slice(0, remainingDetails));
        row.traceDropped += Math.max(0, trace.rows.length - remainingDetails);
        remainingDetails = Math.max(0, remainingDetails - trace.rows.length);
        onYear(row, {identity: engine.identity, ruleConfiguration, founderHash});
        if (resumeAt === year + 1) state = engine.reconstruct(engine.serialize(state));
        if (row.population === 0) { status = 'extinct'; stopReason = 'no-living-residents'; break; }
    }
    const people = { ...state.personaArchive, ...state.personas };
    const generation = id => founderIds.has(id) ? 0 : (people[id]?.parentIds.length
        ? 1 + Math.max(...people[id].parentIds.map(generation)) : 0);
    const birthEvents = state.events.filter(e => e.type === 'ChildBorn');
    const founders = [...founderIds].map(id => {
        const person = people[id], deathAge = person.deathWinter === null ? null : person.deathWinter - person.birthWinter;
        return { id, arrivalAge: arrivalAges[id], deathAge, observedThroughAge: (person.deathWinter ?? state.time.winter) - person.birthWinter,
            censored: deathAge === null };
    });
    const descendants = Object.values(people).filter(p => !founderIds.has(p.id)).map(p => ({ id: p.id,
        generation: generation(p.id), birthWinter: p.birthWinter, deathWinter: p.deathWinter,
        observedThroughAge: (p.deathWinter ?? state.time.winter) - p.birthWinter,
        reachedAdulthood: (p.deathWinter ?? state.time.winter) - p.birthWinter >= 16 }));
    const mothers = Object.values(people).filter(p => p.dna.sex === 'female').map(p => {
        const births = birthEvents.filter(e => e.details.parentIds.includes(p.id));
        return { id: p.id, count: births.length, birthAges: births.map(e => e.time.winter - p.birthWinter),
            partners: counts(births.map(e => ({ partner: e.details.parentIds.find(id => id !== p.id) })), 'partner'),
            children: births.map(e => e.personaId) };
    });
    return { seed, candidate, policy, winters, status, stopReason, fullWorld,
        identity: engine.identity, ruleConfiguration, founderHash, founders, descendants, mothers,
        commands, annual, decisions, finalStateHash: hash(core.serializeState({ ...state, world: undefined })) };
}
