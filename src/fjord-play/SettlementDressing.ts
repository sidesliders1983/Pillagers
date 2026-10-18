import type { SimulationState } from '../simulation/SimulationCore';
import { discoveryAt, type DiscoveryView } from '../simulation/ClanDiscovery';
import type { Bounds2, Point2, WorldBlueprint } from '../world-generation/WorldBlueprint';
import { createBlueprintSurface } from '../world-generation/TerrainQueries';
import type { FjordEntity, FjordPlot, FjordTransform } from './FjordProjection';
import type { FjordGround } from './FjordGround';
import type { SettlementCampfire } from './SettlementCampfire';

export const dressingAssetKeys = [
    'logs', 'barrel', 'crate', 'fish', 'well',
    'kaykit-grass-cluster-a', 'kaykit-grass-cluster-b',
    'kaykit-bush-a', 'kaykit-bush-b', 'kaykit-rock-small-a', 'kaykit-rock-small-b'
] as const;
export type DressingAsset = typeof dressingAssetKeys[number];
export interface DressingBounds extends Bounds2 { height: number }
export type DressingSources = Readonly<Partial<Record<string, DressingBounds>>>;
export interface DressingHome {
    key: string;
    asset: string;
    transform: FjordTransform;
    plot: FjordPlot;
    occupied: boolean;
    farmyard: boolean;
    work: string[];
}
export interface DressingInput {
    seed: number;
    homes: DressingHome[];
    ground: FjordGround;
    campfire: SettlementCampfire;
}
export interface DressingPlacement extends FjordTransform {
    id: string;
    owner: string;
    asset: DressingAsset;
    kind: 'prop' | 'cover';
    bounds: Bounds2;
}
// Quality changes select stable subsets of one plan, never a different world or RNG sequence.
export const dressingBudgets = {
    low: { props: 40, cover: 160 },
    standard: { props: 64, cover: 320 }
} as const;

/** Only facts which change the visible arrangement enter the planner/cache key.
 * Occupation is a resident fact, not the house specialization or an invented inventory. */
export function dressingHomes(state: SimulationState, entities: readonly FjordEntity[]): DressingHome[] {
    return entities.filter(entity => entity.plot && entity.transform).map(entity => {
        const members = Object.values(state.households).filter(home => entity.kind === 'household'
            ? home.id === entity.id
            : home.residenceId && state.residences[home.residenceId]?.buildingId === entity.id)
            .flatMap(home => home.memberIds.map(id => state.personas[id]))
            .filter(person => person?.deathWinter === null);
        return { key: entity.selectionKey, asset: entity.asset,
            transform: { ...entity.transform! }, plot: { ...entity.plot! },
            occupied: members.length > 0, farmyard: Boolean(entity.status.farmyard),
            work: [...new Set(members.map(person => person.occupation).filter(
                work => work !== null))].sort() };
    }).sort((a, b) => a.key.localeCompare(b.key));
}

function randomFor(seed: number, key: string) {
    let value = seed | 0;
    for (const char of key) value = Math.imul(value ^ char.charCodeAt(0), 16777619);
    return () => {
        value ^= value << 13;
        value ^= value >>> 17;
        value ^= value << 5;
        return (value >>> 0) / 4294967296;
    };
}
function overlaps(a: Bounds2, b: Bounds2, margin = 0) {
    return a.minX < b.maxX + margin && a.maxX > b.minX - margin &&
        a.minZ < b.maxZ + margin && a.maxZ > b.minZ - margin;
}
function parcelBounds(plot: FjordPlot): Bounds2 {
    return { minX: plot.x - plot.halfWidth, maxX: plot.x + plot.halfWidth,
        minZ: plot.z - plot.halfDepth, maxZ: plot.z + plot.halfDepth };
}
function transformedBounds(source: Bounds2, transform: FjordTransform): Bounds2 {
    const sine = Math.sin(transform.rotation), cosine = Math.cos(transform.rotation);
    const corners = [source.minX, source.maxX].flatMap(x => [source.minZ, source.maxZ].map(z => ({
        x: transform.x + (x * cosine + z * sine) * transform.scale,
        z: transform.z + (z * cosine - x * sine) * transform.scale
    })));
    return { minX: Math.min(...corners.map(p => p.x)), maxX: Math.max(...corners.map(p => p.x)),
        minZ: Math.min(...corners.map(p => p.z)), maxZ: Math.max(...corners.map(p => p.z)) };
}
function localPoint(home: DressingHome, x: number, z: number) {
    const sine = Math.sin(home.transform.rotation), cosine = Math.cos(home.transform.rotation);
    return { x: home.transform.x + x * cosine + z * sine,
        z: home.transform.z + z * cosine - x * sine };
}
function segmentDistance(point: Point2, a: Point2, b: Point2) {
    const x = b.x - a.x, z = b.z - a.z;
    const t = Math.max(0, Math.min(1, ((point.x - a.x) * x + (point.z - a.z) * z) /
        Math.max(.000001, x * x + z * z)));
    return Math.hypot(point.x - a.x - t * x, point.z - a.z - t * z);
}

/** Small, local presentation plan. Never mutates the blueprint, layout, navigation or Core RNG.
 * Solid props stay inside existing non-walkable parcels. Ground cover remains ankle height. */
export function planSettlementDressing(world: WorldBlueprint, input: DressingInput,
    sources: DressingSources): DressingPlacement[] {
    const surface = createBlueprintSurface(world);
    const homes = [...input.homes].sort((a, b) => a.key.localeCompare(b.key));
    const paths = input.ground.paths.flatMap(path => path.points.slice(1).map((point, i) =>
        [path.points[i], point] as const));
    const walls = homes.flatMap(home => sources[home.asset]
        ? [{ home, source: sources[home.asset]! }] : []);
    const plan: DressingPlacement[] = [];
    const accepted: { bounds: Bounds2; kind: DressingPlacement['kind'] }[] = [];

    const place = (owner: string, slot: string, asset: DressingAsset, point: Point2,
        rotation: number, scale: number, kind: DressingPlacement['kind'], home?: DressingHome) => {
        const source = sources[asset];
        if (!source) return;
        const transform = { ...point, y: 0, rotation, scale };
        const bounds = transformedBounds(source, transform);
        const radius = Math.hypot(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ) / 2;
        const samples = [point, ...[bounds.minX, bounds.maxX].flatMap(x =>
            [bounds.minZ, bounds.maxZ].map(z => ({ x, z })))];
        if (samples.some(p => p.x < surface.bounds.minX || p.x > surface.bounds.maxX ||
            p.z < surface.bounds.minZ || p.z > surface.bounds.maxZ ||
            surface.surfaceHeightAt(p.x, p.z) < surface.waterLevel + .35 ||
            surface.slopeAt(p.x, p.z) > (kind === 'prop' ? .2 : .5))) return;
        const heights = samples.map(p => surface.surfaceHeightAt(p.x, p.z));
        if (Math.max(...heights) - Math.min(...heights) > (kind === 'prop' ? .1 : .3)) return;
        if (Math.hypot(point.x - input.campfire.transform.x, point.z - input.campfire.transform.z) <
            input.campfire.clearingRadius + radius + .5) return;
        if (paths.some(([a, b]) => segmentDistance(point, a, b) < 1.8 + radius)) return;
        if (walls.some(wall => {
            // Test in the house's own axes. A world AABB invents large empty wall corners
            // around diagonal houses and rejects the very side-wall props we want to keep.
            const dx = point.x - wall.home.transform.x, dz = point.z - wall.home.transform.z;
            const sine = Math.sin(wall.home.transform.rotation), cosine = Math.cos(wall.home.transform.rotation);
            const houseScale = wall.home.transform.scale;
            const local = transformedBounds(source, {
                x: (dx * cosine - dz * sine) / houseScale,
                z: (dx * sine + dz * cosine) / houseScale, y: 0,
                rotation: rotation - wall.home.transform.rotation, scale: scale / houseScale
            });
            return overlaps(local, wall.source, .25 / houseScale);
        })) return;
        // Authored farmyards own all their internal details and cattle collision surfaces.
        if (homes.some(other => (other.farmyard || kind === 'prop' && other !== home) &&
            overlaps(bounds, parcelBounds(other.plot), .3))) return;
        if (kind === 'prop') {
            if (!home || bounds.minX < home.plot.x - home.plot.halfWidth + .5 ||
                bounds.maxX > home.plot.x + home.plot.halfWidth - .5 ||
                bounds.minZ < home.plot.z - home.plot.halfDepth + .5 ||
                bounds.maxZ > home.plot.z + home.plot.halfDepth - .5) return;
        } else {
            if (source.height * scale > .6) return;
            // Preserve canonical trunks/rocks; these accents are never woodworker targets.
            if (world.placementPlan.some(p => !/grass|bush/.test(p.assetId) &&
                Math.hypot(p.x - point.x, p.z - point.z) < .55 + radius)) return;
        }
        if (accepted.some(other => overlaps(bounds, other.bounds,
            kind === 'cover' && other.kind === 'cover' ? -.2 : .12))) return;
        transform.y = Math.min(...heights) - (kind === 'cover' ? .035 : 0);
        accepted.push({ bounds, kind });
        plan.push({ id: owner + '/' + slot, owner, asset, kind, ...transform, bounds });
    };

    for (const home of homes) {
        const source = sources[home.asset];
        if (!source || !home.occupied || home.farmyard) continue;
        const temporary = home.asset === 'tent';
        const random = randomFor(input.seed, home.key + ':household');
        const side = random() < .5 ? -1 : 1;
        const left = source.minX * home.transform.scale;
        const right = source.maxX * home.transform.scale;
        const rear = source.minZ * home.transform.scale;
        const edge = (sign: number) => sign < 0 ? left : right;
        const slots: { id: string; asset: DressingAsset; x: number; z: number; scale: number }[] = [
            { id: 'container', asset: 'crate', x: edge(side) + side * .85,
                z: rear + .8, scale: temporary ? .7 : .95 },
            { id: 'barrel', asset: 'barrel', x: edge(side) + side * .85,
                z: rear + 2.1, scale: temporary ? .7 : .95 }
        ];
        if (!temporary) slots.push({ id: 'fuel', asset: 'logs', x: edge(-side) - side * 1.15,
            z: rear + .7, scale: home.work.includes('woodworker') ? 1.05 : .85 });
        if (!temporary && home.work.includes('fisher')) slots.push({ id: 'fishing', asset: 'fish',
            x: 0, z: rear - 1.25, scale: .85 });
        for (const slot of slots) {
            const relativeRotation = slot.asset === 'logs' ? Math.PI / 2 : (random() - .5) * .25;
            const prop = sources[slot.asset];
            if (!prop) continue;
            const footprint = transformedBounds(prop, { x: 0, y: 0, z: 0,
                rotation: relativeRotation, scale: slot.scale });
            if (slot.id === 'fishing') slot.z = rear - footprint.maxZ - .35;
            else {
                const sign = slot.id === 'fuel' ? -side : side;
                slot.x = edge(sign) + (sign < 0 ? -footprint.maxX - .35 : -footprint.minX + .35);
                if (slot.id === 'fuel') slot.z = rear - footprint.minZ + .3;
            }
            const point = localPoint(home, slot.x, slot.z);
            place(home.key, slot.id, slot.asset, point,
                home.transform.rotation + relativeRotation, slot.scale, 'prop', home);
        }
    }

    // The growing village reuses one decorative well at a permanent parcel corner.
    // It has no selection, water stock or production rule, and never creates a new walk obstacle.
    const permanent = homes.filter(home => home.occupied && home.asset !== 'tent');
    const hosts = permanent.filter(home => !home.farmyard).sort((a, b) =>
        Math.hypot(a.transform.x - input.campfire.transform.x, a.transform.z - input.campfire.transform.z) -
        Math.hypot(b.transform.x - input.campfire.transform.x, b.transform.z - input.campfire.transform.z) ||
        a.key.localeCompare(b.key));
    const well = sources.well;
    if (permanent.length >= 2 && well) {
        let placed = false;
        for (const host of hosts) {
            const house = sources[host.asset];
            if (!house) continue;
            for (const side of [-1, 1]) {
                const x = side < 0 ? house.minX * host.transform.scale - well.maxX - .45
                    : house.maxX * host.transform.scale - well.minX + .45;
                const z = house.maxZ * host.transform.scale - well.minZ + .45;
                const before = plan.length;
                place(host.key, 'shared-well', 'well', localPoint(host, x, z),
                    host.transform.rotation, 1, 'prop', host);
                if (plan.length > before) { placed = true; break; }
            }
            if (placed) break;
        }
    }

    const patches: { owner: string; point: Point2; rank: number }[] = [];
    for (const home of homes) {
        const random = randomFor(input.seed, home.key + ':edges');
        // Irregular clusters, with gaps rather than a hedge around every rectangular plot.
        const firstSide = Math.floor(random() * 4);
        for (let sideIndex = 0; sideIndex < 2; sideIndex++) for (let index = 0; index < 2; index++) {
            const side = (firstSide + sideIndex) % 4;
            const along = (index === 0 ? -3 : 3) + (random() - .5) * 3;
            const outside = home.farmyard ? 1.6 : -.9;
            const point = side < 2
                ? { x: home.plot.x + (side === 0 ? -1 : 1) * (home.plot.halfWidth + outside),
                    z: home.plot.z + along }
                : { x: home.plot.x + along,
                    z: home.plot.z + (side === 2 ? -1 : 1) * (home.plot.halfDepth + outside) };
            // Keep the entire front approach open, even before its path is connected.
            const dx = point.x - home.transform.x, dz = point.z - home.transform.z;
            const localX = dx * Math.cos(home.transform.rotation) - dz * Math.sin(home.transform.rotation);
            const localZ = dx * Math.sin(home.transform.rotation) + dz * Math.cos(home.transform.rotation);
            if (Math.abs(localX) < 2.1 && localZ > 0) continue;
            patches.push({ owner: home.key + ':edge-' + side + '-' + index, point, rank: index });
        }
    }
    // Dress only the existing local tree groups, without adding or moving canonical trees.
    const trees = world.placementPlan.filter(p => /conifer|deciduous/.test(p.assetId) &&
        Math.hypot(p.x - input.campfire.transform.x, p.z - input.campfire.transform.z) < 85);
    for (const tree of trees) {
        const owner = 'tree:' + tree.assetId + '@' + tree.x + ',' + tree.z;
        const random = randomFor(input.seed, owner);
        for (let index = 0; index < 3; index++) {
            const angle = random() * Math.PI * 2, radius = 1.5 + random() * 3;
            const point = { x: tree.x + Math.cos(angle) * radius, z: tree.z + Math.sin(angle) * radius };
            if (homes.some(home => overlaps({ minX: point.x - .7, maxX: point.x + .7,
                minZ: point.z - .7, maxZ: point.z + .7 }, parcelBounds(home.plot), .3))) continue;
            patches.push({ owner: owner + ':' + index, point, rank: index % 2 });
        }
    }
    patches.sort((a, b) => a.rank - b.rank || a.owner.localeCompare(b.owner));
    for (const patch of patches) {
        const random = randomFor(input.seed, patch.owner);
        const woodland = patch.owner.startsWith('tree:');
        for (let index = 0; index < (woodland ? 9 : 7); index++) {
            const asset: DressingAsset = index >= 6
                ? index === 8 ? (random() < .5 ? 'kaykit-rock-small-a' : 'kaykit-rock-small-b')
                    : random() < .65 ? (random() < .5 ? 'kaykit-bush-a' : 'kaykit-bush-b')
                        : (random() < .5 ? 'kaykit-rock-small-a' : 'kaykit-rock-small-b')
                : index % 2 === 0 ? 'kaykit-grass-cluster-a' : 'kaykit-grass-cluster-b';
            const source = sources[asset];
            if (!source) continue;
            const width = Math.max(source.maxX - source.minX, source.maxZ - source.minZ);
            const size = index >= 6 ? .65 + random() * .5 : 1.1 + random() * .7;
            const scale = Math.min(size / Math.max(.1, width),
                (asset.includes('rock') ? .18 : asset.includes('bush') ? .5 : .4) /
                Math.max(.1, source.height));
            place(patch.owner, 'cover-' + index, asset, {
                x: patch.point.x + (random() - .5) * (woodland ? 5 : 3.4),
                z: patch.point.z + (random() - .5) * (woodland ? 5 : 3.4)
            }, random() * Math.PI * 2, scale, 'cover');
        }
    }
    return plan;
}

export function visibleDressing(plan: readonly DressingPlacement[], quality: 'low' | 'standard',
    discovery?: DiscoveryView) {
    const budget = dressingBudgets[quality], counts = { prop: 0, cover: 0 };
    return plan.filter(item => {
        const points = [{ x: item.x, z: item.z }, ...[item.bounds.minX, item.bounds.maxX].flatMap(x =>
            [item.bounds.minZ, item.bounds.maxZ].map(z => ({ x, z })))];
        if (discovery && points.some(point => {
            const known = discoveryAt(discovery, point.x, point.z);
            return item.kind === 'prop' ? known !== 'visible' : known === 'unknown';
        })) return false;
        return counts[item.kind]++ < (item.kind === 'prop' ? budget.props : budget.cover);
    });
}
