import {planWetLowlands, type WetLowlandPlan, type WetLowlandRules} from './WetLowlands';
import type { Bounds2, Point2, WorldBlueprint } from './WorldBlueprint';
import { createBlueprintSurface, terrainGradientAt } from './TerrainQueries';
import { sampleEnvironment } from './EnvironmentZoning';
import { siteRoutes } from './SiteNavigation';
import { planRoute } from './LandRoutes';

export interface OreSiteRules {
    version: 1;
    maximumSites: number;
    minimumElevation: number;
    minimumRockExposure: number;
    maximumApproachSlope: number;
    minimumSeparation: number;
    settlementBuffer: number;
    minimumUnits: number;
    maximumUnits: number;
}
export interface OreSite {
    id: string;
    ore: 'iron';
    position: Point2 & { y: number };
    approach: Point2;
    appearance: 'rock-outcrop' | 'bog-iron';
    wetLowlandId?: string;
    initialUnits: number;
    rockExposure: number;
}
export interface OreSitePlan {
    version: 1 | 2;
    wetLowlands?: WetLowlandPlan;
    rules: OreSiteRules;
    sites: OreSite[];
    inspected: number;
    candidates: number;
    routeChecks: number;
    inaccessible: number;
    reasons: string[];
}
/** Experimental coefficients, pending a multi-seed availability report and owner review. */
export const prototypeOreSiteRules: Readonly<OreSiteRules> = Object.freeze({
    version: 1, maximumSites: 4, minimumElevation: 8, minimumRockExposure: .35,
    maximumApproachSlope: .55, minimumSeparation: 110, settlementBuffer: 20,
    minimumUnits: 32, maximumUnits: 96,
});
const within = (point: Point2, bounds: Bounds2, margin: number) =>
    point.x >= bounds.minX - margin && point.x <= bounds.maxX + margin &&
    point.z >= bounds.minZ - margin && point.z <= bounds.maxZ + margin;

/** Derived from the actual final terrain/zoning/nav; no second map, random stream or discovery state. */
export function planOreSites(world: WorldBlueprint, overrides: Partial<OreSiteRules> = {}): OreSitePlan {
    const rules = { ...prototypeOreSiteRules, ...overrides };
    if (Object.keys(overrides).some(key => !Object.hasOwn(prototypeOreSiteRules, key)) || rules.version !== 1 || !Number.isInteger(rules.maximumSites) || rules.maximumSites < 0 || rules.maximumSites > 8 ||
        !Number.isInteger(rules.minimumUnits) || !Number.isInteger(rules.maximumUnits) ||
        rules.minimumUnits < 1 || rules.maximumUnits < rules.minimumUnits || rules.maximumUnits > 10000 ||
        ![rules.minimumElevation, rules.minimumRockExposure, rules.maximumApproachSlope,
            rules.minimumSeparation, rules.settlementBuffer].every(n => Number.isFinite(n) && n >= 0) ||
        rules.minimumRockExposure > 1 || rules.maximumApproachSlope > 1 || rules.minimumSeparation < 8)
        throw new Error('Invalid ore-site rules.');
    const result: OreSitePlan = { version: 1, rules, sites: [], inspected: 0, candidates: 0, routeChecks: 0, inaccessible: 0, reasons: [] };
    if (!world.environment) { result.reasons.push('missing-environment-zoning'); return result; }
    const surface = createBlueprintSurface(world), nav = world.navigation;
    const routes = siteRoutes(nav, world.settlement.center);
    const forbidden = [world.settlement.bounds, ...(world.rivalSite ? [world.rivalSite.bounds] : [])];
    const occupied = new Map<string, typeof world.placementPlan[number][]>();
    const bucket = (x: number, z: number) => `${Math.floor(x / 8)}:${Math.floor(z / 8)}`;
    for (const prop of world.placementPlan) {
        const key = bucket(prop.x, prop.z), list = occupied.get(key) ?? [];
        list.push(prop); occupied.set(key, list);
    }
    const collision = (point: Point2) => {
        const col = Math.floor(point.x / 8), row = Math.floor(point.z / 8);
        for (let z = row - 2; z <= row + 2; z++) for (let x = col - 2; x <= col + 2; x++)
            for (const prop of occupied.get(`${x}:${z}`) ?? [])
                if (Math.hypot(prop.x - point.x, prop.z - point.z) < prop.clearance + 1.5) return true;
        return false;
    };
    const candidates: { site: OreSite; score: number }[] = [];
    const stride = Math.max(1, Math.round(8 / nav.spacing));
    for (let row = stride; row < nav.rows - stride; row += stride)
        for (let col = stride; col < nav.columns - stride; col += stride) {
            result.inspected++;
            if (!nav.cells[row * nav.columns + col]) continue;
            const approach = { x: nav.bounds.minX + col * nav.spacing, z: nav.bounds.minZ + row * nav.spacing };
            if (forbidden.some(bounds => within(approach, bounds, rules.settlementBuffer)) ||
                surface.slopeAt(approach.x, approach.z) > rules.maximumApproachSlope) continue;
            const gradient = terrainGradientAt(world, approach.x, approach.z), slope = Math.hypot(gradient.x, gradient.z);
            if (slope < .1) continue;
            const x = approach.x + gradient.x / slope * 3.5, z = approach.z + gradient.z / slope * 3.5;
            const y = surface.surfaceHeightAt(x, z), zone = sampleEnvironment(world, x, z);
            if (!zone || zone.rockExposure < rules.minimumRockExposure || zone.moisture > .8 ||
                y < world.waterLevel + rules.minimumElevation || collision({ x, z }) ||
                forbidden.some(bounds => within({ x, z }, bounds, rules.settlementBuffer))) continue;
            const initialUnits = rules.minimumUnits + Math.floor(zone.rockExposure *
                (rules.maximumUnits - rules.minimumUnits));
            candidates.push({ score: zone.rockExposure * 10 + (y - world.waterLevel) * .01 - zone.moisture,
                site: { id: `iron-${world.config.seed}-${row}-${col}`, ore: 'iron',
                    position: { x, y, z }, approach, appearance: 'rock-outcrop', initialUnits,
                    rockExposure: zone.rockExposure } });
        }
    result.candidates = candidates.length;
    candidates.sort((a, b) => b.score - a.score || (a.site.id < b.site.id ? -1 : a.site.id > b.site.id ? 1 : 0));
    for (const { site } of candidates) {
        if (result.sites.length === rules.maximumSites) break;
        if (result.sites.some(other => Math.hypot(other.position.x - site.position.x,
            other.position.z - site.position.z) < rules.minimumSeparation) || !routes(site.approach).length) continue;
        if (result.routeChecks >= 64) { result.reasons.push('route-search-limit'); break; }
        result.routeChecks++;
        try {
            const route = planRoute({ world }, site.approach, world.settlement.center, true);
            if (route.adjusted) { result.inaccessible++; continue; }
        } catch { result.inaccessible++; continue; }
        result.sites.push(site);
    }
    if (!result.sites.length) result.reasons.push('no-accessible-rock-sites');
    return result;
}


/** New Mining authoring revision; legacy v1 proposals remain independently reproducible. */
export function planMiningSites(world: WorldBlueprint, overrides: Partial<OreSiteRules> = {},
    wetRules: Partial<WetLowlandRules> = {}): OreSitePlan {
    const rock = planOreSites(world, overrides), wetLowlands = planWetLowlands(world, wetRules);
    const result: OreSitePlan = {...rock, version: 2, sites: [...rock.sites], reasons: [...rock.reasons], wetLowlands};
    let checks = 0, added = 0;
    for (const patch of wetLowlands.patches) {
        // A deterministic subset of actual wet patches bears ore; never label all mud as a deposit.
        const anchor = patch.cells[Math.floor(patch.cells.length / 2)];
        if (added >= 2 || added >= wetLowlands.patches.length - 1 ||
            (Math.imul(world.config.seed ^ anchor, 0x45d9f3b) >>> 0) % 3 !== 0) continue;
        const approach = {...patch.center}, surface = createBlueprintSurface(world);
        if (world.placementPlan.some(prop => Math.hypot(prop.x - approach.x, prop.z - approach.z) < prop.clearance + 1.5) ||
            result.sites.some(site => Math.hypot(site.position.x - approach.x, site.position.z - approach.z) < 40)) continue;
        if (++checks > 8) break;
        try {if (planRoute({world}, approach, world.settlement.center, true).adjusted) continue;}
        catch {continue;}
        const zone = sampleEnvironment(world, approach.x, approach.z)!;
        result.sites.push({id: `bog-iron-${patch.id}`, ore: 'iron', appearance: 'bog-iron', wetLowlandId: patch.id,
            approach, position: {...approach, y: surface.surfaceHeightAt(approach.x, approach.z)}, rockExposure: 0,
            initialUnits: rock.rules.minimumUnits + Math.floor(zone.mud * (rock.rules.maximumUnits - rock.rules.minimumUnits))});
        added++;
    }
    if (!added) result.reasons.push('no-accessible-bog-iron');
    return result;
}

/** Engine math may differ by a last bit. Validate tightly, then retain the saved proposal. */
export function assertOreSitePlan(world: WorldBlueprint, saved: OreSitePlan): void {
    if (!saved || ![1, 2].includes(saved.version) || !saved.rules) throw new Error('Invalid saved ore-site proposal.');
    if (saved.version === 2 && !saved.wetLowlands) throw new Error('Missing wet lowland proposal.');
    const expected = saved.version === 1 ? planOreSites(world, saved.rules) :
        planMiningSites(world, saved.rules, saved.wetLowlands!.rules);
    const equivalent = (actual: unknown, canonical: unknown, path: string): boolean => {
        if (typeof canonical === 'number') {
            if (typeof actual !== 'number' || !Number.isFinite(actual)) return false;
            const geometry = /^sites\.\d+\.(position|approach)\.[xyz]$/.test(path);
            const exposure = /^sites\.\d+\.rockExposure$/.test(path);
            return Math.abs(actual - canonical) <= (geometry ? 1e-7 : exposure ? 1e-10 : 0);
        }
        if (!canonical || typeof canonical !== 'object') return actual === canonical;
        if (!actual || typeof actual !== 'object' || Array.isArray(actual) !== Array.isArray(canonical)) return false;
        const keys = Object.keys(canonical);
        if (Object.keys(actual).length !== keys.length) return false;
        return keys.every(key => Object.hasOwn(actual, key) && equivalent(
            (actual as Record<string, unknown>)[key], (canonical as Record<string, unknown>)[key], path ? path + '.' + key : key));
    };
    if (!equivalent(saved, expected, ''))
        throw new Error('Saved ore sites do not match the canonical island.');
}
