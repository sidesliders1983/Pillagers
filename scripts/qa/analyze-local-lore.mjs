import { auditLoreCohort } from './local-lore-audit.mjs';
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
        catch (error) { throw new Error('Incomplete ' + label + ' cohort: outcome file unavailable', { cause: error }); }
        const { acceptedAudited, changedAccepted, acceptedWithOlderSources, failures } = auditLoreCohort(corpus, rows);
        cohort.candidates[label] = { ...summarizeLoreComparison(rows), acceptedAudited, changedAccepted, acceptedWithOlderSources,
            acceptedSameAsBaseline: acceptedAudited - changedAccepted, baselineParagraphs: normalizedParagraphs(rows, false), comparisonParagraphs: normalizedParagraphs(rows, true), failures };
    }
    all[folder === root ? 'defaultCohort' : 'controlledFixtures'] = cohort;
}
const sources = [];
for (const file of ['scripts/qa/local-lore-audit.mjs', 'src/lore/LocalLoreAdapter.ts', 'src/lore/LoreExperimentQueue.ts', 'src/lore/LoreBenchmark.ts',
    'src/lore/NarrativeComposer.ts', 'src/lore/LegacyNarrativeComposerV2.ts', 'src/lore/LegacyNarrativeComposerV3.ts', 'src/lore/NarrativeTime.ts', 'src/lore/NarrativePlan.ts', 'src/lore/ClanBook.ts']) {
    sources.push({ file, sha256: createHash('sha256').update(await readFile(file)).digest('hex') });
}
await writeFile(root + '/analysis-review-v3.json', JSON.stringify({ generatedAt: new Date().toISOString(), sources, ...all }, null, 2) + '\n');
console.log(JSON.stringify(Object.fromEntries(Object.entries(all).map(([key, value]) => [key,
    Object.fromEntries(Object.entries(value.candidates).map(([label, result]) => [label,
        { chapters: result.chapters, accepted: result.accepted, changed: result.changedAccepted }]))]))));
