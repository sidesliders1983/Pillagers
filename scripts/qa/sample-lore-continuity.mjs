import { readFile, writeFile } from 'node:fs/promises';
import { loadTypeScript } from '../load-typescript.mjs';
const core = loadTypeScript(new URL('../../src/simulation/SimulationCore.ts', import.meta.url));
const { SharedSettlement } = loadTypeScript(new URL('../../src/play/SharedSettlement.ts', import.meta.url));
const output = 'docs/qa/lore-continuity/runtime-samples.json';
const measured = JSON.parse(await readFile(output, 'utf8'));
const samples = measured.slice(0, 3);
function observed(landing = {}, mechanics = {}) {
    const owner = new SharedSettlement(32, 7);
    const state = core.createCampaign(32, { initialFood: 1000, initialMaterials: 1000,
        cattleBirthChanceBps: 0, cattleCrowdingBps: 0, cattleMortalityYoungBps: 0,
        cattleMortalityAdultBps: 0, cattleMortalityOlderBps: 0, cattleMortalityOldBps: 0, ...landing },
        { fertilityChanceBps: 0, partnershipChanceBps: 0, careerReviewWinters: 0,
            mortalityBands: [{ minAge: 0, chanceBps: 0 }], ...mechanics }, { enabled: false });
    owner.importJSON(core.serializeState(state));
    // Plain imports correctly begin with partial founding facts; observed checkpoints use their complete accounts.
    const envelope = JSON.parse(owner.fjord.exportJSON());
    envelope.narrative.narrativeSeed = 7;
    owner.importJSON(JSON.stringify(envelope));
    return owner;
}
function sample(owner, scenario) { samples.push({ scenario: 'Controlled Core QA: ' + scenario,
    narrativeSeed: owner.session.book.snapshot().narrativeSeed, ...owner.session.book.snapshot().chapters.at(-1) }); }
const home = observed();
home.command({ type: 'BuildHouse', householdId: 'founder-9' });
home.command({ type: 'SpecializeBuilding', buildingId: 'house-1', occupation: 'woodworker' });
home.command({ type: 'AdvanceTicks', ticks: 20000 });
home.command({ type: 'UpgradeBuilding', buildingId: 'house-1' });
home.command({ type: 'AdvanceTicks', ticks: 5000 });
sample(home, 'construction recalled twenty Winters later');
const family = observed({}, { fertilityChanceBps: 10000 });
family.command({ type: 'AdvanceTicks', ticks: 19000 });
const birth = family.session.snapshot().events.find(event => event.type === 'ChildBorn');
family.command({ type: 'AssignOccupation', personaId: birth.personaId, occupation: 'smith' });
family.command({ type: 'AdvanceTicks', ticks: 1000 });
sample(family, 'birth recalled when the same child took up work');
const death = observed({}, { mortalityBands: [{ minAge: 0, chanceBps: 10000 }] });
death.command({ type: 'AdvanceTicks', ticks: 5000 });
sample(death, 'founder deaths with recorded arrival links');
const herd = observed({ cattleBirthChanceBps: 10000, cattleFertileMinAge: 8 });
herd.command({ type: 'AssignOccupation', personaId: 'founder-9', occupation: 'farmer' });
herd.command({ type: 'BuildHouse', householdId: 'founder-9' });
for (const cattleId of ['cattle-1', 'cattle-2', 'cattle-3'])
    herd.command({ type: 'AssignCattle', cattleId, farmyardId: 'house-1' });
herd.command({ type: 'AdvanceTicks', ticks: 10000 });
sample(herd, 'calves and their own mothers at the Farmyard');
const voyage = observed();
voyage.command({ type: 'AdvanceTicks', ticks: 4900 });
const region = Object.values(voyage.session.snapshot().world.regions).find(region => region.targetClanId && !region.requiresShip);
voyage.command({ type: 'CreateExpeditionGroup', name: 'The Western Crew', memberIds: ['founder-1'] });
voyage.command({ type: 'DispatchExpedition', groupId: 'group-1', regionId: region.id, mission: 'Recon' });
voyage.command({ type: 'AdvanceTicks', ticks: 5100 });
sample(voyage, 'return linked to the same earlier expedition');
const reserves = observed({ initialFood: 0 });
for (const persona of Object.values(reserves.session.snapshot().personas))
    reserves.command({ type: 'AssignOccupation', personaId: persona.id, occupation: 'woodworker' });
reserves.command({ type: 'AdvanceTicks', ticks: 5000 });
sample(reserves, 'complete shortage account');
for (const persona of Object.values(reserves.session.snapshot().personas))
    reserves.command({ type: 'AssignOccupation', personaId: persona.id, occupation: 'farmer' });
reserves.command({ type: 'AdvanceTicks', ticks: 5000 });
sample(reserves, 'later reserves with an older shortage callback');
const quiet = observed({ foundingCoupleChanceBps: 0 });
quiet.command({ type: 'AdvanceTicks', ticks: 5000 });
sample(quiet, 'fully observed quiet interval');
const partial = observed();
sample(partial, 'truthful partial founding after plain Core import');
await writeFile(output, JSON.stringify(samples, null, 2) + '\n');
console.log('Saved ' + samples.length + ' actual composed passages for review.');
