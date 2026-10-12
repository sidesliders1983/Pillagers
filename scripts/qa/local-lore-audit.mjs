import assert from 'node:assert/strict';

/** Audit a complete frozen cohort before it can supply comparison statistics. */
export function auditLoreCohort(corpus, rows) {
    const rowKey = (campaign, chapter) => JSON.stringify([campaign, chapter]);
    const expected = new Set(corpus.flatMap(campaign => campaign.requests.map(request =>
        rowKey(campaign.scenario, request.chapterIndex))));
    const expectedCount = corpus.reduce((count, campaign) => count + campaign.requests.length, 0);
    assert.equal(expected.size, expectedCount, 'Duplicate frozen cohort request');
    const indexed = new Map();
    for (const row of rows) {
        const key = rowKey(row.campaign, row.chapter);
        assert.ok(expected.has(key), 'Unexpected cohort outcome: ' + key);
        assert.ok(!indexed.has(key), 'Duplicate cohort outcome: ' + key);
        indexed.set(key, row);
    }
    assert.equal(indexed.size, expected.size, 'Incomplete cohort: missing chapter outcomes');
    let acceptedAudited = 0, changedAccepted = 0, acceptedWithOlderSources = 0;
    const failures = [];
    for (const campaign of corpus) {
        const history = [];
        for (const request of campaign.requests) {
            const row = indexed.get(rowKey(campaign.scenario, request.chapterIndex));
            assert.ok(row, 'Missing cohort outcome');
            assert.equal(row.inputKey, request.key);
            assert.equal(row.baseline, request.baseline);
            assert.equal(row.result.key, request.key);
            assert.deepEqual(row.inputContext, {
                ...structuredClone(request.context), previousText: history.slice(-3)
            });
            if (row.result.status === 'accepted') {
                const chosen = row.result.selectedIds.map(id => request.catalogue.find(item => item.id === id));
                assert.equal(chosen.length, request.context.slots.length);
                chosen.forEach((item, index) => assert.ok(request.context.slots[index].options.some(option =>
                    option.id === item?.id)));
                assert.equal(row.result.text, chosen.map(item => item.text).join('\n\n'));
                const sources = [...new Set(chosen.flatMap(item => item.sourceEventIds))];
                assert.deepEqual(row.result.sourceEventIds, sources);
                const checkpoint = JSON.parse(campaign.snapshots[request.chapterIndex]).fjord.campaign;
                const events = checkpoint.events.slice(0, request.checkpoint.eventEnd);
                assert.ok(sources.every(id => events.some(event => event.id === id)));
                const from = request.context.facts.period?.from;
                if (from && sources.some(id => events.some(event => event.id === id &&
                    (event.time.winter < from.winter || event.time.winter === from.winter && event.time.tick < from.tick)))) {
                    acceptedWithOlderSources++;
                }
                acceptedAudited++;
                if (row.result.text !== row.baseline) changedAccepted++;
            } else {
                assert.equal(row.result.status, 'fallback', 'A complete cohort cannot contain stale or rejected results');
                assert.equal(row.result.text, request.baseline, 'Fallback must equal the trusted frozen baseline');
                failures.push({ campaign: row.campaign, chapter: row.chapter,
                    reason: row.result.reason, raw: row.result.raw });
            }
            history.push(row.result.text);
        }
    }
    return { acceptedAudited, changedAccepted, acceptedWithOlderSources, failures };
}
