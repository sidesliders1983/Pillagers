import type { Point2, WorldBlueprint } from '../world-generation/WorldBlueprint';
import { identitySample } from '../characters/seededRandom';
import { wildlifeTerritoryGap, type WildlifeVariant } from './WildlifeSpecies';
import type { HabitatSample } from './WildlifeHabitats';

/** Reserve scarce habitats together, before broad-habitat species can occupy them. */
export function planWildlifeTerritories(
    world: WorldBlueprint,
    available: ReadonlyMap<WildlifeVariant, readonly HabitatSample[]>,
    variants: readonly WildlifeVariant[],
) {
    const chosen = new Map<WildlifeVariant, HabitatSample>();
    const centers = [world.settlement.center, ...(world.rivalSite ? [world.rivalSite.center] : [])];
    let attempts = 0;
    let best = new Map<WildlifeVariant, HabitatSample>();

    const fits = (point: Point2, variant: WildlifeVariant) => [...chosen].every(([other, anchor]) =>
        Math.hypot(point.x - anchor.x, point.z - anchor.z)
            >= variant.radius + other.radius + wildlifeTerritoryGap);

    const score = (point: Point2, variant: WildlifeVariant) => {
        const remote = Math.min(220, ...centers.map(center =>
            Math.hypot(point.x - center.x, point.z - center.z)));
        const spacing = Math.min(200, ...[...chosen].map(([other, anchor]) =>
            Math.hypot(point.x - anchor.x, point.z - anchor.z) - variant.radius - other.radius));
        const jitter = identitySample(world.config.seed,
            'wildlife.territory.' + variant.asset + ':' + point.x + ':' + point.z);
        return remote * .6 + spacing * 1.8 + jitter * 12;
    };

    function assign(remaining: readonly WildlifeVariant[]): boolean {
        if (chosen.size > best.size) best = new Map(chosen);
        if (!remaining.length) return true;
        if (++attempts > 25000) return false;

        const options = remaining.map(variant => ({
            variant,
            sites: available.get(variant)!.filter(point => fits(point, variant)),
        }));
        options.sort((a, b) => a.sites.length - b.sites.length
            || a.variant.asset.localeCompare(b.variant.asset));
        const { variant, sites } = options[0];
        const scores = new Map(sites.map(point => [point, score(point, variant)]));
        sites.sort((a, b) => scores.get(b)! - scores.get(a)!);

        for (const point of sites) {
            chosen.set(variant, point);
            if (assign(remaining.filter(item => item !== variant))) return true;
            chosen.delete(variant);
            if (attempts > 25000) break;
        }
        return false;
    }

    return assign(variants.filter(variant => available.get(variant)!.length > 0)) ? chosen : best;
}
