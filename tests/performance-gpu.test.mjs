import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load-source.mjs';

test('GPU diagnostics wait for availability, reject disjoint results and release their queries', () => {
    const { PerformanceGpuTimer } = load('../src/fjord-play/PerformanceGpuTimer.ts');
    let now = 0, current = null, available = false, disjoint = false, reads = 0;
    const queries = new Set(), results = [];
    const extension = { TIME_ELAPSED_EXT: 1, GPU_DISJOINT_EXT: 2, QUERY_COUNTER_BITS_EXT: 3 };
    const gl = {
        CURRENT_QUERY: 4, QUERY_RESULT_AVAILABLE: 5, QUERY_RESULT: 6,
        getExtension: () => extension, isContextLost: () => false,
        getQuery: (target, key) => key === 3 ? 64 : current,
        getParameter: () => disjoint,
        createQuery: () => { const query = {}; queries.add(query); return query; },
        beginQuery: (target, query) => { current = query; },
        endQuery: () => { current = null; },
        deleteQuery: query => queries.delete(query),
        getQueryParameter(query, key) {
            if (key === 5) return available;
            reads++;
            assert.ok(available && !disjoint, 'No blocking or invalid result read');
            return 2_500_000;
        },
    };
    const gpu = new PerformanceGpuTimer(gl, (status, ms, scope) => results.push({ status, ms, scope }), () => now);
    assert.equal(gpu.begin('main'), true);
    gpu.end();
    now = 500;
    gpu.poll();
    assert.equal(reads, 0);
    available = true;
    now = 1000;
    gpu.poll();
    assert.deepEqual(results.at(-1), { status: 'valid', ms: 2.5, scope: 'main' });
    assert.equal(queries.size, 0);
    assert.equal(gpu.begin('portrait'), true);
    gpu.end();
    disjoint = true;
    now += 500;
    gpu.poll();
    assert.equal(results.at(-1).status, 'disjoint');
    assert.equal(reads, 1);
    assert.equal(queries.size, 0);
    assert.equal(gpu.begin('main'), false, 'Do not begin more measurements while the GPU clock is disjoint');
    disjoint = false;
    current = { external: true };
    now += 500;
    assert.equal(gpu.begin('main'), false, 'An existing consumer owns the query');
    assert.equal(queries.size, 0);
    current = null;
    now += 500;
    gpu.begin('main');
    gpu.end();
    gpu.dispose();
    assert.equal(queries.size, 0);
    const unsupported = new PerformanceGpuTimer({ getExtension: () => null }, status => results.push({ status }));
    assert.equal(unsupported.begin('main'), false);
    assert.equal(results.at(-1).status, 'unsupported');
    unsupported.dispose();
    const interrupted = new PerformanceGpuTimer({ ...gl,
        getParameter() { throw new Error('Driver context unavailable'); } }, status => results.push({ status }));
    assert.doesNotThrow(() => assert.equal(interrupted.begin('main'), false));
    interrupted.dispose();
});

test('unavailable GPU results cannot accumulate more than four pending queries', () => {
    const { PerformanceGpuTimer } = load('../src/fjord-play/PerformanceGpuTimer.ts');
    let now = 0, current, high = 0;
    const owned = new Set();
    const gl = {
        CURRENT_QUERY: 4, QUERY_RESULT_AVAILABLE: 5, QUERY_RESULT: 6,
        getExtension: () => ({ TIME_ELAPSED_EXT: 1, GPU_DISJOINT_EXT: 2, QUERY_COUNTER_BITS_EXT: 3 }),
        isContextLost: () => false, getParameter: () => false,
        getQuery: (target, parameter) => parameter === 3 ? 64 : current,
        createQuery() { const query = {}; owned.add(query); high = Math.max(high, owned.size); return query; },
        beginQuery: (target, query) => { current = query; }, endQuery: () => { current = undefined; },
        deleteQuery: query => owned.delete(query),
        getQueryParameter(query, key) { assert.equal(key, 5); return false; },
    };
    const gpu = new PerformanceGpuTimer(gl, () => {}, () => now);
    for (let frame = 0; frame < 360; frame++) {
        now = frame * (1000 / 60);
        if (gpu.begin('main')) gpu.end();
    }
    assert.ok(high <= 4);
    gpu.dispose();
    assert.equal(owned.size, 0);
});
