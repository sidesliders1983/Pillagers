import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { load } from './load-source.mjs';
const { Color, Group, Mesh, BoxGeometry, MeshStandardMaterial } = createRequire(import.meta.url)('three');
const { SeasonAppearanceTransition } = load('../src/world/SeasonAppearanceTransition.ts');
const { SeasonTint } = load('../src/world/SeasonTint.ts');
const { StructureSeasonTint } = load('../src/world/StructureSeasonTint.ts');
const { FjordEntities } = load('../src/fjord-play/FjordEntities.ts');
const { projectFjordCalendar } = load('../src/fjord-play/FjordCalendar.ts');
const { seasonBlend } = load('../src/config/timeVisualization.ts');

function shader(material) {
    const value = { uniforms: {}, vertexShader: '#include <color_vertex>\n#include <defaultnormal_vertex>\n#include <project_vertex>',
        fragmentShader: '#include <color_fragment>' };
    material.onBeforeCompile(value);
    return value;
}

test('snow endpoints preserve the existing held winter, Spring thaw and annual palette exactly', () => {
    const transition = new SeasonAppearanceTransition();
    for (const tick of [0, 125, 249, 250, 251, 312, 375, 500, 750, 875, 999, 1000]) {
        const calendar = projectFjordCalendar({ winter: tick === 1000 ? 801 : 800, tick: tick % 1000 }, 1000);
        transition.anchor(calendar.visualProgress);
        const { from, to, mix } = seasonBlend(calendar.visualProgress);
        assert.equal(transition.current.snowAmount, calendar.winterWeight * .65);
        assert.ok(transition.current.ground.equals(new Color(from.ground).lerp(new Color(to.ground), mix)));
        assert.ok(transition.current.foliage.equals(new Color(from.foliage).lerp(new Color(to.foliage), mix)));
        assert.equal(transition.advance(5, true), false, 'A steady season needs no material frame updates');
    }
    for (let tick = 0; tick <= 250; tick++) {
        const progress = projectFjordCalendar({ winter: 801, tick }, 1000).visualProgress;
        assert.equal(transition.anchor(progress, .5), false, 'Returning sunlight must not reapply a held snow palette');
        assert.equal(transition.advance(.5, true), false);
    }
});

test('snow and seasonal colors blend continuously at different frame rates and freeze on pause', () => {
    const samples = [];
    for (const fps of [15, 30, 60, 120]) {
        const transition = new SeasonAppearanceTransition();
        transition.anchor(0);
        const before = transition.current.ground.clone();
        transition.anchor(.02, .5);
        assert.equal(transition.current.snowAmount, .65);
        assert.ok(transition.current.ground.equals(before), 'A confirmed sample cannot pop the current material');
        for (let frame = 0; frame < fps; frame++) transition.advance(.25 / fps, true);
        samples.push(transition.current.snowAmount);
        assert.ok(transition.current.snowAmount < .65 && transition.current.snowAmount > 0);
        const paused = transition.current.snowAmount, color = transition.current.ground.clone();
        for (let frame = 0; frame < fps; frame++) assert.equal(transition.advance(1, false), false);
        assert.equal(transition.current.snowAmount, paused);
        assert.ok(transition.current.ground.equals(color));
        transition.anchor(.04, .5);
        assert.equal(transition.current.snowAmount, paused, 'A new target starts from the displayed partial thaw');
        transition.advance(.5, true);
        const endpoint = transition.current.snowAmount;
        assert.equal(transition.advance(10000, true), false, 'Presentation cannot advance past confirmed snow');
        assert.equal(transition.current.snowAmount, endpoint);
    }
    for (const amount of samples) assert.ok(Math.abs(amount - samples[0]) < 1e-12);
});

test('year rollover, duplicate samples and explicit recovery retain winter rather than passing through summer', () => {
    const transition = new SeasonAppearanceTransition();
    transition.anchor(.99);
    const before = transition.current.snowAmount;
    transition.anchor(0, .5);
    transition.advance(.25, true);
    assert.ok(transition.current.snowAmount > before && transition.current.snowAmount < .65);
    const partial = transition.current.snowAmount;
    transition.anchor(0, .5);
    assert.equal(transition.current.snowAmount, partial);
    transition.advance(.25, true);
    assert.equal(transition.current.snowAmount, .65, 'Duplicate samples must not restart the blend');
    transition.anchor(.03, .5);
    transition.advance(.1, true);
    transition.finish();
    const recovery = transition.current.snowAmount;
    assert.equal(transition.advance(10000, false), false);
    assert.equal(transition.current.snowAmount, recovery);
    transition.anchor(.5);
    assert.equal(transition.current.snowAmount, 0, 'An import/time jump reanchors immediately');
    transition.anchor(null);
    assert.ok(transition.current.ground.equals(new Color(0xffffff)));
    assert.ok(transition.current.foliage.equals(new Color(0xffffff)));
});

test('actual terrain, discovered foliage and roof uniforms share partial snow without rebuilding GPU resources', () => {
    const root = new Group(), geometry = new BoxGeometry(), source = new MeshStandardMaterial({ color: '#8fa45c' });
    const ground = new Mesh(geometry, source.clone()), foliage = new Mesh(geometry, source), roof = new Mesh(geometry, source);
    foliage.userData.seasonalFoliage = true;
    root.add(ground, foliage);
    const terrain = new SeasonTint(root, ground, 20), structure = new StructureSeasonTint(roof);
    const transition = new SeasonAppearanceTransition();
    const groundShader = shader(ground.material), foliageShader = shader(foliage.material), roofShader = shader(roof.material);
    const uniforms = [groundShader.uniforms.seasonSnowAmount, foliageShader.uniforms.seasonSnowAmount,
        roofShader.uniforms.structureSnowAmount];
    const materials = [ground.material, foliage.material, roof.material];
    const versions = materials.map(material => material.version), keys = materials.map(m => m.customProgramCacheKey());
    try {
        transition.anchor(0);
        transition.anchor(.06, .5);
        // A frame update may touch cached material bindings, never rediscover the scene or recompile shaders.
        root.traverse = () => assert.fail('Material interpolation must not traverse world geometry');
        for (let frame = 0; frame < 30; frame++) {
            transition.advance(1 / 60, true);
            terrain.applyAppearance(transition.current);
            structure.setSnowAmount(transition.current.snowAmount);
            assert.ok(uniforms.every(uniform => uniform.value === transition.current.snowAmount));
        }
        assert.deepEqual([ground.material, foliage.material, roof.material], materials);
        assert.deepEqual(materials.map(material => material.version), versions);
        assert.deepEqual(materials.map(m => m.customProgramCacheKey()), keys);
        assert.ok([ground, foliage, roof].every(mesh => mesh.geometry === geometry));
        assert.match(groundShader.fragmentShader, /fjordSummitLine/, 'Permanent summit snow remains independent');
        structure.setSnowMultiplier(.25);
        structure.setSnowAmount(.4);
        assert.equal(uniforms[2].value, .1, 'The campfire/local heat multiplier still composes with seasonal snow');
        delete root.traverse;
        terrain.refreshFoliage(root);
        const discovered = shader(foliage.material);
        terrain.applyAppearance(transition.current);
        assert.equal(discovered.uniforms.seasonSnowAmount.value, transition.current.snowAmount);
        assert.equal(groundShader.uniforms.seasonSnowAmount, uniforms[0]);
    } finally {
        delete root.traverse;
        terrain.dispose(); structure.dispose(); ground.material.dispose(); source.dispose(); geometry.dispose();
    }
});

test('new and upgraded houses inherit the displayed partial snow while paused', async () => {
    const geometry = new BoxGeometry(), source = new MeshStandardMaterial();
    const models = { create: async () => new Mesh(geometry, source), reconcile: async () => {},
        release: () => true, boundsShape: () => 'fixture' };
    const layer = new FjordEntities(models), transition = new SeasonAppearanceTransition();
    const entity = { id: 'home', kind: 'building', selectionKey: 'building:home', asset: 'hut', status: {},
        transform: { x: 0, y: 0, z: 0, rotation: 0, scale: 1 } };
    try {
        transition.anchor(0);
        transition.anchor(.08, .5);
        transition.advance(.25, true);
        layer.setSeasonAppearance(transition.current);
        await layer.sync([entity]);
        assert.equal(layer.inspectSeason()[0].amount, transition.current.snowAmount);
        await layer.sync([{ ...entity, asset: 'homestead' }]);
        assert.equal(layer.inspectSeason()[0].amount, transition.current.snowAmount);
        assert.ok(transition.current.snowAmount > 0 && transition.current.snowAmount < .65);
        transition.advance(.25, true);
        layer.setSeasonAppearance(transition.current);
        assert.equal(layer.inspectSeason()[0].amount, transition.current.snowAmount);
    } finally { layer.dispose(); geometry.dispose(); source.dispose(); }
});
