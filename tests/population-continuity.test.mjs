import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load-source.mjs';
const core = load('../src/simulation/SimulationCore.ts');

test('new default player campaigns agree on 15 Food without retuning CPU starts or founder assets', () => {
    const state = core.createCampaign(32);
    const oldRule = core.createCampaign(32, { initialFood: 30 });
    assert.equal(state.stocks.food, 15);
    assert.equal(state.landing.config.initialFood, 15);
    assert.equal(state.events[0].details.stocks.food, 15);
    assert.equal(state.stocks.materials, 5);
    assert.deepEqual(state.personas, oldRule.personas);
    assert.deepEqual(state.landing.cattle, oldRule.landing.cattle);
    assert.deepEqual(state.world.targetClans, oldRule.world.targetClans);
    assert.deepEqual(core.reconstructState(core.serializeState(state)), state);
});

test('Lab and shared game use the new default after import, while saved-rule restarts retain explicit Food', () => {
    const { GameplaySession } = load('../src/gameplay-lab/GameplaySession.ts');
    const { SharedSettlement } = load('../src/play/SharedSettlement.ts');
    const old = core.createCampaign(32, { initialFood: 30 });
    old.stocks.food = 47;
    const saved = core.serializeState(old);
    const lab = new GameplaySession();
    assert.equal(lab.book.snapshot().chapters[0].facts.stocks.food, 15);
    lab.loadJSON(saved);
    assert.equal(lab.snapshot().stocks.food, 47);
    assert.equal(lab.snapshot().landing.config.initialFood, 30);
    lab.restartCampaign(true);
    assert.equal(lab.snapshot().stocks.food, 30);
    lab.newCampaign(32);
    assert.equal(lab.snapshot().stocks.food, 15);
    assert.equal(lab.book.snapshot().chapters[0].facts.stocks.food, 15);

    const shared = new SharedSettlement(32);
    shared.importJSON(saved);
    const book = shared.session.book.snapshot();
    const resumed = SharedSettlement.restore(shared.persist(), 'fjord');
    assert.equal(resumed.session.snapshot().stocks.food, 47);
    assert.deepEqual(resumed.session.book.snapshot(), book);
    resumed.restart(true);
    assert.equal(resumed.session.snapshot().stocks.food, 30);
    resumed.newCampaign(32, true);
    assert.equal(resumed.session.snapshot().stocks.food, 15);
    assert.equal(resumed.session.snapshot().events[0].details.stocks.food, 15);
    assert.equal(resumed.session.book.snapshot().chapters[0].facts.stocks.food, 15);
    for (const amount of [0, 9, 30, 400]) {
        const custom = core.createCampaign(32, { initialFood: amount });
        assert.equal(custom.stocks.food, amount);
        assert.equal(custom.landing.config.initialFood, amount);
        assert.equal(core.reconstructState(core.serializeState(custom)).stocks.food, amount);
    }
});

test('annual diagnostic output observes real decisions without changing Core events, RNG or save/load', async () => {
    const { populationEngine } = await import('../scripts/qa/population-engine.mjs');
    const engine = populationEngine('baseline15');
    const initial = engine.create(32);
    const canonical = core.applyCommand(initial, { type: 'AdvanceWinter' });
    const measured = engine.advance(initial, 1000);
    assert.deepEqual(measured, canonical);
    const rows = engine.drain().rows;
    assert.equal(rows.filter(row => row.kind === 'human-mortality').length, 10);
    assert.equal(rows.filter(row => row.kind === 'cattle-mortality').length, 3);
    assert.ok(rows.some(row => row.kind === 'fertility'));
    assert.ok(rows.every(row => row.winter === 801 && row.weatherWinter === 800));
    const partial = engine.advance(initial, 417);
    const resumed = engine.advance(engine.reconstruct(engine.serialize(partial)), 583);
    assert.deepEqual(resumed, canonical);
    assert.deepEqual(core.reconstructState(core.serializeState(measured)), measured);
});

test('zero Food is recorded as unmet cattle need but does not currently block unassigned breeding', async () => {
    const { populationEngine } = await import('../scripts/qa/population-engine.mjs');
    const engine = populationEngine('baseline15');
    let initial = engine.create(32, { landing: { initialFood: 0, cattleBirthChanceBps: 10000,
        cowFoodPerWinter: 0, cattleMortalityYoungBps: 0, cattleMortalityAdultBps: 0,
        cattleMortalityOlderBps: 0, cattleMortalityOldBps: 0, cattleCrowdingBps: 0 },
        mechanics: { mortalityBands: [{ minAge: 0, chanceBps: 0 }], fertilityChanceBps: 0,
            partnershipChanceBps: 0, careerReviewWinters: 0 }, weather: { enabled: false } });
    for (const id of Object.keys(initial.personas)) initial = core.applyCommand(initial,
        { type: 'AssignOccupation', personaId: id, occupation: null });
    const next = engine.advance(initial);
    const rows = engine.drain().rows;
    assert.equal(rows.find(row => row.kind === 'feeding').cattle.shortfall, 3);
    assert.equal(next.events.filter(e => e.type === 'CattleBorn').length, 2);
    const decisions = rows.filter(row => row.kind === 'cattle-breeding');
    assert.equal(decisions.length, 2);
    assert.ok(decisions.every(row => row.firstBlocker === 'born' && row.farmyardId === null && row.cattleShortfall === 3));
});

test('annual cattle exposure uses each outgoing weather profile once, with soft-cap shelter and disabled weather', async () => {
    const { populationEngine } = await import('../scripts/qa/population-engine.mjs');
    const engine = populationEngine();
    const quiet = { mortalityBands: [{ minAge: 0, chanceBps: 0 }], fertilityChanceBps: 0,
        partnershipChanceBps: 0, careerReviewWinters: 0 };
    const cattle = { initialFood: 100, initialMaterials: 100, foundingCoupleChanceBps: 0,
        cattleBirthChanceBps: 0, cattleMortalityYoungBps: 0, cattleMortalityAdultBps: 0,
        cattleMortalityOlderBps: 0, cattleMortalityOldBps: 0, farmyardCapacity: 2 };
    for (const [kind, risk] of [['Mild', 0], ['Normal', 0], ['Harsh', 500], ['Severe', 1500], ['Disabled', 0]]) {
        const profiles = structuredClone(core.defaultWeatherConfig.profiles);
        for (const [name, profile] of Object.entries(profiles)) {
            profile.probabilityBps = name === (kind === 'Disabled' ? 'Normal' : kind) ? 10000 : 0;
            profile.tentMortalityBps = 0;
        }
        const initial = engine.create(32, { landing: cattle, mechanics: quiet,
            weather: { enabled: kind !== 'Disabled', profiles } });
        engine.advance(initial);
        const outside = engine.drain().rows.filter(row => row.kind === 'cattle-mortality');
        assert.equal(outside.length, 3);
        assert.ok(outside.every(row => row.risk === risk && row.exposureBps === risk));
        if (kind !== 'Disabled') assert.ok(outside.every(row => row.weatherWinter === 800 && row.winter === 801));
        let housed = core.applyCommand(initial, { type: 'AssignOccupation', personaId: 'founder-1', occupation: 'farmer' });
        housed = core.applyCommand(housed, { type: 'BuildHouse', householdId: 'founder-1' });
        for (const id of Object.keys(housed.landing.cattle)) housed = core.applyCommand(housed,
            { type: 'AssignCattle', cattleId: id, farmyardId: 'house-1' });
        engine.advance(housed);
        const inside = engine.drain().rows.filter(row => row.kind === 'cattle-mortality');
        assert.ok(inside.every(row => row.sheltered && row.exposureBps === 0 && row.overcrowding === 1 && row.risk === 200));
        const inactive = core.applyCommand(housed, { type: 'AssignOccupation', personaId: 'founder-1', occupation: 'hunter' });
        engine.advance(inactive);
        assert.ok(engine.drain().rows.filter(row => row.kind === 'cattle-mortality')
            .every(row => !row.sheltered && row.farmyardId === null && row.risk === risk));
    }
});

test('last farmer death exposes cattle before the same mortality boundary and dead cattle stop eating and producing', () => {
    const profiles = structuredClone(core.defaultWeatherConfig.profiles);
    for (const [name, profile] of Object.entries(profiles)) {
        profile.probabilityBps = name === 'Severe' ? 10000 : 0;
        profile.exposedCattleMortalityBps = 10000;
        profile.tentMortalityBps = 0;
    }
    let initial = core.createCampaign(32, { initialFood: 1000, initialMaterials: 100,
        foundingCoupleChanceBps: 0, cattleBirthChanceBps: 0, cattleMortalityYoungBps: 0,
        cattleMortalityAdultBps: 0, cattleMortalityOlderBps: 0, cattleMortalityOldBps: 0 },
        { mortalityBands: [{ minAge: 0, chanceBps: 0 }, { minAge: 90, chanceBps: 10000 }],
            fertilityChanceBps: 0, partnershipChanceBps: 0, careerReviewWinters: 0 }, { profiles });
    initial = core.applyCommand(initial, { type: 'AssignOccupation', personaId: 'founder-1', occupation: 'farmer' });
    initial = core.applyCommand(initial, { type: 'BuildHouse', householdId: 'founder-1' });
    initial = core.applyCommand(initial, { type: 'AssignCattle', cattleId: 'cattle-1', farmyardId: 'house-1' });
    const sheltered = core.advanceWinter(initial);
    assert.equal(sheltered.landing.cattle['cattle-1'].deathWinter, null);
    initial.personas['founder-1'].birthWinter = 711;
    const exposed = core.advanceWinter(core.reconstructState(core.serializeState(initial)));
    assert.equal(exposed.personas['founder-1'].deathWinter, 801);
    assert.ok(Object.values(exposed.landing.cattle).every(c => c.deathWinter === 801));
    assert.equal(exposed.events.find(e => e.type === 'CattleFoodConsumed').details.required, 0);
    const deaths = exposed.events.filter(e => e.type === 'CattleDied');
    assert.ok(deaths.every(e => e.details.weatherWinter === 800 && e.details.weatherExposureBps === 10000));
    const next = core.advanceWinter(exposed);
    assert.equal(next.events.slice(exposed.events.length).some(e => e.type === 'CattleFoodProduced'), false);
});

test('well-fed mothers can have a third and fourth child while own care and two complete cooldown Winters remain distinct', () => {
    let state = core.createSettlement(41, { fertilityChanceBps: 10000, partnershipChanceBps: 0,
        careerReviewWinters: 0, mortalityBands: [{ minAge: 0, chanceBps: 0 }] });
    state.stocks.food = 10000;
    for (let year = 0; year < 9; year++) state = core.advanceWinter(state);
    const births = state.events.filter(e => e.type === 'ChildBorn' && e.details.parentIds.includes('liv'));
    assert.deepEqual(births.map(e => e.time.winter), [803, 806, 809]);
    assert.equal(Object.values(state.personas).filter(p => p.parentIds.includes('liv')).length, 4);
    assert.equal(state.mechanics.people.liv.childcareUntilWinter, 814);
    const { GameplaySession } = load('../src/gameplay-lab/GameplaySession.ts');
    const session = new GameplaySession();
    session.loadJSON(core.serializeState(state));
    assert.equal(session.snapshot().personas[births[2].personaId].parentIds.includes('liv'), true);
    assert.equal(session.familyTree().nodes.find(p => p.id === 'liv').children.length, 4);
});

test('paired opening runs retain founder identity, exact stock accounting and replayable annual outcomes', async () => {
    const { runPopulationScenario } = await import('../scripts/qa/population-scenario.mjs');
    const old = runPopulationScenario({ seed: 32, candidate: 'control30', winters: 3 });
    const current = runPopulationScenario({ seed: 32, candidate: 'baseline15', winters: 3 });
    assert.equal(old.annual[0].food, 30);
    assert.equal(current.annual[0].food, 15);
    assert.equal(old.founderHash, current.founderHash);
    assert.equal(current.status, 'complete');
    assert.equal(current.annual.length, 4);
    assert.deepEqual(runPopulationScenario({ seed: 32, candidate: 'baseline15', winters: 3, resumeAt: 1 }), current);
    assert.ok(current.annual.slice(1).every(row => row.foodResidual === 0 && row.cattleResidual === 0));
    assert.equal(current.founders.length, 10);
    assert.ok(current.founders.every(person => person.arrivalAge >= 18 && person.arrivalAge <= 40));
    const bounded = runPopulationScenario({ seed: 32, winters: 80, maxCattle: 2 });
    assert.equal(bounded.status, 'resource-limit');
    assert.equal(bounded.annual.length, 1);
    assert.equal(bounded.annual[0].cattle, 3, 'study stops rather than capping the herd');
});

test('restarting a new 15-Food player campaign preserves separately configured CPU opening rules', () => {
    const { GameplaySession } = load('../src/gameplay-lab/GameplaySession.ts');
    const session = new GameplaySession(32);
    const initial = session.snapshot();
    session.restartCampaign(true);
    assert.deepEqual(session.snapshot(), initial);
});

test('human-only reserve experiment allows a birth that the cattle-inclusive gate blocks without changing saved defaults', async () => {
    const { populationEngine } = await import('../scripts/qa/population-engine.mjs');
    const baseline = populationEngine('baseline15'), proposal = populationEngine('human-reserve');
    let state = baseline.create(32, { landing: { initialFood: 43, cowFoodPerWinter: 0,
        cattleBirthChanceBps: 0, cattleMortalityYoungBps: 0, cattleMortalityAdultBps: 0,
        cattleMortalityOlderBps: 0, cattleMortalityOldBps: 0 },
        mechanics: { fertilityChanceBps: 10000, partnershipChanceBps: 0, careerReviewWinters: 0,
            mortalityBands: [{ minAge: 0, chanceBps: 0 }] }, weather: { enabled: false } });
    for (const id of Object.keys(state.personas)) state = core.applyCommand(state,
        { type: 'AssignOccupation', personaId: id, occupation: null });
    const unchanged = baseline.advance(state), changed = proposal.advance(state);
    assert.equal(unchanged.events.filter(e => e.type === 'ChildBorn').length, 0);
    assert.equal(changed.events.filter(e => e.type === 'ChildBorn').length, 1);
    assert.ok(baseline.drain().rows.some(r => r.firstBlocker === 'food' && r.humanNeed === 20 && r.reserveNeed === 23));
    assert.ok(proposal.drain().rows.some(r => r.firstBlocker === 'born' && r.reserveNeed === 20));
    assert.throws(() => baseline.reconstruct(proposal.serialize(changed)), /identity/);
    assert.equal(core.createCampaign(32).stocks.food, 15);
});

test('mortality proposal increases adult age and exposure risk while retaining child natural mortality and the old reserve gate', async () => {
    const { populationEngine } = await import('../scripts/qa/population-engine.mjs');
    const proposal = populationEngine('mortality');
    const state = proposal.create(32);
    assert.deepEqual(state.mechanics.config.mortalityBands.map(b => b.chanceBps), [10, 5, 150, 600, 1500, 3000, 6000]);
    assert.equal(state.weather.config.profiles.Harsh.tentMortalityBps, 200);
    assert.equal(state.weather.config.profiles.Severe.tentMortalityBps, 800);
    const baseline = core.createCampaign(32);
    assert.equal(baseline.mechanics.config.mortalityBands.find(b => b.minAge === 50).chanceBps, 50);
    proposal.advance(state);
    assert.ok(proposal.drain().rows.filter(r => r.kind === 'fertility').every(r => r.reserveNeed === r.humanNeed + r.cattleNeed));
});

test('feeding and yard-space proposals block only new breeding; existing cattle are never capped or culled', async () => {
    const { populationEngine } = await import('../scripts/qa/population-engine.mjs');
    const options = { landing: { initialFood: 0, initialMaterials: 100, cowFoodPerWinter: 0,
        foundingCoupleChanceBps: 0, cattleBirthChanceBps: 10000, cattleMortalityYoungBps: 0,
        cattleMortalityAdultBps: 0, cattleMortalityOlderBps: 0, cattleMortalityOldBps: 0, cattleCrowdingBps: 0 },
        mechanics: { fertilityChanceBps: 0, partnershipChanceBps: 0, careerReviewWinters: 0,
            mortalityBands: [{ minAge: 0, chanceBps: 0 }] }, weather: { enabled: false } };
    for (const candidate of ['feeding', 'yard-breeding']) {
        const engine = populationEngine(candidate);
        let state = engine.create(32, options);
        for (const id of Object.keys(state.personas)) state = core.applyCommand(state,
            { type: 'AssignOccupation', personaId: id, occupation: null });
        const blocked = engine.advance(state);
        assert.equal(Object.values(blocked.landing.cattle).filter(c => c.deathWinter === null).length, 3);
        assert.equal(blocked.events.some(e => e.type === 'CattleBorn'), false);
        assert.ok(engine.drain().rows.filter(r => r.kind === 'cattle-breeding')
            .every(r => r.rolled === null && r.firstBlocker === (candidate === 'feeding' ? 'feeding-shortfall' : 'no-yard-space')));
        state.stocks.food = 1000;
        state = core.applyCommand(state, { type: 'AssignOccupation', personaId: 'founder-1', occupation: 'farmer' });
        state = core.applyCommand(state, { type: 'BuildHouse', householdId: 'founder-1' });
        for (const id of Object.keys(state.landing.cattle)) state = core.applyCommand(state,
            { type: 'AssignCattle', cattleId: id, farmyardId: 'house-1' });
        const supported = engine.advance(state);
        assert.equal(supported.events.filter(e => e.type === 'CattleBorn').length, candidate === 'feeding' ? 2 : 1);
        assert.deepEqual(engine.advance(engine.reconstruct(engine.serialize(state))), supported);
    }
});

test('domestic measurements match complete-world domestic outcomes and keep CPU decisions out of player diagnostics', async () => {
    const { runPopulationScenario } = await import('../scripts/qa/population-scenario.mjs');
    const domestic = runPopulationScenario({ seed: 32, winters: 3, policy: 'herd' });
    const world = runPopulationScenario({ seed: 32, winters: 3, policy: 'herd', fullWorld: true });
    assert.equal(world.finalStateHash, domestic.finalStateHash);
    assert.deepEqual(world.annual, domestic.annual);
    assert.deepEqual(world.decisions, domestic.decisions);
});

test('study CLI writes auditable raw data and rejects unknown arguments without silently overwriting evidence', async () => {
    const { execFileSync } = await import('node:child_process');
    const { mkdtempSync, readFileSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const { gunzipSync } = await import('node:zlib');
    const { createHash } = await import('node:crypto');
    const directory = mkdtempSync(join(tmpdir(), 'population-study-'));
    const args = ['scripts/qa/run-population-study.mjs', '--seeds=32', '--candidates=baseline15',
        '--winters=1', '--workers=1', '--out='+directory];
    execFileSync(process.execPath,args);
    const manifest = JSON.parse(readFileSync(join(directory,'manifest.json')));
    assert.equal(manifest.observations.length,1);
    assert.equal(manifest.observations[0].status,'complete');
    const raw = readFileSync(join(directory,manifest.observations[0].file));
    assert.equal(createHash('sha256').update(raw).digest('hex'),manifest.observations[0].sha256);
    assert.equal(JSON.parse(gunzipSync(raw)).annual[0].food,15);
    assert.throws(()=>execFileSync(process.execPath,args,{stdio:'pipe'}));
    assert.throws(()=>execFileSync(process.execPath,['scripts/qa/run-population-study.mjs','--unknown=x'],{stdio:'pipe'}));
});
