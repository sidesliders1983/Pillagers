import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { loadTypeScript } from '../load-typescript.mjs';
const { SharedSettlement, inspectSettlementSave } = loadTypeScript(new URL('../../src/play/SharedSettlement.ts', import.meta.url));
const output = 'docs/qa/integrated-playtest-180';
await mkdir(output, { recursive: true });
const manifest = { version: 'integrated-playtest-fixtures-v1', scenarios: [] };
for (const name of ['funded-800', 'developed-810', 'snow-811', 'summer-17']) {
    const source = `docs/qa/fjord-runtime-performance/fixtures/${name === 'funded-800' ? 'summer-32' : name}.json`;
    const original = await readFile(source, 'utf8');
    let data = JSON.parse(original);
    const commands = [];
    if (name === 'funded-800') {
        const owner = SharedSettlement.restore(original, 'fjord');
        const command = { type: 'SalvageLongship', longshipId: Object.keys(owner.session.readSnapshot().landing.longships)[0] };
        owner.command(command);
        data = JSON.parse(owner.persist());
        commands.push(command);
    }
    data.target = 'fjord'; data.pace.running = false;
    const bytes = JSON.stringify(data) + '\n';
    inspectSettlementSave(bytes);
    await writeFile(`${output}/${name}.json`, bytes);
    manifest.scenarios.push({ name, source, commands,
        sourceSha256: createHash('sha256').update(original).digest('hex'),
        sha256: createHash('sha256').update(bytes).digest('hex') });
}
await writeFile(output + '/scenarios.json', JSON.stringify(manifest, null, 2) + '\n');
console.log('Prepared four valid, paused QA campaigns through the normal save path.');
