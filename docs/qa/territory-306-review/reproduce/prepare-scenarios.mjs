import assert from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { loadSource, digest } from './fixture-tools.mjs';

const directory = fileURLToPath(new URL('./', import.meta.url));
const sourceRoot = process.env.PROFILE_SOURCE_ROOT || process.cwd();
const label = process.env.PROFILE_LABEL || 'prepared';
const api = await loadSource(sourceRoot);
const report = { status: 'running', label, pin: api.pin, scenarios: [], blockers: [] };
function differentPaths(expected, actual, path = '', result = []) {
    if (result.length >= 12 || isDeepStrictEqual(expected, actual)) return result;
    if (!expected || !actual || typeof expected !== 'object' || typeof actual !== 'object') {
        result.push({ path, expected: typeof expected === 'string' ? expected.slice(0, 100) : expected,
            actual: typeof actual === 'string' ? actual.slice(0, 100) : actual });
        return result;
    }
    for (const key of new Set([...Object.keys(expected), ...Object.keys(actual)])) {
        differentPaths(expected[key], actual[key], path + '/' + key, result);
        if (result.length >= 12) break;
    }
    return result;
}
const thresholds = process.env.PROFILE_THRESHOLDS ? process.env.PROFILE_THRESHOLDS.split(',').map(Number) : [50, 100];
for (const threshold of thresholds) {
    const baseText = await readFile(new URL('population-' + threshold + '.shared.json', import.meta.url), 'utf8');
    for (const groups of [1, 2]) {
        const common = api.SharedSettlement.restore(baseText, 'fjord');
        common.fjord.project();
        const members = api.core.inspectWorld(common.session.readSnapshot()).eligible.slice(0, groups * 2);
        assert.equal(members.length, groups * 2);
        for (let index = 0; index < groups; index++) common.session.command({
            type: 'CreateExpeditionGroup', name: 'Review visitors ' + (index + 1),
            memberIds: members.slice(index * 2, index * 2 + 2).map(person => person.id),
        });
        const commonText = common.persist();
        const enabled = api.SharedSettlement.restore(commonText, 'fjord');
        const disabled = api.SharedSettlement.restore(commonText, 'fjord');
        try { enabled.fjord.enableTerritorialAwareness(); }
        catch (error) {
            report.blockers.push({ threshold, groups, stage: 'public territory adoption', error: String(error.stack || error) });
            console.log('adoption-blocked', threshold, groups, String(error));
            continue;
        }
        for (const shared of [enabled, disabled]) {
            const beforeProjection = shared.session.saveJSON();
            shared.fjord.project();
            assert.ok(shared.session.saveJSON() === beforeProjection, 'Public projection leaves Core unchanged');
        }
        const prefix = label + '-population-' + threshold + '-groups-' + groups;
        let commonPhysicalContext;
        if (process.env.PROFILE_COMMON_CONTEXT) {
            const physical = api.context(enabled);
            commonPhysicalContext = { worldId: physical.worldId, exclusions: physical.exclusions,
                source: 'Actual adopted public Fjord projection, shared unchanged with the disabled variant through GameplaySession.bindPhysicalWorld before dispatch.',
                note: 'At100 threshold this controls two previously missing cosmetic vacant-house plots. No Core/persona/event/body state is inserted.' };
            await writeFile(new URL(prefix + '-physical-context.json', import.meta.url), JSON.stringify(commonPhysicalContext, null, 2));
            for (const shared of [enabled, disabled]) shared.session.bindPhysicalWorld(api.world,
                physical.worldId, () => physical.exclusions);
        }
        const state = enabled.session.readSnapshot();
        const origins = Object.fromEntries(members.map(person => {
            const presence = api.core.inspectResidentPresence(state, person.id);
            assert.ok(presence, 'An actual outdoor canonical departure exists for the crew');
            return [person.id, { ...presence.position }];
        }));
        assert.equal(state.rngState, disabled.session.readSnapshot().rngState);
        assert.deepEqual(state.mechanics.config, disabled.session.readSnapshot().mechanics.config);
        const targets = [{ x: 26, z: -64 }, { x: 20, z: -72 }];
        const offers = [];
        for (let index = 0; index < groups; index++) {
            const groupId = 'group-' + (index + 1);
            const crew = members.slice(index * 2, index * 2 + 2).map(person => person.id);
            const crewOrigins = Object.fromEntries(crew.map(id => [id, origins[id]]));
            for (const shared of [disabled, enabled]) {
                shared.session.command({ type: 'StartExpedition', groupId });
                const offer = shared.session.exploreOffer(groupId, targets[index], crewOrigins);
                offers.push({ enabled: shared === enabled, groupId, offer });
                shared.session.command({ type: 'ExploreArea', groupId, target: targets[index], origins: crewOrigins });
            }
        }
        const offState = disabled.session.readSnapshot(), onState = enabled.session.readSnapshot();
        for (const id of Object.keys(onState.world.spatial.missions)) {
            assert.deepEqual(onState.world.spatial.missions[id].memberRoutes, offState.world.spatial.missions[id].memberRoutes);
        }
        assert.equal(onState.rngState, offState.rngState);
        const files = {}, roundTrips = {};
        for (const [variant, shared] of [['disabled', disabled], ['enabled', enabled]]) {
            const beforeProjection = shared.session.saveJSON();
            shared.fjord.project();
            assert.ok(shared.session.saveJSON() === beforeProjection, 'Public projection leaves Core unchanged');
            const file = prefix + '-' + variant + '.shared.json', text = shared.persist();
            await writeFile(new URL(file, import.meta.url), text);
            const restored = api.SharedSettlement.restore(text, 'fjord');
            const restoredText = restored.persist();
            const expectedCore = JSON.parse(shared.session.saveJSON());
            const actualCore = JSON.parse(restored.session.saveJSON());
            roundTrips[variant] = { canonicalEqual: isDeepStrictEqual(expectedCore, actualCore),
                sharedByteEqual: restoredText === text,
                changedPaths: differentPaths(JSON.parse(text), JSON.parse(restoredText)) };
            if (!roundTrips[variant].sharedByteEqual) console.log('roundtrip-difference', threshold, groups, variant,
                JSON.stringify(roundTrips[variant]));
            assert.ok(roundTrips[variant].canonicalEqual, 'Canonical state must survive actual Shared save/load');
            files[variant] = { file, sha256: digest(text), sharedBytes: Buffer.byteLength(text),
                coreBytes: Buffer.byteLength(shared.session.saveJSON()) };
        }
        const scenario = { threshold, groups, files, time: onState.time, population: api.population(onState),
            groupMembers: members.map(person => ({ id: person.id, name: person.name })), origins, offers, roundTrips,
            physicalContextFile: commonPhysicalContext ? prefix + '-physical-context.json' : null };
        report.scenarios.push(scenario);
        await writeFile(new URL(label + '-scenario-report.json', import.meta.url), JSON.stringify(report, null, 2));
        console.log('scenario-prepared', threshold, groups, JSON.stringify(scenario.population));
    }
}
report.status = report.blockers.length ? 'blocked' : 'passed';
await writeFile(new URL(label + '-scenario-report.json', import.meta.url), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ status: report.status, label, scenarios: report.scenarios.length, blockers: report.blockers.length }));
