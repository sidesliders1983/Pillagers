// Frozen #78 prepared policy: keep the published aptitude harness and its fingerprints intact.
import { loadTypeScript } from '../load-typescript.mjs';
const { seededRandom } = loadTypeScript(new URL('../../src/characters/seededRandom.ts', import.meta.url));
const foodRoles = ['farmer', 'fisher', 'hunter'];

export function prepareFoodPolicy(engine, initial, policy, commands) {
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
