import assert from 'node:assert/strict';
import { studyEngine } from './aptitude-engine.mjs';
import { createHash } from 'node:crypto';
import { loadTypeScript } from '../load-typescript.mjs';
const { seededRandom } = loadTypeScript(new URL('../../src/characters/seededRandom.ts', import.meta.url));
export const hash = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
const foodRoles = ['farmer', 'fisher', 'hunter'];

function prepare(engine, initial, policy, commands) {
    let state = initial;
    const apply = command => {
        const accepted = engine.canApplyCommand(state, command);
        commands.push({ winter: state.time.winter, ...command, accepted,
            ...(command.type === 'AssignOccupation' ? { changed: state.personas[command.personaId].occupation !== command.occupation } : {}) });
        if (accepted) state = engine.applyCommand(state, command);
    };
    if (policy === 'default') return state;
    const people = Object.values(state.personas).filter(person => person.deathWinter === null &&
        engine.personaAge(state, person.id) >= state.mechanics.config.workAge &&
        engine.inspectWork(state, person.id).reason !== 'childcare').sort((a, b) => a.id.localeCompare(b.id, 'en'));
    const fit = (person, role) => engine.occupationAptitude(state, person.id, role);
    const bestFood = person => [...foodRoles].sort((a, b) => fit(person, b) - fit(person, a) || foodRoles.indexOf(a) - foodRoles.indexOf(b))[0];
    const randomRank = person => seededRandom(state.seed, 'aptitude-allocation-v1:' + person.id)();
    const ordered = [...people].sort(policy === 'random'
        ? (a, b) => randomRank(a) - randomRank(b) || a.id.localeCompare(b.id, 'en')
        : (a, b) => (fit(b, 'woodworker') - fit(b, bestFood(b))) -
            (fit(a, 'woodworker') - fit(a, bestFood(a))) || a.id.localeCompare(b.id, 'en'));
    const materialCount = people.length > 1 ? Math.max(1, Math.round(people.length / 4)) : 0;
    const roles = new Map(ordered.slice(0, materialCount).map(person => [person.id, 'woodworker']));
    const foodPeople = ordered.slice(materialCount);
    const farmer = [...foodPeople].sort(policy === 'random'
        ? (a, b) => randomRank(a) - randomRank(b)
        : (a, b) => (fit(b, 'farmer') - fit(b, bestFood(b))) -
            (fit(a, 'farmer') - fit(a, bestFood(a))) || a.id.localeCompare(b.id, 'en'))[0];
    for (const person of foodPeople) {
        const randomRole = foodRoles[Math.floor(seededRandom(state.seed, 'aptitude-food-v1:' + person.id)() * foodRoles.length)];
        roles.set(person.id, person === farmer ? 'farmer' : policy === 'random' ? randomRole : bestFood(person));
    }
    for (const person of people) if (person.occupation !== roles.get(person.id) || !state.mechanics.people[person.id].occupationLocked) {
        apply({ type: 'AssignOccupation', personaId: person.id, occupation: roles.get(person.id) });
    }
    if (state.time.winter === 800) apply({ type: 'SalvageLongship', longshipId: 'founding-longship' });
    const homes = Object.values(state.households).filter(home => home.memberIds.some(id => state.personas[id].deathWinter === null));
    const priority = home => home.memberIds.some(id => state.personas[id].occupation === 'farmer') ? 0
        : home.memberIds.some(id => foodRoles.includes(state.personas[id].occupation)) ? 1 : 2;
    homes.sort((a, b) => priority(a) - priority(b) || a.id.localeCompare(b.id, 'en'));
    const upkeepReserve = () => Object.keys(state.buildings).reduce((sum, id) =>
        sum + (engine.inspectBuilding(state, id).occupied ? engine.inspectBuilding(state, id).upkeep : 0), 0) * 2;
    for (const home of homes) {
        const residence = home.residenceId ? state.residences[state.households[home.id].residenceId] : null;
        if (residence?.kind !== 'house' && state.stocks.materials >= state.mechanics.config.houseCost + upkeepReserve() + 2) {
            apply({ type: 'BuildHouse', householdId: home.id });
        }
    }
    for (const home of homes) {
        const buildingId = state.residences[state.households[home.id].residenceId]?.buildingId;
        if (!buildingId || !state.buildings[buildingId]) continue;
        const working = home.memberIds.filter(id => roles.has(id)).sort((a, b) =>
            Number(!foodRoles.includes(roles.get(a))) - Number(!foodRoles.includes(roles.get(b))) || a.localeCompare(b, 'en'));
        const role = roles.get(working[0]);
        if (role && state.buildings[buildingId].specialization !== role) {
            apply({ type: 'SpecializeBuilding', buildingId, occupation: role });
        }
    }
    const yards = engine.landingSummary(state).farmyards;
    for (const cattle of Object.values(state.landing.cattle).filter(cattle => cattle.deathWinter === null && cattle.farmyardId === null)) {
        const count = id => Object.values(state.landing.cattle).filter(cattle => cattle.deathWinter === null && cattle.farmyardId === id).length;
        const yard = [...yards].sort((a, b) => count(a.id) - count(b.id) || a.id.localeCompare(b.id, 'en'))
            .find(yard => count(yard.id) < state.landing.config.farmyardCapacity);
        if (yard) apply({ type: 'AssignCattle', cattleId: cattle.id, farmyardId: yard.id });
    }
    if (homes.every(home => state.residences[state.households[home.id].residenceId]?.kind === 'house')) {
        for (const id of Object.keys(state.buildings).sort()) {
            const cost = state.mechanics.config.upgradeCosts[engine.inspectBuilding(state, id).upgradeLevel];
            if (cost !== undefined && state.stocks.materials >= cost + upkeepReserve() + 2) {
                apply({ type: 'UpgradeBuilding', buildingId: id });
            }
        }
    }
    return state;
}
function population(state) {
    return Object.values(state.personas).filter(person => person.deathWinter === null).length;
}
export function runEconomyScenario({ seed, model = 'control', policy = 'default', winters = 25,
    resumeAt = null, fullWorld = false } = {}) {
    const experiment = studyEngine(model);
    const core = experiment.core;
    const landing = experiment.landing;
    const weather = experiment.weather;
    if (!['default', 'random', 'aware'].includes(policy)) throw new Error('Unknown allocation policy');
    if (resumeAt !== null && (!Number.isSafeInteger(resumeAt) || resumeAt < 1 || resumeAt >= winters)) throw new Error('Invalid resume boundary');
    if (!Number.isSafeInteger(winters) || winters < 1 || winters > 100) throw new Error('Invalid Winters');
    let state = fullWorld ? core.createCampaign(seed) : landing.createCampaign(seed);
    if (!fullWorld) weather.initializeWeather(state);
    const configuration = structuredClone(state.mechanics.config);
    const initialFingerprint = hash({ personas: state.personas, households: state.households,
        residences: state.residences, landing: state.landing, stocks: state.stocks, rngState: state.rngState });
    const commands = [];
    const annual = [{ elapsedWinter: 0, winter: 800, food: state.stocks.food,
        materials: state.stocks.materials, population: population(state) }];
    let longestShortage = 0, streak = 0;
    for (let year = 0; year < winters; year++) {
        state = prepare(core, state, policy, commands);
        const previousFood = state.stocks.food;
        const start = state.events.length;
        const annualCommands = commands.filter(command => command.winter === state.time.winter && command.accepted);
        const playerOccupationChanges = annualCommands.filter(command => command.type === 'AssignOccupation' && command.changed).length;
        const conditions = core.inspectWeather(state);
        const workers = Object.values(state.personas).filter(person => person.deathWinter === null).map(person => ({
            id: person.id, occupation: person.occupation, ...core.inspectWork(state, person.id),
        }));
        state = core.advanceWinter(state);
        const events = state.events.slice(start);
        const sum = (type, key = 'units', filter = () => true) => events.filter(event => event.type === type && filter(event))
            .reduce((total, event) => total + (event.details?.[key] || 0), 0);
        const residentFood = sum('ResourceProduced', 'units', event => event.details.resource === 'food');
        const cattleFood = sum('CattleFoodProduced');
        const foodConsumed = sum('FoodConsumed') + sum('CattleFoodConsumed');
        const shortfall = sum('FoodConsumed', 'shortfall') + sum('CattleFoodConsumed', 'shortfall');
        streak = shortfall ? streak + 1 : 0;
        longestShortage = Math.max(longestShortage, streak);
        const row = { elapsedWinter: year + 1, winter: state.time.winter, weather: conditions.class,
            previousFood, food: state.stocks.food, materials: state.stocks.materials, population: population(state),
            foodProduced: residentFood + cattleFood, residentFood, cattleFood, foodConsumed, shortfall,
            materialsProduced: sum('ResourceProduced', 'units', event => event.details.resource === 'materials'),
            upkeep: sum('BuildingMaintained'), births: events.filter(event => event.type === 'ChildBorn').length,
            deaths: events.filter(event => event.type === 'PersonaDied').length,
            occupationChanges: events.filter(event => event.type === 'OccupationAssigned').length + playerOccupationChanges,
            playerOccupationChanges,
            houses: Object.keys(state.buildings).length, upgrades: Object.values(state.mechanics.buildings).reduce((n, b) => n + b.upgradeLevel, 0),
            farmyards: core.landingSummary(state).farmyards.length, cattle: core.landingSummary(state).cattle,
            unshelteredCattle: core.landingSummary(state).unshelteredCattle, workers,
            rngState: state.rngState };
        for (const stock of Object.values(state.stocks)) assert.ok(Number.isSafeInteger(stock) && stock >= 0);
        assert.equal(row.food, previousFood + row.foodProduced - foodConsumed);
        annual.push(row);
        if (resumeAt === year + 1) state = experiment.reconstruct(experiment.serialize(state));
    }
    const descendants = Object.values(state.personas).filter(person => person.parentIds.length).map(person => ({
        campaignSeed: seed, personaId: person.id, name: person.name, dnaSeed: person.dna.seed, sex: person.dna.sex,
        age: core.personaAge(state, person.id), traits: { ...person.dna.traits }, parentIds: [...person.parentIds],
        deathWinter: person.deathWinter, assignedOccupation: person.occupation,
    }));
    return { seed, model, policy, winters, descendants, ruleConfiguration: { mechanics: configuration, landing: state.landing.config, weather: state.weather.config }, experiment: experiment.identity, configuration, initialFingerprint, commands, annual,
        longestShortage, finalStateHash: hash(core.serializeState(state)),
        finalDomesticHash: hash({ ...state, world: undefined }) };
}
