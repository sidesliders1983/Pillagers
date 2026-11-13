import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { loadTypeScript } from './load-typescript.mjs';
import { core, personalArmorApply as apply, craftedPersonalArmorFixture } from '../tests/personal-armor-fixture.mjs';
import { metalworkingContext } from '../tests/metalworking-fixture.mjs';

const { pillageEquipment, equipmentCasualtyRisk, equipmentSpearBonus } =
    loadTypeScript(new URL('../src/simulation/Smithery.ts', import.meta.url));
const { randomUint } = loadTypeScript(new URL('../src/simulation/Random.ts', import.meta.url));
const samples = Number(process.argv[2] ?? 128);
if (!Number.isSafeInteger(samples) || samples < 1 || samples > 10000) throw new Error('Choose 1-10000 matched seeds.');
const seedGenerator = { rngState: 0x333224 };
const seeds = Array.from({ length: samples }, () => randomUint(seedGenerator));
const output = new URL('../docs/qa/personal-armor-333/balance.json', import.meta.url);
const memberIds = ['founder-1', 'founder-2'];
const started = performance.now();
let base = craftedPersonalArmorFixture();
// The remaining real mature animal supplies the existing leather-shield recipe.
const animal = Object.values(base.landing.cattle).find(value => value.deathWinter === null &&
    base.landing.livestock.hides[value.species] > 0 && base.time.winter - value.birthWinter >= 2);
assert.ok(animal, 'The pinned source must still contain a real hide-bearing adult');
base = apply(base, { type: 'SlaughterLivestock', livestockId: animal.id });
base = apply(base, { type: 'AssignOccupation', personaId: memberIds[0], occupation: 'smith' });
for (const item of ['woodenSpear', 'woodenShield']) base = apply(base, { type: 'SetSmitheryTarget', item, target: 1 });
base = apply(base, { type: 'AdvanceTicks', ticks: 100 });
base = apply(base, { type: 'AssignOccupation', personaId: memberIds[0], occupation: 'leatherAndJewelleryMaker' });
base = apply(base, { type: 'SetSmitheryTarget', item: 'leatherShield', target: 1 });
base = apply(base, { type: 'AdvanceTicks', ticks: 100 });
for (const item of ['woodenSpear', 'woodenShield', 'leatherShield', 'ironSpear', 'ironShield', 'leatherBodyArmor', 'ironHelmet'])
    assert.equal(base.smithery.stored[item], 1, `Actual paid source stock for ${item}`);
base = apply(base, { type: 'EditExpeditionGroup', groupId: 'group-1', name: 'Matched named cohort', memberIds });
const region = Object.values(base.world.regions).find(value => value.targetClanId && !value.requiresShip);
base.world.config.successBps.Recon = 10000;
base.world.config.casualtyBps.Recon = 0;
base.world.config.durations.Recon = 1;
base = apply(base, { type: 'DispatchExpedition', groupId: 'group-1', regionId: region.id, mission: 'Recon' });
base = apply(base, { type: 'AdvanceTicks', ticks: 1 });
base.world.config.successBps.Pillage = 6000;
base.world.config.casualtyBps.Pillage = 1000;
base.world.config.durations.Pillage = 1;
assert.notEqual(base.time.tick, 999, 'A one-tick trial must not cross annual economy/mortality work');
const sourceStateDigest = createHash('sha256').update(core.serializeState(base)).digest('hex');
const productionProvenance = {
    sourceStateDigest,
    remainingStocks: { ...base.stocks, ...base.specialistStocks },
    actualStoredItems: base.smithery.stored,
    craftReceipts: base.events.filter(event => event.type === 'EquipmentCrafted'),
    ingredientReceipts: base.events.filter(event => ['IronOreExtracted', 'LivestockSlaughtered', 'CattleSlaughtered'].includes(event.type)),
};
if (process.argv.includes('--prepare-only')) {
    mkdirSync(dirname(fileURLToPath(output)), { recursive: true });
    writeFileSync(new URL('production-provenance.json', output), JSON.stringify(productionProvenance, null, 2) + '\n');
    console.log(JSON.stringify({ preparedSourceDigest: sourceStateDigest, actualItems: base.smithery.stored }));
    process.exit(0);
}
const profiles = [{ name: 'unarmed-unprotected', weapon: null, shield: null, bodyArmor: null, headgear: null }];
for (const weapon of ['woodenSpear', 'ironSpear']) for (const shield of [null, 'woodenShield', 'leatherShield', 'ironShield'])
    for (const [armorName, bodyArmor, headgear] of [
        ['none', null, null], ['body', 'leatherBodyArmor', null],
        ['helmet', null, 'ironHelmet'], ['both', 'leatherBodyArmor', 'ironHelmet'],
    ]) profiles.push({ name: `${weapon}/${shield ?? 'no-shield'}/${armorName}`, weapon, shield, bodyArmor, headgear });
let allyCasualtySeeds;
const results = [];
for (const profile of profiles) {
    let template = base;
    for (const slot of ['weapon', 'shield', 'bodyArmor', 'headgear']) if (profile[slot])
        template = apply(template, { type: 'AssignEquipment', personaId: memberIds[0], slot, item: profile[slot] });
    const snapshot = pillageEquipment(template, memberIds, 6000, 1000);
    assert.equal(snapshot.members[1].weapon, null);
    assert.equal(snapshot.members[1].shield, null);
    assert.equal(snapshot.members[1].casualtyBps, 1000);
    template = apply(template, { type: 'DispatchExpedition', groupId: 'group-1', regionId: region.id,
        mission: 'Pillage', priorities: ['Materials'] });
    const mission = Object.values(template.world.missions).at(-1);
    assert.deepEqual(mission.equipment, snapshot);
    const opening = core.serializeState(template);
    const wearerDeaths = [], allyDeaths = [], drawCounts = { 2: 0, 3: 0 };
    let successes = 0, lostItems = 0, example;
    const profileStarted = performance.now();
    for (const seed of seeds) {
        // Core clones this immutable input before work. Only the explicitly matched saved RNG seed changes.
        const trial = core.applyCommand({ ...template, rngState: seed }, { type: 'AdvanceTicks', ticks: 1 }, metalworkingContext);
        const returned = trial.world.missions[mission.id];
        assert.equal(returned.status, 'Returned');
        const outcome = returned.result;
        const wearerDied = outcome.casualtyIds.includes(memberIds[0]), allyDied = outcome.casualtyIds.includes(memberIds[1]);
        if (wearerDied) wearerDeaths.push(seed);
        if (allyDied) allyDeaths.push(seed);
        successes += Number(outcome.success);
        lostItems += outcome.equipment.lost.reduce((sum, member) => sum +
            [member.weapon, member.shield, member.bodyArmor, member.headgear].filter(Boolean).length, 0);
        const probe = { rngState: seed };
        randomUint(probe); randomUint(probe);
        const expectedDraws = outcome.survivorIds.length ? 3 : 2;
        if (expectedDraws === 3) randomUint(probe);
        assert.equal(trial.rngState, probe.rngState, 'Armor adds no independent chance roll or RNG stream');
        drawCounts[expectedDraws]++;
        if (!example || wearerDied && !example.wearerDied) example = { seed, wearerDied, finalRng: trial.rngState,
            outcome, lossReceipts: trial.events.filter(event => event.type === 'EquipmentLost' && event.details?.missionId === mission.id) };
    }
    assert.equal(core.serializeState(template), opening, 'Counterfactual outcomes cannot mutate another trial input');
    if (allyCasualtySeeds === undefined) allyCasualtySeeds = allyDeaths;
    else assert.deepEqual(allyDeaths, allyCasualtySeeds, 'Another wearer cannot change the unchanged ally casualty roll');
    const row = { ...profile, samples, successBps: snapshot.successBps,
        wearerCasualtyBps: snapshot.members[0].casualtyBps, allyCasualtyBps: 1000,
        onSiteIncomingBpsFromUnarmed250: equipmentCasualtyRisk(250, snapshot.members[0], template.smithery.config),
        onSiteOwnAttackBpsAgainstUnprotected: Math.min(10000, Math.floor(250 *
            (10000 + equipmentSpearBonus(profile.weapon, template.smithery.config)) / 10000)),
        successes, successPercent: 100 * successes / samples,
        wearerDeaths: wearerDeaths.length, wearerCasualtyPercent: 100 * wearerDeaths.length / samples,
        wearerCasualtySeeds: wearerDeaths, allyDeaths: allyDeaths.length, allyCasualtySeeds: allyDeaths,
        lostItems, drawCounts, elapsedMs: performance.now() - profileStarted, snapshot, example };
    results.push(row);
    console.log(JSON.stringify({ completed: results.length, total: profiles.length, profile: profile.name,
        wearerRiskBps: row.wearerCasualtyBps, wearerDeaths: row.wearerDeaths, samples, elapsedMs: Math.round(row.elapsedMs) }));
}
const sourceFiles = ['Smithery', 'Metalworking', 'PersonalArmor', 'Mining', 'SimulationCore', 'Mechanics', 'WorldExpeditions', 'Random', 'Mortality']
    .map(name => `src/simulation/${name}.ts`);
const sourceFingerprint = createHash('sha256').update(sourceFiles.map(path =>
    path + '\n' + readFileSync(new URL('../' + path, import.meta.url), 'utf8').replace(/\r\n/g, '\n')).join('\n')).digest('hex');
const report = {
    issue: 333, status: 'Owner-approved trial coefficients; bounded matched-cohort measurement, not complete combat or physical-device acceptance.',
    source: { finalCommit: null, prerequisiteCommit: '8374fac84e766aedf16131c1c246cddbecb13db9', fingerprint: sourceFingerprint, files: sourceFiles },
    command: `node scripts/calibrate-personal-armor.mjs ${samples}`,
    protocol: { samples, seeds, seedSchedule: 'Existing public randomUint LCG, fixed seed-schedule initial state 0x333224; these are counterfactual initial saved RNG states, not an extra in-game outcome stream.', memberIds,
        memberNames: memberIds.map(id => base.personas[id].name), changedWearer: memberIds[0], unchangedAlly: memberIds[1],
        sourceStateDigest, sourceTime: base.time, sourceSeed: base.seed, geometrySeed: 18,
        actualPipeline: 'Public scout, finite Mining, physical worker return, real eligible livestock slaughter, Smith/Leatherworker progress, targets, individual assignment, dispatch, and actual public Core AdvanceTicks return.',
        timing: 'Saved workPerUnit=100000 accelerates production; Recon and legacy Pillage durations are one tick for the comparison. No annual boundary, weather or additional source work outcome is crossed. Coefficients and same participant ordering remain real.',
        onSiteScope: 'The on-site columns are analytic evaluations of the shared public equipment risk/offense functions, not a second encounter resolver. Actual reached on-site four-slot/loss/interruption tests run separately.',
        samplingLimit: 'Small matched cohort exposes per-wearer direction and RNG conservation; it cannot certify fine balance or population-wide casualty frequencies.' },
    productionProvenance,
    rules: { baseLegacySuccessBps: 6000, baseLegacyCasualtyBps: 1000, onSiteUnequippedLethalityBps: 250,
        config: base.smithery.config,
        formulas: { legacy: 'base success + floor(sum of each actual spear bonus / crew count), capped at 10000. A wooden/iron spear gives 1000/1500 additive bps before averaging.',
            onSite: 'floor(base action lethality * (10000 + own spear bonus)/10000). Wooden/iron spear multipliers 1.10/1.15; no legacy victory roll is added.',
            protection: 'Actual shield * body * helmet remaining-risk factors; one product floor. Total reduction <= 60% uses a CEIL minimum remaining risk, preventing rounding-induced immunity at tiny nonzero base chances. Without new armor, original shield floor remains exact.',
            customPolicy: 'An old custom shield above 60% remains exact alone; equipping it together with new armor is explicitly rejected atomically.' } },
    parityRegressionEvidence: { suite: 'Separate executed public Core tests', cases: [
        { file: 'tests/metalworking.test.mjs', seeds: 100, contract: 'No iron worn: original v1 dispatch bytes, shared resolver result and final RNG unchanged.' },
        { file: 'tests/personal-armor.test.mjs', seeds: 100, contract: 'No armor worn, including actual iron gear: original v2 dispatch bytes, shared resolver result and final RNG unchanged.' },
    ] },
    elapsedMs: performance.now() - started, results,
};
mkdirSync(dirname(fileURLToPath(output)), { recursive: true });
writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
const rows = results.map(row => `| ${row.name} | ${(row.wearerCasualtyBps / 100).toFixed(2)}% | ${row.wearerDeaths}/${samples} | ${row.allyDeaths}/${samples} | ${(row.successBps / 100).toFixed(2)}% | ${row.successes}/${samples} |`);
const markdown = `# Personal armor matched-cohort balance - #333

Owner-approved playtest values, 13 November 2026. Source final commit remains unpinned;
algorithm fingerprint: ${sourceFingerprint}.

The same named wearer (${base.personas[memberIds[0]].name}) and unchanged unarmed ally
(${base.personas[memberIds[1]].name}) use ${samples} explicitly recorded matched uint32 seeds.
The existing public randomUint generator creates that reproducible seed schedule from 0x333224.
All seven item stocks come from real public crafting, finite extraction and eligible slaughter;
selectors grant nothing. Each trial uses actual Core dispatch and one-tick legacy return.
Production/mission timing is explicitly accelerated. This bounded cohort is not final physical
combat, performance or device acceptance.

Legacy success is **additive and averaged**: one wooden spear in this two-person crew raises
60% to 65%; one iron spear raises it to 67.5%. If every crew member holds one, the same formula
gives 70%/75%. On-site attacks instead multiply the actual holder's 250 bps action by 1.10/1.15,
yielding 275/287 bps. No legacy success bonus is applied a second time to on-site combat.

Protection combines actual wearer factors once. Armor plus helmet yields 28% reduction without
a shield, 46% with wood, 56.8% with leather, and 60% capped with iron. A conservative **CEIL on
minimum remaining risk** enforces the 60% cap even for tiny nonzero chances. A saved custom
shield above 60% remains unchanged without armor; its unsupported armor combination is rejected
explicitly.

| Wearer loadout | Derived wearer casualty | Observed wearer deaths | Unchanged ally deaths | Derived crew success | Observed successes |
| --- | ---: | ---: | ---: | ---: | ---: |
${rows.join('\n')}

The ally's exact casualty seed set is asserted equal across every profile. Each canonical trial
consumes exactly two casualty rolls plus one success roll when anyone survives. Different gear
may legitimately prevent an all-dead outcome and therefore retain the existing success roll;
it adds no independent armor roll. Separate 100-seed no-iron/no-armor regression tests preserve
old snapshot bytes, outcomes and RNG.

The on-site columns in the JSON are analytical evaluations of the shared public functions.
The actual reached on-site four-slot, loss and interrupted-save journeys are covered separately
by tests/personal-armor-encounter.test.mjs. This report does not replace those journeys or
physical iPhone acceptance. Reproduce with:

    node scripts/calibrate-personal-armor.mjs ${samples}
`;
writeFileSync(new URL('balance.md', output), markdown);
console.log(JSON.stringify({ report: fileURLToPath(output), samples, scenarios: results.length, elapsedMs: Math.round(report.elapsedMs) }));
