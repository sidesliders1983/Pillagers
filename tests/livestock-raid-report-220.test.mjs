import test from 'node:test';
import assert from 'node:assert/strict';
import { core, knownRival, raid, context } from './livestock-raid-fixture.mjs';
import { loadTypeScript } from '../scripts/load-typescript.mjs';
import { replayLivestockTransfers } from '../scripts/qa/livestock-transfer-replay.mjs';

test('actual raid reports distinguish immutable arrival facts from current breeding age and never grant home ownership early', () => {
    let state = raid(knownRival());
    const donorId = Object.keys(state.world.targetClans['island-rival'].landing.cattle).sort()[0];
    state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 250 }, context);
    assert.equal(state.landing.cattle[donorId], undefined);
    assert.ok(state.world.targetClans['island-rival'].landing.cattle[donorId]);
    const saved = core.serializeState(state);
    const restored = core.reconstructState(saved);
    const expected = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 250 }, context);
    state = core.applyCommand(restored, { type: 'AdvanceTicks', ticks: 250 }, context);
    assert.deepEqual(state, expected);
    const missionId = Object.keys(state.world.spatial.missions).at(-1);
    const rows = core.inspectIslandMissionLivestock(state, missionId);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].id, donorId);
    assert.equal(rows[0].current.species, 'cattle');
    assert.equal(rows[0].current.breedingAge, 'within-window');
    const returnedFact = structuredClone(rows[0].atReturn);
    const event = structuredClone(state.events.find(event => event.type === 'ExpeditionReturned' &&
        event.details.missionId === missionId));
    assert.equal(state.world.targetClans['island-rival'].landing.cattle[donorId], undefined);
    assert.equal(new Set(Object.values(state.landing.cattle).map(animal => animal.id)).size,
        Object.keys(state.landing.cattle).length);
    state = core.applyCommand(state, { type: 'SlaughterLivestock', livestockId: donorId });
    const after = core.inspectIslandMissionLivestock(state, missionId)[0];
    assert.equal(after.current.breedingAge, 'deceased');
    assert.deepEqual(after.atReturn, returnedFact);
    assert.deepEqual(state.events.find(candidate => candidate.id === event.id), event);
});

test('six source-pinned real raids retain actual animal identities, donor changes, clocks and exact interrupted-save outcomes', async () => {
    const result = await replayLivestockTransfers();
    assert.deepEqual(result.rows.map(row => row.species), ['cattle', 'chicken', 'pig', 'sheep', 'goat', 'goose']);
    assert.ok(result.rows.every(row => row.status === 'PASS'));
});

test('a successful raid without livestock reports receipt separately and exposes no invented donor explanation', () => {
    const { renderMissionLivestock } = loadTypeScript(new URL('../src/play/MissionLivestockView.ts', import.meta.url));
    const departed = raid(knownRival(), ['Food']);
    assert.deepEqual(core.inspectIslandMissionLivestock(departed,
        Object.keys(departed.world.spatial.missions).at(-1)), []);
    const state = core.applyCommand(departed, { type: 'AdvanceTicks', ticks: 500 }, context);
    const missionId = Object.keys(state.world.spatial.missions).at(-1);
    const result = state.world.spatial.missions[missionId].task.result;
    assert.equal(result.success, true);
    assert.deepEqual(result.cattleIds, []);
    assert.match(renderMissionLivestock(state, missionId), /No livestock was recovered/);
    assert.doesNotMatch(renderMissionLivestock(state, missionId), /no living stock|capacity|extinct/i);
});

test('a genuinely born and raided young animal can mature while its immutable return receipt stays young', () => {
    const profile = { youngAdultAge: 1, adultAge: 2, adultFood: 1, youngFood: 0,
        femaleFoodPerWinter: 4, maleFoodPerWinter: 0, femaleMaterialsPerWinter: 0, maleMaterialsPerWinter: 0,
        exposedProductivityBps: 5000, youngSlaughterFood: 2, youngAdultSlaughterFood: 4, slaughterFood: 8,
        birthChanceBps: 10000, fertileMinAge: 2, fertileMaxAge: 6, birthInterval: 2,
        mortalityBands: [{ minAge: 0, chanceBps: 0 }], crowdingBps: 0, weatherMortalityBps: 0,
        capacityWeightBps: 10000 };
    const rules = { version: 2, founding: { version: 1 },
        profiles: Object.fromEntries(['chicken', 'pig', 'sheep', 'goat', 'goose'].map(species => [species, profile])),
        breeding: { requireFed: false, capacityLimited: true, unassignedCapacityUnits: 40000 },
        hides: { cattle: 1, chicken: 0, pig: 1, sheep: 1, goat: 1, goose: 0 } };
    let state = core.applyCommand(knownRival(rules), { type: 'AdvanceTicks', ticks: 1000 }, context);
    let donor = state.world.targetClans['island-rival'];
    const young = Object.values(donor.landing.cattle).filter(animal => animal.origin === 'reproduction' && animal.deathWinter === null);
    assert.ok(young.length, 'This explicit contract fixture must produce actual offspring');
    // Fixture preparation uses real donor slaughter commands after real births. The
    // player's raid still uses the unmodified first-live-ID selector and real route.
    for (const animal of Object.values(donor.landing.cattle).filter(animal => animal.origin === 'founding' && animal.deathWinter === null))
        donor = core.applyCommand(donor, { type: 'SlaughterLivestock', livestockId: animal.id });
    state.world.targetClans['island-rival'] = donor;
    state = core.applyCommand(raid(state), { type: 'AdvanceTicks', ticks: 500 }, context);
    const missionId = Object.keys(state.world.spatial.missions).at(-1);
    let row = core.inspectIslandMissionLivestock(state, missionId)[0];
    assert.ok(young.some(animal => animal.id === row.id));
    assert.equal(row.current.breedingAge, 'young');
    const fact = structuredClone(row.atReturn);
    state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 2000 }, context);
    row = core.inspectIslandMissionLivestock(state, missionId)[0];
    assert.equal(row.current.breedingAge, 'within-window');
    assert.deepEqual(row.atReturn, fact);
    state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 5000 }, context);
    row = core.inspectIslandMissionLivestock(state, missionId)[0];
    assert.equal(row.current.breedingAge, 'past-window');
    assert.deepEqual(row.atReturn, fact);
});
