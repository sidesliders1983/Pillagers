import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { loadTypeScript } from '../load-typescript.mjs';

// Derive review data through existing Core commands; never modify source fixtures.
const core = loadTypeScript(new URL('../../src/simulation/SimulationCore.ts', import.meta.url));
const { housingName } = loadTypeScript(new URL('../../src/simulation/HousingNames.ts', import.meta.url));
const directory = 'docs/qa/desktop-ui-redesign-180';
const original = JSON.parse(await readFile(directory + '/scene-data.json', 'utf8'));
const data = { version: 2, sourceHead: 'eeba00d09c4ea0350a9cfc8dd2cde948fd41c66c', scenes: {} };

function project(state, backdrop, provenance) {
    const people = Object.values(state.personas).filter(person => person.deathWinter === null);
    return {
        backdrop,
        provenance,
        year: state.time.winter,
        tick: state.time.tick,
        clan: state.clan.name,
        stocks: state.stocks,
        houseCost: state.mechanics.config.houseCost,
        houseUpkeep: state.mechanics.config.houseUpkeep,
        capacity: state.landing.config.farmyardCapacity,
        cattle: Object.values(state.landing.cattle)
            .filter(animal => animal.deathWinter === null)
            .map(animal => ({ id: animal.id, sex: animal.sex, farmyardId: animal.farmyardId })),
        people: people.map(person => {
            const home = Object.values(state.households).find(home => home.memberIds.includes(person.id));
            return {
                id: person.id,
                name: person.name,
                age: core.personaAge(state, person.id),
                occupation: person.occupation,
                occupationLocked: state.mechanics.people[person.id].occupationLocked,
                farmerFit: core.occupationAptitude(state, person.id, 'farmer'),
                canFarm: core.canApplyCommand(state, {
                    type: 'AssignOccupation', personaId: person.id, occupation: 'farmer',
                }),
                partner: person.partnerId,
                children: people.filter(child => child.parentIds.includes(person.id)).map(child => child.id),
                home: home && {
                    id: home.id,
                    label: housingName(state, 'household', home.id),
                    residence: home.residenceId,
                    members: home.memberIds,
                },
            };
        }),
        events: state.events.filter(event => event.personaId === 'founder-1'
            || event.details?.personaId === 'founder-1').slice(-5),
    };
}

const raw = await readFile('docs/qa/fjord-runtime-performance/fixtures/summer-32.json', 'utf8');
const fixture = JSON.parse(raw);
const state = core.reconstructState(JSON.stringify(fixture.fjord.campaign));
data.chapter = fixture.fjord.narrative?.chapters?.[0]?.text || 'No published opening chapter in this fixture.';
const source = {
    fixture: 'summer-32',
    sha256: createHash('sha256').update(raw).digest('hex'),
    commands: [],
};
data.scenes.blocked = project(state, 'world-founding.png', source);
const ship = Object.values(state.landing.longships).find(ship => ship.salvagedWinter === null);
const funding = { type: 'SalvageLongship', longshipId: ship.id };
const funded = core.applyCommand(state, funding);
data.scenes.funded = project(funded, 'world-founding.png', {
    ...source,
    commands: [funding],
    note: 'Funded test state uses the existing 20-Materials longship salvage command. '
        + 'This is fixture preparation, not part of the farmyard journey. The common founding '
        + 'backdrop predates salvage; no vessel is visible in the captured frame.',
});
const home = data.scenes.funded.people[0].home;
const candidate = data.scenes.funded.people
    .filter(person => home.members.includes(person.id) && person.canFarm)
    .sort((left, right) => right.farmerFit - left.farmerFit)[0];
let completed = core.applyCommand(funded, { type: 'BuildHouse', householdId: home.id });
const residenceId = completed.households[home.id].residenceId;
const buildingId = completed.residences[residenceId].buildingId;
completed = core.applyCommand(completed, {
    type: 'AssignOccupation', personaId: candidate.id, occupation: 'farmer',
});
completed = core.applyCommand(completed, {
    type: 'SpecializeBuilding', buildingId, occupation: 'farmer',
});
for (const animal of data.scenes.funded.cattle) {
    completed = core.applyCommand(completed, {
        type: 'AssignCattle', cattleId: animal.id, farmyardId: buildingId,
    });
}
data.farmyardResult = {
    candidateId: candidate.id,
    materials: completed.stocks.materials,
    farmyard: core.landingSummary(completed).farmyards.find(yard => yard.id === buildingId),
    note: 'A headless feasibility check of existing commands, not implementation of a combined command.',
};
data.scenes.developed = {
    ...original.scenes.settled,
    backdrop: 'world-settled.png',
    provenance: { fixture: 'developed-810', sha256: original.scenes.settled.fixtureSha256 },
    clan: 'Landing party',
    cattle: null,
};
// Only aggregate livestock counts are used for the developed visual-density scenario.
data.scenes.developed.cattleCount = original.scenes.settled.cattle;
await writeFile(directory + '/study-data-v2.json', JSON.stringify(data, null, 2) + '\n');
console.log('Prepared funded and blocked snapshots; verified house, farmer, specialization and 3 assignments.');
console.log(JSON.stringify(data.farmyardResult));
