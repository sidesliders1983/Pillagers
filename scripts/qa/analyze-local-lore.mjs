import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { loadTypeScript } from '../load-typescript.mjs';

const { summarizeLoreComparison } = loadTypeScript(new URL('../../src/lore/LoreBenchmark.ts', import.meta.url));
const root = 'docs/qa/local-lore';
const all = {};
function normalizedParagraphs(rows, modelText) {
    const paragraphs = [];
    for (const row of rows) {
        const names = new Set();
        const collect = value => {
            if (!value || typeof value !== 'object') return;
            for (const [key, child] of Object.entries(value)) {
                if (['name', 'displayName', 'residenceName'].includes(key) && typeof child === 'string') names.add(child.toLowerCase());
                else collect(child);
            }
        };
        collect(row.inputContext.facts);
        for (let paragraph of (modelText ? row.result.text : row.baseline).toLowerCase().split('\n\n')) {
            for (const name of [...names].sort((a, b) => b.length - a.length))
                paragraph = paragraph.split(name).join('<name>');
            paragraphs.push(paragraph.replace(/\d+/g, '#').replace(/\s+/g, ' ').trim());
        }
    }
    return { instances: paragraphs.length, repeatedAfterNamesAndNumbers: paragraphs.length - new Set(paragraphs).size,
        note: 'Exact paragraph bodies after substituting known names and numbers; a repetition diagnostic, not reader preference or a semantic quality score.' };
}
for (const folder of [root, root + '/edge-cases']) {
    const raw = gunzipSync(await readFile(folder + '/corpus.json.gz')).toString('utf8');
    const hash = createHash('sha256').update(raw).digest('hex');
    assert.equal(hash, (await readFile(folder + '/corpus.sha256', 'utf8')).trim());
    const { corpus } = JSON.parse(raw);
    const cohort = { corpusHash: hash, campaigns: corpus.length,
        eventTypes: [...new Set(corpus.flatMap(item => item.eventTypes))], candidates: {} };
    for (const label of ['B', 'C']) {
        let rows;
        try { rows = (await readFile(folder + '/candidate-' + label + '.jsonl', 'utf8')).trim().split('\n').filter(Boolean).map(JSON.parse); }
        catch (error) { if (error.code === 'ENOENT') continue; throw error; }
        let acceptedAudited = 0, changedAccepted = 0;
        const failures = [];
        for (const campaign of corpus) {
            const history = [];
            for (const request of campaign.requests) {
                const row = rows.find(item => item.campaign === campaign.scenario && item.chapter === request.chapterIndex);
                if (!row) continue;
                assert.equal(row.inputKey, request.key);
                assert.deepEqual(row.inputContext.previousText, history.slice(-3));
                if (row.result.status === 'accepted') {
                    const chosen = row.result.selectedIds.map(id => request.catalogue.find(item => item.id === id));
                    assert.equal(chosen.length, request.context.slots.length);
                    chosen.forEach((item, index) => assert.ok(request.context.slots[index].options.some(option => option.id === item?.id)));
                    assert.equal(row.result.text, chosen.map(item => item.text).join('\n\n'));
                    const sources = [...new Set(chosen.flatMap(item => item.sourceEventIds))];
                    assert.deepEqual(row.result.sourceEventIds, sources);
                    const checkpoint = JSON.parse(campaign.snapshots[request.chapterIndex]).fjord.campaign;
                    const events = checkpoint.events.slice(0, request.checkpoint.eventEnd);
                    assert.ok(sources.every(id => events.some(event => event.id === id)));
                    acceptedAudited++;
                    if (row.result.text !== row.baseline) changedAccepted++;
                } else failures.push({ campaign: row.campaign, chapter: row.chapter, reason: row.result.reason, raw: row.result.raw });
                history.push(row.result.text);
            }
        }
        cohort.candidates[label] = { ...summarizeLoreComparison(rows), acceptedAudited, changedAccepted,
            acceptedSameAsBaseline: acceptedAudited - changedAccepted, baselineParagraphs: normalizedParagraphs(rows, false), comparisonParagraphs: normalizedParagraphs(rows, true), failures };
    }
    all[folder === root ? 'defaultCohort' : 'controlledFixtures'] = cohort;
}
const sources = [];
for (const file of ['src/lore/LocalLoreAdapter.ts', 'src/lore/LoreExperimentQueue.ts', 'src/lore/LoreBenchmark.ts',
    'src/lore/NarrativeComposer.ts', 'src/lore/NarrativePlan.ts', 'src/lore/ClanBook.ts']) {
    sources.push({ file, sha256: createHash('sha256').update(await readFile(file)).digest('hex') });
}
await writeFile(root + '/analysis.json', JSON.stringify({ generatedAt: new Date().toISOString(), sources, ...all }, null, 2) + '\n');
console.log(JSON.stringify(Object.fromEntries(Object.entries(all).map(([key, value]) => [key,
    Object.fromEntries(Object.entries(value.candidates).map(([label, result]) => [label,
        { chapters: result.chapters, accepted: result.accepted, changed: result.changedAccepted }]))]))));
