import { BufferGeometry, Float32BufferAttribute, Group, LineBasicMaterial, LineSegments } from 'three';
import type { MovementSystem } from '../systems/MovementSystem';

type Point = { x: number; y: number; z: number };

/** Optional Fjordside diagnostics: forward clearance and committed local detours. */
export class MovementDebug {
    readonly root = new Group();
    private layers: { line: LineSegments; position: Float32BufferAttribute; count: number }[];

    constructor(private movement: MovementSystem) {
        this.root.name = 'Resident movement probes';
        this.root.visible = false;
        this.layers = [0x178555, 0xce4e38, 0x167fac].map(color => {
            const geometry = new BufferGeometry();
            const position = new Float32BufferAttribute(movement.villagers.length * 12, 3);
            geometry.setAttribute('position', position);
            geometry.setDrawRange(0, 0);
            const material = new LineBasicMaterial({ color, depthTest: false, depthWrite: false });
            const line = new LineSegments(geometry, material);
            line.frustumCulled = false;
            line.renderOrder = 10;
            this.root.add(line);
            return { line, position, count: 0 };
        });
    }

    update() {
        for (const layer of this.layers) layer.count = 0;
        const segment = (layerIndex: number, start: Point, end: Point) => {
            const layer = this.layers[layerIndex];
            layer.position.setXYZ(layer.count++, start.x, start.y, start.z);
            layer.position.setXYZ(layer.count++, end.x, end.y, end.z);
        };
        for (const probe of this.movement.navigationProbes()) {
            segment(probe.clear ? 0 : 1, probe.start, probe.end);
            let start = probe.start;
            for (const waypoint of probe.route) {
                segment(2, start, waypoint);
                start = waypoint;
            }
        }
        for (const layer of this.layers) {
            layer.line.geometry.setDrawRange(0, layer.count);
            layer.position.needsUpdate = true;
        }
    }

    dispose() {
        for (const { line } of this.layers) {
            line.geometry.dispose();
            (line.material as LineBasicMaterial).dispose();
        }
        this.root.removeFromParent();
    }
}
