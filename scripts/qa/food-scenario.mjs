import assert from 'node:assert/strict';
import { foodEngine, normalFoodNeed } from './food-engine.mjs';
import { prepareFoodPolicy } from './food-policy.mjs';
import { hash } from './aptitude-economy.mjs';

export function runFoodScenario({ seed, scenario = 'B', winters = 25, resumeAt = null, fullWorld = false } = {}) {
    if (!Number.isSafeInteger(winters) || winters < 1 || winters > 100) throw new Error('Invalid Winters');
    if (resumeAt !== null && (!Number.isSafeInteger(resumeAt) || resumeAt < 1 || resumeAt >= winters)) throw new Error('Invalid resume boundary');
    const experiment = foodEngine(scenario);
    const core = experiment.core;
    let state = experiment.create(seed, fullWorld);
    const ruleConfiguration = { mechanics: structuredClone(state.mechanics.config),
        landing: structuredClone(state.landing.config), weather: structuredClone(state.weather.config) };
    const initialFingerprint = hash({ personas: state.personas, households: state.households,
        residences: state.residences, landing: state.landing, stocks: state.stocks, rngState: state.rngState });
    const commands = [];
    const living = () => Object.values(state.personas).filter(person => person.deathWinter === null).length;
    const annual = [{ elapsedWinter: 0, winter: 800, food: state.stocks.food, materials: state.stocks.materials, population: living() }];
    for (let year = 0; year < winters; year++) {
        const previousMaterials = state.stocks.materials;
        const preparationOffset = state.events.length;
        state = prepareFoodPolicy(core, state, experiment.recipe.policy, commands);
        const previousFood = state.stocks.food;
        const offset = state.events.length;
        const weather = core.inspectWeather(state).class;
        const beforeLedger = structuredClone(experiment.ledger(state));
        const workers = Object.values(state.personas).filter(person => person.deathWinter === null).map(person => ({
            id: person.id, name: person.name, occupation: person.occupation, age: core.personaAge(state, person.id),
            ...experiment.work(state, person.id),
        }));
        const cattleIds = Object.values(state.landing.cattle).filter(animal => animal.deathWinter === null).map(animal => animal.id);
        const openingNormalNeed = normalFoodNeed(state);
        const openingForecastNeed = workers.reduce((sum, worker) => sum + (worker.age < state.mechanics.config.foodAdultAge
            ? state.mechanics.config.childFood : state.mechanics.config.adultFood), 0);
        const outgoingProfile = state.weather.config.profiles[weather];
        const occupations = Object.fromEntries(Object.values(state.personas).map(person => [person.id, person.occupation]));
        state = core.advanceWinter(state);
        const events = state.events.slice(offset);
        const allEvents = state.events.slice(preparationOffset);
        const sum = (type, field = 'units', predicate = () => true) => events.filter(event => event.type === type && predicate(event))
            .reduce((total, event) => total + (event.details?.[field] || 0), 0);
        const producedByRole = Object.fromEntries(['farmer', 'fisher', 'hunter', 'woodworker'].map(role =>
            [role, sum('ResourceProduced', 'units', event => occupations[event.personaId] === role)]));
        const cattleProduced = sum('CattleFoodProduced');
        const foodProduced = producedByRole.farmer + producedByRole.fisher + producedByRole.hunter + cattleProduced;
        const foodConsumed = sum('FoodConsumed') + sum('CattleFoodConsumed');
        const spoiled = experiment.ledger(state).spoiled - beforeLedger.spoiled;
        const capacityLostWork = Object.fromEntries(['farmer', 'fisher', 'hunter'].map(role =>
            [role, experiment.ledger(state).workLost[role] - beforeLedger.workLost[role]]));
        const lostByRole = Object.fromEntries(['farmer', 'fisher', 'hunter'].map(role => [role,
            Math.floor(experiment.ledger(state).workLost[role] / state.mechanics.config.workPerUnit) -
            Math.floor(beforeLedger.workLost[role] / state.mechanics.config.workPerUnit)]));
        const capacityLostEquivalent = Object.values(lostByRole).reduce((sum, value) => sum + value, 0);
        const residentBaseAtConsumption = workers.filter(worker => state.personas[worker.id].deathWinter === null)
            .reduce((sum, worker) => sum + (worker.age + 1 < state.mechanics.config.foodAdultAge
                ? state.mechanics.config.childFood : state.mechanics.config.adultFood), 0);
        const cattleBaseAtConsumption = cattleIds.filter(id => state.landing.cattle[id].deathWinter === null)
            .reduce((sum, id) => sum + (state.time.winter - state.landing.cattle[id].birthWinter < state.landing.config.cattleAdultAge
                ? state.landing.config.calfFood : state.landing.config.adultCattleFood), 0);
        const currentNeed = normalFoodNeed(state);
        const farmerCount = workers.filter(worker => worker.occupation === 'farmer' && worker.reason === null).length;
        const roleCount = role => workers.filter(worker => worker.occupation === role && worker.reason === null).length;
        const activeFood = workers.filter(worker => ['farmer', 'fisher', 'hunter'].includes(worker.occupation) && worker.reason === null).length;
        const row = { elapsedWinter: year + 1, winter: state.time.winter, weather, previousFood,
            food: state.stocks.food, materials: state.stocks.materials, population: living(),
            foodDelta: state.stocks.food - previousFood,
            unmetConsumptionEvents: events.filter(event => ['FoodConsumed', 'CattleFoodConsumed'].includes(event.type) && event.details.shortfall > 0).length,
            productiveFoodWorkers: workers.filter(worker => ['farmer', 'fisher', 'hunter'].includes(worker.occupation) && worker.actualProductivityBps > 0).length,
            productiveMaterialsWorkers: workers.filter(worker => worker.occupation === 'woodworker' && worker.actualProductivityBps > 0).length,
            workers, activeFood, activeMaterials: roleCount('woodworker'),
            availableByRole: { farmer: farmerCount, fisher: roleCount('fisher'), hunter: roleCount('hunter') },
            childcarePersonWinters: workers.filter(worker => worker.reason === 'childcare').length,
            ageReducedWorkers: workers.filter(worker => worker.age > state.mechanics.config.ageFullProductivityThrough && worker.reason === null).length,
            openingNormalNeed, openingForecastNeed: Math.ceil(openingForecastNeed * (outgoingProfile.residentConsumptionBps ?? 10000) / 10000) +
                Math.ceil(cattleIds.reduce((sum, id) => sum + (state.time.winter - 1 - state.landing.cattle[id].birthWinter < state.landing.config.cattleAdultAge
                    ? state.landing.config.calfFood : state.landing.config.adultCattleFood), 0) *
                    (outgoingProfile.cattleConsumptionBps !== undefined ? outgoingProfile.cattleConsumptionBps / 10000 : outgoingProfile.cattleConsumptionMultiplier)),
            reserveWinters: currentNeed ? state.stocks.food / currentNeed : null,
            residentBaseAtConsumption, cattleBaseAtConsumption,
            residentRequired: sum('FoodConsumed') + sum('FoodConsumed', 'shortfall'),
            cattleRequired: sum('CattleFoodConsumed') + sum('CattleFoodConsumed', 'shortfall'),
            capacityLostWork, lostByRole, capacityLostEquivalent, nominalFoodEquivalent: foodProduced + capacityLostEquivalent,
            producedByRole, cattleProduced, cattleConsumed: sum('CattleFoodConsumed'), foodProduced, foodConsumed,
            shortfall: sum('FoodConsumed', 'shortfall') + sum('CattleFoodConsumed', 'shortfall'), spoiled,
            beforeSpoilage: state.stocks.food + spoiled, protectedFood: experiment.recipe.protectedWinters * normalFoodNeed(state),
            births: events.filter(event => event.type === 'ChildBorn').length,
            deaths: events.filter(event => event.type === 'PersonaDied').length, rngState: state.rngState };
        const sumAll = (type, field) => allEvents.filter(event => event.type === type)
            .reduce((total, event) => total + (event.details?.[field] || 0), 0);
        row.materialsSpent = sumAll('HouseBuilt', 'cost') + sumAll('BuildingUpgraded', 'cost');
        row.upkeep = sumAll('BuildingMaintained', 'units');
        row.materialsRecovered = sumAll('FoundingLongshipSalvaged', 'materials') + sumAll('BuildingCollapsed', 'salvage') + sumAll('BuildingSalvaged', 'salvage');
        row.previousMaterials = previousMaterials;
        row.houses = Object.keys(state.buildings).length;
        row.upgrades = Object.values(state.mechanics.buildings).reduce((sum, building) => sum + building.upgradeLevel, 0);
        const herd = core.landingSummary(state);
        row.farmyards = herd.farmyards.length;
        row.cattle = herd.cattle;
        row.unshelteredCattle = herd.unshelteredCattle;
        row.shelteredCattle = herd.cattle - herd.unshelteredCattle;
        row.overcrowding = herd.farmyards.reduce((sum, yard) => sum + yard.overcrowding, 0);
        row.playerOccupationChanges = commands.filter(command => command.accepted && command.changed && command.winter === state.time.winter - 1).length;
        row.occupationChanges = row.playerOccupationChanges + events.filter(event => event.type === 'OccupationAssigned').length;
        row.specializationChanges = allEvents.filter(event => event.type === 'BuildingSpecialized').length;
        assert.equal(row.materials, previousMaterials + producedByRole.woodworker + row.materialsRecovered - row.materialsSpent - row.upkeep);
        assert.equal(row.food, previousFood + foodProduced - foodConsumed - spoiled);
        assert.ok(Object.values(state.stocks).every(value => Number.isSafeInteger(value) && value >= 0));
        annual.push(row);
        if (resumeAt === year + 1) state = experiment.reconstruct(experiment.serialize(state));
    }
    return { seed, scenario, winters, recipe: experiment.recipe, identity: experiment.identity, ruleConfiguration,
        initialFingerprint, commands, annual, finalStateHash: experiment.canonicalHash(state), finalDomesticHash: experiment.domesticHash(state),
        finalLedger: structuredClone(experiment.ledger(state)) };
}

/** Public command-script probe for capacity and partial-work save/replay verification. */
export function runFoodCommandProbe({ seed, scenario = 'B', commands = [], ticks = 500, resumeAt = null,
    readAsScenario = scenario } = {}) {
    if (!Number.isSafeInteger(ticks) || ticks < 0 || ticks > 1000) throw new Error('Invalid probe ticks');
    const experiment = foodEngine(scenario);
    const core = experiment.core;
    let state = experiment.create(seed);
    const attempted = [];
    for (const command of commands) {
        const accepted = core.canApplyCommand(state, command);
        attempted.push({ ...command, accepted });
        if (accepted) state = core.applyCommand(state, command);
    }
    if (resumeAt !== null) {
        if (!Number.isSafeInteger(resumeAt) || resumeAt < 0 || resumeAt > ticks) throw new Error('Invalid probe save boundary');
        state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: resumeAt });
        state = foodEngine(readAsScenario).reconstruct(experiment.serialize(state));
    }
    state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: ticks - (resumeAt || 0) });
    return { seed, scenario, time: state.time, commands: attempted,
        workers: Object.values(state.personas).map(person => ({ id: person.id, occupation: person.occupation,
            ...experiment.work(state, person.id), workProgress: person.workProgress })),
        stocks: state.stocks, ledger: structuredClone(experiment.ledger(state)),
        finalStateHash: experiment.canonicalHash(state), save: experiment.serialize(state) };
}
