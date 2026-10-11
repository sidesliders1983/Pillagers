import type { FjordEntity } from './FjordProjection';
import type { FjordGround } from './FjordGround';
import type { Point2, WorldBlueprint } from '../world-generation/WorldBlueprint';
import { createBlueprintSurface } from '../world-generation/TerrainQueries';
type Agent = {
    key: string;
    kind: string;
    x: number;
    y: number;
    z: number;
    rotation: number;
    state: 'Idle' | 'Walk';
    speed: number;
    anchor: Point2;
    entity: FjordEntity;
    random: number;
    wait: number;
    path: Point2[];
    signature: string;
    pace: number;
};
/** Ephemeral presentation only. Neither simulation state nor its random stream enters this controller. */
export class LivingWorldController {
    private agents = new Map<string, Agent>();
    private surface;
    private yardSurfaces = new Map<string, (x: number, z: number) => number | null>();
    private parcels: FjordEntity[] = [];
    private nature: WorldBlueprint['placementPlan'] = [];
    private ground: FjordGround = { plots: [], paths: [] };
    constructor(private world: WorldBlueprint) { this.surface = createBlueprintSurface(world); }
    reconcile(entities: readonly FjordEntity[], ground: FjordGround) {
        this.parcels = entities.filter(e => e.plot);
        this.ground = ground;
        const active = entities.filter(e => e.transform && (e.kind === 'persona' || e.kind === 'cattle'));
        // These are the same plot/anchor/path clearances applied by the scene's nature reconciler.
        const cleared = [...this.parcels.map(e => e.plot!), ...active.map(e => ({ ...e.transform!, halfWidth: 1, halfDepth: 1 })),
            ...ground.paths.flatMap(p => p.points.map(point => ({ ...point, halfWidth: 1.5, halfDepth: 1.5 })))];
        this.nature = this.world.placementPlan.filter(p => !cleared.some(c => Math.abs(p.x - c.x) <= c.halfWidth + p.clearance && Math.abs(p.z - c.z) <= c.halfDepth + p.clearance));
        const wanted = new Set(active.map(e => e.selectionKey));
        for (const key of this.agents.keys())
            if (!wanted.has(key)) {
                this.agents.delete(key);
                this.yardSurfaces.delete(key);
            }
        for (const entity of active) {
            const p = entity.transform!, signature = JSON.stringify([p.x, p.z, entity.asset, entity.status.assignment, entity.status.grazingZone]);
            let agent = this.agents.get(entity.selectionKey);
            if (!agent || agent.signature !== signature) {
                this.yardSurfaces.delete(entity.selectionKey);
                let seed = this.world.config.seed >>> 0;
                for (const c of entity.selectionKey)
                    seed = Math.imul(seed ^ c.charCodeAt(0), 16777619) >>> 0;
                agent = { key: entity.selectionKey, kind: entity.kind, x: p.x, y: p.y, z: p.z, rotation: p.rotation,
                    anchor: { x: p.x, z: p.z }, entity, random: seed || 1, wait: 1 + seed % 40 / 10,
                    path: [], signature, state: 'Idle', speed: 0, pace: entity.kind === 'persona' ? .8 : .28 };
                this.agents.set(agent.key, agent);
            }
            agent.entity = entity;
            if (!this.safe(agent, agent)) {
                agent.x = p.x;
                agent.z = p.z;
                agent.path = [];
                agent.speed = 0;
            }
            agent.y = this.surface.surfaceHeightAt(agent.x, agent.z);
        }
    }
    setYardSurface(key: string, sample: (x: number, z: number) => number | null) {
        this.yardSurfaces.set(key, sample);
        const agent = this.agents.get(key);
        if (agent) {
            if (!this.safe(agent, agent)) {
                const farm = this.parcels.find(e => e.kind === 'building' &&
                    e.id === agent.entity.status.assignment)?.plot;
                const candidates: Point2[] = [];
                if (farm) {
                    // Fine source-space slots fit between authored walls and fences; a radial
                    // search can miss those narrow corridors entirely.
                    for (let x = farm.x - farm.halfWidth + .8; x < farm.x + farm.halfWidth - .8; x += .2)
                        for (let z = farm.z - farm.halfDepth + .8; z < farm.z + farm.halfDepth - .8; z += .2)
                            candidates.push({ x, z });
                    candidates.sort((a, b) => Math.hypot(a.x - agent.x, a.z - agent.z) -
                        Math.hypot(b.x - agent.x, b.z - agent.z));
                } else {
                    for (let radius = .25; radius <= 3; radius += .25)
                        for (let direction = 0; direction < 32; direction++)
                            candidates.push({ x: agent.x + Math.cos(direction * Math.PI / 16) * radius,
                                z: agent.z + Math.sin(direction * Math.PI / 16) * radius });
                }
                const point = candidates.find(point => this.safe(agent, point) &&
                    ![...this.agents.values()].some(other => other !== agent &&
                        Math.hypot(other.x - point.x, other.z - point.z) < this.radius(other) + this.radius(agent)));
                if (point) {
                    agent.x = point.x;
                    agent.z = point.z;
                    agent.path = [];
                    agent.state = 'Idle';
                    agent.speed = 0;
                }
            }
            agent.y = this.height(agent);
        }
    }
    private radius(a: Agent) {
        return a.kind === 'persona' ? .4 : a.entity.status.stage === 'Young' ? .5 : a.entity.status.stage === 'Young Adult' ? .7 : .9;
    }
    private height(a: Agent) { return this.yardSurfaces.get(a.key)?.(a.x, a.z) ?? this.surface.surfaceHeightAt(a.x, a.z); }
    setPace(key: string, pace: number) {
        const a = this.agents.get(key);
        if (a && Number.isFinite(pace) && pace > 0)
            a.pace = pace;
    }
    private random(a: Agent) {
        a.random ^= a.random << 13;
        a.random ^= a.random >>> 17;
        a.random ^= a.random << 5;
        return (a.random >>> 0) / 4294967296;
    }
    private safe(a: Agent, p: Point2) {
        if (this.yardSurfaces.has(a.key) && this.yardSurfaces.get(a.key)!(p.x, p.z) === null)
            return false;
        if (a.kind === 'persona' && Math.hypot(p.x - a.anchor.x, p.z - a.anchor.z) > 28)
            return false;
        const b = this.world.terrain.bounds;
        if (p.x < b.minX + 1 || p.x > b.maxX - 1 || p.z < b.minZ + 1 || p.z > b.maxZ - 1 ||
            this.surface.surfaceHeightAt(p.x, p.z) <= this.world.waterLevel + .2 || this.surface.slopeAt(p.x, p.z) > .55)
            return false;
        const farm = this.parcels.find(e => e.id === a.entity.status.assignment && e.kind === 'building')?.plot;
        if (a.entity.status.grazingZone === 'overflow' && farm && Math.hypot(p.x - farm.x, p.z - farm.z) > 20)
            return false;
        if (a.entity.status.grazingZone === 'yard' && farm) {
            if (Math.abs(p.x - farm.x) > farm.halfWidth - .8 || Math.abs(p.z - farm.z) > farm.halfDepth - .8)
                return false;
            // Source farmhouse occupies the central four metres; cattle use the surrounding yard.
            if (Math.abs(p.x - farm.x) < 2.8 && Math.abs(p.z - farm.z) < 2.8)
                return false;
        }
        else if (a.kind === 'cattle' && Math.hypot(p.x - a.anchor.x, p.z - a.anchor.z) > 8)
            return false;
        if (this.parcels.some(e => {
            if (a.entity.status.grazingZone === 'yard' && e.id === a.entity.status.assignment && e.kind === 'building')
                return false;
            return Math.abs(p.x - e.plot!.x) <= e.plot!.halfWidth + .65 && Math.abs(p.z - e.plot!.z) <= e.plot!.halfDepth + .65;
        }))
            return false;
        return !this.nature.some(n => Math.hypot(p.x - n.x, p.z - n.z) < Math.max(.5, n.clearance) + .35);
    }
    private segment(a: Agent, from: Point2, to: Point2) {
        const steps = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.z - from.z) / .2));
        for (let i = 1; i <= steps; i++)
            if (!this.safe(a, { x: from.x + (to.x - from.x) * i / steps, z: from.z + (to.z - from.z) * i / steps }))
                return false;
        return true;
    }
    private route(a: Agent) {
        // A bounded four-neighbour waypoint search works for tents as well as permanent paths.
        const spacing = a.entity.status.grazingZone === 'yard' ? .25 : 1;
        const nodes: Point2[] = [{ x: a.x, z: a.z }], parents = [-1], seen = new Set(['0,0']);
        for (let i = 0; i < nodes.length && nodes.length < 500; i++) {
            const from = nodes[i];
            for (const [dx, dz] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
                const to = { x: from.x + dx * spacing, z: from.z + dz * spacing };
                const key = Math.round((to.x - a.x) / spacing) + ',' + Math.round((to.z - a.z) / spacing);
                if (seen.has(key))
                    continue;
                seen.add(key);
                if (Math.hypot(to.x - a.x, to.z - a.z) > (a.kind === 'persona' ? 14 : 5))
                    continue;
                if (!this.segment(a, from, to))
                    continue;
                parents.push(i);
                nodes.push(to);
            }
        }
        if (nodes.length < 2)
            return [];
        let end = 1 + Math.floor(this.random(a) * (nodes.length - 1));
        if (a.kind === 'persona' && this.random(a) < .7) {
            const homes = this.parcels.map(e => ({ x: e.plot!.x + Math.sin(e.plot!.rotation) * (e.plot!.halfDepth + 2),
                z: e.plot!.z + Math.cos(e.plot!.rotation) * (e.plot!.halfDepth + 2) }));
            const targets = [...homes, a.anchor, ...this.ground.paths.flatMap(p => p.points.filter((_, i) => i % 8 === 0))]
                .filter(p => this.safe(a, p) && Math.hypot(p.x - a.x, p.z - a.z) > 2);
            if (targets.length) {
                const goal = targets[Math.floor(this.random(a) * targets.length)];
                for (let i = 1; i < nodes.length; i++)
                    if (Math.hypot(nodes[i].x - goal.x, nodes[i].z - goal.z) < Math.hypot(nodes[end].x - goal.x, nodes[end].z - goal.z))
                        end = i;
            }
        }
        const path: Point2[] = [];
        while (end > 0) {
            path.unshift(nodes[end]);
            end = parents[end];
        }
        return path;
    }
    advance(seconds: number, running: boolean, visible: boolean) {
        if (!running || !visible || !Number.isFinite(seconds) || seconds <= 0)
            return;
        const elapsed = Math.min(seconds, 1), steps = Math.ceil(elapsed / .1);
        for (let i = 0; i < steps; i++)
            this.step(elapsed / steps);
    }
    private step(dt: number) {
        for (const a of this.agents.values()) {
            if (!a.path.length) {
                a.speed = 0;
                a.state = 'Idle';
                a.wait -= dt;
                if (a.wait <= 0) {
                    a.path = this.route(a);
                    a.wait = 3 + this.random(a) * 5;
                }
                continue;
            }
            const target = a.path[0], dx = target.x - a.x, dz = target.z - a.z, distance = Math.hypot(dx, dz);
            a.speed = Math.min(a.pace, a.speed + dt * a.pace * 2, Math.sqrt(2 * a.pace * Math.max(.01, distance)));
            const step = Math.min(distance, a.speed * dt), p = { x: a.x + dx / distance * step, z: a.z + dz / distance * step };
            if (!this.segment(a, a, p) || [...this.agents.values()].some(other => other !== a && Math.hypot(other.x - p.x, other.z - p.z) < this.radius(a) + this.radius(other) &&
                Math.hypot(other.x - p.x, other.z - p.z) <= Math.hypot(other.x - a.x, other.z - a.z))) {
                a.path = [];
                a.speed = 0;
                a.state = 'Idle';
                a.wait = 1 + this.random(a) * 2;
                continue;
            }
            const heading = Math.atan2(dx, dz), angle = Math.atan2(Math.sin(heading - a.rotation), Math.cos(heading - a.rotation));
            a.rotation += angle * Math.min(1, dt * 8);
            a.x = p.x;
            a.z = p.z;
            a.y = this.height(a);
            a.state = 'Walk';
            if (distance <= step + 1e-7)
                a.path.shift();
        }
    }
    inspect() {
        return [...this.agents.values()].map(a => ({ key: a.key, kind: a.kind, x: a.x, y: a.y, z: a.z,
            rotation: a.rotation, state: a.state, speed: a.speed, walkable: this.safe(a, a) }));
    }
}
