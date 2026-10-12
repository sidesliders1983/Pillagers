import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { loadTypeScript } from '../load-typescript.mjs';
const core = loadTypeScript(new URL('../../src/simulation/SimulationCore.ts', import.meta.url));
const { SharedSettlement } = loadTypeScript(new URL('../../src/play/SharedSettlement.ts', import.meta.url));
const output = 'docs/qa/lore-continuity';
await mkdir(output, { recursive: true });
const runs = [], samples = [], bodies = [], openings = [], endings = [];
const normalization = text => text.replace(/\b\d+\b/g, '#').trim();
const duplicateCount = values => values.length - new Set(values).size;
for (let seed = 1; seed <= 20; seed++) {
    const started = performance.now();
    const owner = new SharedSettlement(seed, 1000 + seed);
    let matched = owner.session.snapshot();
    const commands = [{ type: 'SalvageLongship', longshipId: 'founding-longship' },
        { type: 'AdvanceTicks', ticks: 50000 }];
    for (const command of commands) {
        owner.command(command);
        matched = core.applyCommand(matched, command);
    }
    assert.equal(owner.session.saveJSON(), core.serializeState(matched));
    const book = owner.session.book.snapshot();
    const restored = SharedSettlement.restore(owner.persist(), 'fjord');
    assert.deepEqual(restored.session.book.snapshot(), book);
    assert.equal(restored.session.saveJSON(), owner.session.saveJSON());
    assert.equal(book.chapters.length, 11);
    assert.equal(duplicateCount(book.chapters.map(chapter => chapter.text)), 0);
    for (const chapter of book.chapters) {
        bodies.push(chapter.text);
        const sentences = chapter.text.split(/(?<=\.)\s+/);
        openings.push(normalization(sentences[0]));
        endings.push(normalization(sentences.at(-1)));
    }
    runs.push({ seed, narrativeSeed: 1000 + seed, winters: 50,
        coreIdentical: true, exactBookReload: true,
        words: book.chapters.map(chapter => chapter.text.split(/\s+/).length),
        callbacks: book.chapters.reduce((sum, chapter) => sum + (chapter.plan?.callbackEventIds.length ?? 0), 0),
        duplicateBodiesRejected: book.chapters.reduce((sum, chapter) => sum + (chapter.composition?.rejectedDuplicateBodies ?? 0), 0),
        boundedFallbacks: book.chapters.filter(chapter => chapter.composition?.usedFallback).length,
        milliseconds: Math.round(performance.now() - started) });
    if (seed <= 3) for (const index of [0, 1, 5, 10]) samples.push({ scenario: 'Default rules, seed ' + seed,
        ...book.chapters[index] });
    console.log('Seed ' + seed + ': Core identical; exact book reload; ' + book.chapters.length + ' chapters');
}
// Same factual opening, independently controlled narrative stream.
const sameOpening = Array.from({ length: 32 }, (_, seed) => new SharedSettlement(32, seed).session.book.snapshot().chapters[0].text);
const repeat = new SharedSettlement(32, 7);
assert.equal(repeat.session.book.snapshot().chapters[0].text, sameOpening[7]);
const report = { generatedAt: new Date().toISOString(), generatorVersion: 2, styleVersion: 2,
    rules: 'Unchanged default Core rules; weather, resident mortality and cattle lifecycle enabled',
    runs, chapters: bodies.length, exactDuplicateBodies: duplicateCount(bodies),
    normalizedOpeningDuplicates: duplicateCount(openings), normalizedEndingDuplicates: duplicateCount(endings),
    sameFactsOpeningCohort: { seeds: 32, distinctBodies: new Set(sameOpening).size },
    note: 'Overlap is measured, not claimed absent. Different dates and actors are expected. No universal uniqueness or hardware performance guarantee.' };
await writeFile(output + '/cohort.json', JSON.stringify(report, null, 2) + '\n');
await writeFile(output + '/runtime-samples.json', JSON.stringify(samples, null, 2) + '\n');
console.log(JSON.stringify({ chapters: report.chapters, duplicates: report.exactDuplicateBodies,
    sameFactsDistinct: report.sameFactsOpeningCohort.distinctBodies,
    openingOverlap: report.normalizedOpeningDuplicates, endingOverlap: report.normalizedEndingDuplicates }));
