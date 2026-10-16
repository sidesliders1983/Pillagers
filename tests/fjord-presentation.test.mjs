import test from 'node:test';
import assert from 'node:assert/strict';
import { Scene, Vector3 } from 'three';
import { load } from './load-source.mjs';

const { WorldLighting } = load('../src/core/WorldLighting.ts');
const { fjordPresentation } = load('../src/config/FjordPresentation.ts');
const { projectFjordWeather } = load('../src/fjord-play/FjordWeather.ts');

test('Fjord treatment preserves season, weather, fog and shadow contracts while separating lit planes', () => {
    const assets = { windowMaterials: [], fireMaterials: [] };
    const renderer = () => ({ shadowMap: { enabled: true }, toneMappingExposure: 1 });
    const baselineScene = new Scene(), candidateScene = new Scene();
    const baseline = new WorldLighting(baselineScene, renderer(), assets, undefined, new Vector3(), 'low');
    const candidate = new WorldLighting(candidateScene, renderer(), assets, undefined, new Vector3(),
        'low', fjordPresentation.lighting);
    const resources = [...candidateScene.children];
    try {
        for (const weather of [null, 'Mild', 'Normal', 'Harsh', 'Severe']) {
            for (const progress of [0, .125, .25, .375, .5, .75, .875, 1]) {
                const settings = projectFjordWeather(weather).lighting;
                baseline.setSeason(progress, settings);
                candidate.setSeason(progress, settings);
                assert.equal(candidate.ambient.intensity, baseline.ambient.intensity * .78);
                assert.equal(candidate.directional.intensity, baseline.directional.intensity * 1.12);
                assert.deepEqual(candidateScene.background, baselineScene.background);
                assert.deepEqual(candidate.fog, baseline.fog);
                assert.deepEqual(candidate.directional.position, baseline.directional.position);
                assert.equal(candidate.directional.shadow.mapSize.x, 1024);
                assert.equal(candidateScene.children.filter(node => node.isLight && node.castShadow).length, 1);
                assert.deepEqual(candidateScene.children, resources);
            }
        }
        candidate.setMode('day');
        baseline.setMode('day');
        assert.equal(candidate.ambient.intensity, baseline.ambient.intensity, 'Native day remains unchanged');
        candidate.setMode('night');
        baseline.setMode('night');
        assert.equal(candidate.directional.intensity, baseline.directional.intensity, 'Native night remains unchanged');
    } finally {
        baseline.dispose();
        candidate.dispose();
    }
});
