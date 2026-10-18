import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { loadTypeScript } from '../load-typescript.mjs';
import { digest, coreDigest } from './exploration-replay.mjs';
export { digest, coreDigest, replayExplorationTrace } from './exploration-replay.mjs';

const load = path => loadTypeScript(new URL('../../src/' + path, import.meta.url));
const core = load('simulation/SimulationCore.ts');
const discovery = load('simulation/ClanDiscovery.ts');
const visibility = load('world-generation/SettlementVisibility.ts');
const mechanics = load('simulation/Mechanics.ts');
const { SharedSettlement } = load('play/SharedSettlement.ts');
const { siteRoutes } = load('world-generation/SiteNavigation.ts');

export const baselineSeeds = [17, 42, 91, 1983, 1337, 7, 18, 32, 64, 127];
export const heldOutSeeds = [73, 256, 65537, 20261018];

export function createExplorationCampaign(seed) {
    const shared = new SharedSettlement(seed, 123, true, 'island-pool-v1', 'summer-800-v1');
    shared.fjord.enableDiscovery();
    return shared;
}

function knowledgeCount(state, property = 'explored') {
    const hex = state.discovery.clans[state.clan.id][property];
    let count = 0;
    for (let index = 0; index < hex.length; index += 2) {
        let byte = parseInt(hex.slice(index, index + 2), 16);
        while (byte) { count += byte & 1; byte >>>= 1; }
    }
    return count;
}

export function assertClanIdentity(state) {
    assert.deepEqual(Object.keys(state.world.targetClans), ['island-rival']);
    assert.equal(state.world.island.clanId, 'island-rival');
    const ids = [...new Set([...Object.keys(state.personas), ...Object.keys(state.personaArchive ?? {})])];
    const rival = state.world.targetClans['island-rival'];
    const rivalIds = [...new Set([...Object.keys(rival.personas), ...Object.keys(rival.personaArchive ?? {})])];
    assert.ok(rivalIds.every(id => id.startsWith('island-rival:') && !ids.includes(id)));
    assert.equal(new Set([...ids, ...rivalIds]).size, ids.length + rivalIds.length);
}

/** Real island, ordinary starting stocks and two independent one-resident groups.
 * Wrappers collect the actual public Core inputs; no private session/context access is needed. */
export function runExplorationScenario(seed, { encounter = false } = {}) {
    let shared = createExplorationCampaign(seed);
    const world = shared.fjord.blueprint;
    const initial = shared.session.snapshot();
    const initialExplored = knowledgeCount(initial);
    const initialWorldHash = digest(world);
    const trace = { version: 1, seed, initial, worldSha256: initialWorldHash, commands: [], checkpoints: [] };
    const profiling = { observation: [], sightlines: [], cpuTicks: [] };
    const original = { apply: core.applyCommand, observe: discovery.commitClanObservation,
        sightline: visibility.traceTerrainSightline, tick: mechanics.stepMechanicsTick };
    let committing = false;
    const timed = (target, method, originalMethod, samples, predicate = () => true) => {
        target[method] = function (...args) {
            if (!committing || !predicate(args)) return originalMethod.apply(this, args);
            const started = performance.now();
            try { return originalMethod.apply(this, args); }
            finally { samples.push(performance.now() - started); }
        };
    };
    timed(discovery, 'commitClanObservation', original.observe, profiling.observation);
    timed(visibility, 'traceTerrainSightline', original.sightline, profiling.sightlines);
    timed(mechanics, 'stepMechanicsTick', original.tick, profiling.cpuTicks,
        args => args[0].clan.id === 'island-rival');
    core.applyCommand = (input, command, context) => {
        if (!committing) return original.apply(input, command, context);
        const inputHash = coreDigest(input);
        const started = performance.now();
        let result;
        try { result = original.apply(input, command, context); }
        catch (error) {
            trace.commands.push({ command: structuredClone(command), rejected: String(error),
                context: context && { worldId: context.worldId, exclusions: structuredClone(context.exclusions) },
                before: inputHash, after: coreDigest(input), milliseconds: performance.now() - started });
            assert.equal(coreDigest(input), inputHash, 'A rejected order cannot mutate its input.');
            throw error;
        }
        const milliseconds = performance.now() - started;
        assert.equal(coreDigest(input), inputHash, 'Committed commands also keep their inputs immutable.');
        trace.commands.push({ command: structuredClone(command),
            context: context && { worldId: context.worldId, exclusions: structuredClone(context.exclusions) },
            before: inputHash, after: coreDigest(result), milliseconds });
        return result;
    };
    const command = value => {
        committing = true;
        try { shared.session.command(value); }
        finally { committing = false; }
    };
    const state = () => shared.session.readSnapshot();
    const mission = group => Object.values(state().world.spatial?.missions ?? {})
        .find(item => item.groupId === group && item.status !== 'Returned');
    const checkpoint = name => {
        const before = shared.session.saveJSON();
        const saved = shared.persist();
        shared = SharedSettlement.restore(saved, 'fjord');
        assert.equal(shared.session.saveJSON(), before, name + ': exact Core save/restore');
        assert.equal(shared.session.running, false, name + ': loading stays paused');
        assert.equal(digest(shared.fjord.blueprint), initialWorldHash, name + ': no geography reroll');
        assertClanIdentity(state());
        trace.checkpoints.push({ name, afterCommand: trace.commands.length,
            coreSha256: coreDigest(state()), saveBytes: Buffer.byteLength(saved),
            exploredCells: knowledgeCount(state()), visibleCells: knowledgeCount(state(), 'visible') });
    };
    try {
        assertClanIdentity(initial);
        assert.equal(shared.fjord.readProjection().rival.known, false);
        const crew = core.inspectWorld(initial).eligible.slice(0, 2).map(person => person.id);
        assert.equal(crew.length, 2);
        for (const [index, id] of crew.entries()) {
            command({ type: 'CreateExplorationGroup' });
            const groupId = 'group-' + (index + 1);
            if (index === 1) {
                assert.throws(() => command({ type: 'SetExplorationMember', groupId,
                    personaId: crew[0], included: true }), /eligible|group/i);
            }
            command({ type: 'SetExplorationMember', groupId, personaId: id, included: true });
            const food = state().stocks.food;
            const known = structuredClone(state().discovery);
            command({ type: 'StartExpedition', groupId });
            assert.equal(state().stocks.food, food - 2);
            assert.deepEqual(state().discovery, known, 'Packing must not map a planned destination.');
        }
        const entities = shared.fjord.readProjection().entities;
        const origins = Object.fromEntries(crew.map(id => {
            const transform = entities.find(entity => entity.kind === 'persona' && entity.id === id).transform;
            assert.ok(transform, 'The actual founding resident needs a physical origin.');
            return [id, { x: transform.x, z: transform.z }];
        }));
        const route = siteRoutes(world.navigation, origins[crew[0]])(world.rivalSite.center);
        assert.ok(route.length > 60, 'Use the actual validated route toward the other valley.');
        const known = discovery.inspectClanDiscovery(initial.discovery, initial.clan.id);
        const firstUnknown = route.findIndex(point => discovery.discoveryAt(known, point.x, point.z) === 'unknown');
        assert.ok(firstUnknown > 0);
        const localIndex = Math.min(Math.max(60, firstUnknown + 8), route.length - 1);
        const goals = encounter ? route.filter((_point, index) => index > 0 && index % 40 === 0) :
            [route[localIndex]];
        if (encounter) goals.push(world.rivalSite.center);
        const shortGoal = route[Math.min(24, route.length - 1)];
        const firstOrigin = { [crew[0]]: origins[crew[0]] };
        const secondOrigin = { [crew[1]]: origins[crew[1]] };
        command({ type: 'ExploreArea', groupId: 'group-1', target: goals[0], origins: firstOrigin });
        command({ type: 'ExploreArea', groupId: 'group-2', target: shortGoal, origins: secondOrigin });
        assert.deepEqual(state().discovery, initial.discovery, 'Dispatch reveals no corridor.');
        command({ type: 'AdvanceTicks', ticks: 12 });
        checkpoint('two-groups-traveling');
        command({ type: 'RecallExpedition', groupId: 'group-2' });
        let nextGoal = 1, observedAt = null, observedProjection = null, observedSave = null;
        for (let ticks = 16; ticks <= 600; ticks += 4) {
            command({ type: 'AdvanceTicks', ticks: 4 });
            const view = shared.fjord.readProjection();
            if (view.rival.currentlyObserved && observedAt === null) {
                observedAt = ticks;
                observedProjection = structuredClone(view.rival);
                observedSave = shared.persist();
                checkpoint('rival-currently-observed');
                if (encounter && mission('group-1')?.status !== 'Returning')
                    command({ type: 'RecallExpedition', groupId: 'group-1' });
            }
            const current = mission('group-1');
            if (!current) break;
            if (current.status === 'Stranded') throw new Error('A validated local trip stranded on seed ' + seed);
            if (current.status === 'Exploring') {
                if (!encounter || observedAt !== null || nextGoal >= goals.length)
                    command({ type: 'RecallExpedition', groupId: 'group-1' });
                else command({ type: 'ExploreArea', groupId: 'group-1', target: goals[nextGoal++] });
            }
        }
        assert.ok(Object.values(state().world.spatial.missions).every(item => item.status === 'Returned'));
        assert.equal(shared.session.expeditionMode, false);
        assert.ok(knowledgeCount(state()) > initialExplored, 'Real travel must map new ground.');
        checkpoint('both-groups-returned');
        const final = shared.session.snapshot();
        const elapsedTicks = (final.time.winter - initial.time.winter) * final.ticksPerWinter +
            final.time.tick - initial.time.tick;
        const expectedCpu = original.apply(initial.world.targetClans['island-rival'],
            { type: 'AdvanceTicks', ticks: elapsedTicks });
        assert.deepEqual(final.world.targetClans['island-rival'], expectedCpu,
            'The CPU advances exactly once, independently of all projection and save reads.');
        const returned = Object.values(final.world.spatial.missions);
        for (const item of returned) {
            assert.equal(final.events.filter(event => event.type === 'ExploreAreaReturned' &&
                event.details?.missionId === item.id).length, 1, 'A journey cannot return twice.');
        }
        if (encounter && world.config.seed === 7) {
            assert.ok(observedAt !== null, 'The reachable rival must be observed by actual exploration.');
            assert.ok(observedProjection.entities.some(entity => entity.kind === 'persona'));
            assert.equal(shared.fjord.readProjection().rival.known, true);
            assert.equal(shared.fjord.readProjection().rival.currentlyObserved, false);
            assert.deepEqual(shared.fjord.readProjection().rival.entities, [], 'Mapped land is not live enemy intel.');
        }
        assert.equal(digest(world), initialWorldHash);
        trace.final = coreDigest(final);
        return { shared, world, trace, profiling, observedSave, summary: {
            seed, islandSeed: world.config.seed, elapsedTicks, commands: trace.commands.length,
            worldSha256: initialWorldHash, coreSha256: trace.final, initialExplored,
            exploredCells: knowledgeCount(final), observedAt, checkpoints: trace.checkpoints,
            cpuExact: true, groupsReturned: returned.length,
            encounter: observedAt !== null ? 'observed-then-mapped' : encounter ? 'not-reached' : 'local-exploration',
        } };
    } finally {
        core.applyCommand = original.apply;
        discovery.commitClanObservation = original.observe;
        visibility.traceTerrainSightline = original.sightline;
        mechanics.stepMechanicsTick = original.tick;
    }
}
