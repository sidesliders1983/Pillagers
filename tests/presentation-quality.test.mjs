import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load-source.mjs';

test('Fjord quality preserves cold-start and live-switch resolution without changing resident detail', () => {
    const { resolvePresentationQuality } = load('../src/config/PresentationQuality.ts');
    const cold = resolvePresentationQuality('standard', 'low', 2, 'initial');
    const live = resolvePresentationQuality('standard', 'low', 2, 'live');
    const low = resolvePresentationQuality('low', 'low', 2, 'live');
    assert.equal(cold.pixelRatio, 1);
    assert.equal(live.pixelRatio, 1.5);
    assert.equal(low.pixelRatio, 1);
    assert.equal(resolvePresentationQuality('standard', 'low', .75, 'live').pixelRatio, .75);
    assert.deepEqual([cold.residentLOD, live.residentLOD, low.residentLOD], [2, 2, 2]);
    assert.deepEqual([cold.waterQuality, low.waterQuality], ['medium', 'low']);
    assert.deepEqual([cold.dressing, low.dressing], [
        { props: 64, cover: 320, castPropShadows: true },
        { props: 40, cover: 160, castPropShadows: false },
    ]);
});

test('existing preference defaults remain separate from canonical campaigns and survive restore', () => {
    const { defaultPresentationPreferences } = load('../src/config/PresentationQuality.ts');
    assert.deepEqual(defaultPresentationPreferences, { quality: 'low', effects: 'low' });
    const { SharedSettlement } = load('../src/play/SharedSettlement.ts');
    const shared = new SharedSettlement(32);
    const before = shared.session.saveJSON();
    shared.setPresentation({ quality: 'standard', effects: 'normal',
        camera: { position: [28, 31, -32], target: [0, 1, 0] } });
    const restored = SharedSettlement.restore(shared.persist(), 'fjord');
    assert.equal(shared.session.saveJSON(), before);
    assert.equal(restored.session.saveJSON(), before);
    assert.deepEqual(restored.presentation, shared.presentation);
});
