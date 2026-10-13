import { findNaturalSites } from './MacroIsland';
import { createBlueprintSurface } from './TerrainQueries';
import type { MacroSiteCandidate } from './MacroIsland';
import type { SiteCompartment } from './SettlementSites';
import type { WorldBlueprint } from './WorldBlueprint';

type Landscape = Pick<WorldBlueprint, 'terrain' | 'waterLevel' | 'coast'>;

/** Split lowland at narrow necks. Water, steep slopes and high ground are barriers;
 * no compass sectors or seed-dependent angular wedges define a compartment. */
export function compartmentCandidates(world: Landscape, budget: number) {
    const { terrain, waterLevel } = world;
    const { columns, rows, spacing, heights, bounds } = terrain;
    const surface = createBlueprintSurface(world);
    const point = (i: number) => ({ x: bounds.minX + i % columns * spacing,
        z: bounds.minZ + Math.floor(i / columns) * spacing });
    const neighbors = (i: number) => [i % columns > 0 ? i - 1 : -1,
        i % columns < columns - 1 ? i + 1 : -1,
        i >= columns ? i - columns : -1, i < columns * (rows - 1) ? i + columns : -1];
    const usable = heights.map((height, i) => {
        const p = point(i);
        return height >= waterLevel + .25 && height <= waterLevel + 10 &&
            surface.slopeAt(p.x, p.z) <= .12;
    });
    // Distance to a barrier identifies broad cores; a thin coastal ribbon does not
    // merge the valleys on opposite sides of an island into one giant candidate pool.
    const clearance = new Int16Array(heights.length).fill(32767);
    const edgeQueue: number[] = [];
    for (let i = 0; i < usable.length; i++) if (!usable[i]) {
        clearance[i] = 0;
        edgeQueue.push(i);
    }
    for (let cursor = 0; cursor < edgeQueue.length; cursor++) {
        const cell = edgeQueue[cursor];
        for (const next of neighbors(cell)) if (next >= 0 && clearance[next] > clearance[cell] + 1) {
            clearance[next] = clearance[cell] + 1;
            edgeQueue.push(next);
        }
    }
    const labels = new Int32Array(heights.length).fill(-1);
    const cores: number[][] = [];
    for (let start = 0; start < heights.length; start++) {
        if (clearance[start] * spacing < 6 || labels[start] !== -1) continue;
        const cells = [start];
        labels[start] = -2;
        for (let cursor = 0; cursor < cells.length; cursor++) {
            for (const next of neighbors(cells[cursor])) {
                if (next < 0 || labels[next] !== -1 || clearance[next] * spacing < 6) continue;
                labels[next] = -2;
                cells.push(next);
            }
        }
        if (cells.length * spacing * spacing < 200) continue;
        const id = cores.length;
        cells.forEach(i => { labels[i] = id; });
        cores.push(cells);
    }
    const queue = cores.flat();
    for (let cursor = 0; cursor < queue.length; cursor++) {
        const cell = queue[cursor];
        for (const next of neighbors(cell)) {
            if (next < 0 || !usable[next] || labels[next] >= 0) continue;
            labels[next] = labels[cell];
            queue.push(next);
        }
    }
    const areas = cores.map(() => 0);
    for (let i = 0; i < labels.length; i++) if (labels[i] >= 0) areas[labels[i]] += spacing * spacing;
    const pools: MacroSiteCandidate[][] = cores.map(() => []);
    const natural = findNaturalSites(world, { anchorStride: 5, radius: 65 });
    for (const site of natural) {
        const index = Math.round((site.z - bounds.minZ) / spacing) * columns +
            Math.round((site.x - bounds.minX) / spacing);
        if (labels[index] >= 0) pools[labels[index]].push(site);
    }
    const compartments: SiteCompartment[] = cores.map((cells, i) => ({
        id: 'compartment-' + (i + 1), area: areas[i], coreArea: cells.length * spacing * spacing,
        center: point(cells[Math.floor(cells.length / 2)]), eligibleAnchors: pools[i].length,
        candidateIds: [], sixParcelFits: 0, reasons: pools[i].length ? [] :
            ['No connected 3000m² coastal pocket has an anchor in this compartment.'],
    }));
    const chosen: (MacroSiteCandidate & { compartmentId: string })[] = [];
    const selected: MacroSiteCandidate[][] = cores.map(() => []);
    const order = pools.map((_, i) => i).sort((a, b) => areas[b] - areas[a] || a - b);
    // Round-robin budgets protect smaller geographic compartments from a large plain.
    while (chosen.length < budget) {
        let added = false;
        for (const index of order) {
            if (chosen.length >= budget) break;
            const pool = pools[index];
            if (!pool.length) continue;
            const previous = selected[index];
            const merit = (site: MacroSiteCandidate) => previous.length ?
                Math.min(...previous.map(p => Math.hypot(site.x - p.x, site.z - p.z))) + site.area / 500 : site.area;
            pool.sort((a, b) => merit(b) - merit(a) || a.z - b.z || a.x - b.x);
            const site = pool.shift()!;
            previous.push(site);
            chosen.push({ ...site, compartmentId: compartments[index].id });
            added = true;
        }
        if (!added) break;
    }
    for (let i = 0; i < compartments.length; i++) {
        if (compartments[i].eligibleAnchors && !selected[i].length) {
            compartments[i].reasons.push('Candidate budget exhausted before this compartment.');
        }
    }
    return { candidates: chosen, compartments };
}
