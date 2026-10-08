import { createNoise2D } from 'simplex-noise';
import { seededRandom } from '../config/worldConfig';
import { natureAssetIds } from '../config/NatureAssets';
import { buildingDistance } from '../world/SettlementLayout';
import { natureFootprints } from './NatureFootprints';
import { createBlueprintSurface } from './TerrainQueries';
import type { AssetPlacement, Biome, WorldBlueprint, Point2 } from './WorldBlueprint';

type Landscape = Omit<WorldBlueprint, 'biomes' | 'placementPlan'>;
function segmentDistance(p: Point2, a: Point2, b: Point2) {
    const dx = b.x-a.x, dz = b.z-a.z;
    const t = Math.max(0, Math.min(1, ((p.x-a.x)*dx+(p.z-a.z)*dz)/(dx*dx+dz*dz)));
    return Math.hypot(p.x-a.x-t*dx, p.z-a.z-t*dz);
}

export function planNature(world: Landscape) {
    const surface = createBlueprintSurface(world), { terrain } = world;
    const random = seededRandom(world.config.seed ^ 0x39a16);
    const noise = createNoise2D(seededRandom(world.config.seed ^ 0x15fe));
    const bounds = world.settlement.bounds;
    const cells: Biome[] = [], waterDistance: number[] = [], moisture: number[] = [], worn: number[] = [];
    const coverage = { water: 0, shore: 0, clearing: 0, grass: 0, forest: 0, rock: 0 };
    for (let row = 0; row < terrain.rows; row++) {
        for (let col = 0; col < terrain.columns; col++) {
            const p = { x: terrain.bounds.minX + col*terrain.spacing,
                z: terrain.bounds.minZ + row*terrain.spacing };
            const h = surface.surfaceHeightAt(p.x, p.z), slope = surface.slopeAt(p.x, p.z);
            const distance = Math.min(...world.coast.map(s => segmentDistance(p, s.a, s.b)));
            const wet = h <= world.waterLevel;
            const clearing = p.x >= bounds.minX && p.x <= bounds.maxX &&
                p.z >= bounds.minZ && p.z <= bounds.maxZ;
            const soilMoisture = Math.max(0, Math.min(1, .5 + noise(p.x*.038, p.z*.038)*.3 - slope*.2));
            let wear = clearing ? .25 : 0;
            if (clearing) {
                const routeDistance = Math.min(...world.settlement.accessPaths.flatMap(path =>
                    path.map(q => Math.hypot(p.x-q.x, p.z-q.z))));
                wear = Math.max(wear, Math.exp(-routeDistance*routeDistance/2));
                if (world.settlement.buildings.some(b => buildingDistance(p.x, p.z, b) < 1)) wear = 1;
            }
            const biome: Biome = wet ? 'water' : slope > .48 ? 'rock' : distance < 4 ? 'shore' : clearing ? 'clearing' :
                h > 21 ? 'rock' :
                h > 2.8 && soilMoisture > .34 && noise(p.x*.018+7, p.z*.018) > -.25 ? 'forest' : 'grass';
            cells.push(biome);
            coverage[biome]++;
            waterDistance.push(Math.fround(wet ? -distance : distance));
            moisture.push(Math.fround(soilMoisture));
            worn.push(Math.fround(wear));
        }
    }
    const biomeAt = (x: number, z: number) => cells[Math.round((z-terrain.bounds.minZ)/2)*terrain.columns+
        Math.round((x-terrain.bounds.minX)/2)];
    const placementPlan: AssetPlacement[] = [];
    for (const assetId of natureAssetIds) {
        const tree = assetId.includes('conifer'), deciduous = assetId.includes('deciduous');
        const rock = assetId.includes('rock') || assetId.includes('boulder');
        const grass = assetId.includes('grass');
        const count = Math.round((tree ? 30 : deciduous ? 12 : rock ? 26 : grass ? 65 : 36) *
            (tree || deciduous ? world.config.forestDensity : 1));
        for (let attempt = 0, placed = 0; placed < count && attempt < count*80; attempt++) {
            const x = -85 + random()*170, z = -40 + random()*125;
            const biome = biomeAt(x, z);
            if (tree && biome !== 'forest' || deciduous && !['forest','grass'].includes(biome) ||
                rock && !['rock','shore'].includes(biome) ||
                !tree && !deciduous && !rock && !['grass','forest','clearing'].includes(biome)) continue;
            const patch = (noise(x*.055, z*.055)+1)/2;
            if (!rock && random() > patch*.85) continue;
            const scale = tree ? .65+random()*.35 : deciduous ? .65 :
                grass ? .35+random()*.3 : rock ? .6+random()*.45 : .65+random()*.35;
            const clearance = natureFootprints[assetId].radius*scale+.25;
            if (Math.abs(x)+clearance >= 90 || Math.abs(z)+clearance >= 90) continue;
            const y = surface.surfaceHeightAt(x, z);
            if (y < world.waterLevel+.15 || surface.slopeAt(x, z) > (rock ? .55 : .4)) continue;
            if ([[-1,0],[1,0],[0,-1],[0,1]].some(([dx,dz]) =>
                surface.surfaceHeightAt(x+dx*clearance, z+dz*clearance) < world.waterLevel+.1)) continue;
            if (world.settlement.buildings.some(b => buildingDistance(x, z, b) < clearance)) continue;
            if (world.settlement.accessPaths.some(path => path.some(p =>
                Math.hypot(p.x-x, p.z-z) <= clearance+.65))) continue;
            if (!grass && placementPlan.some(p => !p.assetId.includes('grass') &&
                Math.hypot(p.x-x, p.z-z) < Math.max(.7, (p.clearance+clearance)*.65))) continue;
            placementPlan.push({ assetId, x, y, z, scale, clearance, rotation: random()*Math.PI*2 });
            placed++;
        }
    }
    const nav = world.navigation, navCells = [...nav.cells];
    for (const p of placementPlan) {
        if (p.assetId.includes('grass')) continue;
        const radius = p.clearance+.65;
        for (let z = Math.floor(p.z-radius); z <= Math.ceil(p.z+radius); z++) {
            for (let x = Math.floor(p.x-radius); x <= Math.ceil(p.x+radius); x++) {
                if (Math.hypot(x-p.x,z-p.z) > radius) continue;
                const col = x-nav.bounds.minX, row = z-nav.bounds.minZ;
                if (col >= 0 && col < nav.columns && row >= 0 && row < nav.rows) {
                    navCells[row*nav.columns+col] = false;
                }
            }
        }
    }
    return { biomes: { cells, waterDistance, moisture, worn, coverage }, placementPlan,
        navigation: { ...nav, cells: navCells } };
}
