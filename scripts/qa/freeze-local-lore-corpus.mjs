import assert from 'node:assert/strict';
import { access, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { loadTypeScript } from '../load-typescript.mjs';
const core = loadTypeScript(new URL('../../src/simulation/SimulationCore.ts', import.meta.url));
const { SharedSettlement } = loadTypeScript(new URL('../../src/play/SharedSettlement.ts', import.meta.url));
const { freezeLoreRequest } = loadTypeScript(new URL('../../src/lore/LocalLoreAdapter.ts', import.meta.url));
const output = process.env.LORE_OUTPUT ?? 'docs/qa/local-lore';
const corpus = [];
try {
    await access(output + '/corpus.json.gz');
    throw new Error('Recorded corpus exists; choose a separate LORE_OUTPUT folder for the new version.');
} catch (error) {
    if (error.code !== 'ENOENT') throw error;
}
await mkdir(output, { recursive: true });
for (let seed = 1; seed <= 20; seed++) {
    const owner = new SharedSettlement(seed, 1000 + seed);
    let direct = owner.session.snapshot();
    const commands = [{ type: 'SalvageLongship', longshipId: 'founding-longship' }];
    owner.command(commands[0]);
    direct = core.applyCommand(direct, commands[0]);
    const snapshots = [owner.persist()];
    for (let checkpoint = 0; checkpoint < 2; checkpoint++) {
        const command = { type: 'AdvanceTicks', ticks: 5000 };
        commands.push(command);
        owner.command(command);
        direct = core.applyCommand(direct, command);
        assert.equal(owner.session.saveJSON(), core.serializeState(direct));
        snapshots.push(owner.persist());
    }
    const restored = SharedSettlement.restore(owner.persist(), 'fjord');
    assert.equal(restored.session.saveJSON(), owner.session.saveJSON());
    assert.deepEqual(restored.session.book.snapshot(), owner.session.book.snapshot());
    const requests = [];
    for (const [index, snapshot] of snapshots.entries()) {
        const checkpoint = SharedSettlement.restore(snapshot, 'fjord');
        requests.push(await freezeLoreRequest(checkpoint.session.snapshot(),
            checkpoint.session.book.save(checkpoint.session.snapshot()), index));
    }
    const events = owner.session.snapshot().events;
    corpus.push({ scenario: 'Default Core rules, seed ' + seed, seed, narrativeSeed: 1000 + seed,
        winters: 10, commands, snapshots, requests,
        eventTypes: [...new Set(events.map(event => event.type))],
        coreIdentical: true, exactBookReload: true });
    console.log('Frozen seed ' + seed + ': opening and two five-Winter chapters');
}
const data = JSON.stringify({ version: 1, generatedAt: new Date().toISOString(),
    baselineRevision: 'fed7b9003232718ca72ca18ef147d12008b7701f',
    rules: 'Unmodified default weather, resident mortality and cattle lifecycle', corpus }, null, 2) + '\n';
await writeFile(output + '/corpus.json.gz', gzipSync(data, { level: 9 }));
await writeFile(output + '/corpus.sha256', createHash('sha256').update(data).digest('hex') + '\n');
console.log('Saved ' + corpus.length * 3 + ' frozen chapter requests');
