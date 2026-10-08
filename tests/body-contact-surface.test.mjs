import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Vector3 } from 'three';
import { ConvexHull } from 'three/addons/math/ConvexHull.js';
import { loadTypeScript } from '../scripts/load-typescript.mjs';
import { readGLB, geometryGLTF } from '../scripts/characters/glb-inspection.mjs';

const { goldenLabBody } = loadTypeScript(new URL('../src/characters/LabBodySources.ts', import.meta.url));
const { goldenBodySurfaceCalibration } = loadTypeScript(new URL('../src/characters/GoldenBodySurfaceCalibration.ts', import.meta.url));
const { validateBodySurfaceCalibration } = loadTypeScript(new URL('../src/characters/BodySurfaceCalibration.ts', import.meta.url));
const { createBodyContactSurface, requireBodyContactSurface } = loadTypeScript(new URL('../src/characters/BodyContactSurface.ts', import.meta.url));
const { CharacterFactory } = loadTypeScript(new URL('../src/characters/CharacterFactory.ts', import.meta.url));
const { goldenCharacterDNA } = loadTypeScript(new URL('../src/characters/GoldenCharacters.ts', import.meta.url));
const bare = { hair: 'none', beard: 'none', outfit: 'none', equipment: 'none', equipmentSocket: 'auto', hairColor: null, technicalWaistWrap: false };
const v = p => new Vector3(...p);
const move = (contact, distance) => v(contact.point).addScaledVector(v(contact.normal), distance).toArray();
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const file = new URL('../public' + goldenLabBody.path, import.meta.url);

async function fixture() {
    const record = readGLB(goldenLabBody.path), source = await geometryGLTF(record), originals = [];
    assert.equal(record.sha256, goldenLabBody.sha256);
    source.scene.traverse(o => { if (o.isSkinnedMesh) originals.push(o); });
    const calibration = validateBodySurfaceCalibration(goldenBodySurfaceCalibration, record.sha256, originals);
    const factory = new CharacterFactory(async url => { assert.equal(url.split('?')[0], goldenLabBody.path); return source; });
    const human = await factory.create(goldenCharacterDNA('golden_masculine_01'), 2, bare, { version: 1, preset: 'neutral', source: goldenLabBody.source });
    const meshes = [];
    human.root.traverse(o => { if (o.isSkinnedMesh) meshes.push(o); });
    const sourceGeometries = new Map(meshes.map(mesh => [mesh, mesh.geometry]));
    let revision = 1;
    const options = () => ({ sourceSHA256: record.sha256, root: human.root, getRevision: () => revision, sourceGeometries });
    const surface = createBodyContactSurface(calibration, meshes, options());
    return { record, source, originals, calibration, factory, human, meshes, sourceGeometries, options, surface, nextRevision: () => { revision++; } };
}

function witness(batch) {
    // This XY belongs to the actual source-bound lower mouth rim, not an
    // averaged vertex target asserted to be on the triangular surface.
    const hit = batch.raycast([-0.004663094412535429, 1.6256082653999329, 2], [0, 0, -1], { contactZones: ['HEAD'] });
    assert.ok(hit);
    return hit.nearest;
}

function assertCorrespondence(surface, contact) {
    const facet = surface.evidence().facets.find(f => f.mesh === contact.mesh && f.triangle === contact.triangle);
    assert.ok(facet);
    assert.deepEqual(contact.vertexIds, facet.vertexIds);
    assert.ok(contact.barycentric.every(value => value >= -1e-9 && value <= 1 + 1e-9));
    assert.ok(Math.abs(contact.barycentric.reduce((a, b) => a + b, 0) - 1) < 1e-9);
    const reconstructed = new Vector3();
    facet.points.forEach((p, i) => reconstructed.addScaledVector(v(p), contact.barycentric[i]));
    assert.ok(reconstructed.distanceTo(v(contact.point)) < 1e-10);
    assert.ok(Math.abs(v(contact.normal).length() - 1) < 1e-10);
}

test('actual r3 facial recess is outside full body but inside convex HEAD; real facial/scalp penetration remains rejected', async () => {
    const f = await fixture();
    try {
        const batch = f.surface.beginQueryBatch(), hull = new ConvexHull().setFromPoints(f.human.fit.cages.get('HEAD_CAGE').points);
        const contacts = [
            [-.0043046073988080025, 1.6478037238121033],
            [-.004663094412535429, 1.6256082653999329],
            [-.005003989674150944, 1.603240966796875],
            [.026936637237668037, 1.631628155708313],
            [-.03591601550579071, 1.6303906440734863],
        ];
        assert.equal(f.surface.completeTriangles, 1322);
        assert.equal(f.surface.evidence().facets.filter(facet => facet.coverage.every(zone => zone === 'HEAD')).length, 282);
        for (const [x, y] of contacts) {
            const hit = batch.raycast([x, y, 2], [0, 0, -1], { contactZones: ['HEAD'] });
            assert.ok(hit);
            assertCorrespondence(f.surface, hit.nearest);
            assert.equal(batch.query(hit.nearest.point).classification, 'on-surface');
            const outside = move(hit.nearest, .0005), buried = move(hit.nearest, -.003);
            assert.ok(hull.containsPoint(v(outside)), 'reproduce a true convex proxy false positive');
            assert.equal(batch.query(outside).classification, 'outside');
            assert.ok(batch.query(outside).signedDistance > 0);
            assert.equal(batch.query(buried).classification, 'inside');
            assert.ok(batch.query(buried).signedDistance < 0);
        }
        // Under-nose mean of two source vertices is inside, so never fabricate
        // its mean as an on-triangle contact or waive its actual penetration.
        assert.equal(batch.query([-.0043046073988080025, 1.6478037238121033, .08997591212391853]).classification, 'inside');
        const occiput = f.human.fit.landmarks.get('OCCIPUT').toArray(), scalp = batch.query(occiput, { contactZones: ['HEAD'] }).nearest;
        assert.equal(batch.query(move(scalp, -.003)).classification, 'inside');
        const rayMiss = batch.raycast([0, 3, 0], [0, 1, 0], { contactZones: ['HEAD'] });
        assert.equal(rayMiss, null);
    } finally { f.human.dispose(); }
});

test('semantic HEAD contact and rendering coverage masks cannot replace complete closed-body occupancy', async () => {
    const f = await fixture();
    try {
        const batch = f.surface.beginQueryBatch(), contact = witness(batch), buried = move(contact, -.003);
        const torso = f.surface.evidence().facets.find(facet => facet.coverage.every(zone => zone === 'TORSO_UPPER'));
        assert.ok(torso);
        const point = torso.points.reduce((sum, p) => sum.add(v(p)), new Vector3()).multiplyScalar(1 / 3).addScaledVector(v(torso.normal), .004).toArray();
        const full = batch.query(point), head = batch.query(point, { contactZones: ['HEAD'] });
        assert.equal(full.classification, head.classification);
        assert.equal(full.collisionDistance, head.collisionDistance);
        assert.deepEqual(full.collisionNearest, head.collisionNearest);
        assert.ok(head.contactDistance > head.collisionDistance);
        const before = f.meshes.map(mesh => Array.from(mesh.geometry.index.array));
        f.human.fit.maskBody(['HEAD']);
        assert.ok(f.meshes.some((mesh, i) => mesh.geometry.index.count < before[i].length));
        // Rebuild after a real canonical mask using constructor-captured full
        // source geometry. The masked current index is never collision authority.
        const masked = createBodyContactSurface(f.calibration, f.meshes, f.options());
        assert.equal(masked.completeTriangles, 1322);
        assert.equal(masked.query(buried, { contactZones: ['HEAD'] }).classification, 'inside');
        assert.throws(() => createBodyContactSurface(f.calibration, f.meshes, { ...f.options(), sourceGeometries: undefined }), /topology\/correspondence mismatch/);
        f.human.fit.maskBody([]);
        f.meshes.forEach((mesh, i) => assert.deepEqual(Array.from(mesh.geometry.index.array), before[i]));
    } finally { f.human.dispose(); }
});

test('source hash, branded calibration, immutable original correspondence and revision fail closed', async () => {
    const f = await fixture();
    try {
        const point = witness(f.surface.beginQueryBatch()).point;
        assert.throws(() => createBodyContactSurface(f.calibration, f.meshes, { ...f.options(), sourceSHA256: '0'.repeat(64) }), /source SHA256/);
        assert.throws(() => createBodyContactSurface(structuredClone(f.calibration), f.meshes, f.options()), /source-validated/);
        assert.throws(() => createBodyContactSurface(f.calibration, f.meshes, { ...f.options(), sourceGeometries: new Map() }), /map is incomplete/);
        const invalid = structuredClone(goldenBodySurfaceCalibration);
        invalid.meshes[0].triangleIndices = invalid.meshes[0].triangleIndices.slice(3);
        assert.throws(() => validateBodySurfaceCalibration(invalid, f.record.sha256, f.originals), /topology\/correspondence mismatch/);
        const geometry = f.sourceGeometries.get(f.meshes[0]), position = geometry.getAttribute('position'), index = geometry.index;
        const saved = position.getX(0);
        try { position.setX(0, saved + .001); assert.throws(() => f.surface.beginQueryBatch(), /neutral POSITION correspondence/); }
        finally { position.setX(0, saved); }
        const savedIndex = index.getX(0);
        try { index.setX(0, index.getX(1)); assert.throws(() => f.surface.query(point), /triangle correspondence/); }
        finally { index.setX(0, savedIndex); }
        const ownedClone = f.meshes[0].geometry.clone(), savedGeometry = f.meshes[0].geometry;
        try {
            f.meshes[0].geometry = ownedClone;
            ownedClone.getAttribute('position').setX(0, saved + .001);
            assert.throws(() => f.surface.beginQueryBatch(), /current clone neutral POSITION correspondence/);
        } finally { f.meshes[0].geometry = savedGeometry; ownedClone.dispose(); }
        const oldBatch = f.surface.beginQueryBatch();
        f.nextRevision();
        assert.throws(() => oldBatch.query(point), /Stale body contact fit revision/);
        assert.throws(() => oldBatch.raycast([0, 2, 2], [0, 0, -1]), /Stale body contact fit revision/);
        assert.throws(() => f.surface.beginQueryBatch(), /Stale body contact fit revision/);
    } finally { f.human.dispose(); }
});

test('actual current skin surface must remain closed before becoming occupancy authority', async () => {
    const f = await fixture();
    const mesh = f.meshes[0], savedGeometry = mesh.geometry, broken = savedGeometry.clone();
    try {
        // Break one split corner through its current skin weights; ordered
        // neutral POSITION/index still exactly match the validated full source.
        mesh.geometry = broken;
        broken.getAttribute('skinWeight').setXYZW(0, 0, 0, 0, 0);
        assert.throws(() => createBodyContactSurface(f.calibration, f.meshes, f.options()), /closed consistently oriented|Degenerate|Collapsed/);
    } finally { mesh.geometry = savedGeometry; broken.dispose(); f.human.dispose(); }
});

test('surface, batches and exact on-triangle evidence are immutable; invalid/unbranded queries cannot mutate source', async () => {
    const f = await fixture();
    const positionSnapshots = f.meshes.map(mesh => Array.from(mesh.geometry.getAttribute('position').array));
    const indexSnapshots = f.meshes.map(mesh => Array.from(mesh.geometry.index.array));
    const beforeHash = hash(readFileSync(file));
    try {
        const batch = f.surface.beginQueryBatch(), contact = witness(batch), evidence = f.surface.evidence(), sourcePoint = [.001, 1.62, .3], beforePoint = [...sourcePoint];
        assert.ok(Object.isFrozen(f.surface) && Object.isFrozen(batch));
        assert.ok(Object.isFrozen(evidence) && Object.isFrozen(evidence.facets) && Object.isFrozen(evidence.facets[0]));
        assert.ok(Object.isFrozen(evidence.facets[0].points[0]) && Object.isFrozen(contact.point) && Object.isFrozen(contact.barycentric));
        assert.throws(() => { evidence.facets[0].points[0][0] += 1; }, TypeError);
        assert.throws(() => { contact.normal[0] += 1; }, TypeError);
        assert.throws(() => requireBodyContactSurface({ ...f.surface }), /source-validated/);
        assert.throws(() => f.surface.beginQueryBatch.call({}), /source-validated/);
        assert.throws(() => f.surface.query.call({}, sourcePoint), /source-validated/);
        assert.throws(() => f.surface.raycast.call({}, [0, 2, 2], [0, 0, -1]), /source-validated/);
        assert.throws(() => f.surface.evidence.call({}), /source-validated/);
        assert.throws(() => batch.query.call({}, sourcePoint), /Unvalidated body contact query batch/);
        assert.throws(() => batch.raycast.call({}, [0, 2, 2], [0, 0, -1]), /Unvalidated body contact query batch/);
        const otherSurface = createBodyContactSurface(f.calibration, f.meshes, f.options()), otherBatch = otherSurface.beginQueryBatch();
        assert.throws(() => f.surface.beginQueryBatch.call(otherSurface), /instance mismatch/);
        assert.throws(() => f.surface.evidence.call(otherSurface), /instance mismatch/);
        assert.throws(() => batch.query.call(otherBatch, sourcePoint), /Unvalidated body contact query batch/);
        assert.throws(() => batch.raycast.call(otherBatch, [0, 2, 2], [0, 0, -1]), /Unvalidated body contact query batch/);
        for (const options of [{ contactZones: [] }, { contactZones: ['invented'] }, { contactZones: ['HEAD', 'HEAD'] }]) assert.throws(() => batch.query(sourcePoint, options), /semantic zone/);
        assert.throws(() => batch.query([NaN, 0, 0]), /Invalid body surface query/);
        assert.throws(() => batch.raycast([0, 2, 2], [0, 0, 0]), /cannot be zero/);
        assert.throws(() => batch.raycast([0, 2, 2], [NaN, 0, -1]), /Invalid body surface ray direction/);
        batch.query(sourcePoint, { contactZones: ['HEAD'] });
        assert.deepEqual(sourcePoint, beforePoint);
        f.meshes.forEach((mesh, i) => {
            assert.deepEqual(Array.from(mesh.geometry.getAttribute('position').array), positionSnapshots[i]);
            assert.deepEqual(Array.from(mesh.geometry.index.array), indexSnapshots[i]);
        });
        assert.equal(hash(readFileSync(file)), beforeHash);
        assert.equal(beforeHash, f.record.sha256);
    } finally { f.human.dispose(); }
});

test('validated snapshot copies constructor inputs; later option replacement cannot bypass its source or revision', async () => {
    const f = await fixture();
    try {
        const options = f.options(), surface = createBodyContactSurface(f.calibration, f.meshes, options);
        options.sourceSHA256 = '0'.repeat(64);
        options.getRevision = () => 999;
        const batch = surface.beginQueryBatch(), contact = witness(batch);
        assert.equal(surface.sourceSHA256, f.record.sha256);
        assert.equal(batch.sourceSHA256, f.record.sha256);
        assert.equal(surface.evidence().sourceSHA256, f.record.sha256);
        assert.equal(batch.query(contact.point).classification, 'on-surface');
        f.nextRevision();
        assert.throws(() => batch.query(contact.point), /Stale body contact fit revision/);
    } finally { f.human.dispose(); }
});
