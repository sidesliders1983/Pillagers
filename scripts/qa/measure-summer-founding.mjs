import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { loadTypeScript } from '../load-typescript.mjs';
const core = loadTypeScript(new URL('../../src/simulation/SimulationCore.ts', import.meta.url));
const seeds = [1, 2, 3, 7, 17, 32, 42, 91, 1983, 1337];
const output = 'docs/qa/summer-founding';
const digest = state => createHash('sha256').update(core.serializeState(state)).digest('hex');
const advance = (state, ticks) => core.applyCommand(state, { type: 'AdvanceTicks', ticks });

function initial(seed, phase, strategy) {
    let state = core.createCampaign(seed, {}, {}, {}, {}, { enabled: true }, {}, phase);
    const actions = [];
    const command = action => { state = core.applyCommand(state, action); actions.push(action); };
    if (strategy === 'one-farmyard') {
        const residents = Object.values(state.personas).sort((a, b) => a.id.localeCompare(b.id));
        const farmer = residents.find(person => person.occupation === 'farmer') ?? residents[0];
        if (farmer.occupation !== 'farmer') command({ type: 'AssignOccupation', personaId: farmer.id, occupation: 'farmer' });
        const household = Object.values(state.households).find(home => home.memberIds.includes(farmer.id));
        command({ type: 'SalvageLongship', longshipId: 'founding-longship' });
        command({ type: 'BuildHouse', householdId: household.id });
        for (const cattleId of Object.keys(state.landing.cattle).sort())
            command({ type: 'AssignCattle', cattleId, farmyardId: 'house-1' });
    }
    return { state, actions };
}

function run(seed, phase, strategy) {
    const prepared = initial(seed, phase, strategy);
    const start = prepared.state;
    const ticks = 1000 - start.time.tick;
    const end = advance(start, ticks);
    const resumed = advance(core.reconstructState(core.serializeState(advance(start, ticks - 1))), 1);
    assert.equal(core.serializeState(end), core.serializeState(resumed));
    assert.deepEqual(end.time, { winter: 801, tick: 0 });
    assert.ok(Object.values(end.world.targetClans).every(clan => clan.time.winter === 801 && clan.time.tick === 0));
    const events = end.events.slice(start.events.length);
    const byType = type => events.filter(event => event.type === type);
    const sum = (type, field = 'units', predicate = () => true) => byType(type).filter(predicate)
        .reduce((total, event) => total + Number(event.details?.[field] ?? 0), 0);
    const residentFood = sum('ResourceProduced', 'units', event => event.details.resource === 'food');
    const cattleFood = sum('CattleFoodProduced');
    const cattleConsumed = sum('CattleFoodConsumed');
    const residentConsumed = sum('FoodConsumed');
    assert.equal(start.stocks.food + residentFood + cattleFood - cattleConsumed - residentConsumed, end.stocks.food);
    return {
        seed, phase: phase ?? 'legacy-winter', strategy, playedTicks: ticks,
        actions: prepared.actions, initialStocks: start.stocks,
        outgoingWeather: core.inspectWeather(start).class, incomingWeather: core.inspectWeather(end).class,
        initialExposure: core.inspectWeatherExposure(start), finalExposure: core.inspectWeatherExposure(end),
        residentFoodProduced: residentFood, cattleFoodProduced: cattleFood,
        residentFoodConsumed: residentConsumed, cattleFoodConsumed: cattleConsumed,
        residentFoodShortfall: sum('FoodConsumed', 'shortfall'), cattleFoodShortfall: sum('CattleFoodConsumed', 'shortfall'),
        finalStocks: end.stocks,
        residentDeaths: byType('PersonaDied').length, cattleDeaths: byType('CattleDied').length,
        residentBirths: byType('ChildBorn').length, cattleBirths: byType('CattleBorn').length,
        survivingResidents: Object.values(end.personas).filter(person => person.deathWinter === null).length,
        survivingCattle: Object.values(end.landing.cattle).filter(animal => animal.deathWinter === null).length,
        checkpointSha256: digest(end), saveResumeEqual: true,
    };
}

const results = [];
for (const strategy of ['passive', 'one-farmyard']) {
    for (const seed of seeds) {
        for (const phase of [undefined, 'summer-800-v1']) {
            const result = run(seed, phase, strategy);
            assert.deepEqual(run(seed, phase, strategy), result, 'Repeated run must reproduce every metric and state hash.');
            results.push(result);
        }
    }
}
await mkdir(output, { recursive: true });
await writeFile(output + '/first-boundary.json', JSON.stringify({ version: 1, seeds,
    rules: 'Unmodified current player defaults: 15 Food, 5 Materials, mortality, cattle lifecycle, weather and social events enabled.',
    observation: 'First boundary only. Full annual consumption and risks are unchanged, with 500 versus 1000 played production ticks. Shortfall is recorded, not interpreted as starvation deaths.',
    results }, null, 2) + '\n');
for (const strategy of ['passive', 'one-farmyard']) {
    console.log(strategy);
    console.table(results.filter(row => row.strategy === strategy).map(row => ({ seed: row.seed, phase: row.phase,
        weather: row.outgoingWeather, food: row.finalStocks.food, shortfall: row.residentFoodShortfall + row.cattleFoodShortfall,
        residents: row.survivingResidents, cattle: row.survivingCattle })));
}
console.log('40 paired scenarios repeated exactly; save/resume and Food accounting passed.');
