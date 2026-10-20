import { mkdir, writeFile } from 'node:fs/promises';
import { loadTypeScript } from '../load-typescript.mjs';
import { livestockCandidate } from './livestock-candidates.mjs';

const core = loadTypeScript(new URL('../../src/simulation/SimulationCore.ts', import.meta.url));
const { SharedSettlement } = loadTypeScript(new URL('../../src/play/SharedSettlement.ts', import.meta.url));
const output = 'docs/qa/livestock-models/fixtures';
await mkdir(output, { recursive: true });
const found = new Set();
for (let seed = 0; seed < 48 && found.size < 3; seed++) {
    let state = core.createCampaign(seed, { initialMaterials: 50 }, {}, { enabled: false }, {}, {}, {},
        'summer-800-v1', undefined, { player: livestockCandidate });
    const species = Object.values(state.landing.cattle)[0].species;
    if (!['goat', 'pig', 'sheep'].includes(species) || found.has(species)) continue;
    state = core.applyCommand(state, { type: 'AssignOccupation', personaId: 'founder-1', occupation: 'farmer' });
    state = core.applyCommand(state, { type: 'HouseHousehold', householdId: 'founder-1' });
    for (const animal of Object.values(state.landing.cattle))
        state = core.applyCommand(state, { type: 'AssignLivestock', livestockId: animal.id, farmyardId: 'house-1' });
    const shared = new SharedSettlement(seed, undefined, true, 'island-pool-v2', 'summer-800-v1');
    shared.session.loadJSON(core.serializeState(state));
    shared.fjord.project();
    await writeFile(output + '/' + species + '.json', shared.persist() + '\n');
    found.add(species);
    console.log('Prepared physical Fjord fixture: ' + species + ', seed ' + seed);
}
if (found.size !== 3) throw new Error('All three deterministic species fixtures are required');
