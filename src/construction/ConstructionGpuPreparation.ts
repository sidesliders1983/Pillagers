import { Group, Mesh, PerspectiveCamera, Plane, Texture, Vector3 } from 'three';
import type { Scene, WebGLRenderer } from 'three';
import type { FjordModels } from '../fjord-play/FjordModels';
import { StructureSeasonTint } from '../world/StructureSeasonTint';
import { housingConstructionProfiles } from './BuildEnvelope';
import { ConstructionMaterials } from './ConstructionMaterials';
import { ConstructionTransitions } from './ConstructionTransition';

interface PreparationOptions {
    renderer: WebGLRenderer;
    scene: Scene;
    models: FjordModels;
    anchor: Vector3;
    check(): void;
    yieldControl(): Promise<void>;
}

/** First-use shaders/textures/geometry are prepared under the existing opaque loading screen. */
export class ConstructionGpuPreparation {
    private root = new Group();
    private scaffold = new ConstructionTransitions();
    private owned: { root: import('three').Object3D; season: StructureSeasonTint;
        effect?: ConstructionMaterials }[] = [];
    private pending?: Promise<void>;
    private disposed = false;
    private models?: FjordModels;

    prepare(options: PreparationOptions) {
        return this.pending ??= this.run(options);
    }

    private async run(options: PreparationOptions) {
        const { renderer, scene, models, anchor } = options;
        const check = () => {
            options.check();
            if (this.disposed) throw new Error('Construction preparation cancelled.');
        };
        check();
        this.models = models;
        this.root.position.copy(anchor);
        const camera = new PerspectiveCamera(45, 1, .1, 150);
        camera.position.copy(anchor).add(new Vector3(24, 18, 24));
        camera.lookAt(anchor.clone().add(new Vector3(0, 3, 0)));
        camera.updateMatrixWorld(true);
        const textures = new Set<Texture>();
        const uploaded = new Set<Texture>();
        const prepareRoot = async (root: import('three').Object3D, upload = true) => {
            check();
            root.visible = true;
            root.traverse(node => {
                if (!(node instanceof Mesh)) return;
                for (const material of Array.isArray(node.material) ? node.material : [node.material])
                    for (const value of Object.values(material))
                        if (value instanceof Texture) textures.add(value);
            });
            for (const texture of textures) {
                if (!upload) continue;
                if (uploaded.has(texture)) continue;
                check(); renderer.initTexture(texture); uploaded.add(texture);
                await options.yieldControl();
            }
            textures.clear();
            await renderer.compileAsync(root, camera, scene);
            check();
            // Compile alone does not upload vertex buffers or first-use shadow programs.
            if (upload) renderer.render(scene, camera);
            root.visible = false;
            await options.yieldControl();
            check();
        };
        scene.add(this.root);
        try {
            for (const asset of Object.keys(housingConstructionProfiles)) {
                // Bound mobile GPU residency: only the two possible first house forms upload eagerly.
                // Later sizes prepare their shader variants without uploading their texture/vertex data.
                const upload = asset === 'hut' || asset === 'farmHut';
                for (const mode of ['complete', 'old-fade', 'target'] as const) {
                    check();
                    const model = await models.create({
                        kind: 'building', id: 'construction-warmup', selectionKey: 'building:construction-warmup',
                        label: 'Construction preparation', asset,
                        ...(asset.startsWith('farm') ? { terrainAsset: 'farmHutTerrain' } : {}),
                        transform: { x: 0, y: 0, z: 0, rotation: 0, scale: 1 },
                        plot: { x: 0, y: 0, z: 0, rotation: 0, scale: 1, halfWidth: 20, halfDepth: 20 },
                        status: { living: true }
                    });
                    if (this.disposed) { models.release(model); check(); }
                    model.userData.asset = asset;
                    const season = new StructureSeasonTint(model);
                    this.root.add(model);
                    const effect = mode === 'complete' ? undefined : new ConstructionMaterials(model,
                        mode === 'target' ? 'reveal' : 'fade', new Plane(new Vector3(0, -1, 0), anchor.y + 3));
                    this.owned.push({ root: model, season, effect });
                    if (mode === 'old-fade') effect!.setOpacity(.5);
                    await prepareRoot(model, upload);
                    if (mode === 'target') {
                        effect!.setOpacity(.5);
                        await prepareRoot(model, upload);
                    }
                    if (asset === 'hut' && mode === 'complete') {
                        const sample = model.clone(true);
                        this.root.add(sample, this.scaffold.root);
                        this.scaffold.play('preparation', sample);
                        for (let i = 0; i < 16; i++) this.scaffold.update(.1);
                        await prepareRoot(this.scaffold.root);
                        sample.visible = false;
                    }
                }
            }
        } finally {
            // Retain material program references so Three.js does not discard warmed programs.
            this.root.removeFromParent();
        }
    }

    dispose() {
        this.disposed = true;
        this.scaffold.dispose();
        for (const { root, season, effect } of this.owned) {
            effect?.dispose(); season.dispose(); this.models?.release(root);
        }
        this.owned = [];
        this.root.clear();
        this.root.removeFromParent();
    }
}
