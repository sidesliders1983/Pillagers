import { readFile, writeFile, appendFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { gunzipSync } from 'node:zlib';
import { loadTypeScript } from '../load-typescript.mjs';
const { LocalLoreAdapter, localLorePromptVersion, localLoreDecoding } =
    loadTypeScript(new URL('../../src/lore/LocalLoreAdapter.ts', import.meta.url));
const { LoreExperimentQueue } = loadTypeScript(new URL('../../src/lore/LoreExperimentQueue.ts', import.meta.url));
const { summarizeLoreComparison } = loadTypeScript(new URL('../../src/lore/LoreBenchmark.ts', import.meta.url));
const output = process.env.LORE_OUTPUT ?? 'docs/qa/local-lore';
const label = process.env.LORE_CANDIDATE;
if (!['B', 'C'].includes(label)) throw new Error('Set LORE_CANDIDATE=B or C.');
const rawCorpus = gunzipSync(await readFile(output + '/corpus.json.gz')).toString('utf8');
const corpusHash = createHash('sha256').update(rawCorpus).digest('hex');
const expected = (await readFile(output + '/corpus.sha256', 'utf8')).trim();
if (corpusHash !== expected) throw new Error('Frozen corpus hash mismatch.');
const manifest = JSON.parse(await readFile(output + '/manifest.json', 'utf8'));
const candidate = manifest.candidates[label];
const adapter = new LocalLoreAdapter({ endpoint: process.env.LORE_ENDPOINT ?? 'http://127.0.0.1:8085',
    model: candidate.file, identity: candidate.sha256 + ':' + manifest.runtime.commit,
    timeoutMs: manifest.deadlineMs });
const records = [];
const file = output + '/candidate-' + label + '.jsonl';
await writeFile(file, '');
const started = performance.now();
for (const campaign of JSON.parse(rawCorpus).corpus) {
    const queue = new LoreExperimentQueue(adapter, campaign.requests[0].lineage);
    for (const request of campaign.requests) {
        const inputContext = { ...request.context, previousText: queue.results().slice(-3).map(result => result.text) };
        const result = await queue.enqueue(request);
        const record = { campaign: campaign.scenario, chapter: request.chapterIndex,
            seed: campaign.seed, narrativeSeed: campaign.narrativeSeed,
            inputKey: request.key, inputContext, baseline: request.baseline, result };
        records.push(record);
        await appendFile(file, JSON.stringify(record) + '\n');
        console.log(label + ' seed ' + campaign.seed + ', chapter ' + request.chapterIndex + ': ' +
            result.status + ' (' + result.reason + '), ' + Math.round(result.milliseconds ?? 0) + ' ms');
    }
}
const report = { candidate: label, manifest, corpusHash, promptVersion: localLorePromptVersion,
    decoding: localLoreDecoding, generatedAt: new Date().toISOString(),
    totalMilliseconds: performance.now() - started, ...summarizeLoreComparison(records) };
await writeFile(output + '/candidate-' + label + '-summary.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report));
