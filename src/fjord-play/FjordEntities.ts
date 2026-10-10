import { Box3, Group, Object3D, Raycaster, SkinnedMesh, Vector3 } from 'three';
import { FjordModels } from './FjordModels';
import type { FjordEntity } from './FjordProjection';
/** Reconcile canonical identities; unchanged objects and the environment remain alive. */
export class FjordEntities {
    readonly root = new Group();
    private entries = new Map<string, {
        signature: string;
        model: Object3D;
    }>();
    private disposed = false;
    constructor(private models: FjordModels) { }
    async sync(entities: readonly FjordEntity[]) {
        const visible = entities.filter(e => e.transform !== null);
        const wanted = new Set(visible.map(e => e.selectionKey));
        for (const [key, entry] of this.entries)
            if (!wanted.has(key)) {
                this.remove(entry.model);
                this.entries.delete(key);
            }
        for (const entity of visible) {
            if (this.disposed)
                return;
            const signature = entity.asset + ':' + (entity.terrainAsset ?? '') + ':' +
                (entity.kind === 'persona' && entity.status.age! < 16 ? 'child' : 'adult');
            let entry = this.entries.get(entity.selectionKey);
            if (!entry || entry.signature !== signature) {
                const model = await this.models.create(entity);
                if (this.disposed) {
                    this.remove(model);
                    return;
                }
                if (entry)
                    this.remove(entry.model);
                entry = { signature, model };
                this.entries.set(entity.selectionKey, entry);
                this.root.add(model);
            }
            const p = entity.transform!;
            entry.model.name = entity.selectionKey;
            entry.model.position.set(p.x, p.y, p.z);
            entry.model.rotation.y = p.rotation;
            if (entity.kind === 'cattle' && entity.status.assignment) {
                const home = this.entries.get('building:' + entity.status.assignment)?.model;
                const yard = home?.getObjectByName('farmHutTerrain') ?? home?.getObjectByName('farmyardMarker');
                if (yard) {
                    this.root.updateMatrixWorld(true);
                    const floor = new Raycaster(new Vector3(p.x, p.y + 20, p.z), new Vector3(0, -1, 0))
                        .intersectObject(yard, true)[0]?.point.y;
                    if (floor !== undefined)
                        entry.model.position.y = floor;
                }
            }
            entry.model.userData.canonical = { kind: entity.kind, id: entity.id, ...entity.status };
        }
    }
    describe() {
        this.root.updateMatrixWorld(true);
        return [...this.entries].map(([key, entry]) => ({
            key, renderId: entry.model.uuid, ...entry.model.userData.canonical,
            position: entry.model.position.toArray(),
            bounds: new Box3().setFromObject(entry.model),
            placeholder: (() => { let result = false; entry.model.traverse(n => { if (n.userData.placeholder)
                result = true; }); return result; })(),
        }));
    }
    private remove(model: Object3D) {
        model.removeFromParent();
        model.traverse(node => { if (node instanceof SkinnedMesh)
            node.skeleton.dispose(); });
    }
    dispose() {
        this.disposed = true;
        for (const entry of this.entries.values())
            this.remove(entry.model);
        this.entries.clear();
        this.root.removeFromParent();
    }
}
