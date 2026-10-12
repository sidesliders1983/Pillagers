import test from 'node:test';
import assert from 'node:assert/strict';
import { auditLoreCohort } from '../scripts/qa/local-lore-audit.mjs';

function fixture() {
    const requests = [0, 1, 2].map(chapterIndex => ({
        key: 'key-' + chapterIndex, chapterIndex, baseline: 'Trusted chapter ' + chapterIndex,
        context: { facts: { stocks: { food: 30, materials: 5 } }, slots: [], previousText: [] }
    }));
    const corpus = [{ scenario: 'one', requests }];
    const rows = requests.map((request, index) => ({ campaign: 'one', chapter: index,
        inputKey: request.key, baseline: request.baseline,
        inputContext: { ...structuredClone(request.context), previousText: requests.slice(0, index).map(item => item.baseline) },
        result: { key: request.key, status: 'fallback', reason: 'disabled', text: request.baseline }
    }));
    return { corpus, rows };
}

test('a complete cohort has exactly one outcome per frozen chapter, with no missing or additional rows', () => {
    const { corpus, rows } = fixture();
    assert.equal(auditLoreCohort(corpus, rows).failures.length, 3);
    for (const changed of [rows.slice(0, -1), [...rows, rows[2]], [...rows, { ...rows[2], campaign: 'foreign' }]]) {
        assert.throws(() => auditLoreCohort(corpus, changed), /cohort|duplicate|unexpected|missing/i);
    }
});


test('the audit rejects changed baseline, result identity, complete context and fallback content', () => {
    const { corpus, rows } = fixture();
    const mutations = [
        row => { row.baseline = 'Invented baseline'; },
        row => { row.result.key = 'foreign-key'; },
        row => { row.inputContext.facts.stocks.food = 999; },
        row => { row.inputContext.slots = [{ role: 'invented', options: [] }]; },
        row => { row.result.text = 'Invented fallback'; },
        row => { row.result.status = 'stale'; }
    ];
    for (const mutate of mutations) {
        const changed = structuredClone(rows);
        mutate(changed[1]);
        assert.throws(() => auditLoreCohort(corpus, changed));
    }
});
