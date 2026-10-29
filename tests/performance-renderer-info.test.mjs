import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load-source.mjs';

const { performanceRendererInfo } = load('../src/fjord-play/PerformanceRendererInfo.ts');
const extension = { UNMASKED_VENDOR_WEBGL: 4, UNMASKED_RENDERER_WEBGL: 5 };
const context = () => ({
    VERSION: 1, VENDOR: 2, RENDERER: 3,
    canvas: { width: 1920, height: 1080, getBoundingClientRect: () => ({ width: 960, height: 540 }) },
    drawingBufferWidth: 1920, drawingBufferHeight: 1080,
    isContextLost: () => false,
    getContextAttributes: () => ({ antialias: true, alpha: false, depth: true, stencil: false,
        powerPreference: 'default', failIfMajorPerformanceCaveat: false }),
    getExtension: name => name === 'WEBGL_debug_renderer_info' ? extension : null,
    getParameter: key => ({ 1: 'WebGL 2.0', 2: 'WebKit', 3: 'WebKit WebGL',
        4: 'Test vendor', 5: 'Test graphics backend' })[key],
});

test('renderer export separates actual drawing pixels, CSS size and optional driver identity', () => {
    const report = performanceRendererInfo(context());
    assert.equal(report.status, 'available');
    assert.equal(report.api, 'WebGL 2.0');
    assert.deepEqual(report.drawingBuffer, [1920, 1080]);
    assert.deepEqual(report.canvasSize, [1920, 1080]);
    assert.deepEqual(report.cssSize, [960, 540]);
    assert.deepEqual(report.identity, { status: 'available', vendor: 'Test vendor', renderer: 'Test graphics backend' });
    assert.equal(report.attributes.powerPreference, 'default', 'A requested preference is not a GPU selection claim');
    assert.equal(report.hardwareAcceleration, undefined, 'No inferred browser setting or utilization');
});

test('renderer inspection tolerates absent, lost, restricted and incomplete APIs without stale identity', () => {
    assert.deepEqual(performanceRendererInfo(), { status: 'unavailable' });
    assert.deepEqual(performanceRendererInfo({ isContextLost: () => true,
        getParameter() { assert.fail('Do not query a lost context'); } }), { status: 'context-lost' });
    const hidden = performanceRendererInfo({ ...context(), getExtension: () => null });
    assert.equal(hidden.identity.status, 'unsupported-or-hidden');
    assert.equal(hidden.identity.renderer, null);
    assert.equal(hidden.api, 'WebGL 2.0');
    const denied = performanceRendererInfo({ ...context(), getExtension() { throw new Error('Denied'); } });
    assert.equal(denied.identity.status, 'unavailable');
    const restricted = performanceRendererInfo({ ...context(), getParameter() { throw new Error('Denied'); } });
    assert.equal(restricted.identity.renderer, null);
    assert.equal(restricted.api, null);
    assert.equal(restricted.identity.status, 'unavailable');
    assert.deepEqual(performanceRendererInfo({ isContextLost() { throw new Error('Disposed'); } }), { status: 'unavailable' });
    const incomplete = performanceRendererInfo({ ...context(), getContextAttributes: () => null,
        canvas: { width: 1920, height: 1080 }, getParameter: () => ({ unexpected: true }) });
    assert.equal(incomplete.cssSize, null);
    assert.equal(incomplete.attributes, null);
    assert.equal(incomplete.renderer, null);
    const bounded = performanceRendererInfo({ ...context(), getParameter: () => 'x'.repeat(100_000) });
    assert.equal(bounded.identity.renderer.length, 256);
});
