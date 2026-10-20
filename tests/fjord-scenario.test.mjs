import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load-source.mjs';
import { livestockCandidate } from '../scripts/qa/livestock-candidates.mjs';

test('fresh Fjord scenarios roll only the four supplied species, with saved rules and independent founders', () => {
    const { newFjordScenario } = load('../src/fjord-play/FjordScenario.ts');
    const { GameplaySession } = load('../src/gameplay-lab/GameplaySession.ts');
    const core = load('../src/simulation/SimulationCore.ts');
    const observed = new Set();
    for (let seed = 0; seed < 32; seed++) {
        const session = newFjordScenario(seed);
        const state = session.snapshot();
        const control = new GameplaySession(seed, undefined, true, 'summer-800-v1').snapshot();
        assert.deepEqual(state.personas, control.personas);
        assert.deepEqual(state.stocks, { food: 15, materials: 5 });
        assert.deepEqual(state.time, { winter: 800, tick: 500 });
        assert.equal(state.rngState, control.rngState);
        assert.deepEqual(state.landing.livestock.founding.species, ['cattle', 'pig', 'sheep', 'goat']);
        assert.deepEqual(state.landing.livestock, { ...livestockCandidate,
            founding: { version: 1, species: ['cattle', 'pig', 'sheep', 'goat'] } });
        const animals = Object.values(state.landing.cattle);
        assert.equal(animals.length, 3);
        assert.deepEqual(animals.map(animal => animal.sex), ['female', 'female', 'male']);
        assert.equal(new Set(animals.map(animal => animal.species)).size, 1);
        observed.add(animals[0].species);
        for (const animal of animals) assert.equal(core.inspectLivestock(state, animal.id).stage, 'Adult');
        assert.deepEqual(core.reconstructState(core.serializeState(state)), state);
        assert.deepEqual(session.restartProposal().snapshot(), state);
        for (const target of Object.values(state.world.targetClans))
            assert.ok(['cattle', 'pig', 'sheep', 'goat'].includes(Object.values(target.landing.cattle)[0].species));
    }
    assert.deepEqual([...observed].sort(), ['cattle', 'goat', 'pig', 'sheep']);
    assert.notDeepEqual(newFjordScenario(32).snapshot().personas, newFjordScenario(33).snapshot().personas);
});

test('four-species physical rivals exclude the player species; invalid saved pools fail closed', () => {
    const { newFjordScenario } = load('../src/fjord-play/FjordScenario.ts');
    const core = load('../src/simulation/SimulationCore.ts');
    const bounds = { minX: 0, maxX: 512, minZ: 0, maxZ: 256 };
    // Species policy fixture only: the existing route/terrain tests own physical reachability.
    const landscape = {
        waterLevel: -1,
        terrain: { bounds, spacing: 8, columns: 65, rows: 33, heights: Array(2145).fill(0) },
        navigation: { bounds, spacing: 8, columns: 65, rows: 33, cells: Array(2145).fill(true) },
        settlement: { center: { x: 64, z: 128 }, harbor: null },
        rivalSite: { version: 1, candidateId: 'rival-pocket', center: { x: 352, z: 128 },
            bounds: { minX: 288, maxX: 416, minZ: 64, maxZ: 192 } },
    };
    for (let seed = 1; seed <= 8; seed++) {
        const state = core.initializeIslandClans(newFjordScenario(seed).snapshot(), landscape, 'pool-policy');
        const rival = state.world.targetClans['island-rival'];
        const playerSpecies = Object.values(state.landing.cattle)[0].species;
        const rivalSpecies = Object.values(rival.landing.cattle)[0].species;
        assert.notEqual(rivalSpecies, playerSpecies);
        assert.ok(['cattle', 'pig', 'sheep', 'goat'].includes(rivalSpecies));
        assert.equal(rival.stocks.food, 30);
        assert.equal(rival.landing.livestock.founding.excludedSpecies, playerSpecies);
        assert.deepEqual(core.reconstructState(core.serializeState(state)), state);
    }
    for (const pool of [[], ['cattle'], ['pig', 'pig'], ['cattle', 'dragon']]) {
        const bad = newFjordScenario(1).snapshot();
        bad.landing.livestock.founding.species = pool;
        assert.throws(() => core.serializeState(bad), /species pool/);
    }
});
