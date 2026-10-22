import { mkdir, writeFile } from 'node:fs/promises';
import { loadTypeScript } from './load-typescript.mjs';
const { warmHomeFixture } = loadTypeScript(new URL('./qa/warm-homes-256-fixtures.ts', import.meta.url));
const directory = 'docs/qa/warm-homes-256/fixtures';
await mkdir(directory, { recursive: true });
for (const progress of [0, .125, .5, .875]) {
    const shared = warmHomeFixture(progress);
    await writeFile(`${directory}/phase-${String(progress).replace('.', '-')}.json`, shared.handoff('fjord'));
    console.log(progress, shared.fjord.readProjection().entities.filter(e => e.kind === 'building')
        .map(e => [e.id, e.asset, e.status.inhabited]));
}
