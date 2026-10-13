import { createWorldSpatialQueries } from '../world-generation/WorldSpatialQueries';
import type { WorldBlueprint } from '../world-generation/WorldBlueprint';

/** Lab-only, collapsed by default. Queries are computed on demand, not each render frame. */
export function renderSpatialDiagnostics(container: HTMLElement, world: WorldBlueprint) {
    const query = createWorldSpatialQueries(world);
    const open = (container as HTMLDetailsElement).open;
    container.hidden = false;
    container.innerHTML = `<summary>Spatial grid · inspect a point</summary>
        <p>Canonical navigation cells · ${query.grid.spacing} m. Building points are advisory;
        a complete foundation still requires the existing footprint validation.</p>
        <p>Ground colours reuse Environment zoning. Physical sea is blue. Movement: green available,
        red blocked. Building points: green unreserved, amber suitable but reserved/occupied,
        red unsuitable. Reservations: pale foundations, green player, pink rival, amber buffer,
        blue routes/harbor. Slope: green 0° to red 90°. Aspect: hue 0° north (+Z), 90° east (+X);
        neutral grey below 0.001 m/m. Forest, rock and snow overlays reuse the zoning fields.</p>
        <label>Query X (m)<input id="world-query-x" type="number" step="any"></label>
        <label>Query Z (m)<input id="world-query-z" type="number" step="any"></label>
        <button id="world-query-inspect">Inspect point</button>
        <button id="world-query-connectivity">Check reserved routes</button>
        <pre id="world-query-result" role="status" style="max-height:16rem;overflow:auto;white-space:pre-wrap"></pre>`;
    (container as HTMLDetailsElement).open = open;
    const x = container.querySelector<HTMLInputElement>('#world-query-x')!;
    const z = container.querySelector<HTMLInputElement>('#world-query-z')!;
    const output = container.querySelector<HTMLElement>('#world-query-result')!;
    x.value = String(world.settlement.center.x);
    z.value = String(world.settlement.center.z);
    container.querySelector('#world-query-inspect')!.addEventListener('click', () => {
        try {
            if (!x.value || !z.value) throw new Error('Enter finite X and Z coordinates.');
            const point = query.sample(Number(x.value), Number(z.value));
            output.textContent = point ? JSON.stringify(point, null, 2) : 'Outside the saved navigation bounds.';
        } catch (error) {
            output.textContent = error instanceof Error ? error.message : String(error);
        }
    });
    container.querySelector('#world-query-connectivity')!.addEventListener('click', () => {
        output.textContent = JSON.stringify(query.navigationReport(), null, 2);
    });
}
