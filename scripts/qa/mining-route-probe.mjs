import {loadTypeScript} from '../load-typescript.mjs';
const load = file => loadTypeScript(new URL('../../src/' + file + '.ts', import.meta.url));
const core = load('simulation/SimulationCore');
const {siteRoutes} = load('world-generation/SiteNavigation');
const {planRoute} = load('world-generation/LandRoutes');
const {absoluteTick, expeditionEligible} = load('simulation/WorldExpeditions');

/** QA observer probe, never a player controller: blueprint waypoints feed real paid commands. */
export function probeRivalAccess(initial, context) {
    const {world} = context;
    let waypoints, directFailure;
    try {
        planRoute(context, world.rivalSite.center, undefined, true);
        waypoints = [world.rivalSite.center];
    } catch (error) {
        directFailure = error.message;
        const trail = siteRoutes(world.navigation, world.settlement.center)(world.rivalSite.center);
        if (!trail.length) throw new Error('No canonical navigation trail to the rival.');
        waypoints = trail.filter((_, index) => index > 0 && index % 48 === 0);
        waypoints.push(world.rivalSite.center);
    }
    const resident = Object.keys(initial.personas).sort().find(id => expeditionEligible(initial, id));
    if (!resident) throw new Error('No available founder for the paid route probe.');
    let state = core.applyCommand(initial, {type: 'CreateExplorationGroup'}, context);
    const groupId = Object.keys(state.world.groups).at(-1);
    state = core.applyCommand(state, {type: 'SetExplorationMember', groupId, personaId: resident, included: true}, context);
    const foodBefore = state.stocks.food;
    state = core.applyCommand(state, {type: 'StartExpedition', groupId}, context);
    const foodCharged = foodBefore-state.stocks.food;
    const legs = [], start = absoluteTick(state);
    for (const target of waypoints) {
        state = core.applyCommand(state, {type: 'ExploreArea', groupId, target}, context);
        const mission = Object.values(state.world.spatial.missions).at(-1);
        const ticks = Math.ceil(mission.distance/state.world.spatial.policy.metresPerTick);
        state = core.applyCommand(state, {type: 'AdvanceTicks', ticks}, context);
        const reached = Object.values(state.world.spatial.missions).at(-1);
        if (reached.status !== 'Exploring') throw new Error('Paid scout did not reach the next waypoint: '+reached.status);
        legs.push({target: {...target}, resolvedTarget: {...reached.target}, metres: mission.distance, ticks});
    }
    const sighting = state.events.find(e => e.type === 'IslandSiteSighted' && e.details?.siteId === world.rivalSite.candidateId);
    if (!sighting) throw new Error('The actual scout reached the area without sighting the rival.');
    state = core.applyCommand(state, {type: 'RecallExpedition', groupId}, context);
    for (let elapsed = 0; elapsed < 3000; elapsed += 100) {
        if (Object.values(state.world.spatial.missions).at(-1).status === 'Returned') break;
        state = core.applyCommand(state, {type: 'AdvanceTicks', ticks: 100}, context);
    }
    if (Object.values(state.world.spatial.missions).at(-1).status !== 'Returned')
        throw new Error('The paid scout did not return home within the bounded probe.');
    const serialized = core.serializeState(state);
    if (core.serializeState(core.reconstructState(serialized)) !== serialized) throw new Error('Rival travel save mismatch.');
    return {qaObserverWaypoints: true, directFailure, resident, foodCharged,
        elapsedTicks: absoluteTick(state)-start, legs, returned: true, sighting,
        events: state.events.filter(e => ['ExploreAreaStarted','ExploreAreaDestinationChanged','ExploreAreaReturned'].includes(e.type))};
}
