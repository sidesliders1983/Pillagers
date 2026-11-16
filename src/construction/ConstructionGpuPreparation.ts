import { Group, Line, Mesh, PerspectiveCamera, Plane, Points, Sprite, Texture, Vector3 } from 'three';
import type { Object3D, Scene, WebGLRenderer } from 'three';
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
    private owned: { root: Object3D; season: StructureSeasonTint;
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
        const eager: Object3D[] = [];
        const targets: { root: Object3D; effect: ConstructionMaterials; eager: boolean }[] = [];
        const renderable = (node: Object3D) => node instanceof Mesh || node instanceof Line ||
            node instanceof Points || node instanceof Sprite;

        const renderEager = async (roots: Object3D[]) => {
            check();
            const allowed = new Set<Object3D>();
            for (const root of roots) root.traverse(node => allowed.add(node));
            const layers = new Map<Object3D, number>();
            const visibility = roots.map(root => ({ root, visible: root.visible }));
            // Keep the real scene lights, fog and shadow configuration. Rendering a bare
            // warmup Group would compile different programs; hiding whole parents could
            // also hide their lights. Layers exclude only unrelated drawables temporarily.
            scene.traverse(node => {
                if (!renderable(node) || allowed.has(node)) return;
                layers.set(node, node.layers.mask);
                node.layers.mask = 0;
            });
            try {
                for (const root of roots) root.visible = true;
                renderer.render(scene, camera);
            } finally {
                for (const [node, mask] of layers) node.layers.mask = mask;
                for (const { root, visible } of visibility) root.visible = visible;
            }
            await options.yieldControl();
            check();
        };
        const compile = async () => {
            check();
            // Three.js traverses hidden meshes here; targetScene supplies the unchanged
            // live lighting. Retain all material owners until final scene disposal.
            await renderer.compileAsync(this.root, camera, scene);
            check();
            await options.yieldControl();
            check();
        };
        scene.add(this.root);
        try {
            for (const asset of Object.keys(housingConstructionProfiles)) {
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
                    model.visible = false;
                    if (upload) eager.push(model);
                    if (mode === 'target') targets.push({ root: model, effect: effect!, eager: upload });
                    if (asset === 'hut' && mode === 'complete') {
                        const sample = model.clone(true);
                        this.root.add(sample, this.scaffold.root);
                        this.scaffold.play('preparation', sample);
                        for (let i = 0; i < 16; i++) this.scaffold.update(.1);
                        sample.visible = this.scaffold.root.visible = false;
                        eager.push(sample, this.scaffold.root);
                    }
                    await options.yieldControl();
                    check();
                }
            }
            const textures = new Set<Texture>();
            for (const root of eager) root.traverse(node => {
                if (!(node instanceof Mesh)) return;
                for (const material of Array.isArray(node.material) ? node.material : [node.material])
                    for (const value of Object.values(material))
                        if (value instanceof Texture) textures.add(value);
            });
            // Later sizes compile every state without eagerly uploading their textures
            // or vertex buffers. The first Hut/Farm Hut forms and scaffold stay ready.
            for (const texture of textures) {
                check();
                renderer.initTexture(texture);
                await options.yieldControl();
            }
            await compile();
            await renderEager(eager);
            // Wait for opaque reveal programs before changing these same materials.
            // A concurrent mutation would let compileAsync observe only the later state.
            for (const target of targets) target.effect.setOpacity(.5);
            await compile();
            await renderEager(targets.filter(target => target.eager).map(target => target.root));
        } finally {
            this.root.removeFromParent();
        }
    }

    dispose() {
        if (this.disposed) return;
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
