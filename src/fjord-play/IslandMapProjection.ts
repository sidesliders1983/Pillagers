import { discoveryAt, type DiscoveryView } from '../simulation/ClanDiscovery';
import type { Bounds2 } from '../world-generation/WorldBlueprint';
import type { TerrainPreview } from '../world-generation/TerrainPreview';

type Point = { x: number; z: number };
type MapPoint = { x: number; y: number };
export interface MapMission {
    groupId: string;
    groupName: string;
    status: string;
    target: Point;
}
export function expeditionMapDestinations(missions: readonly MapMission[], home: Point) {
    return missions.filter(mission => ['Traveling', 'Exploring', 'Returning'].includes(mission.status)).map(mission => ({
        groupId: mission.groupId, label: mission.groupName, status: mission.status,
        ...(mission.status === 'Returning' ? home : mission.target),
    }));
}

/** North is -Z/up; normalized coordinates preserve rectangular world proportions in the view. */
export function mapPoint(bounds: Bounds2, point: Point): MapPoint {
    return { x: (point.x - bounds.minX) / (bounds.maxX - bounds.minX),
        y: (point.z - bounds.minZ) / (bounds.maxZ - bounds.minZ) };
}
export function worldPoint(bounds: Bounds2, point: MapPoint): Point {
    return { x: bounds.minX + point.x * (bounds.maxX - bounds.minX),
        z: bounds.minZ + point.y * (bounds.maxZ - bounds.minZ) };
}

const palette = [[40, 83, 96], [101, 132, 87], [194, 175, 126], [104, 98, 76], [130, 141, 143]];
const unknownColor = [25, 37, 41, 255];

/** Takes geographic preview and the observing clan's mask only; no enemy/site/entity input. */
export class IslandMapProjection {
    readonly pixels: Uint8ClampedArray;
    readonly aspect: number;
    private base: Uint8ClampedArray;
    private signature?: string;
    private knowledge?: DiscoveryView;
    constructor(readonly preview: TerrainPreview, knowledge?: DiscoveryView) {
        this.aspect = (preview.bounds.maxX - preview.bounds.minX) / (preview.bounds.maxZ - preview.bounds.minZ);
        this.base = new Uint8ClampedArray(preview.columns * preview.rows * 4);
        this.pixels = new Uint8ClampedArray(this.base.length);
        for (let i = 0; i < preview.heights.length; i++) {
            const height = preview.heights[i];
            const shade = height <= preview.waterLevel ? 1 : Math.max(.55, Math.min(1.2,
                .92 + (preview.heights[Math.max(0, i - 1)] +
                    preview.heights[Math.max(0, i - preview.columns)] - height * 2) * .035));
            const color = height <= preview.waterLevel ? palette[0] : palette[preview.ground[i]] ?? palette[1];
            this.base.set([color[0] * shade, color[1] * shade, color[2] * shade, 255], i * 4);
        }
        this.setKnowledge(knowledge);
    }
    setKnowledge(knowledge?: DiscoveryView): boolean {
        const signature = knowledge ? knowledge.worldId + ':' + knowledge.explored + ':' + knowledge.visible : 'unavailable';
        if (signature === this.signature) return false;
        this.signature = signature;
        this.knowledge = knowledge;
        const { columns, rows, bounds } = this.preview;
        for (let row = 0; row < rows; row++) for (let col = 0; col < columns; col++) {
            const point = worldPoint(bounds, { x: (col + .5) / columns, y: (row + .5) / rows });
            const visibility = knowledge ? discoveryAt(knowledge, point.x, point.z) : 'unknown';
            const index = (row * columns + col) * 4;
            if (visibility === 'unknown') {
                this.pixels.set(unknownColor, index);
                continue;
            }
            const shade = visibility === 'visible' ? 1 : .7;
            for (let channel = 0; channel < 3; channel++) this.pixels[index + channel] = this.base[index + channel] * shade;
            this.pixels[index + 3] = 255;
        }
        return true;
    }
    destination(point: MapPoint): Point | null {
        if (![point.x, point.y].every(Number.isFinite) || point.x < 0 || point.y < 0 || point.x >= 1 || point.y >= 1)
            return null;
        const destination = worldPoint(this.preview.bounds, point);
        return !this.knowledge || discoveryAt(this.knowledge, destination.x, destination.z) === 'unknown' ? null : destination;
    }
    get bytes() { return this.base.byteLength + this.pixels.byteLength + this.preview.heights.byteLength + this.preview.ground.byteLength; }
}
