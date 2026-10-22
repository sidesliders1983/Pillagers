import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { load } from './load-source.mjs';
const { BufferGeometry, BufferAttribute, Float32BufferAttribute, Float16BufferAttribute,
    InterleavedBuffer, InterleavedBufferAttribute } = createRequire(import.meta.url)('three');
const { createBodyCoverageBuilder, maskedBodyGeometry } = load('../src/characters/BodyCoverage.ts');

function fixture() {
    const source = new BufferGeometry();
    source.setAttribute('position', new Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3));
    source.setAttribute('normal', new BufferAttribute(new Int8Array([0, 0, 127, 0, 0, 127, 0, 0, 127]), 3, true));
    source.setAttribute('uv', new InterleavedBufferAttribute(
        new InterleavedBuffer(new Float32Array([0, 0, 9, 1, 0, 9, 0, 1, 9]), 3), 2, 0));
    source.setAttribute('skinIndex', new BufferAttribute(new Uint16Array([1, 0, 0, 0, 2, 0, 0, 0, 3, 0, 0, 0]), 4));
    source.setAttribute('skinWeight', new BufferAttribute(new Uint16Array([
        65535, 0, 0, 0, 65535, 0, 0, 0, 65535, 0, 0, 0,
    ]), 4, true));
    const half = new Float16BufferAttribute(new Uint16Array(9), 3);
    for (let vertex = 0; vertex < 3; vertex++) half.setXYZ(vertex, .125, .25, .5);
    source.morphAttributes.position = [new Float32BufferAttribute([.1, 0, 0, .2, 0, 0, .3, 0, 0], 3)];
    source.morphAttributes.normal = [half];
    source.morphTargetsRelative = true;
    source.setIndex([0, 1, 2]);
    const surface = { positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], indices: [0, 1, 2],
        regions: ['TORSO_UPPER', 'TORSO_UPPER', 'TORSO_UPPER'], triangles: 1 };
    return { source, surface };
}

test('one coverage batch decodes normalized/interleaved/half data once and owns each fragment', () => {
    const { source, surface } = fixture();
    let reads = 0;
    for (const attribute of [source.getAttribute('normal'), source.getAttribute('uv'),
        source.getAttribute('skinWeight'), source.morphAttributes.normal[0]]) {
        const original = attribute.getComponent;
        attribute.getComponent = function (...args) { reads++; return original.apply(this, args); };
    }
    const build = createBodyCoverageBuilder(source), once = reads;
    const a = build(surface, new Set()), b = build(surface, new Set());
    try {
        assert.ok(once > 0);
        assert.equal(reads, once, 'another fragment does not decode the complete body again');
        assert.deepEqual([...a.getAttribute('normal').array], [0, 0, 1, 0, 0, 1, 0, 0, 1]);
        assert.deepEqual([...a.getAttribute('uv').array], [0, 0, 1, 0, 0, 1]);
        const accessorValues = Array.from({ length: 9 }, (_, index) =>
            source.morphAttributes.normal[0].getComponent(Math.floor(index / 3), index % 3));
        assert.deepEqual([...a.morphAttributes.normal[0].array], accessorValues,
            'retain the installed Three version’s existing getComponent semantics');
        assert.equal(a.morphTargetsRelative, true);
        a.getAttribute('position').setX(0, 99);
        assert.equal(b.getAttribute('position').getX(0), 0);
        assert.equal(source.getAttribute('position').getX(0), 0);
        source.getAttribute('position').setX(0, 7);
        const next = maskedBodyGeometry(source, surface, new Set());
        try { assert.equal(next.getAttribute('position').getX(0), 7, 'a new refit sees even an unversioned in-place edit'); }
        finally { next.dispose(); }
    } finally { a.dispose(); b.dispose(); source.dispose(); }
});

test('early fragment compaction retains exact cut positions, native influences, morphs and coverage lineage', () => {
    const { source, surface } = fixture();
    const geometry = createBodyCoverageBuilder(source)(surface, new Set(), [
        { regions: ['TORSO_UPPER'], normal: [0, 1, 0], constant: -.5 },
    ], [], 0);
    try {
        assert.deepEqual([...geometry.index.array], [0, 1, 2]);
        assert.deepEqual([...geometry.getAttribute('position').array], [.5, .5, 0, 0, 1, 0, 0, .5, 0]);
        assert.deepEqual([...geometry.getAttribute('skinIndex').array], [2, 3, 0, 0, 3, 0, 0, 0, 1, 3, 0, 0]);
        assert.deepEqual([...geometry.getAttribute('skinWeight').array], [.5, .5, 0, 0, 1, 0, 0, 0, .5, .5, 0, 0]);
        assert.deepEqual(geometry.userData.coverageWeights.map(value => value.vertex), [0, 2]);
        assert.equal(geometry.morphAttributes.position[0].count, 3);
        assert.equal(geometry.morphAttributes.normal[0].getX(0), source.morphAttributes.normal[0].getComponent(0, 0));
        assert.equal(geometry.morphTargetsRelative, true);
    } finally { geometry.dispose(); source.dispose(); }
});
