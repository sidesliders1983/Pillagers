import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { loadSource, digest } from './fixture-tools.mjs';
const [root = process.env.PROFILE_SOURCE_ROOT || process.cwd(), label = '0041b92b-50-g2-parity'] = process.argv.slice(2);
const api = await loadSource(root);
const fixture = 'final-0041b92b-population-50-groups-2-enabled.shared.json';
let shared = api.SharedSettlement.restore(await readFile(new URL(fixture, import.meta.url), 'utf8'), 'fjord');
const context = api.context(shared);
let state = shared.session.snapshot();shared = null;
const trace = [];
for (let index = 0; index <= 270; index++) {
    const text = api.core.serializeState(state);
    trace.push({ tick: state.time.tick, winter: state.time.winter, sha256: digest(text) });
    if (index === 270) {
        await writeFile(new URL(label + '.end.core.json', import.meta.url), text);
        assert.equal(api.core.serializeState(api.core.reconstructState(text)), text);
        break;
    }
    state = api.core.applyCommand(state, { type: 'AdvanceTicks', ticks: 1 }, context);
}
const report = { source: api.pin, fixture, command: '270 individual public Core AdvanceTicks1 calls',
    contextHash: digest(JSON.stringify(context.exclusions)), trace, endSHA256: trace.at(-1).sha256,
    endTime: state.time, phases: api.core.inspectTerritory(state).incidents.map(incident => incident.phase) };
await writeFile(new URL(label + '.trace.json', import.meta.url), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ label, source: api.pin.head, endSHA256: report.endSHA256, endTime: state.time, phases: report.phases }));
