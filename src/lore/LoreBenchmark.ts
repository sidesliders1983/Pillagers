import type { LoreResult } from './LocalLoreAdapter';
export type LoreComparisonRecord = {
    campaign: string;
    chapter: number;
    baseline: string;
    result: LoreResult;
};
function repetition(texts: string[]) {
    const normalized = texts.map(text => text.toLowerCase().replace(/\d+/g, '#').replace(/\s+/g, ' ').trim());
    return { exactRepeatedBodies: texts.length - new Set(texts).size,
        normalizedRepeatedBodies: normalized.length - new Set(normalized).size };
}
/** Report all outcomes; a rejected model answer is a fallback, never a quality success. */
export function summarizeLoreComparison(records: readonly LoreComparisonRecord[]) {
    const timings = records.flatMap(record => Number.isFinite(record.result.milliseconds) ?
        [record.result.milliseconds!] : []).sort((a, b) => a - b);
    const reasons: Record<string, number> = {};
    for (const record of records) reasons[record.result.reason] = (reasons[record.result.reason] ?? 0) + 1;
    return {
        chapters: records.length,
        accepted: records.filter(record => record.result.status === 'accepted').length,
        fallbacks: records.filter(record => record.result.status === 'fallback').length,
        stale: records.filter(record => record.result.status === 'stale').length,
        reasons,
        latencyMs: { samples: timings.length, minimum: timings[0] ?? null,
            median: timings.length ? timings[Math.floor(timings.length / 2)] : null,
            p95: timings.length ? timings[Math.ceil(timings.length * 0.95) - 1] : null,
            maximum: timings.at(-1) ?? null },
        baseline: repetition(records.map(record => record.baseline)),
        comparison: repetition(records.map(record => record.result.text)),
        readerPreference: 'not-measured',
        factuality: 'Accepted output is drawn from the approved catalogue; no semantic truth claim for unrestricted prose.'
    };
}
