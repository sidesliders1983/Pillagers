import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { loadTypeScript } from '../load-typescript.mjs';

// Derive review data through existing Core commands; never modify source fixtures.
const core = loadTypeScript(new URL('../../src/simulation/SimulationCore.ts', import.meta.url));
const { occupationIds } = loadTypeScript(new URL('../../src/simulation/Mechanics.ts', import.meta.url));
const { housingName } = loadTypeScript(new URL('../../src/simulation/HousingNames.ts', import.meta.url));
const directory = 'docs/qa/desktop-ui-redesign-180';
const original = JSON.parse(await readFile(directory + '/scene-data.json', 'utf8'));
const data = {
    version: 2, sourceHead: 'eeba00d09c4ea0350a9cfc8dd2cde948fd41c66c',
    occupations: occupationIds, scenes: {},
};

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
                availableOccupations: occupationIds.filter(occupation => core.canApplyCommand(state, {
                    type: 'AssignOccupation', personaId: person.id, occupation,
                })),
                partner: person.partnerId,
                children: people.filter(child => child.parentIds.includes(person.id)).map(child => child.id),
                home: home && {
                    id: home.id,
                    label: housingName(state, 'household', home.id),
                    residence: home.residenceId,
                    kind: state.residences[home.residenceId]?.kind || 'tent',
                    specialization: state.buildings[state.residences[home.residenceId]?.buildingId]?.specialization ?? null,
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
        + 'This is fixture preparation, not part of a housing or work journey. The common founding '
        + 'backdrop predates salvage; no vessel is visible in the captured frame.',
});
const home = data.scenes.funded.people[0].home;
const candidate = data.scenes.funded.people
    .filter(person => home.members.includes(person.id) && person.canFarm)
    .sort((left, right) => right.farmerFit - left.farmerFit)[0];
let completed = core.applyCommand(funded, { type: 'BuildHouse', householdId: home.id });
const residenceId = completed.households[home.id].residenceId;
const buildingId = completed.residences[residenceId].buildingId;
data.housingResult = {
    materials: completed.stocks.materials,
    residence: completed.residences[residenceId].kind,
    specialization: completed.buildings[buildingId].specialization,
    members: home.members.map(id => ({
        id,
        occupation: completed.personas[id].occupation,
        occupationUnchanged: completed.personas[id].occupation === funded.personas[id].occupation,
        careerSettingsUnchanged: completed.mechanics.people[id].occupationLocked
            === funded.mechanics.people[id].occupationLocked,
    })),
    farmyard: core.landingSummary(completed).farmyards.find(yard => yard.id === buildingId) ?? null,
    cattleAssignmentsUnchanged: Object.values(funded.landing.cattle)
        .every(animal => completed.landing.cattle[animal.id].farmyardId === animal.farmyardId),
    note: 'BuildHouse alone preserves occupations, career settings, specialization and cattle assignments.',
};
const withFarmer = core.applyCommand(funded, {
    type: 'AssignOccupation', personaId: candidate.id, occupation: 'farmer',
});
const farmerHome = core.applyCommand(withFarmer, { type: 'BuildHouse', householdId: home.id });
data.existingFarmerHousingResult = {
    farmyard: core.landingSummary(farmerHome).farmyards.find(yard => yard.householdId === home.id),
    specialization: farmerHome.buildings[buildingId].specialization,
    occupationUnchanged: farmerHome.personas[candidate.id].occupation === withFarmer.personas[candidate.id].occupation,
    cattleAssignmentsUnchanged: Object.values(withFarmer.landing.cattle)
        .every(animal => farmerHome.landing.cattle[animal.id].farmyardId === animal.farmyardId),
    note: 'A farmer is explicitly prepared before BuildHouse. Their house activates the existing Farmyard function with no cattle assigned.',
};
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
const developedRaw = await readFile('docs/qa/fjord-runtime-performance/fixtures/developed-810.json', 'utf8');
const developed = core.reconstructState(JSON.stringify(JSON.parse(developedRaw).fjord.campaign));
data.scenes.developed = {
    ...original.scenes.settled,
    ...project(developed, 'world-settled.png', {
        fixture: 'developed-810', sha256: createHash('sha256').update(developedRaw).digest('hex'),
    }),
    cattle: null,
};
// Only aggregate livestock counts are used for the developed visual-density scenario.
data.scenes.developed.cattleCount = original.scenes.settled.cattle;
await writeFile(directory + '/study-data-v2.json', JSON.stringify(data, null, 2) + '\n');
console.log('Prepared neutral housing and all canonical occupation choices; checked housing separately from farmyard setup.');
console.log(JSON.stringify(data.housingResult));
console.log(JSON.stringify(data.farmyardResult));
