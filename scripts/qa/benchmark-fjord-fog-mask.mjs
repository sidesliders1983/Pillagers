import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { loadTypeScript } from '../load-typescript.mjs';

const load = file => loadTypeScript(new URL('../../src/' + file, import.meta.url));
const { GameplaySession } = load('gameplay-lab/GameplaySession.ts');
const { FjordCampaign } = load('fjord-play/FjordCampaign.ts');
const { inspectClanDiscovery } = load('simulation/ClanDiscovery.ts');
const { DiscoveryFog } = load('fjord-play/DiscoveryFog.ts');
const { fjordFogPresentation } = load('config/FjordFog.ts');
const output = process.env.QA_OUTPUT || 'artifacts/fjord-fog';
const initial = JSON.parse(await readFile('docs/qa/integrated-playtest-180/exploration-800.json', 'utf8'));
const mapped = JSON.parse(await readFile(output + '/mapped-fixture.json', 'utf8'));
const session = new GameplaySession();
const campaign = new FjordCampaign(session, 'island-pool-v1', JSON.stringify(initial.fjord));
const views = [initial, mapped].map(fixture => inspectClanDiscovery(fixture.fjord.campaign.discovery,
    fixture.fjord.campaign.clan.id));
const expected = [];
const report = { note: 'Isolated Node CPU mask construction; no WebGL or GPU upload. ABBA order.', samples: [] };
for (const profile of ['current', 'nordic', 'nordic', 'current']) {
    const fog = new DiscoveryFog(campaign.blueprint, views[0]);
    fog.setPresentation(fjordFogPresentation(profile, { width: campaign.blueprint.config.width }));
    const durationsMs = [];
    for (let step = 0; step < 4; step++) {
        const view = views[(step + 1) % 2];
        const started = performance.now();
        fog.setKnowledge(view);
        durationsMs.push(performance.now() - started);
        fog.update(.8);
        const bytes = fog.root.children[0].material.alphaMap.image.data;
        const sha256 = createHash('sha256').update(bytes).digest('hex');
        expected[step] ??= sha256;
        assert.equal(sha256, expected[step], 'Presentation cannot change alpha bytes.');
    }
    report.samples.push({ profile, durationsMs, resources: fog.inspect() });
    fog.dispose();
}
report.status = 'PASS';
await writeFile(output + '/mask-cpu.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report));
