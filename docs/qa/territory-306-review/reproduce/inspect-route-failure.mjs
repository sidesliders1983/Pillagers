import { readFile, writeFile } from 'node:fs/promises';
import { loadSource } from './fixture-tools.mjs';
const api = await loadSource((process.env.PROFILE_SOURCE_ROOT || process.cwd()));
const { createBlueprintSurface } = api.load('world-generation/TerrainQueries');
const state = api.core.reconstructState(await readFile(new URL('pilot-7cdc-50-g1-before-failure.core.json', import.meta.url), 'utf8'));
const world = api.world, nav = world.navigation, bounds = world.terrain.bounds, surface = createBlueprintSurface(world);
const failures = [];
const terrainFact = point => {
    const column = Math.round((point.x - nav.bounds.minX) / nav.spacing);
    const row = Math.round((point.z - nav.bounds.minZ) / nav.spacing);
    return { nav: !!nav.cells[row * nav.columns + column], height: surface.surfaceHeightAt(point.x, point.z),
        inside: point.x >= bounds.minX && point.x < bounds.maxX && point.z >= bounds.minZ && point.z < bounds.maxZ };
};
for (const clan of [state, ...Object.values(state.world.targetClans)]) {
    for (const [id, actor] of Object.entries(clan.residentPresence.residents)) {
        for (let index = 1; index < actor.route.length; index++) {
            const first = actor.route[index - 1], last = actor.route[index];
            const distance = Math.hypot(last.x - first.x, last.z - first.z);
            const steps = Math.max(1, Math.ceil(distance * 2));
            let prior = surface.surfaceHeightAt(first.x, first.z);
            for (let step = 0; step <= steps; step++) {
                const point = { x: first.x + (last.x - first.x) * step / steps,
                    z: first.z + (last.z - first.z) * step / steps };
                const fact = terrainFact(point);
                const allowed = .65 * distance / steps + 1e-6;
                if (!fact.inside || !fact.nav || fact.height <= world.waterLevel + .25 ||
                    step > 0 && Math.abs(fact.height - prior) > allowed) {
                    failures.push({ clan: clan.clan.id, id, mode: actor.mode, home: actor.home,
                        current: actor.position, routeIndex: index, first, last, sample: point,
                        priorHeight: prior, fact, deltaHeight: Math.abs(fact.height - prior), allowed });
                    break;
                }
                prior = fact.height;
            }
        }
    }
}
await writeFile(new URL('pilot-route-failure-detail.json', import.meta.url), JSON.stringify({ time: state.time, failures }, null, 2));
console.log(JSON.stringify({ time: state.time, failures }));
