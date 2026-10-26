import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    core, directory, digest, endpoint, personStatus, readJSON, sourceIdentity, writeJSON,
} from './cohort-v4.mjs';

const mode = process.argv[2];
assert.equal(process.argv.length, 3);
assert.ok(['--generate', '--verify', '--replay'].includes(mode));
const outputPath = join(directory, 'seed17-source-replay-v2.json');
const runnerSHA256 = digest(readFileSync(fileURLToPath(import.meta.url)));
const before = sourceIdentity();
if (mode === '--verify') {
    const saved = readJSON(outputPath);
    before.head = saved.source.head;
    assert.deepEqual(before, saved.source);
    assert.equal(runnerSHA256, saved.runnerSHA256);
    console.log(JSON.stringify({ status: 'seed17-source-replay-verified' }));
    process.exit(0);
}
const oldFixturePath = 'D:/CodexSites/Pillagers/scratch/cultural-occasions-277/scratch/contextual-support-278/fixtures.json';
const prior = mode === '--replay' ? readJSON(outputPath) : undefined;
const historical = prior ? undefined : readJSON(oldFixturePath);
const oldCase = prior ? prior.originalCase : historical.cases.find(item => item.id === 'co-displaced-partners-803');
const arguments_ = oldCase.campaignArguments.map(value => value?.$undefined === true ? undefined : value);
let state = core.createCampaign(...arguments_);
assert.deepEqual(state.contextualSupport.config, {
    enabled: true, offerBps: 1000, acceptanceBps: 5000, resolutionTicks: 50, candidateBudget: 128,
});
const transactions = [];
for (const command of oldCase.commands) {
    const stocksBefore = { ...state.stocks };
    state = core.applyCommand(state, command);
    if (command.type !== 'AdvanceTicks') transactions.push({
        command, stocksBefore, stocksAfter: { ...state.stocks },
        materialsDelta: state.stocks.materials - stocksBefore.materials,
    });
}
const lossEndpoint = endpoint(state);
const actualSourceLoss = state.events.find(event => event.type === 'BuildingCollapsed');
assert.equal(actualSourceLoss?.details.buildingId, 'house-1');
assert.deepEqual(actualSourceLoss.time, { winter: 803, tick: 0 });
assert.deepEqual(actualSourceLoss.details.housingResidents.residentIds, ['founder-2', 'founder-8']);
const partiesAtLoss = ['founder-2', 'founder-8'].map(id => personStatus(state, id));
state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 50 });
const resolutionEndpoint = endpoint(state);
const after = sourceIdentity();
assert.deepEqual(after, before);
const result = {
    schemaVersion: 1, purpose: 'Replay the historical genuine seed17 public commands against final #278 normal Core; supplemental source audit, not an expanded cohort.',
    source: before, runnerSHA256,
    originalSourceHead: prior?.originalSourceHead ?? historical.sourceHead,
    originalFixtureSHA256: prior?.originalFixtureSHA256 ?? digest(readFileSync(oldFixturePath)),
    originalCase: {
        id: oldCase.id, campaignArguments: oldCase.campaignArguments, commands: oldCase.commands,
        historicalEndpointSHA256: oldCase.historicalEndpointSHA256 ?? oldCase.endpoint.stateSHA256,
    },
    configuration: {
        landing: state.landing.config, mechanics: state.mechanics.config,
        weather: state.weather.config, social: state.social.config,
        culture: state.culture.config, contextualSupport: state.contextualSupport.config,
    },
    transactions, actualSourceLoss, partiesAtLoss, lossEndpoint,
    resolutionCommand: { type: 'AdvanceTicks', ticks: 50 }, resolutionEndpoint,
    supportEvents: state.events.filter(event => event.type.startsWith('Support')),
    interpretation: 'Old bbb0180 state hash is historical only. This explicit new source replay retains the normal no-offer/zero-bank outcome instead of forcing the known co-displaced pair to succeed.',
};
if (mode === '--replay') {
    before.head = prior.source.head;
    assert.deepEqual(result, prior);
} else writeJSON(outputPath, result);
console.log(JSON.stringify({ status: mode === '--replay' ? 'seed17-exact-replay-matched' : 'seed17-replay-saved',
    loss: actualSourceLoss.time, resolution: resolutionEndpoint.time,
    supportEvents: result.supportEvents.length, bank: resolutionEndpoint.culture.supportCount }));

