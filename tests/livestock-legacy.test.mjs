import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { loadTypeScript } from '../scripts/load-typescript.mjs';

const core = loadTypeScript(new URL('../src/simulation/SimulationCore.ts', import.meta.url));
const { SharedSettlement } = loadTypeScript(new URL('../src/play/SharedSettlement.ts', import.meta.url));
const reference = JSON.parse(readFileSync(new URL('./fixtures/livestock-legacy-218.json', import.meta.url), 'utf8'));
const hash = text => createHash('sha256').update(text).digest('hex');

test('pre-expansion cattle campaigns retain exact canonical bytes through commands, migration and save/load', () => {
    for (const entry of reference.cases) {
        if (entry.mode === 'shared') {
            let shared = SharedSettlement.restore(JSON.stringify(entry.input), 'fjord');
            assert.equal(hash(shared.session.saveJSON()), entry.checkpoints[0], entry.name);
            for (const [index, command] of entry.commands.entries()) {
                shared.command(command);
                assert.equal(hash(shared.session.saveJSON()), entry.checkpoints[index + 1], entry.name);
                shared = SharedSettlement.restore(shared.persist(), 'fjord');
            }
        } else {
            let state = core.reconstructState(JSON.stringify(entry.input));
            assert.equal(hash(core.serializeState(state)), entry.checkpoints[0], entry.name);
            for (const [index, command] of entry.commands.entries()) {
                state = core.applyCommand(state, command);
                assert.equal(hash(core.serializeState(state)), entry.checkpoints[index + 1], entry.name);
                state = core.reconstructState(core.serializeState(state));
            }
        }
    }
});
