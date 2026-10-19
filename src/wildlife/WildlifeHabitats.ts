import type { WorldBlueprint, Point2, BuildingPlacement } from '../world-generation/WorldBlueprint';
import { createBlueprintSurface } from '../world-generation/TerrainQueries';
import { createCoastDistance } from '../world-generation/CoastDistance';
import { buildingDistance } from '../world/SettlementLayout';
import type { HabitatTag, WildlifeVariant } from './WildlifeSpecies';
export type WildlifeObstacle = Pick<BuildingPlacement, 'x' | 'z' | 'rotation' | 'halfWidth' | 'halfDepth'>;
export interface HabitatSample extends Point2 {
    height: number;
    coastDistance: number;
    tags: HabitatTag[];
}
/** Describes the existing terrain, biome, environment and navigation fields without regenerating them. */
export class WildlifeHabitats {
    readonly surface;
    readonly coastDistance;
    readonly alpineHeight: number;
    readonly candidates: HabitatSample[] = [];
    private obstacles: readonly WildlifeObstacle[];
    private nature = new Map<string, {
        x: number;
        z: number;
        radius: number;
    }[]>();
    constructor(readonly world: WorldBlueprint) {
        this.surface = createBlueprintSurface(world);
        this.coastDistance = createCoastDistance(world.coast);
        this.alpineHeight = world.waterLevel + Math.max(20, (world.terrain.heights.reduce((max, height) => Math.max(max, height), world.waterLevel) - world.waterLevel) * .58);
        this.obstacles = world.settlement.buildings;
        for (const item of world.placementPlan) {
            if (/grass|flower|fern/i.test(item.assetId))
                continue;
            const key = this.bucket(item.x, item.z);
            const group = this.nature.get(key) ?? [];
            group.push({ x: item.x, z: item.z, radius: item.clearance });
            this.nature.set(key, group);
        }
        const b = world.terrain.bounds;
        // Interior habitat samples are bounded and independent of camera position.
        for (let z = b.minZ + 4; z < b.maxZ; z += 8) {
            for (let x = b.minX + 4; x < b.maxX; x += 8)
                this.candidates.push(this.sample(x, z));
        }
        // A coarse inland grid would miss thin beaches. Sample the authoritative coast itself.
        for (let i = 0; i < world.coast.length; i++) {
            const { a, b: end } = world.coast[i];
            const dx = end.x - a.x, dz = end.z - a.z, length = Math.hypot(dx, dz);
            if (length < .001)
                continue;
            const steps = Math.max(1, Math.ceil(length / 8));
            for (let step = 0; step < steps; step++) {
                const t = (step + .5) / steps, x = a.x + dx * t, z = a.z + dz * t;
                for (const offset of [-5, -2, -.75, .75, 2, 5]) {
                    const point = this.sample(x - dz / length * offset, z + dx / length * offset);
                    if (this.inBounds(point, 1))
                        this.candidates.push(point);
                }
            }
        }
    }
    setObstacles(obstacles: readonly WildlifeObstacle[]) { this.obstacles = obstacles; }
    private bucket(x: number, z: number) { return Math.floor(x / 12) + ':' + Math.floor(z / 12); }
    inBounds(point: Point2, margin = 0) {
        const b = this.world.terrain.bounds;
        return point.x >= b.minX + margin && point.x <= b.maxX - margin
            && point.z >= b.minZ + margin && point.z <= b.maxZ - margin;
    }
    sample(x: number, z: number): HabitatSample {
        const world = this.world, field = world.terrain;
        const col = Math.max(0, Math.min(field.columns - 1, Math.round((x - field.bounds.minX) / field.spacing)));
        const row = Math.max(0, Math.min(field.rows - 1, Math.round((z - field.bounds.minZ) / field.spacing)));
        const i = row * field.columns + col, biome = world.biomes.cells[i];
        const environment = world.environment;
        const envIndex = environment ? Math.max(0, Math.min(environment.rows - 1, Math.round((z - field.bounds.minZ) / environment.spacing))) * environment.columns
            + Math.max(0, Math.min(environment.columns - 1, Math.round((x - field.bounds.minX) / environment.spacing))) : 0;
        const forest = environment?.fields.forestCover[envIndex] ?? (biome === 'forest' ? .7 : 0);
        const moisture = environment?.fields.moisture[envIndex] ?? world.biomes.moisture[i] ?? 0;
        const rock = environment?.fields.rockExposure[envIndex] ?? (biome === 'rock' ? 1 : 0);
        const height = this.surface.surfaceHeightAt(x, z), coastDistance = this.coastDistance({ x, z });
        const elevation = height - world.waterLevel, tags: HabitatTag[] = [];
        if (elevation < -.2 && coastDistance < 80)
            tags.push('fjord_water');
        if (elevation > .2 && coastDistance < 12 && elevation < 8) {
            tags.push('coast');
            if (rock > .18 || biome === 'rock')
                tags.push('rocky_shore');
        }
        if (elevation > 4 && coastDistance < 25 && this.surface.slopeAt(x, z) > .4)
            tags.push('cliff');
        if (elevation > .2) {
            if (forest > .45 || biome === 'forest')
                tags.push('deep_forest');
            if (forest > .12 && forest < .65 || biome === 'forest')
                tags.push('forest_edge');
            if (elevation < (this.alpineHeight - world.waterLevel) * .7) {
                tags.push('lowland');
                if (moisture > .45 && coastDistance > 12)
                    tags.push('wet_lowland');
            }
            if (elevation > 10 && height < this.alpineHeight)
                tags.push('foothill');
            if (height >= this.alpineHeight)
                tags.push('mountain', 'alpine');
        }
        return { x, z, height, coastDistance, tags };
    }
    private walkable(point: Point2) {
        const nav = this.world.navigation;
        const x = Math.round((point.x - nav.bounds.minX) / nav.spacing);
        const z = Math.round((point.z - nav.bounds.minZ) / nav.spacing);
        return x >= 0 && x < nav.columns && z >= 0 && z < nav.rows
            && nav.cells[z * nav.columns + x] && this.surface.slopeAt(point.x, point.z) <= .55;
    }
    valid(point: Point2, variant: WildlifeVariant, habitatRequired = true) {
        if (!this.inBounds(point, variant.clearance + 1))
            return false;
        const sample = 'tags' in point ? point as HabitatSample : this.sample(point.x, point.z);
        if (variant.minimumElevation !== undefined
            && sample.height < this.world.waterLevel + variant.minimumElevation)
            return false;
        const center = this.world.settlement.center;
        if (Math.hypot(point.x - center.x, point.z - center.z) < variant.avoidSettlement)
            return false;
        const rival = this.world.rivalSite?.center;
        if (rival && Math.hypot(point.x - rival.x, point.z - rival.z) < variant.avoidSettlement)
            return false;
        if (habitatRequired && !variant.habitats.some(tag => sample.tags.includes(tag)))
            return false;
        if (variant.maximumCoastDistance !== undefined && sample.coastDistance > variant.maximumCoastDistance)
            return false;
        if (variant.minimumCoastDistance !== undefined && sample.coastDistance < variant.minimumCoastDistance)
            return false;
        if (variant.movement === 'air')
            return true;
        if (this.obstacles.some(b => buildingDistance(point.x, point.z, b) < variant.clearance + 1))
            return false;
        for (let dx = -1; dx <= 1; dx++)
            for (let dz = -1; dz <= 1; dz++) {
                for (const obstacle of this.nature.get(this.bucket(point.x + dx * 12, point.z + dz * 12)) ?? []) {
                    if (Math.hypot(point.x - obstacle.x, point.z - obstacle.z) < obstacle.radius + variant.clearance)
                        return false;
                }
            }
        for (const [dx, dz] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const x = point.x + dx * variant.clearance, z = point.z + dz * variant.clearance;
            const height = this.surface.surfaceHeightAt(x, z);
            if (variant.movement === 'water') {
                if (height > this.world.waterLevel - .2)
                    return false;
            }
            else if (height < this.world.waterLevel + .2 || !this.walkable({ x, z }))
                return false;
        }
        return true;
    }
    segmentValid(from: Point2, to: Point2, variant: WildlifeVariant) {
        const steps = Math.ceil(Math.hypot(to.x - from.x, to.z - from.z) / .5);
        for (let i = 0; i <= steps; i++) {
            const t = steps ? i / steps : 0;
            if (!this.valid({ x: from.x + (to.x - from.x) * t, z: from.z + (to.z - from.z) * t }, variant))
                return false;
        }
        return true;
    }
}
