import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { Group, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { loadTypeScript } from '../scripts/load-typescript.mjs';

// The runtime class needs Vite's asset base; all actual assets below come from the committed public tree.
function fjordModels() {
    const url = new URL('../src/fjord-play/FjordModels.ts', import.meta.url);
    const module = { exports: {} }, nativeRequire = createRequire(import.meta.url);
    const source = readFileSync(url, 'utf8').replaceAll('import.meta.env.BASE_URL', JSON.stringify('/'));
    const code = ts.transpileModule(source, { compilerOptions: {
        module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
    } }).outputText;
    new Function('require', 'module', 'exports', code)(name => name.startsWith('.') ?
        loadTypeScript(new URL(name + '.ts', url)) : nativeRequire(name), module, module.exports);
    return module.exports.FjordModels;
}
const load = path => loadTypeScript(new URL('../src/' + path + '.ts', import.meta.url));

test('actual native residents leave old actions, stand still on deck through repeated sync and turns, then resume on land', async () => {
    const previous = { self: globalThis.self, createImageBitmap: globalThis.createImageBitmap };
    globalThis.self = globalThis;
    globalThis.createImageBitmap = async () => ({ width: 2048, height: 2048, close() {} });
    const { MeshyHumanFactory } = load('characters/MeshyHuman');
    const { FjordEntities } = load('fjord-play/FjordEntities');
    const { createCampaign } = load('simulation/SimulationCore');
    const { projectResidentAppearance } = load('characters/ResidentAppearance');
    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    const bytes = async path => {
        const data = await readFile(new URL('../public' + path.split('?')[0], import.meta.url));
        return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
    };
    const extra = await loader.parseAsync(await bytes('/game-assets/human/Human_ExtraAnimations.glb'), '');
    const factory = new MeshyHumanFactory(async path => {
        const source = await loader.parseAsync(await bytes(path), '');
        source.animations.push(...extra.animations.map(clip => clip.clone()));
        return source;
    }, bytes);
    const campaign = createCampaign(32);
    try {
        for (const id of ['founder-1', 'founder-2']) {
            const appearance = projectResidentAppearance(campaign, id);
            const human = await factory.createWorld(appearance.dna, undefined, appearance.face);
            const Models = fjordModels(), models = new Models({});
            models.actors.set(human.root, { human, pace: 1, groundSpeed: 1, state: 'Doze' });
            models.create = async entity => entity.kind === 'persona' ? human.root : new Group();
            models.reconcile = async () => {};
            human.setAnimation('Doze'); human.update(1);
            const layer = new FjordEntities(models);
            const transform = { x: 100, y: 0, z: 200, rotation: .7, scale: 1 };
            const passenger = { kind: 'persona', id, selectionKey: 'persona:' + id, asset: 'human', transform,
                status: { living: true, expedition: 'same-group', aboardShip: 'ship', aboardAnchor: 0 } };
            const ship = { kind: 'longship', id: 'ship', selectionKey: 'longship:ship', asset: 'longship',
                transform: { ...transform }, status: { living: true } };
            const head = human.root.getObjectByName('mixamorigHead');
            assert.ok(head);
            try {
                await layer.sync([passenger, ship]);
                const hull = human.root.parent;
                const localHead = () => hull.worldToLocal(head.getWorldPosition(new Vector3()));
                const standing = localHead();
                assert.ok(standing.y > 1.5, 'The real head is upright above the source deck');
                for (let frame = 0; frame < 120; frame++) {
                    ship.transform.x += .1; ship.transform.rotation += .01;
                    if (frame % 30 === 0) await layer.sync([passenger, ship]);
                    layer.advance({ inspect: () => [{ key: passenger.selectionKey, x: -999, y: 0, z: -999,
                        rotation: 2, state: 'Run', speed: 4 }] }, 1 / 60, true);
                    assert.ok(localHead().distanceTo(standing) < 1e-6);
                    assert.equal(human.animationState.animation, 'Idle');
                    assert.equal(human.animationState.time, 0);
                }
                await layer.sync([{ ...passenger, status: { living: true, expedition: 'same-group' } }, ship]);
                assert.equal(human.root.parent, layer.root);
                assert.ok(new Vector3(0, 1, 0).applyQuaternion(human.root.quaternion)
                    .distanceTo(new Vector3(0, 1, 0)) < 1e-6);
                models.animate(human.root, 'Walk', 1, .2);
                assert.equal(human.animationState.animation, 'Walk');
                assert.ok(human.animationState.time > 0);
            } finally { layer.dispose(); models.dispose(); }
        }
    } finally {
        for (const [key, value] of Object.entries(previous)) {
            if (value === undefined) delete globalThis[key];
            else globalThis[key] = value;
        }
    }
});
