import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import ts from 'typescript';
import { BufferGeometry, Float32BufferAttribute, Group, Mesh, MeshStandardMaterial, Triangle, Vector3 } from 'three';
import { ConvexHull } from 'three/addons/math/ConvexHull.js';
import { loadTypeScript } from '../scripts/load-typescript.mjs';
import { readGLB, geometryGLTF } from '../scripts/characters/glb-inspection.mjs';
import { auditSurfaceIntersections } from '../scripts/characters/surface-intersections.mjs';

const { goldenLabBody } = loadTypeScript(new URL('../src/characters/LabBodySources.ts', import.meta.url));
const { CharacterFactory } = loadTypeScript(new URL('../src/characters/CharacterFactory.ts', import.meta.url));
const { goldenCharacterDNA } = loadTypeScript(new URL('../src/characters/GoldenCharacters.ts', import.meta.url));
const { attachmentVersion } = loadTypeScript(new URL('../src/characters/AttachmentContract.ts', import.meta.url));
const { headSurfaceFitter } = loadTypeScript(new URL('../src/character-lab/HeadSurfaceContactFit.ts', import.meta.url));
const { appearanceModules, disposeModules } = loadTypeScript(new URL('../src/character-lab/AppearanceModules.ts', import.meta.url));
const bodyContactModule = loadTypeScript(new URL('../src/characters/BodyContactSurface.ts', import.meta.url));
const bare = { hair: 'none', beard: 'none', outfit: 'none', equipment: 'none', equipmentSocket: 'auto', hairColor: null, technicalWaistWrap: false };
const profile = { hairStyle: 'short', beardStyle: 'short', color: '#654832', greyAmount: 0 };
const v = point => new Vector3(...point);
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
function geometrySnapshot(geometry) { return { position: Array.from(geometry.getAttribute('position').array), index: geometry.index ? Array.from(geometry.index.array) : null }; }
function bodySnapshot(human) {
    const meshes = [];
    human.root.traverse(o => { if (o.isSkinnedMesh) meshes.push({ name: o.name, geometry: geometrySnapshot(o.geometry), morphs: [...(o.morphTargetInfluences ?? [])], inverses: o.skeleton.boneInverses.map(m => [...m.elements]) }); });
    return { meshes, cages: [...human.fit.cages].map(([name, cage]) => ({ name, points: cage.points.map(p => p.toArray()), canonicalBounds: [cage.canonicalBounds.min.toArray(), cage.canonicalBounds.max.toArray()] })) };
}
async function fixture() {
    const factory = new CharacterFactory(async url => geometryGLTF(readGLB(url.split('?')[0])));
    const human = await factory.create(goldenCharacterDNA('golden_masculine_01'), 2, bare, { version: 1, preset: 'neutral', source: goldenLabBody.source });
    const surface = human.fit.bodyContactSurface;
    assert.ok(surface);
    assert.equal(surface.sourceSHA256, goldenLabBody.sha256);
    assert.equal(surface.revision, human.fit.revision);
    const centre = human.fit.headFrame.bounds.getCenter(new Vector3()), size = human.fit.headFrame.bounds.getSize(new Vector3());
    const contact = surface.raycast([-.004663094412535429, 1.6256082653999329, 2], [0, 0, -1], { contactZones: ['HEAD'] }).nearest;
    const skull = human.fit.cages.get('HEAD_CAGE').points.map(p => p.clone().sub(centre));
    return { factory, human, surface, centre, size, contact, skull, authority: { kind: 'body-triangles', surface, centre } };
}
function patch(f, offset) {
    const facet = f.surface.evidence().facets.find(row => row.mesh === f.contact.mesh && row.triangle === f.contact.triangle), anchor = v(f.contact.point), normal = v(f.contact.normal);
    const points = facet.points.map(point => v(point).sub(anchor).multiplyScalar(.03).add(anchor).addScaledVector(normal, offset).sub(f.centre));
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(points.flatMap(p => p.toArray()), 3)); geometry.setIndex([0, 1, 2]);
    const mesh = new Mesh(geometry, new MeshStandardMaterial({ color: '#654832', flatShading: true }));
    const source = new Group(); source.name = 'IndependentMeasuredContactFixture'; source.add(mesh);
    return { source, mesh, points };
}
function metadata(f, type) {
    return { version: attachmentVersion, id: type + '/independent-contact-fixture', type, anchor: type === 'hair' ? 'socket_head_top' : 'socket_jaw', fitCage: type === 'hair' ? 'HEAD_CAGE' : 'LOWER_FACE_CAGE', fitMode: 'conform', clearance: .001, authoringFrame: 'canonical', canonicalHeadSize: f.size.toArray(), sourceStyle: 'short', projection: 'outward', attachmentBand: { minimumY: null, maximumY: null } };
}
function renderModule(f, source, type, authority = f.authority) {
    return appearanceModules(profile, f.size, 2, { hair: 1, beard: 1, clothing: 1 }, type === 'hair' ? source : null, f.skull, type === 'beard' ? source : null, metadata(f, type), f.human.fit.cages, undefined, authority);
}
function crossingCount(surface, geometry, centre) {
    const body = surface.evidence().facets, positions = body.flatMap(facet => facet.points.map(point => [...point])), bodyCount = body.length, count = positions.length;
    const p = geometry.getAttribute('position'), ix = geometry.index;
    for (let i = 0; i < p.count; i++) positions.push(new Vector3().fromBufferAttribute(p, i).add(centre).toArray());
    const ids = ix ? Array.from(ix.array) : Array.from({ length: p.count }, (_, i) => i);
    const triangles = body.map((_, i) => [i * 3, i * 3 + 1, i * 3 + 2]);
    for (let i = 0; i < ids.length; i += 3) triangles.push(ids.slice(i, i + 3).map(id => id + count));
    return auditSurfaceIntersections({ positions, triangles, correspondenceIds: positions.map((point, i) => (i < count ? 'body/' : 'module/') + point.map(n => n.toFixed(7)).join(',')) }).properPairs.filter(pair => pair.triangles[0] < bodyCount && pair.triangles[1] >= bodyCount).length;
}

test('actual r3 facial recess remains exactly unchanged in helper, hair and beard consumers; source/body/cages stay immutable', async () => {
    const f = await fixture(), p = patch(f, .0015), before = geometrySnapshot(p.mesh.geometry), bodyBefore = bodySnapshot(f.human), hull = new ConvexHull().setFromPoints(f.human.fit.cages.get('HEAD_CAGE').points), evidence = [];
    const file = new URL('../public' + goldenLabBody.path, import.meta.url), sourceHash = digest(readFileSync(file));
    try {
        const fitter = headSurfaceFitter(f.surface, f.centre, f.size);
        for (let i = 0; i < p.mesh.geometry.getAttribute('position').count; i++) {
            const local = new Vector3().fromBufferAttribute(p.mesh.geometry.getAttribute('position'), i), original = local.clone(), absolute = local.clone().add(f.centre);
            assert.ok(hull.containsPoint(absolute));
            assert.equal(f.surface.query(absolute.toArray()).classification, 'outside');
            fitter.project(local, .001, 'outward');
            assert.deepEqual(local.toArray(), original.toArray());
        }
        fitter.clearTriangles(p.mesh, -Infinity, Infinity, .001);
        assert.deepEqual(geometrySnapshot(p.mesh.geometry), before);
        assert.equal(crossingCount(f.surface, p.mesh.geometry, f.centre), 0);
        for (const type of ['hair', 'beard']) {
            const result = renderModule(f, p.source, type);
            try {
                const fitted = result.getObjectByName(type === 'hair' ? 'GeneratedHair' : 'GeneratedBeard').children.find(child => child.isMesh);
                assert.ok(fitted);
                assert.deepEqual(geometrySnapshot(fitted.geometry), before);
                assert.equal(crossingCount(f.surface, fitted.geometry, f.centre), 0);
                assert.deepEqual(result.userData.collisionAuthority, { kind: 'body-triangles', sourceSHA256: goldenLabBody.sha256, revision: f.surface.revision, completeTriangles: 1322 });
                evidence.push({ type, preservedExteriorRecess: true, properBodyCrossings: 0 });
            } finally { disposeModules(result); }
        }
        // The actual UniversalHuman install path must pass calibrated authority,
        // rather than letting AppearanceModules default silently to legacy.
        const installed = f.human.equip(metadata(f, 'beard'), p.source);
        const installedMesh = installed.children.find(child => child.isMesh);
        assert.deepEqual(geometrySnapshot(installedMesh.geometry), before);
        f.factory.unequip(f.human, metadata(f, 'beard').id);
        assert.deepEqual(geometrySnapshot(p.mesh.geometry), before);
        assert.deepEqual(bodySnapshot(f.human), bodyBefore);
        assert.equal(digest(readFileSync(file)), sourceHash);
        mkdirSync('scratch/facial-surface-review', { recursive: true });
        writeFileSync('scratch/facial-surface-review/EXTERIOR-CONSUMER-PROOF.json', JSON.stringify({ schema: 'pillagers-head-contact-consumer-review/1', bodySHA256: sourceHash, actualTriangle: f.contact.triangle, proof: 'Actual on-triangle facial patch+1.5mm is outside full body but inside HEAD convex hull; helper/hair/beard/public install preserve exact positions and index.', evidence, sourceBodyAndCagesUnchanged: true, visualAcceptance: false }, null, 2) + '\n');
    } finally { p.mesh.geometry.dispose(); p.mesh.material.dispose(); f.human.dispose(); }
});

test('genuine actual skull penetration is corrected to exterior clearance without changing source or body, excessive correction fails unchanged', async () => {
    const f = await fixture(), inside = patch(f, -.003), sourceBefore = geometrySnapshot(inside.mesh.geometry), bodyBefore = bodySnapshot(f.human);
    try {
        const fitter = headSurfaceFitter(f.surface, f.centre, f.size);
        const point = v(f.contact.point).addScaledVector(v(f.contact.normal), -.003).sub(f.centre);
        assert.equal(f.surface.query(point.clone().add(f.centre).toArray()).classification, 'inside');
        fitter.project(point, .001, 'outward');
        const checked = f.surface.query(point.clone().add(f.centre).toArray());
        assert.equal(checked.classification, 'outside'); assert.ok(checked.collisionDistance >= .001 - 1e-7);
        const result = renderModule(f, inside.source, 'beard');
        try {
            const fitted = result.getObjectByName('GeneratedBeard').children.find(child => child.isMesh);
            assert.equal(crossingCount(f.surface, fitted.geometry, f.centre), 0);
            const p = fitted.geometry.getAttribute('position');
            for (let i = 0; i < p.count; i++) assert.equal(f.surface.query(new Vector3().fromBufferAttribute(p, i).add(f.centre).toArray()).classification, 'outside');
        } finally { disposeModules(result); }
        assert.deepEqual(geometrySnapshot(inside.mesh.geometry), sourceBefore);
        const excessive = new Vector3(0, 0, 0), saved = excessive.clone();
        assert.equal(f.surface.query(excessive.clone().add(f.centre).toArray()).classification, 'inside');
        assert.throws(() => fitter.project(excessive, .001, 'outward'), /excessive actual-surface correction/);
        assert.deepEqual(excessive.toArray(), saved.toArray());
        assert.deepEqual(bodySnapshot(f.human), bodyBefore);
    } finally { inside.mesh.geometry.dispose(); inside.mesh.material.dispose(); f.human.dispose(); }
});

test('head consumer retains complete body triangle authority for a triangle with outside corners crossing the skull', async () => {
    const f = await fixture();
    try {
        const facets = f.surface.evidence().facets.filter(row => row.coverage.every(zone => zone === 'HEAD'));
        const left = facets.reduce((best, row) => row.points.some(p => p[0] < best.points[0][0]) ? row : best, facets[0]);
        // A broad chord crossing the head cannot be approved merely because its
        // three corners query outside. A bounded fitter must clear it or throw.
        const points = [[-.18, 1.68, .03], [.18, 1.68, .03], [0, 1.8, .25]].map(p => v(p).sub(f.centre));
        assert.ok(left);
        points.forEach(point => assert.equal(f.surface.query(point.clone().add(f.centre).toArray()).classification, 'outside'));
        const geometry = new BufferGeometry(); geometry.setAttribute('position', new Float32BufferAttribute(points.flatMap(p => p.toArray()), 3)); geometry.setIndex([0, 1, 2]);
        const mesh = new Mesh(geometry, new MeshStandardMaterial()), fitter = headSurfaceFitter(f.surface, f.centre, f.size);
        try {
            assert.ok(crossingCount(f.surface, geometry, f.centre) > 0);
            const before = geometrySnapshot(geometry);
            try { fitter.clearTriangles(mesh, -Infinity, Infinity, .001); }
            catch (error) { assert.match(error.message, /distort|still crosses/); assert.deepEqual(geometrySnapshot(geometry), before); return; }
            assert.equal(crossingCount(f.surface, geometry, f.centre), 0);
        } finally { geometry.dispose(); mesh.material.dispose(); }
    } finally { f.human.dispose(); }
});

test('explicit invalid authority never downgrades to legacy convex and invalid fitter parameters reject before mutation', async () => {
    const f = await fixture(), p = patch(f, .0015), before = geometrySnapshot(p.mesh.geometry);
    try {
        for (const authority of [{ kind: 'invented' }, { kind: 'body-triangles' }, { kind: 'body-triangles', surface: { ...f.surface }, centre: f.centre }, { kind: 'body-triangles', surface: f.surface, centre: new Vector3(NaN, 0, 0) }]) assert.throws(() => renderModule(f, p.source, 'beard', authority));
        for (const size of [new Vector3(NaN, 1, 1), new Vector3(0, 1, 1), new Vector3(-1, 1, 1), new Vector3(Infinity, 1, 1)]) assert.throws(() => headSurfaceFitter(f.surface, f.centre, size));
        const fitter = headSurfaceFitter(f.surface, f.centre, f.size);
        for (const clearance of [NaN, Infinity, -.001]) {
            const local = v(f.contact.point).addScaledVector(v(f.contact.normal), -.003).sub(f.centre), saved = local.clone();
            assert.throws(() => fitter.project(local, clearance, 'outward'));
            assert.deepEqual(local.toArray(), saved.toArray());
        }
        const local = v(f.contact.point).sub(f.centre), saved = local.clone();
        assert.throws(() => fitter.project(local, .001, 'invented'));
        assert.deepEqual(local.toArray(), saved.toArray());
        assert.throws(() => fitter.clearTriangles(p.mesh, NaN, Infinity, .001));
        assert.throws(() => fitter.clearTriangles(p.mesh, 1, -1, .001));
        assert.throws(() => fitter.clearTriangles(p.mesh, -Infinity, Infinity, NaN));
        assert.deepEqual(geometrySnapshot(p.mesh.geometry), before);
    } finally { p.mesh.geometry.dispose(); p.mesh.material.dispose(); f.human.dispose(); }
});

// Controlled classifier-failure injection evaluates the exact production helper
// with an authenticated real surface delegated by the harness. It does not forge
// a production brand, mutate modules or admit an unvalidated runtime provider.
function indeterminateConsumer(realSurface) {
    const url = new URL('../src/character-lab/HeadSurfaceContactFit.ts', import.meta.url), realBatch = realSurface.beginQueryBatch();
    const synthetic = { ...realSurface, beginQueryBatch: () => ({ ...realBatch, query: (...args) => ({ ...realBatch.query(...args), classification: 'indeterminate', signedDistance: null }) }), evidence: () => realSurface.evidence() };
    const productionSource = readFileSync(url, 'utf8'), code = ts.transpileModule(productionSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, module = { exports: {} };
    new Function('require', 'module', 'exports', code)(name => name === 'three' ? threeNamespace : name === '../characters/BodyContactSurface' ? { ...bodyContactModule, requireBodyContactSurface: input => { assert.equal(input, synthetic); bodyContactModule.requireBodyContactSurface(realSurface); return input; } } : (() => { throw new Error('Unexpected test dependency ' + name); })(), module, module.exports);
    return { fitter: module.exports.headSurfaceFitter, synthetic };
}
// Exact imported Three constructors, not geometry/query reimplementations.
import * as threeNamespace from 'three';

test('indeterminate classification fails closed in the exact production correction branch', async () => {
    const f = await fixture();
    try {
        const injected = indeterminateConsumer(f.surface), point = v(f.contact.point).sub(f.centre), before = point.clone();
        assert.throws(() => headSurfaceFitter(injected.synthetic, f.centre, f.size), /source-validated/);
        const controlled = injected.fitter(injected.synthetic, f.centre, f.size);
        assert.throws(() => controlled.project(point, .001, 'outward'), /Indeterminate actual body contact/);
        assert.deepEqual(point.toArray(), before.toArray());
    } finally { f.human.dispose(); }
});

test('legacy convex behavior remains an explicit separate consumer branch; refit invalidates prior actual fitter', async () => {
    const f = await fixture(), p = patch(f, .0015);
    try {
        const explicit = renderModule(f, p.source, 'beard', { kind: 'legacy-convex' });
        try {
            assert.deepEqual(explicit.userData.collisionAuthority, { kind: 'legacy-convex' });
            const fitted = explicit.getObjectByName('GeneratedBeard').children.find(child => child.isMesh);
            assert.notDeepEqual(geometrySnapshot(fitted.geometry), geometrySnapshot(p.mesh.geometry));
            assert.ok(Array.from(fitted.geometry.getAttribute('position').array).every(Number.isFinite));
        } finally { disposeModules(explicit); }
        const old = headSurfaceFitter(f.surface, f.centre, f.size), point = v(f.contact.point).sub(f.centre), saved = point.clone();
        f.human.apply(f.human.root.userData.universalHumanProfile, '#d49b75');
        assert.notEqual(f.human.fit.bodyContactSurface, f.surface);
        assert.throws(() => old.project(point, .001, 'outward'), /Stale body contact fit revision/);
        assert.deepEqual(point.toArray(), saved.toArray());
        const sourceBefore = geometrySnapshot(p.mesh.geometry);
        assert.throws(() => old.clearTriangles(p.mesh, -Infinity, Infinity, .001), /Stale body contact fit revision/);
        assert.deepEqual(geometrySnapshot(p.mesh.geometry), sourceBefore);
    } finally { p.mesh.geometry.dispose(); p.mesh.material.dispose(); f.human.dispose(); }
});


