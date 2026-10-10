import type { SelectionMarker } from '../play/SelectionPresentation';
import { Box3, DoubleSide, Group, Mesh, MeshBasicMaterial, Object3D, Raycaster, RingGeometry, SkinnedMesh, Vector3 } from 'three';
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
    private markers = new Map<string, {
        mesh: Mesh<RingGeometry, MeshBasicMaterial>;
        radius: number;
    }>();
    constructor(private models: FjordModels) {
    }
    select(markers: readonly SelectionMarker[]) {
        const wanted = new Set(markers.filter(marker => this.entries.has(marker.selectionKey)).map(marker => marker.selectionKey));
        for (const [key, entry] of this.markers) {
            if (!wanted.has(key)) {
                entry.mesh.removeFromParent();
                entry.mesh.geometry.dispose();
                entry.mesh.material.dispose();
                this.markers.delete(key);
            }
        }
        const descriptions = [];
        for (const marker of markers) {
            const model = this.entries.get(marker.selectionKey)?.model;
            if (!model)
                continue;
            const box = new Box3().setFromObject(model);
            const size = box.getSize(new Vector3()), center = box.getCenter(new Vector3());
            const radius = Math.max(.9, Math.max(size.x, size.z) / 2 + .3);
            let entry = this.markers.get(marker.selectionKey);
            if (!entry) {
                const mesh = new Mesh(new RingGeometry(radius - .22, radius, 96), new MeshBasicMaterial({
                    side: DoubleSide, depthTest: false, depthWrite: false, transparent: true, opacity: 1, fog: false, toneMapped: false
                }));
                mesh.raycast = () => {
                };
                mesh.rotation.x = -Math.PI / 2;
                mesh.renderOrder = 1000;
                this.root.add(mesh);
                entry = { mesh, radius };
                this.markers.set(marker.selectionKey, entry);
            }
            if (Math.abs(radius - entry.radius) > .001) {
                entry.mesh.geometry.dispose();
                entry.mesh.geometry = new RingGeometry(radius - .22, radius, 96);
                entry.radius = radius;
            }
            const color = marker.role === 'selected' ? '#ffdf6a' : '#79e0ed';
            entry.mesh.material.color.set(color);
            entry.mesh.position.set(center.x, box.min.y + .04, center.z);
            descriptions.push({ ...marker, color, fill: 'transparent', radius,
                position: entry.mesh.position.toArray(), anchor: [center.x, box.max.y + .4, center.z] });
        }
        this.root.userData.markers = descriptions;
        this.root.userData.selection = descriptions.find(marker => marker.role === 'selected') ?? null;
    }
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
            placeholder: (() => {
                let result = false;
                entry.model.traverse(n => {
                    if (n.userData.placeholder)
                        result = true;
                });
                return result;
            })(),
        }));
    }
    private remove(model: Object3D) {
        model.removeFromParent();
        model.traverse(node => {
            if (node instanceof SkinnedMesh)
                node.skeleton.dispose();
        });
    }
    dispose() {
        this.disposed = true;
        for (const entry of this.entries.values())
            this.remove(entry.model);
        this.select([]);
        this.entries.clear();
        this.root.removeFromParent();
    }
}
