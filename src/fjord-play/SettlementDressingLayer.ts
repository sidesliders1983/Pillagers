import { Box3, Color, Group, InstancedMesh, Matrix4, Mesh, Object3D } from 'three';
import type { AssetManager, AssetKey } from '../core/AssetManager';
import type { DiscoveryView } from '../simulation/ClanDiscovery';
import type { WorldBlueprint } from '../world-generation/WorldBlueprint';
import { StructureSeasonTint } from '../world/StructureSeasonTint';
import { seasonBlend } from '../config/timeVisualization';
import {
    dressingAssetKeys, planSettlementDressing, visibleDressing,
    type DressingAsset, type DressingInput, type DressingPlacement, type DressingSources
} from './SettlementDressing';

interface DressingBatch {
    signature: string;
    root: Group;
    snow: StructureSeasonTint;
    foliage: { material: import('three').MeshStandardMaterial; base: Color }[];
    instances: number;
    triangles: number;
}

/** Instance buffers and seasonal material copies belong to this layer; source GLBs belong
 * to AssetManager. It is a sibling of world/actors, so plot clearing and picking cannot eat it. */
export class SettlementDressingLayer {
    readonly root = new Group();
    private sources: DressingSources = {};
    private templates = new Map<DressingAsset, Object3D>();
    private batches = new Map<DressingAsset, DressingBatch>();
    private signature = '';
    private knowledge = '';
    private plan: DressingPlacement[] = [];
    private discovery?: DiscoveryView;
    private quality: 'low' | 'standard';
    private season: number | null = null;
    private planBuilds = 0;
    private batchBuilds = 0;
    private disposed = false;

    constructor(private assets: AssetManager, private world: WorldBlueprint, quality: 'low' | 'standard') {
        this.quality = quality;
        this.root.name = 'Settlement dressing';
        const sources: Record<string, import('./SettlementDressing').DressingBounds> = {};
        for (const key of [...dressingAssetKeys, 'tent', 'hut', 'homestead', 'longhouse',
            'greatHall', 'farmHut', 'farmHomestead'] as AssetKey[]) {
            if (!assets.has(key)) continue;
            const model = assets.get(key);
            if (model.userData.placeholder) continue;
            model.updateMatrixWorld(true);
            const bounds = new Box3().setFromObject(model, true);
            if (bounds.isEmpty()) continue;
            sources[key] = { minX: bounds.min.x, maxX: bounds.max.x,
                minZ: bounds.min.z, maxZ: bounds.max.z, height: bounds.max.y - bounds.min.y };
            if (dressingAssetKeys.includes(key as DressingAsset)) this.templates.set(key as DressingAsset, model);
        }
        this.sources = sources;
    }

    sync(input: DressingInput, discovery?: DiscoveryView) {
        if (this.disposed) return false;
        const signature = JSON.stringify(input);
        const knowledge = discovery ? discovery.explored + ':' + discovery.visible : '';
        if (signature === this.signature && knowledge === this.knowledge) return false;
        if (signature !== this.signature) {
            this.plan = planSettlementDressing(this.world, input, this.sources);
            this.planBuilds++;
            this.signature = signature;
        }
        this.knowledge = knowledge;
        this.discovery = discovery;
        this.reconcile();
        return true;
    }

    setQuality(quality: 'low' | 'standard') {
        if (quality === this.quality || this.disposed) return;
        this.quality = quality;
        this.reconcile();
    }

    setSeason(progress: number | null) {
        this.season = progress;
        for (const batch of this.batches.values()) this.tint(batch);
    }

    private tint(batch: DressingBatch) {
        batch.snow.update(this.season);
        const blend = this.season === null ? null : seasonBlend(this.season);
        const tone = blend ? new Color(blend.from.foliage).lerp(new Color(blend.to.foliage), blend.mix) : null;
        for (const { material, base } of batch.foliage) {
            material.color.copy(base);
            if (tone) material.color.lerp(tone, .12);
        }
    }

    private release(batch: DressingBatch) {
        batch.snow.dispose();
        batch.root.traverse(node => { if (node instanceof InstancedMesh) node.dispose(); });
        batch.root.removeFromParent();
        batch.root.clear();
    }

    private reconcile() {
        const selected = visibleDressing(this.plan, this.quality, this.discovery);
        for (const asset of dressingAssetKeys) {
            const items = selected.filter(item => item.asset === asset);
            const castShadow = this.quality === 'standard' && !asset.startsWith('kaykit-');
            const signature = JSON.stringify([castShadow, items]);
            const current = this.batches.get(asset);
            if (current?.signature === signature) continue;
            if (current) { this.release(current); this.batches.delete(asset); }
            const source = this.templates.get(asset);
            if (!items.length || !source) continue;
            const root = new Group(), dummy = new Object3D(), matrix = new Matrix4();
            root.name = 'Dressing: ' + asset;
            const transforms = items.map(item => {
                dummy.position.set(item.x, item.y, item.z);
                dummy.rotation.y = item.rotation;
                dummy.scale.setScalar(item.scale);
                dummy.updateMatrix();
                return dummy.matrix.clone();
            });
            let triangles = 0;
            source.traverse(child => {
                if (!(child instanceof Mesh)) return;
                const mesh = new InstancedMesh(child.geometry, child.material, items.length);
                mesh.name = asset;
                transforms.forEach((transform, index) => mesh.setMatrixAt(index,
                    matrix.multiplyMatrices(transform, child.matrixWorld)));
                mesh.castShadow = castShadow;
                mesh.receiveShadow = true;
                mesh.computeBoundingSphere();
                mesh.raycast = () => {};
                triangles += items.length * (child.geometry.index?.count ??
                    child.geometry.getAttribute('position').count) / 3;
                root.add(mesh);
            });
            // Ankle-height foliage frosts on every face; roof/well/log snow keeps upward coverage.
            const snow = new StructureSeasonTint(root, /grass|bush/.test(asset) ? 'all' : 'upward');
            const foliage: DressingBatch['foliage'] = [];
            if (/grass|bush/.test(asset)) {
                const unique = new Set<import('three').MeshStandardMaterial>();
                root.traverse(node => {
                    if (!(node instanceof Mesh)) return;
                    for (const material of Array.isArray(node.material) ? node.material : [node.material])
                        if ('isMeshStandardMaterial' in material)
                            unique.add(material as import('three').MeshStandardMaterial);
                });
                for (const material of unique) foliage.push({ material,
                    base: material.color.clone().multiply(new Color(0x89936e)) });
            }
            const batch = { signature, root, snow, foliage, instances: items.length, triangles };
            this.tint(batch);
            this.batches.set(asset, batch);
            this.root.add(root);
            this.batchBuilds++;
        }
    }

    inspect() {
        return { quality: this.quality, planBuilds: this.planBuilds, batchBuilds: this.batchBuilds,
            planned: this.plan.length, instances: [...this.batches.values()].reduce((sum, b) => sum + b.instances, 0),
            triangles: [...this.batches.values()].reduce((sum, b) => sum + b.triangles, 0),
            batches: [...this.batches].map(([asset, batch]) => ({ asset,
                instances: batch.instances, triangles: batch.triangles,
                primitives: batch.root.children.length, snow: batch.snow.inspect() })) };
    }

    dispose() {
        this.disposed = true;
        for (const batch of this.batches.values()) this.release(batch);
        this.batches.clear();
        this.templates.clear();
        this.plan = [];
        this.root.removeFromParent();
        this.root.clear();
    }
}
