import { createNoise2D } from 'simplex-noise';
import { seededRandom } from '../config/worldConfig';
import { createBlueprintSurface, terrainGradientAt } from './TerrainQueries';
import { createCoastDistance } from './CoastDistance';
import type { Bounds2, WorldBlueprint } from './WorldBlueprint';

export type GroundType = 'water' | 'grass' | 'sand' | 'mud' | 'bedrock';
export interface EnvironmentConfig {
    readonly version: 1;
    readonly meanAnnualTemperatureC: number;
    readonly lapseRateCPerKm: number;
    readonly windFromDegrees: number;
}
export interface EnvironmentRegion {
    readonly id: number;
    readonly ground: GroundType;
    readonly area: number;
    readonly bounds: Bounds2;
    readonly neighbors: readonly number[];
}
export interface EnvironmentZones {
    readonly version: 1;
    readonly spacing: number;
    readonly columns: number;
    readonly rows: number;
    readonly primary: readonly GroundType[];
    readonly regionIds: readonly number[];
    readonly regions: readonly EnvironmentRegion[];
    readonly coverage: Readonly<Record<GroundType, number>>;
    readonly fields: Readonly<Record<EnvironmentField, readonly number[]>>;
}
export type EnvironmentField = 'slope' | 'aspect' | 'moisture' | 'shelter' | 'rockExposure' |
    'forestCover' | 'snowRetentionPotential' | 'grass' | 'sand' | 'mud';
export type EnvironmentRequest = Partial<EnvironmentConfig> & { version: 1 };
export const environmentFields: readonly EnvironmentField[] = [
    'slope', 'aspect', 'moisture', 'shelter', 'rockExposure', 'forestCover',
    'snowRetentionPotential', 'grass', 'sand', 'mud',
];
export function normalizeEnvironmentConfig(request: EnvironmentRequest): EnvironmentConfig {
    if (!request || request.version !== 1) throw new Error('Invalid environment zoning configuration.');
    const config = { version: 1 as const, meanAnnualTemperatureC: request.meanAnnualTemperatureC ?? 6,
        lapseRateCPerKm: request.lapseRateCPerKm ?? 6.5, windFromDegrees: request.windFromDegrees ?? 315 };
    if (config.version !== 1 || !Number.isFinite(config.meanAnnualTemperatureC) ||
        config.meanAnnualTemperatureC < -40 || config.meanAnnualTemperatureC > 40 ||
        !Number.isFinite(config.lapseRateCPerKm) || config.lapseRateCPerKm < 0 || config.lapseRateCPerKm > 12 ||
        !Number.isFinite(config.windFromDegrees) || config.windFromDegrees < 0 || config.windFromDegrees >= 360) {
        throw new Error('Invalid environment zoning configuration.');
    }
    return config;
}
const clamp = (value: number) => Math.max(0, Math.min(1, value));
const smooth = (low: number, high: number, value: number) => {
    const t = clamp((value - low) / (high - low));
    return t * t * (3 - 2 * t);
};
const round = (value: number) => Math.round(value * 1000) / 1000;
const adjacent = (index: number, columns: number, rows: number) => [
    index % columns > 0 ? index - 1 : -1,
    index % columns < columns - 1 ? index + 1 : -1,
    index >= columns ? index - columns : -1,
    index < columns * (rows - 1) ? index + columns : -1,
].filter(value => value >= 0);

/** Bounded descriptive terrain model, not a geological/climate physics simulation. */
export function zoneEnvironment(world: Pick<WorldBlueprint, 'config' | 'terrain' | 'waterLevel' | 'coast'>,
    config: EnvironmentConfig): EnvironmentZones {
    const surface = createBlueprintSurface(world), distanceToCoast = createCoastDistance(world.coast);
    const noise = createNoise2D(seededRandom(world.config.seed ^ 0x62ea719));
    const spacing = 4, columns = world.config.width / spacing + 1, rows = world.config.depth / spacing + 1;
    const fields = Object.fromEntries(environmentFields.map(key => [key, []])) as unknown as Record<EnvironmentField, number[]>;
    const primary: GroundType[] = [];
    for (let row = 0; row < rows; row++) for (let col = 0; col < columns; col++) {
        const x = world.terrain.bounds.minX + col * spacing, z = world.terrain.bounds.minZ + row * spacing;
        const height = surface.surfaceHeightAt(x, z), elevation = height - world.waterLevel;
        const gradient = terrainGradientAt(world, x, z);
        const slope = Math.hypot(gradient.x, gradient.z);
        const aspect = slope < .001 ? 0 : (Math.atan2(-gradient.x, -gradient.z) + Math.PI * 2) % (Math.PI * 2);
        const neighbors = Array.from({ length: 8 }, (_, i) => {
            const angle = i * Math.PI / 4;
            return surface.surfaceHeightAt(x + Math.sin(angle) * 32, z + Math.cos(angle) * 32);
        });
        const context = neighbors.reduce((n, h) => n + h - height, 0) / 8;
        const concavity = clamp(context / 8), convexity = clamp(-context / 10);
        const windAngle = config.windFromDegrees * Math.PI / 180;
        const windwardRise = surface.surfaceHeightAt(x + Math.sin(windAngle) * 48,
            z + Math.cos(windAngle) * 48) - height;
        const shelter = clamp(concavity * .65 + Math.max(0, windwardRise) / 24);
        const variation = noise(x * .008, z * .008);
        const moisture = clamp(.26 + (1 - smooth(2, 22, elevation)) * .24 +
            concavity * .28 + shelter * .2 - smooth(.1, .65, slope) * .28 + variation * .07);
        const rock = elevation <= 0 ? 0 : clamp(smooth(.18, 1.25, slope) * .9 +
            convexity * .18 + (1 - shelter) * .04 + smooth(15, 65, elevation) * .12);
        const coastDistance = distanceToCoast({ x, z });
        const sand = elevation <= 0 ? 0 : (1 - rock) * (1 - smooth(2, 5 + shelter * 8 + variation, coastDistance)) *
            (1 - smooth(.12, .7, slope)) * (1 - smooth(2, 8, elevation));
        const mud = elevation <= 0 ? 0 : (1 - rock - sand) * smooth(.53, .76, moisture) *
            (1 - smooth(.08, .3, slope)) * (1 - smooth(6, 18, elevation)) * smooth(1, 5, coastDistance);
        const grass = elevation <= 0 ? 0 : Math.max(0, 1 - rock - sand - mud);
        const forest = elevation <= 0 ? 0 : smooth(-.25, .35, noise(x * .007 + 8, z * .007 - 3)) *
            (.65 + shelter * .35) * (1 - smooth(.2, .8, slope)) * (1 - rock) *
            (1 - sand) * (1 - mud * .7) * smooth(.28, .53, moisture);
        const temperature = config.meanAnnualTemperatureC - elevation / 1000 * config.lapseRateCPerKm;
        const cold = clamp(-temperature / 8);
        const northFacing = slope < .03 ? .5 : (1 + Math.cos(aspect)) / 2;
        const snow = elevation <= 0 ? 0 : cold * (1 - smooth(.6, 1.8, slope)) *
            (.4 + shelter * .35 + concavity * .25) * (.65 + northFacing * .35);
        const values = { slope, aspect, moisture, shelter, rockExposure: rock, forestCover: forest,
            snowRetentionPotential: snow, grass, sand, mud };
        for (const key of environmentFields) fields[key].push(round(values[key]));
        const ranked: [GroundType, number][] = [['grass', grass], ['sand', sand], ['mud', mud], ['bedrock', rock]];
        primary.push(elevation <= 0 ? 'water' : ranked.sort((a, b) => b[1] - a[1])[0][0]);
    }
    // Small interior fragments are merged into their largest neighboring ground type;
    // water and narrow physical shores retain their true coast geometry.
    const components = () => {
        const visited = new Uint8Array(primary.length), groups: number[][] = [];
        for (let start = 0; start < primary.length; start++) {
            if (visited[start]) continue;
            const group = [start]; visited[start] = 1;
            for (let cursor = 0; cursor < group.length; cursor++) {
                for (const next of adjacent(group[cursor], columns, rows)) {
                    if (!visited[next] && primary[next] === primary[start]) {
                        visited[next] = 1; group.push(next);
                    }
                }
            }
            groups.push(group);
        }
        return groups;
    };
    for (const group of components()) {
        if (group.length >= 9 || ['water', 'sand'].includes(primary[group[0]])) continue;
        const neighbors = new Map<GroundType, number>();
        for (const index of group) for (const next of adjacent(index, columns, rows)) {
            if (primary[next] !== primary[group[0]] && primary[next] !== 'water')
                neighbors.set(primary[next], (neighbors.get(primary[next]) ?? 0) + 1);
        }
        const replacement = [...neighbors].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0];
        if (replacement) for (const index of group) primary[index] = replacement;
    }
    const regionIds = new Array<number>(primary.length);
    const regions = components().map((group, id) => {
        const bounds = { minX: Infinity, minZ: Infinity, maxX: -Infinity, maxZ: -Infinity };
        for (const index of group) {
            regionIds[index] = id;
            const x = world.terrain.bounds.minX + index % columns * spacing;
            const z = world.terrain.bounds.minZ + Math.floor(index / columns) * spacing;
            bounds.minX = Math.min(bounds.minX, x); bounds.maxX = Math.max(bounds.maxX, x);
            bounds.minZ = Math.min(bounds.minZ, z); bounds.maxZ = Math.max(bounds.maxZ, z);
        }
        return { id, ground: primary[group[0]], area: group.length * spacing * spacing, bounds, neighbors: [] as number[] };
    });
    for (let index = 0; index < primary.length; index++) {
        const region = regions[regionIds[index]];
        for (const next of adjacent(index, columns, rows)) {
            const other = regionIds[next];
            if (other !== region.id && !region.neighbors.includes(other)) region.neighbors.push(other);
        }
    }
    for (const region of regions) region.neighbors.sort((a, b) => a - b);
    const coverage = { water: 0, grass: 0, sand: 0, mud: 0, bedrock: 0 };
    for (const ground of primary) coverage[ground]++;
    return { version: 1, spacing, columns, rows, primary, regionIds, regions, coverage, fields };
}

/** Query stored canonical fields without a renderer. Continuous fields use bilinear interpolation. */
export function sampleEnvironment(world: Pick<WorldBlueprint, 'terrain' | 'waterLevel' | 'environment'>,
    x: number, z: number) {
    const zones = world.environment;
    if (!zones) return null;
    if (!Number.isFinite(x) || !Number.isFinite(z)) throw new RangeError('Coordinates must be finite.');
    const gx = (x - world.terrain.bounds.minX) / zones.spacing;
    const gz = (z - world.terrain.bounds.minZ) / zones.spacing;
    if (gx < 0 || gz < 0 || gx > zones.columns - 1 || gz > zones.rows - 1) return null;
    const col = Math.min(zones.columns - 2, Math.floor(gx));
    const row = Math.min(zones.rows - 2, Math.floor(gz));
    const u = gx - col, v = gz - row, offset = row * zones.columns + col;
    const indices = [offset, offset + 1, offset + zones.columns, offset + zones.columns + 1];
    const weights = [(1 - u) * (1 - v), u * (1 - v), (1 - u) * v, u * v];
    const fields = {} as Record<EnvironmentField, number>;
    for (const key of environmentFields) {
        fields[key] = indices.reduce((sum, index, corner) => sum + zones.fields[key][index] * weights[corner], 0);
    }
    // Aspect is circular: a north-facing 359°/1° transition must not become south-facing.
    const sine = indices.reduce((sum, index, corner) => sum + Math.sin(zones.fields.aspect[index]) * weights[corner], 0);
    const cosine = indices.reduce((sum, index, corner) => sum + Math.cos(zones.fields.aspect[index]) * weights[corner], 0);
    fields.aspect = (Math.atan2(sine, cosine) + Math.PI * 2) % (Math.PI * 2);
    const nearest = Math.round(gz) * zones.columns + Math.round(gx);
    return { primary: zones.primary[nearest], regionId: zones.regionIds[nearest], ...fields };
}
