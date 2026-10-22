import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Group, Color, Vector4, SRGBColorSpace } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { load } from './load-source.mjs';

globalThis.self = globalThis;
globalThis.createImageBitmap = async () => ({ width: 2048, height: 2048, close() {} });

test('resident snapshots reuse the loaded rig and renderer, restoring the live scene after every selection', async () => {
    const { ResidentPortraitStudio } = load('../src/characters/ResidentPortraitStudio.ts');
    const { MeshyHumanFactory } = load('../src/characters/MeshyHuman.ts');
    const { generateCharacterDNA } = load('../src/characters/generateCharacterDNA.ts');
    const { founderFacialIdentity } = load('../src/characters/FacialIdentity.ts');
    let loads = 0;
    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    const bytes = async url => {
        loads++;
        const data = await readFile('public' + url.split('?')[0]);
        return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
    };
    const factory = new MeshyHumanFactory(async url => loader.parseAsync(await bytes(url), ''), bytes);
    const humans = await Promise.all([1, 2, 3].map(seed => factory.createWorld(generateCharacterDNA(seed),
        undefined, founderFacialIdentity(seed))));
    const world = new Group();
    const sibling = new Group();
    world.add(sibling, ...humans.map(human => human.root));
    world.position.set(81, 3, -120);
    humans.forEach((human, index) => {
        human.root.position.set(10 + index, index, 7);
        human.root.rotation.y = index * .7;
        human.root.scale.setScalar(.9 + index * .1);
        human.sampleAnimation('Walk', .3);
    });
    world.updateMatrixWorld(true);
    const saved = humans.map(human => ({ parent: human.root.parent,
        matrix: human.root.matrix.toArray(), world: human.root.matrixWorld.toArray(),
        pose: human.animationState, geometry: human.fit.mesh.geometry,
        morphs: [...human.fit.mesh.morphTargetInfluences] }));
    const renderState = { target: null, viewport: new Vector4(2, 3, 800, 600),
        scissor: new Vector4(4, 5, 700, 500), test: true };
    let draws = 0, outputs = 0, fail = false;
    const targets = new Set();
    // The external graphics boundary records render state without emulating a GPU.
    const renderer = {
        toneMapping: 3, toneMappingExposure: .7, autoClear: false,
        outputColorSpace: SRGBColorSpace,
        shadowMap: { enabled: true },
        getRenderTarget: () => renderState.target,
        getActiveCubeFace: () => 0, getActiveMipmapLevel: () => 0,
        setRenderTarget: target => { renderState.target = target; if (target) targets.add(target); },
        getViewport: out => out.copy(renderState.viewport),
        setViewport: (...args) => renderState.viewport.copy(args[0]?.isVector4 ? args[0] : new Vector4(...args)),
        getScissor: out => out.copy(renderState.scissor),
        setScissor: value => renderState.scissor.copy(value),
        getScissorTest: () => renderState.test,
        setScissorTest: value => { renderState.test = value; },
        getClearColor: out => out.copy(new Color('#123456')), getClearAlpha: () => .5,
        setClearColor() {},
        render(scene, camera) {
            if (scene.isMesh) { outputs++; return; }
            draws++;
            assert.ok(scene.children.some(child => humans.some(human => human.root === child)));
            assert.ok(camera.position.toArray().every(Number.isFinite));
            if (fail) throw new Error('Lost graphics');
        },
        readRenderTargetPixels(target, x, y, width, height, output) { output.fill(0); output[0] = 99; },
    };
    const studio = new ResidentPortraitStudio(renderer, (pixels, size) => {
        assert.equal(pixels[(size - 1) * size * 4], 99, 'GPU rows are flipped for PNG output');
        return 'data:image/png;base64,snapshot';
    }, async () => { throw new Error('A live selection must reuse its prepared model'); });
    try {
        const preparedLoads = loads;
        for (let selection = 0; selection < 6; selection++) {
            const index = selection % humans.length;
            assert.equal(await studio.render({ pixelRatio: 1 }, humans[index]), 'data:image/png;base64,snapshot');
            assert.equal(humans[index].root.parent, saved[index].parent);
            assert.deepEqual(humans[index].root.matrix.toArray(), saved[index].matrix);
            assert.deepEqual(humans[index].root.matrixWorld.toArray(), saved[index].world);
            assert.deepEqual(humans[index].animationState, saved[index].pose);
            assert.equal(humans[index].fit.mesh.geometry, saved[index].geometry);
            assert.deepEqual(humans[index].fit.mesh.morphTargetInfluences, saved[index].morphs);
            assert.deepEqual(world.children, [sibling, ...humans.map(human => human.root)]);
            assert.equal(renderState.target, null);
            assert.deepEqual(renderState.viewport.toArray(), [2, 3, 800, 600]);
            assert.deepEqual(renderState.scissor.toArray(), [4, 5, 700, 500]);
            assert.equal(renderState.test, true);
            assert.equal(renderer.toneMapping, 3);
            assert.equal(renderer.toneMappingExposure, .7);
            assert.equal(renderer.shadowMap.enabled, true);
        }
        assert.equal(loads, preparedLoads, 'Selection cannot load or fit another character');
        assert.equal(targets.size, 2, 'Selections reuse one bounded HDR/output target pair');
        assert.equal(outputs, 6, 'Every snapshot receives tone mapping and sRGB output');
        const target = [...targets][0];
        assert.ok(target.width <= 192 && target.height <= 192);
        fail = true;
        assert.throws(() => studio.capture(humans[0], 1), /Lost graphics/);
        assert.equal(humans[0].root.parent, world);
        assert.equal(renderState.target, null);
        assert.equal(renderer.toneMappingExposure, .7);
        assert.equal(draws, 7);
        let released = 0;
        for (const target of targets) target.addEventListener('dispose', () => released++);
        studio.dispose();
        assert.equal(released, 2);
        assert.ok(humans.every(human => !human.isDisposed), 'The scene still owns all borrowed residents');
        assert.throws(() => studio.capture(humans[0]), /disposed/i);
        assert.equal(await studio.render({ pixelRatio: 1 }, humans[0]), undefined);
    } finally {
        studio.dispose();
        humans.forEach(human => human.dispose());
    }
});

test('closing the scene during archival portrait preparation releases the late owned model', async () => {
    const { ResidentPortraitStudio } = load('../src/characters/ResidentPortraitStudio.ts');
    const { MeshyHumanFactory } = load('../src/characters/MeshyHuman.ts');
    const { generateCharacterDNA } = load('../src/characters/generateCharacterDNA.ts');
    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    const factory = new MeshyHumanFactory(async url => {
        const data = await readFile('public' + url.split('?')[0]);
        return loader.parseAsync(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength), '');
    });
    const historical = await factory.createWorld(generateCharacterDNA(4));
    let finish;
    const studio = new ResidentPortraitStudio({}, () => { throw new Error('Cannot encode after closing'); },
        () => new Promise(resolve => { finish = resolve; }));
    const pending = studio.render({ residentId: 'archived-person' });
    studio.dispose();
    finish(historical);
    assert.equal(await pending, undefined);
    assert.equal(historical.isDisposed, true);
});
