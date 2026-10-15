import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { load } from './load-source.mjs';
const { BoxGeometry, Group, Mesh, MeshBasicMaterial, Raycaster } = createRequire(import.meta.url)('three');
const { createFjordYardSurface } = load('../src/fjord-play/FjordYardSurface.ts');

test('bounded source-floor cache growth retains recent exact probes instead of flushing an active route', () => {
    const geometry = new BoxGeometry(100, .1, 100), material = new MeshBasicMaterial();
    const yard = new Mesh(geometry, material); yard.position.y = -.05;
    const sample = createFjordYardSurface(yard, undefined, 0);
    const original = Raycaster.prototype.intersectObject;
    let rays = 0;
    Raycaster.prototype.intersectObject = function (...args) { rays++; return original.apply(this, args); };
    try {
        let recent;
        for (let i = 0; i < 16020; i++) {
            const point = { x: (i % 128 - 64) / 20 + .003, z: (Math.floor(i / 128) - 64) / 20 + .007 };
            assert.ok(Math.abs(sample(point.x, point.z, .5)) < 1e-8);
            if (i === 15000) recent = point;
        }
        const before = rays;
        assert.ok(Math.abs(sample(recent.x, recent.z, .5)) < 1e-8);
        assert.equal(rays, before, 'Crossing capacity must not discard a recent verified route point');
        assert.equal(sample(50, 0, .5), null, 'Source enclosure clearance remains authoritative');
    } finally {
        Raycaster.prototype.intersectObject = original;
        geometry.dispose(); material.dispose();
    }
});


test('a moved house invalidates its source-yard sampler while an unchanged frame retains it', () => {
    const { FjordEntities } = load('../src/fjord-play/FjordEntities.ts');
    const geometry = new BoxGeometry(20, .1, 20), material = new MeshBasicMaterial();
    const farm = new Group(), cow = new Group(), yard = new Mesh(geometry, material);
    yard.name = 'farmyardMarker'; yard.position.y = -.05; farm.add(yard);
    farm.userData.canonical = { farmyard: true };
    farm.userData.asset = 'source-house';
    cow.userData.canonical = { grazingZone: 'yard', assignment: 'farm', stage: 'Adult' };
    const models = { pace: () => 0, socialEnabled: () => false, activityClips: () => ({}),
        occupationClips: () => ({}), release: () => false };
    const layer = new FjordEntities(models);
    layer.entries.set('building:farm', { signature: 'farm', model: farm });
    layer.entries.set('cattle:cow', { signature: 'cow', model: cow });
    layer.root.add(farm, cow);
    const bound = [];
    const motion = { setPace() {}, setSocialEnabled() {}, setActivityClips() {}, setOccupationClips() {},
        setYardSurface(key, sample, version) { bound.push({ key, sample, version }); } };
    try {
        layer.configureMotion(motion);
        const initial = layer.yardSamplers.get('farm');
        assert.ok(Math.abs(bound.at(-1).sample(0, 0)) < 1e-8);
        layer.configureMotion(motion);
        assert.equal(layer.yardSamplers.get('farm'), initial);
        assert.equal(bound.at(-1).version, bound[0].version);
        farm.position.x = 30;
        layer.configureMotion(motion);
        assert.notEqual(layer.yardSamplers.get('farm'), initial);
        assert.notEqual(bound.at(-1).version, bound[0].version);
        assert.equal(bound.at(-1).sample(0, 0), null);
        assert.ok(Math.abs(bound.at(-1).sample(30, 0)) < 1e-8);
    } finally { layer.dispose(); geometry.dispose(); material.dispose(); }
});
