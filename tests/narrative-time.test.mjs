import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { load } from './load-source.mjs';
const core = load('../src/simulation/SimulationCore.ts');
const { ClanBook } = load('../src/lore/ClanBook.ts');
const { SharedSettlement } = load('../src/play/SharedSettlement.ts');
const { freezeLoreRequest } = load('../src/lore/LocalLoreAdapter.ts');

// Explicit source fixtures exercise the public book; they are not measured campaigns.
function herdBook(seed, salvage = true) {
    const initial = core.createCampaign(32);
    const book = new ClanBook(initial, true, seed);
    const event = (id, type, winter, details) => ({ id, type, time: { winter, tick: 0 }, details });
    const state = structuredClone(initial);
    state.time = { winter: 805, tick: 0 };
    state.events.push(...[
        ...(salvage ? [event('qa-salvage', 'FoundingLongshipSalvaged', 800, { longshipId: 'founding-longship', materials: 20 })] : []),
        event('qa-calf-a', 'CattleBorn', 801, { cattleId: 'qa-a', sex: 'female' }),
        event('qa-calf-b', 'CattleBorn', 801, { cattleId: 'qa-b', sex: 'male' }),
        event('qa-calf-c', 'CattleBorn', 803, { cattleId: 'qa-c', sex: 'female' }),
        event('qa-cow-death', 'CattleDied', 804, { cattleId: 'cattle-1', sex: 'female', age: 7 }),
        event('qa-calf-d', 'CattleBorn', 804, { cattleId: 'qa-d', sex: 'female' })
    ]);
    book.closeCheckpoint(state);
    return { state, book };
}

test('each herd paragraph anchors itself and keeps same-winter events and a two-year gap exact across variants', async () => {
    for (let seed = 0; seed < 4; seed++) {
        const { state, book } = herdBook(seed);
        const chapter = book.snapshot().chapters[1];
        const herd = chapter.paragraphs.find(paragraph => paragraph.templateId.includes('thread.herd'));
        assert.match(herd.text, /In the winter after the longship was salvaged, two calves were born/);
        assert.match(herd.text, /Two winters later, one calf was born/);
        assert.match(herd.text, /The following winter, .*adult cow died/);
        assert.match(herd.text, /[Tt]hat same winter, one calf was born/);
        assert.doesNotMatch(herd.text, /Winter 80[134]|cattle-|qa-/);
        assert.ok(herd.sourceEventIds.includes('qa-salvage'));
        const frozen = await freezeLoreRequest(state, book.save(state), 1);
        const slot = frozen.context.slots.find(item => item.role.includes('thread.herd'));
        for (const option of slot.options) {
            assert.match(option.text, /Two winters later/);
            assert.match(option.text, /[Tt]hat same winter/);
        }
        assert.doesNotMatch(chapter.text, /When the interval ended|complete account recorded|unmet Food need/);
        assert.equal(chapter.templateVersion, 3);
    }
});


test('topic changes re-anchor and never mention a salvage that is absent from the source history', () => {
    const { state, book } = herdBook(0, false);
    const herd = book.snapshot().chapters[1].paragraphs.find(item => item.templateId.includes('thread.herd'));
    assert.match(herd.text, /In the winter after the founding party arrived/);
    assert.doesNotMatch(herd.text, /salvaged/);
    const arrival = state.events.find(event => event.type === 'FoundingPartyLanded');
    assert.ok(herd.sourceEventIds.includes(arrival.id));
});

test('legacy published chapters and provenance remain exact on load while future text uses style three', async () => {
    const { corpus } = JSON.parse(gunzipSync(readFileSync('docs/qa/local-lore/corpus.json.gz')).toString('utf8'));
    const frozen = corpus[0];
    const owner = SharedSettlement.restore(frozen.snapshots.at(-1), 'fjord');
    const earlier = owner.session.book.snapshot().chapters;
    assert.equal(earlier[0].templateVersion, 2);
    const oldRequest = await freezeLoreRequest(owner.session.snapshot(), owner.session.book.save(owner.session.snapshot()), 2);
    assert.deepEqual(oldRequest.catalogue, frozen.requests[2].catalogue);
    const canonical = owner.session.saveJSON();
    assert.equal(SharedSettlement.restore(owner.persist(), 'play').session.saveJSON(), canonical);
    owner.command({ type: 'AdvanceTicks', ticks: 5000 });
    const book = owner.session.book.snapshot();
    assert.deepEqual(book.chapters.slice(0, -1), earlier);
    assert.equal(book.chapters.at(-1).templateVersion, 3);
    assert.equal(book.styleVersion, 3);
    assert.equal(book.generatorVersion, 3);
    assert.deepEqual(SharedSettlement.restore(owner.persist(), 'play').session.book.snapshot(), book);
});


test('without a validated arrival or salvage each paragraph uses one exact anchor, never an invented event', () => {
    const initial = core.createCampaign(32);
    initial.events = initial.events.filter(event => !event.type.startsWith('Founding'));
    const book = new ClanBook(initial, true, 0);
    const state = structuredClone(initial);
    state.time = { winter: 805, tick: 0 };
    state.events.push(
        { id: 'qa-born', type: 'CattleBorn', time: { winter: 801, tick: 0 }, details: { cattleId: 'qa-a' } },
        { id: 'qa-born-later', type: 'CattleBorn', time: { winter: 803, tick: 0 }, details: { cattleId: 'qa-b' } }
    );
    book.closeCheckpoint(state);
    const text = book.snapshot().chapters[1].paragraphs.find(item => item.templateId.includes('herd')).text;
    assert.match(text, /^In Winter 801, one calf was born. Two winters later/);
    assert.doesNotMatch(text, /arrived|salvaged|Winter 803/);
});
