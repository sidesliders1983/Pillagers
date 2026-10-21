import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load-source.mjs';

test('on-demand portraits reuse matching appearances, invalidate visible changes and discard cancelled queued requests', async () => {
    const { CharacterPortraits } = load('../src/characters/CharacterPortraits.ts');
    const { defaultDNA } = load('../src/characters/CharacterDNA.ts');
    const { projectFacialIdentity } = load('../src/characters/FacialIdentity.ts');
    const { createSettlement } = load('../src/simulation/SimulationCore.ts');
    const input = { dna: defaultDNA(), face: projectFacialIdentity(createSettlement(1983), 'einar') };
    let rendered = 0;
    let finish;
    const portraits = new CharacterPortraits(async () => {
        rendered++;
        if (rendered === 1) await new Promise(resolve => { finish = resolve; });
        return 'data:image/png;base64,portrait-' + rendered;
    }, 2);
    const first = portraits.request(input);
    await new Promise(resolve => setImmediate(resolve));
    const cancelled = new AbortController();
    const obsolete = portraits.request({ ...input, dna: { ...input.dna, age: 80 } }, cancelled.signal);
    cancelled.abort();
    finish();
    const image = await first;
    assert.equal(await obsolete, undefined);
    assert.equal(await portraits.request(structuredClone(input)), image);
    assert.equal(rendered, 1);
    await portraits.request({ ...input, dna: { ...input.dna, age: 45 } });
    await portraits.request({ ...input, presentation: { hair: 'none' } });
    assert.equal(rendered, 3);
    await portraits.request(input);
    assert.equal(rendered, 4, 'Evicted images are regenerated within a bounded cache');
    portraits.dispose();
    assert.equal(await portraits.request(input), undefined);
});
