import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load-source.mjs';
const { SharedSettlement } = load('../src/play/SharedSettlement.ts');
const { freezeLoreRequest, LocalLoreAdapter } = load('../src/lore/LocalLoreAdapter.ts');

async function opening() {
    const owner = new SharedSettlement(32, 7);
    return { owner, request: await freezeLoreRequest(owner.session.snapshot(),
        owner.session.book.save(owner.session.snapshot()), 0) };
}

test('a disabled local model keeps the readable opening and leaves campaign playback and save untouched', async () => {
    const { owner, request } = await opening();
    owner.session.setRunning(true);
    const canonical = owner.session.saveJSON();
    const book = owner.session.book.snapshot();
    const result = await new LocalLoreAdapter().generate(request);
    assert.equal(result.status, 'fallback');
    assert.equal(result.reason, 'disabled');
    assert.equal(result.text, book.chapters[0].text);
    assert.equal(owner.session.running, true);
    assert.equal(owner.session.saveJSON(), canonical);
    assert.deepEqual(owner.session.book.snapshot(), book);
    assert.equal(request.context.fullSave, undefined);
    assert.equal(request.context.rng, undefined);
});

import { createServer } from 'node:http';
async function modelServer(reply, run) {
    const server = createServer(async (incoming, outgoing) => {
        let body = '';
        for await (const chunk of incoming) body += chunk;
        const payload = JSON.parse(body);
        const context = JSON.parse(payload.messages.at(-1).content);
        const answer = await reply(context, payload);
        outgoing.setHeader('Content-Type', 'application/json');
        outgoing.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(answer) } }] }));
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    try { await run('http://127.0.0.1:' + server.address().port); }
    finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}

test('the optional local writer can arrange only approved, sourced paragraphs from the frozen opening', async () => {
    const { owner, request } = await opening();
    const saved = owner.persist();
    await modelServer(context => ({ choices: context.slots.map(slot => slot.options.at(-1).id) }), async endpoint => {
        const adapter = new LocalLoreAdapter({ endpoint, model: 'fixture-model', identity: 'fixture-revision' });
        const result = await adapter.generate(request);
        assert.equal(result.status, 'accepted');
        assert.match(result.text, /Winter 800/);
        assert.match(result.text, /already partners/);
        assert.match(result.text, /tents/);
        assert.doesNotMatch(result.text, /cattle-\d|founding-longship|\d+ (?:Food|Materials)/);
        assert.notEqual(result.text, request.baseline);
        assert.equal(owner.persist(), saved);
    });
});

test('an unsupported paragraph or extra invented prose is rejected and the factual baseline survives', async () => {
    const { request } = await opening();
    for (const answer of [{ choices: ['foreign-event'] }, { choices: [], prose: 'They feared the gods.' }]) {
        await modelServer(() => answer, async endpoint => {
            const result = await new LocalLoreAdapter({ endpoint, model: 'fixture-model', identity: 'v1' }).generate(request);
            assert.equal(result.status, 'fallback');
            assert.equal(result.text, request.baseline);
            assert.doesNotMatch(result.text, /feared the gods/);
            assert.ok(result.raw, 'Rejected raw output remains available for the report');
        });
    }
    assert.throws(() => new LocalLoreAdapter({ endpoint: 'https://api.example.com', model: 'remote', identity: 'v1' }), /loopback/);
});

test('timeout and unavailable loopback server leave a readable chapter within the configured deadline', async () => {
    const { request } = await opening();
    await modelServer(async () => { await new Promise(resolve => setTimeout(resolve, 100)); return {}; }, async endpoint => {
        const result = await new LocalLoreAdapter({ endpoint, model: 'fixture', identity: 'v1', timeoutMs: 15 }).generate(request);
        assert.equal(result.reason, 'timeout');
        assert.equal(result.text, request.baseline);
    });
    const result = await new LocalLoreAdapter({ endpoint: 'http://127.0.0.1:1', model: 'fixture', identity: 'v1' }).generate(request);
    assert.equal(result.status, 'fallback');
    assert.equal(result.text, request.baseline);
});

test('duplicate queued chapters settle once, see committed earlier results, and reject a result after rollback', async () => {
    const { LoreExperimentQueue } = load('../src/lore/LoreExperimentQueue.ts');
    const { owner, request } = await opening();
    owner.command({ type: 'AdvanceTicks', ticks: 5000 });
    const next = await freezeLoreRequest(owner.session.snapshot(), owner.session.book.save(owner.session.snapshot()), 1);
    const seen = [];
    await modelServer(async context => {
        seen.push(context.previousText);
        await new Promise(resolve => setTimeout(resolve, 30));
        return { choices: context.slots.map(slot => slot.options.at(-1).id) };
    }, async endpoint => {
        const queue = new LoreExperimentQueue(new LocalLoreAdapter({ endpoint, model: 'fixture', identity: 'v1' }), request.lineage);
        const first = queue.enqueue(request);
        const duplicate = queue.enqueue(request);
        const second = queue.enqueue(next);
        const firstResult = await first;
        assert.deepEqual(await duplicate, firstResult);
        assert.equal((await second).status, 'accepted');
        assert.deepEqual(seen[1], [firstResult.text]);
        assert.equal(seen.length, 2);
        const restarted = new LoreExperimentQueue(new LocalLoreAdapter({ endpoint, model: 'fixture', identity: 'v1' }), request.lineage);
        const late = restarted.enqueue(request);
        await new Promise(resolve => setTimeout(resolve, 10));
        restarted.invalidate('a-new-save-lineage');
        assert.equal((await late).status, 'stale');
        assert.deepEqual(restarted.results(), []);
        assert.equal(owner.session.running, false);
        const restored = SharedSettlement.restore(owner.persist(), 'fjord');
        assert.equal(restored.session.saveJSON(), owner.session.saveJSON());
        assert.deepEqual(restored.session.book.snapshot(), owner.session.book.snapshot());
    });
});

test('five-Winter requests retain exact ledger totals and callbacks without sending the full transaction stream', async () => {
    const owner = new SharedSettlement(32, 7);
    owner.command({ type: 'SalvageLongship', longshipId: 'founding-longship' });
    owner.command({ type: 'AdvanceTicks', ticks: 5000 });
    const request = await freezeLoreRequest(owner.session.snapshot(), owner.session.book.save(owner.session.snapshot()), 1);
    assert.equal(request.context.facts.ledger.food.closing, owner.session.snapshot().stocks.food);
    assert.equal(request.context.facts.ledger.food.transactions, undefined);
    assert.equal(request.context.facts.ledger.transactions, undefined);
    assert.ok(JSON.stringify(request.context).length < 24000);
    assert.equal(request.context.memory.featuredEventIds.length, 0, 'Only committed earlier chapter planning memory belongs to this request');
});


test('a modified catalogue is rejected before inference or fallback text is returned', async () => {
    const { request } = await opening();
    const forged = structuredClone(request);
    forged.catalogue[0].text = 'The gods demanded a sacrifice.';
    await assert.rejects(() => new LocalLoreAdapter().generate(forged), /invalid frozen request/i);
});

test('the public benchmark summary counts every fallback and separates baseline repetition from accepted model output', () => {
    const { summarizeLoreComparison } = load('../src/lore/LoreBenchmark.ts');
    const records = [
        { campaign: 'a', chapter: 0, baseline: 'The party arrived.', result: { status: 'accepted', text: 'The party arrived.', reason: 'validated-catalogue', milliseconds: 1000 } },
        { campaign: 'a', chapter: 1, baseline: 'The party arrived.', result: { status: 'fallback', text: 'The party arrived.', reason: 'timeout', milliseconds: 2000 } },
        { campaign: 'b', chapter: 0, baseline: 'A calf was born.', result: { status: 'fallback', text: 'A calf was born.', reason: 'unsupported-selection', milliseconds: 3000 } }
    ];
    const report = summarizeLoreComparison(records);
    assert.equal(report.chapters, 3);
    assert.equal(report.accepted, 1);
    assert.equal(report.fallbacks, 2);
    assert.deepEqual(report.reasons, { 'validated-catalogue': 1, timeout: 1, 'unsupported-selection': 1 });
    assert.equal(report.latencyMs.maximum, 3000);
    assert.equal(report.baseline.exactRepeatedBodies, 1);
    assert.equal(report.comparison.exactRepeatedBodies, 1);
    assert.equal(report.readerPreference, 'not-measured');
});

test('HTTP failures preserve the raw diagnostic response as well as the controlled fallback', async () => {
    const { request } = await opening();
    const server = createServer((_incoming, outgoing) => {
        outgoing.statusCode = 400;
        outgoing.end(JSON.stringify({ error: { message: 'Context budget exceeded', type: 'context' } }));
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
        const result = await new LocalLoreAdapter({ endpoint: 'http://127.0.0.1:' + server.address().port,
            model: 'fixture', identity: 'v1' }).generate(request);
        assert.equal(result.reason, 'http-400');
        assert.match(result.raw, /Context budget exceeded/);
        assert.equal(result.text, request.baseline);
    } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});

test('the queue rejects changed inputs hidden behind a cached key and future chapters arriving out of order', async () => {
    const { LoreExperimentQueue } = load('../src/lore/LoreExperimentQueue.ts');
    const { owner, request } = await opening();
    const queue = new LoreExperimentQueue(new LocalLoreAdapter(), request.lineage);
    const original = await queue.enqueue(request);
    const changed = structuredClone(request);
    changed.context.facts.stocks.food = 999999;
    await assert.rejects(() => queue.enqueue(changed), /changed frozen request/i);
    const foreign = { ...request, key: 'another-key', lineage: 'another-book' };
    await assert.rejects(() => queue.enqueue(foreign), /lineage/i);
    owner.command({ type: 'AdvanceTicks', ticks: 10000 });
    const future = await freezeLoreRequest(owner.session.snapshot(), owner.session.book.save(owner.session.snapshot()), 2);
    await assert.rejects(() => queue.enqueue(future), /chronological/i);
    assert.deepEqual(queue.results(), [original]);
});

test('malformed transport output is preserved and cannot replace the controlled chapter', async () => {
    const { request } = await opening();
    const server = createServer((_incoming, outgoing) => outgoing.end('not valid JSON'));
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
        const result = await new LocalLoreAdapter({ endpoint: 'http://127.0.0.1:' + server.address().port,
            model: 'fixture', identity: 'v1' }).generate(request);
        assert.equal(result.status, 'fallback');
        assert.equal(result.reason, 'unavailable-or-invalid-response');
        assert.equal(result.text, request.baseline);
        assert.equal(result.raw, 'not valid JSON');
    } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});


test('a changed baseline is rejected without prose or committed context, even when inference is disabled', async () => {
    const { LoreExperimentQueue } = load('../src/lore/LoreExperimentQueue.ts');
    const { owner, request } = await opening();
    const forged = structuredClone(request);
    forged.baseline = 'The gods demanded a sacrifice.';
    await assert.rejects(() => new LocalLoreAdapter().generate(forged), /invalid frozen request/i);
    await modelServer(() => { throw new Error('Invalid input must never reach inference'); }, async endpoint => {
        await assert.rejects(() => new LocalLoreAdapter({ endpoint, model: 'fixture', identity: 'v1' }).generate(forged), /invalid frozen request/i);
    });
    const queue = new LoreExperimentQueue(new LocalLoreAdapter(), request.lineage);
    const invalid = queue.enqueue(forged);
    owner.command({ type: 'AdvanceTicks', ticks: 5000 });
    const next = await freezeLoreRequest(owner.session.snapshot(), owner.session.book.save(owner.session.snapshot()), 1);
    const later = queue.enqueue(next);
    await assert.rejects(() => invalid, /invalid frozen request/i);
    await assert.rejects(() => later, /earlier chapter failed/i);
    assert.deepEqual(queue.results(), []);
    queue.invalidate(request.lineage);
    const recovered = await queue.enqueue(request);
    assert.equal(recovered.text, request.baseline);
    assert.deepEqual(queue.results(), [recovered]);
});
