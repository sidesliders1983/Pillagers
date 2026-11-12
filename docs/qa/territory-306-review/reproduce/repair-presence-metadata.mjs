import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { loadSource } from './fixture-tools.mjs';
const api = await loadSource((process.env.PROFILE_SOURCE_ROOT || process.cwd()));
assert.equal(api.pin.head, '0041b92b49dd2f0a1865eb158100a20e20e5df0c');
const corrections = [];
for (const groups of [1, 2]) {
    const prefix = 'final-0041b92b-population-50-groups-' + groups + '-enabled';
    const original = JSON.parse(await readFile(new URL(prefix + '-measure.json', import.meta.url), 'utf8'));
    let shared = api.SharedSettlement.restore(await readFile(new URL(prefix + '.shared.json', import.meta.url), 'utf8'), 'fjord');
    const context = api.context(shared);
    let state = shared.session.snapshot();
    shared = null;
    const command = { type: 'AdvanceTicks', ticks: 1 };
    for (let index = 0; index < 20; index++) state = api.core.applyCommand(state, command, context);
    const startPresence = api.presenceSummary(state);
    for (let index = 0; index < 250; index++) state = api.core.applyCommand(state, command, context);
    assert.equal(Buffer.byteLength(api.core.serializeState(state)), original.serialized.endBytes,
        'Untimed deterministic metadata replay matches measured final serialized size');
    assert.deepEqual(state.time, original.endTime);
    const correction = { measuredReport: prefix + '-measure.json', source: api.pin.head,
        timingRerun: false, note: 'Untimed deterministic replay repairs only metadata: outdoor requires no indoor placement, age>=5, no caregiving and actual at-home availability. Original timings/raw reports unchanged.',
        startPresence, endPresence: api.presenceSummary(state) };
    corrections.push(correction);
    console.log(JSON.stringify(correction));
}
await writeFile(new URL('0041b92b-presence-metadata-corrections.json', import.meta.url), JSON.stringify(corrections, null, 2));
