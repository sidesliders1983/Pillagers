import { seededRandom } from '../config/worldConfig';
import { sampleEnvironment } from '../world-generation/EnvironmentZoning';
import { natureFootprints } from '../world-generation/NatureFootprints';
import { pineFootprints } from '../world-generation/PineFootprints';
import { planNature, natureNavigation } from '../world-generation/PlanNature';
import { createBlueprintSurface } from '../world-generation/TerrainQueries';
import type { AssetPlacement, Bounds2, Point2, WorldBlueprint } from '../world-generation/WorldBlueprint';
import type { NatureAssetKey } from '../config/NatureAssets';

type Landscape = Omit<WorldBlueprint, 'biomes' | 'placementPlan'>;
export interface VillageNatureContext {
    sites: readonly Point2[];
    foundations: readonly Bounds2[];
    routes: readonly (readonly Point2[])[];
}
const pocketsPerSite = 5;
const isTree = (asset: string) => /conifer|deciduous/.test(asset);
const distanceToBox = (point: Point2, box: Bounds2) => Math.hypot(
    Math.max(box.minX - point.x, point.x - box.maxX, 0),
    Math.max(box.minZ - point.z, point.z - box.maxZ, 0));
function segmentDistance(point: Point2, a: Point2, b: Point2) {
    const dx = b.x - a.x, dz = b.z - a.z;
    const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.z - a.z) * dz) /
        Math.max(.000001, dx * dx + dz * dz)));
    return Math.hypot(point.x - a.x - t * dx, point.z - a.z - t * dz);
}

/** Pinned island-pool-v2 nature only. Reuses the old habitat/asset budgets and rebuilds
 * obstacles from the clean foundation navigation, never from the old tree obstacles. */
export function planVillageNature(world: Landscape, context: VillageNatureContext) {
    const baseline = planNature(world), surface = createBlueprintSurface(world);
    const originalTrees = baseline.placementPlan.filter(p => isTree(p.assetId));
    const plan: AssetPlacement[] = baseline.placementPlan.filter(p => !isTree(p.assetId));
    const quotas = new Map<NatureAssetKey, number>();
    for (const tree of originalTrees) quotas.set(tree.assetId, (quotas.get(tree.assetId) ?? 0) + 1);
    const counts = new Map<NatureAssetKey, number>();
    const random = seededRandom(world.config.seed ^ 0x631dae);
    const segments = context.routes.flatMap(path => path.slice(1).map((p, i) => [path[i], p] as const));

    const addTree = (assetId: NatureAssetKey, point: Point2, scale: number, rotation: number) => {
        if ((counts.get(assetId) ?? 0) >= (quotas.get(assetId) ?? 0)) return false;
        const footprint = world.config.conifers === 'ez-tree' && assetId in pineFootprints
            ? pineFootprints[assetId as keyof typeof pineFootprints] : natureFootprints[assetId];
        const clearance = footprint.radius * scale + .25;
        const samples = [point, ...[-1, 1].flatMap(sign => [
            { x: point.x + sign * clearance, z: point.z },
            { x: point.x, z: point.z + sign * clearance }
        ])];
        if (samples.some(p => p.x < surface.bounds.minX + 2 || p.x > surface.bounds.maxX - 2 ||
            p.z < surface.bounds.minZ + 2 || p.z > surface.bounds.maxZ - 2 ||
            surface.surfaceHeightAt(p.x, p.z) < world.waterLevel + .4 || surface.slopeAt(p.x, p.z) > .32))
            return false;
        const zone = sampleEnvironment(world, point.x, point.z);
        // Sheltered grassland/woodland, not bare rock, beaches or exposed snowy summits.
        if (!zone || zone.primary !== 'grass' || zone.moisture < .28 || zone.forestCover < .1 ||
            zone.rockExposure > .45 || surface.surfaceHeightAt(point.x, point.z) > world.waterLevel + 55)
            return false;
        if (context.foundations.some(box => distanceToBox(point, box) < clearance + .6) ||
            segments.some(([a, b]) => segmentDistance(point, a, b) < clearance + 1.25)) return false;
        if (plan.some(p => !p.assetId.includes('grass') && Math.hypot(p.x - point.x, p.z - point.z) <
            Math.max(.8, (p.clearance + clearance) * .8))) return false;
        plan.push({ assetId, ...point, y: surface.surfaceHeightAt(point.x, point.z), scale, clearance, rotation });
        counts.set(assetId, (counts.get(assetId) ?? 0) + 1);
        return true;
    };

    const roles = ['kaykit-conifer-a', 'kaykit-conifer-c', 'kaykit-deciduous-a',
        'kaykit-conifer-b', 'kaykit-conifer-c', 'kaykit-deciduous-a',
        'kaykit-conifer-a', 'kaykit-conifer-b', 'kaykit-conifer-c'] as const;
    // Five loose pockets per site leave broad gaps. They follow geographical reservations,
    // not current household/occupation facts, so discovery never leaks a rival's private state.
    for (const site of context.sites) {
        const startAngle = random() * Math.PI * 2;
        for (let pocket = 0; pocket < pocketsPerSite; pocket++) {
            const angle = startAngle + pocket * Math.PI * 2 / pocketsPerSite;
            let anchor: Point2 | undefined;
            for (let attempt = 0; attempt < 48; attempt++) {
                const direction = angle + (random() - .5) * 1.1;
                const radius = 24 + attempt % 12 * 2.8 + random() * 3;
                const point = { x: site.x + Math.cos(direction) * radius,
                    z: site.z + Math.sin(direction) * radius };
                const role = roles[pocket * 3 % roles.length];
                if (addTree(role, point, .66 + random() * .22, random() * Math.PI * 2)) {
                    anchor = point;
                    break;
                }
            }
            if (!anchor) continue;
            for (let member = 1; member < 3; member++) {
                for (let attempt = 0; attempt < 32; attempt++) {
                    const direction = random() * Math.PI * 2, radius = 3 + random() * 4;
                    const point = { x: anchor.x + Math.cos(direction) * radius,
                        z: anchor.z + Math.sin(direction) * radius };
                    if (addTree(roles[(pocket * 3 + member) % roles.length], point, .4 + random() * .3,
                        random() * Math.PI * 2)) break;
                }
            }
        }
    }
    // Keep as much of the old wider landscape as fits. Rejected old trees cannot survive
    // underneath a future home or leave stale navigation blockers at their old position.
    for (const tree of originalTrees) addTree(tree.assetId, tree, tree.scale, tree.rotation);
    for (const [asset, quota] of quotas) {
        const anchors = originalTrees.filter(tree => tree.assetId === asset);
        for (let attempt = 0; (counts.get(asset) ?? 0) < quota && attempt < quota * 80; attempt++) {
            const anchor = anchors[Math.floor(random() * anchors.length)];
            const point = attempt % 3 === 0
                ? { x: surface.bounds.minX + random() * world.config.width,
                    z: surface.bounds.minZ + random() * world.config.depth }
                : { x: anchor.x + (random() - .5) * 24, z: anchor.z + (random() - .5) * 24 };
            addTree(asset, point, .55 + random() * .4, random() * Math.PI * 2);
        }
    }
    return { biomes: baseline.biomes, placementPlan: plan,
        navigation: natureNavigation(world.navigation, plan) };
}
