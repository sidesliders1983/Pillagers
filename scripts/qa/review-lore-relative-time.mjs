import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { loadTypeScript } from '../load-typescript.mjs';

const { composeOpening, composeChapter } = loadTypeScript(new URL('../../src/lore/NarrativeComposer.ts', import.meta.url));
const output = 'docs/qa/lore-relative-time';
await mkdir(output, { recursive: true });
const records = [];
const sources = [];
for (const folder of ['docs/qa/local-lore', 'docs/qa/local-lore/edge-cases']) {
    const raw = gunzipSync(await readFile(folder + '/corpus.json.gz')).toString('utf8');
    const sha256 = createHash('sha256').update(raw).digest('hex');
    assert.equal(sha256, (await readFile(folder + '/corpus.sha256', 'utf8')).trim());
    sources.push({ folder, sha256 });
    for (const campaign of JSON.parse(raw).corpus) {
        const previous = [];
        for (const request of campaign.requests) {
            const saved = JSON.parse(campaign.snapshots[request.chapterIndex]);
            const book = saved.fjord.narrative;
            const chapter = book.chapters[request.chapterIndex];
            const events = saved.fjord.campaign.events.slice(0, request.checkpoint.eventEnd);
            const paragraphs = request.chapterIndex === 0 ?
                composeOpening(chapter.facts, chapter.checkpoint.time.winter, book.narrativeSeed, chapter.sourceEventIds) :
                composeChapter(events, chapter.plan, chapter.facts, previous, book.narrativeSeed);
            const text = paragraphs.map(part => part.text).join('\n\n');
            const selectedSources = [...new Set(paragraphs.flatMap(part => part.sourceEventIds))];
            assert.ok(selectedSources.every(id => events.some(event => event.id === id)));
            assert.doesNotMatch(text, /When the interval ended|complete account recorded|unmet Food need|cattle-\d|founding-longship/);
            previous.push({ ...chapter, text, paragraphs, templateVersion: 3 });
            const ledger = chapter.facts.ledger;
            records.push({ cohort: folder.endsWith('edge-cases') ? 'Controlled fixture' : 'Default campaign',
                campaign: campaign.scenario, seed: campaign.seed, chapter: chapter.index, title: chapter.title,
                from: chapter.facts.period?.from, through: chapter.checkpoint.time,
                oldText: chapter.text, newText: text, paragraphs,
                factual: { stocks: chapter.facts.stocks, food: ledger?.food, materials: ledger?.materials },
                sourceEvents: events.filter(event => selectedSources.includes(event.id)).map(event =>
                    ({ id: event.id, type: event.type, time: event.time })) });
        }
    }
}
await writeFile(output + '/comparison.json', JSON.stringify({
    label: 'Separate model-free style-3 preview; historical style-2 model measurements are unchanged.',
    generatorVersion: 3, styleVersion: 3, sources, records
}, null, 2) + '\n');
console.log(JSON.stringify({ previews: records.length, sources }));

