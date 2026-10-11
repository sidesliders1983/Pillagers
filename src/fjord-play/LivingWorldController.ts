import { cattleVariants } from '../characters/CattlePresentation';
import { passConversation, passNeighbours } from '../systems/ResidentPassing';
import { SocialEncounters, residentMovementConfig, turnToward } from '../systems/SocialEncounters';
import type { FjordEntity } from './FjordProjection';
import type { FjordGround } from './FjordGround';
import type { Point2, WorldBlueprint } from '../world-generation/WorldBlueprint';
import { createBlueprintSurface } from '../world-generation/TerrainQueries';
type OccupationClip = 'Farm' | 'Attack' | 'Doze';
type Visit = { target: Point2; face: Point2; source: string; phase: 'approach' | 'activity' | 'home';
    clip: OccupationClip | 'Idle'; remaining: number; travelRemaining?: number;
    checkpoint?: Point2; checkpointSeconds?: number };
type Agent = {
    key: string;
    kind: string;
    x: number;
    y: number;
    z: number;
    rotation: number;
    state: 'Idle' | 'Walk' | 'Talk' | 'Listen' | 'Graze' | 'HumanInteraction' | OccupationClip;
    visit: Visit | null;
    visitDelay: number;
    occupationClips: Partial<Record<OccupationClip, number>>;
    interactionSeconds: number;
    grazeSeconds: number;
    grazeRemaining: number;
    grazeNext: boolean;
    blockedSeconds: number;
    socialEnabled: boolean;
    speed: number;
    anchor: Point2;
    entity: FjordEntity;
    random: number;
    wait: number;
    path: Point2[];
    detour: Point2[];
    signature: string;
    pace: number;
};
/** Ephemeral presentation only. Neither simulation state nor its random stream enters this controller. */
export class LivingWorldController {
    readonly diagnostics: string[] = [];
    private metrics = { routeAttempts: 0, rejectedRoutes: 0, targetAttempts: 0,
        rejectedTargets: 0, routeNodes: 0, maxRouteNodes: 0,
        updates: 0, lastUpdateMs: 0, maxUpdateMs: 0, totalUpdateMs: 0,
        yardRepackAttempts: 0, yardRepackNodes: 0, yardRepackFailures: 0 };
    private agents = new Map<string, Agent>();
    private social = new SocialEncounters();
    private surface;
    private yardSurfaces = new Map<string, (x: number, z: number) => number | null>();
    private trees: { key: string; x: number; z: number; clearance: number }[] = [];
    private parcels: FjordEntity[] = [];
    private nature: WorldBlueprint['placementPlan'] = [];
    private natureCells = new Map<string, Array<WorldBlueprint['placementPlan'][number]>>();
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
        this.natureCells.clear();
        for (const item of this.nature) {
            const radius = Math.max(.5, item.clearance) + .35;
            for (let x = Math.floor((item.x - radius) / 8); x <= Math.floor((item.x + radius) / 8); x++)
                for (let z = Math.floor((item.z - radius) / 8); z <= Math.floor((item.z + radius) / 8); z++) {
                    const key = x + ',' + z;
                    let cell = this.natureCells.get(key);
                    if (!cell) this.natureCells.set(key, cell = []);
                    cell.push(item);
                }
        }
        const existing = new Set(this.agents.keys());
        const wanted = new Set(active.map(e => e.selectionKey));
        for (const key of this.agents.keys())
            if (!wanted.has(key)) {
                this.social.remove(key);
                this.agents.delete(key);
                this.yardSurfaces.delete(key);
            }
        for (const entity of active) {
            const p = entity.transform!, signature = JSON.stringify([p.x, p.z, entity.status.assignment, entity.status.grazingZone]);
            let agent = this.agents.get(entity.selectionKey);
            if (agent && agent.signature !== signature && entity.kind === 'persona') {
                // A new home changes navigation intent, not an already safe moving body.
                this.social.remove(agent.key);
                this.cancelVisit(agent);
                agent.anchor = { x: p.x, z: p.z };
                agent.signature = signature;
            }
            if (!agent || agent.signature !== signature) {
                this.social.remove(entity.selectionKey);
                this.yardSurfaces.delete(entity.selectionKey);
                let seed = this.world.config.seed >>> 0;
                for (const c of entity.selectionKey)
                    seed = Math.imul(seed ^ c.charCodeAt(0), 16777619) >>> 0;
                agent = {
                    key: entity.selectionKey, kind: entity.kind,
                    x: p.x, y: p.y, z: p.z, rotation: p.rotation,
                    anchor: { x: p.x, z: p.z }, entity, random: seed || 1,
                    wait: 1 + seed % 40 / 10, path: [], detour: [], signature,
                    visit: null, visitDelay: 8 + seed % 130 / 10, occupationClips: {},
                    state: 'Idle', interactionSeconds: 0, grazeSeconds: 0,
                    grazeRemaining: 0, grazeNext: true, blockedSeconds: 0,
                    socialEnabled: true, speed: 0, pace: entity.kind === 'persona' ? .8 : .28,
                };
                this.agents.set(agent.key, agent);
            }
            if (agent.entity.status.occupation !== entity.status.occupation ||
                agent.entity.status.workEligible !== entity.status.workEligible ||
                agent.entity.status.workHomeId !== entity.status.workHomeId) {
                this.social.remove(agent.key);
                this.cancelVisit(agent);
            }
            agent.entity = entity;
            if (!this.safe(agent, agent)) {
                this.social.remove(agent.key);
                agent.x = p.x;
                agent.z = p.z;
                agent.path = [];
                agent.detour = [];
                agent.speed = 0;
            }
            agent.y = this.surface.surfaceHeightAt(agent.x, agent.z);
        }
        const actors = [...this.agents.values()].sort((a, b) =>
            Number(existing.has(a.key)) - Number(existing.has(b.key)));
        for (const actor of actors) {
            // Actual fenced yard support is bound afterwards by the loaded source layer.
            if (actor.entity.status.grazingZone === 'yard' || this.bodyClearance(actor, actor)) continue;
            let point: Point2 | undefined;
            for (let radius = .25; radius <= 3 && !point; radius += .25)
                for (let direction = 0; direction < 32 && !point; direction++) {
                    const candidate = { x: actor.x + Math.cos(direction * Math.PI / 16) * radius,
                        z: actor.z + Math.sin(direction * Math.PI / 16) * radius };
                    if (this.safe(actor, candidate) && this.bodyClearance(actor, candidate, candidate)) point = candidate;
                }
            if (point) {
                this.social.remove(actor.key);
                this.cancelVisit(actor);
                actor.x = point.x;
                actor.z = point.z;
                actor.y = this.height(actor);
                actor.path = [];
                actor.detour = [];
                actor.speed = 0;
                actor.state = 'Idle';
            }
        }
        this.clearReleasedPoses();
    }
    private clearReleasedPoses() {
        for (const actor of this.agents.values())
            if ((actor.state === 'Talk' || actor.state === 'Listen' || actor.state === 'HumanInteraction') &&
                this.social.inspect(actor.key).partnerKey === null) {
                actor.state = actor.kind === 'cattle' && actor.grazeRemaining > 0 ? 'Graze' : 'Idle';
                actor.speed = 0;
            }
    }
    setOccupationClips(key: string, clips: Partial<Record<OccupationClip, number>>) {
        const actor = this.agents.get(key);
        if (!actor) return;
        for (const seconds of Object.values(clips))
            if (!Number.isFinite(seconds) || seconds <= 0) throw new Error('Invalid occupation clip duration');
        actor.occupationClips = { ...clips };
        if (actor.visit && actor.visit.clip !== 'Idle' && !clips[actor.visit.clip]) this.cancelVisit(actor);
    }
    private cancelVisit(a: Agent) {
        a.visit = null;
        a.path = [];
        a.detour = [];
        if (this.social.inspect(a.key).partnerKey === null) a.state = 'Idle';
        a.speed = 0;
        a.visitDelay = 20;
    }
    setStandingTrees(trees: readonly { key: string; x: number; z: number; clearance: number }[]) {
        this.trees = trees.map(tree => ({ ...tree }));
        const sources = new Set(trees.map(tree => tree.key));
        for (const a of this.agents.values())
            if (a.visit && (a.entity.status.occupation === 'woodworker' ||
                a.entity.status.occupation === 'hunter') && !sources.has(a.visit.source)) { this.cancelVisit(a); }
    }
    private visitTargets(a: Agent): Visit[] {
        if (!a.entity.status.workEligible) return [];
        if (a.entity.status.occupation === 'fisher') {
            const targets: Visit[] = [];
            if (!a.occupationClips.Doze) {
                const reason = a.key + ': Doze off binding unavailable; shore visit uses bounded Idle.';
                if (!this.diagnostics.includes(reason)) this.diagnostics.push(reason);
            }
            for (const [index, coast] of this.world.coast.entries()) {
                const middle = { x: (coast.a.x + coast.b.x) / 2, z: (coast.a.z + coast.b.z) / 2 };
                if (Math.hypot(middle.x - a.anchor.x, middle.z - a.anchor.z) > 70) continue;
                const dx = coast.b.x - coast.a.x, dz = coast.b.z - coast.a.z;
                const length = Math.hypot(dx, dz);
                if (!length) continue;
                for (const side of [-1, 1]) for (const distance of [2, 3, 4]) {
                    const target = { x: middle.x + dz / length * side * distance,
                        z: middle.z - dx / length * side * distance };
                    if (this.safe(a, target)) targets.push({ target, face: middle, source: 'shore:' + index,
                        phase: 'approach', clip: a.occupationClips.Doze ? 'Doze' : 'Idle',
                        remaining: a.occupationClips.Doze ?? 8 });
                }
            }
            return targets;
        }
        if (a.entity.status.occupation === 'woodworker' || a.entity.status.occupation === 'hunter') {
            const chopping = a.entity.status.occupation === 'woodworker';
            if (chopping && !a.occupationClips.Attack) return [];
            const targets: Visit[] = [];
            for (const tree of this.trees) {
                if (Math.hypot(tree.x - a.anchor.x, tree.z - a.anchor.z) > 26) continue;
                for (let side = 0; side < 8; side++) {
                    const distance = tree.clearance + 1.2;
                    const target = { x: tree.x + Math.cos(side * Math.PI / 4) * distance,
                        z: tree.z + Math.sin(side * Math.PI / 4) * distance };
                    targets.push({ target, face: { x: tree.x, z: tree.z }, source: tree.key,
                        phase: 'approach', clip: chopping ? 'Attack' : 'Idle',
                        remaining: chopping ? a.occupationClips.Attack! : 3 });
                }
            }
            return targets.filter(v => this.safe(a, v.target));
        }
        if (a.entity.status.occupation !== 'farmer' || !a.occupationClips.Farm) return [];
        const farm = this.parcels.find(e => e.kind === 'building' && e.id === a.entity.status.workHomeId);
        if (!farm?.plot || !farm.status.farmyard) return [];
        const p = farm.plot;
        const targets: Visit[] = [];
        for (const side of [-1, 1]) for (const offset of [-3, 0, 3]) {
            const target = { x: p.x + offset, z: p.z + side * (p.halfDepth + 2) };
            targets.push({ target, face: { x: p.x, z: p.z }, source: farm.selectionKey,
                phase: 'approach', clip: 'Farm', remaining: a.occupationClips.Farm });
        }
        return targets.filter(v => this.safe(a, v.target));
    }
    private visitBudget(a: Agent, path: readonly Point2[]) {
        let previous: Point2 = a, distance = 0;
        for (const point of path) {
            distance += Math.hypot(point.x - previous.x, point.z - previous.z);
            previous = point;
        }
        // Finite presentation travel, with room for passing and turns; never a Core timer.
        return Math.min(240, Math.max(30, distance / Math.max(.01, a.pace) * 2 + 10));
    }
    private refreshStalledVisit(a: Agent, seconds: number) {
        const visit = a.visit!;
        visit.checkpointSeconds = (visit.checkpointSeconds ?? 0) + seconds;
        if (visit.checkpointSeconds < 8) return;
        const checkpoint = visit.checkpoint ?? a;
        if (Math.hypot(a.x - checkpoint.x, a.z - checkpoint.z) < 1) {
            // Passing can circle a body in a narrow corridor. Retry the same goal
            // against current occupancy without extending the finite travel budget.
            const goal = visit.phase === 'home' ? a.anchor : visit.target;
            const route = this.route(a, goal);
            if (route.length) {
                a.path = route;
                a.detour = [];
                a.speed = 0;
            }
        }
        visit.checkpoint = { x: a.x, z: a.z };
        visit.checkpointSeconds = 0;
    }
    private beginVisit(a: Agent) {
        const targets = this.visitTargets(a).filter(v => ![...this.agents.values()].some(other =>
            other !== a && other.visit && Math.hypot(other.visit.target.x - v.target.x,
                other.visit.target.z - v.target.z) < 2));
        targets.sort((left, right) => Math.hypot(left.target.x - a.x, left.target.z - a.z) -
            Math.hypot(right.target.x - a.x, right.target.z - a.z));
        targets.splice(24);
        const offset = Math.floor(this.random(a) * Math.max(1, targets.length));
        for (let i = 0; i < Math.min(8, targets.length); i++) {
            const visit = targets[(i + offset) % targets.length];
            this.metrics.targetAttempts++;
            const path = this.route(a, visit.target);
            if (!path.length) {
                this.metrics.rejectedTargets++;
                continue;
            }
            visit.travelRemaining = this.visitBudget(a, path);
            visit.checkpoint = { x: a.x, z: a.z };
            visit.checkpointSeconds = 0;
            a.visit = visit;
            a.path = path;
            a.detour = [];
            return;
        }
        const reason = a.key + ': no reachable ' + (a.entity.status.occupation ?? 'occupation') +
            ' target; ordinary wandering retained.';
        if (a.entity.status.workEligible && !this.diagnostics.includes(reason)) this.diagnostics.push(reason);
        a.visitDelay = 20 + this.random(a) * 20;
    }
    setActivityClips(key: string, clips: { Graze?: number; HumanInteraction?: number }) {
        const actor = this.agents.get(key);
        if (!actor) return;
        if (clips.Graze !== undefined && (!Number.isFinite(clips.Graze) || clips.Graze <= 0))
            throw new Error('Invalid grazing clip duration');
        if (clips.HumanInteraction !== undefined &&
            (!Number.isFinite(clips.HumanInteraction) || clips.HumanInteraction <= 0))
            throw new Error('Invalid cattle interaction clip duration');
        actor.interactionSeconds = clips.HumanInteraction ?? 0;
        if (!actor.interactionSeconds && actor.state === 'HumanInteraction') this.social.remove(key);
        this.clearReleasedPoses();
        actor.grazeSeconds = clips.Graze ?? 0;
        if (!actor.grazeSeconds && actor.state === 'Graze') {
            actor.state = 'Idle';
            actor.grazeRemaining = 0;
        }
    }
    setSocialEnabled(key: string, enabled: boolean) {
        const actor = this.agents.get(key);
        if (!actor || actor.socialEnabled === enabled) return;
        actor.socialEnabled = enabled;
        if (!enabled) this.social.remove(key);
        this.clearReleasedPoses();
    }
    setYardSurface(key: string, sample: (x: number, z: number) => number | null) {
        this.yardSurfaces.set(key, sample);
        const agent = this.agents.get(key);
        if (agent) {
            if (!this.safe(agent, agent) || !this.bodyClearance(agent, agent)) {
                this.social.remove(agent.key);
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
                } else if (!this.repackYard(agent, candidates)) {
                    const message = agent.key + ': no free source-yard slot after bounded herd recovery.';
                    if (!this.diagnostics.includes(message)) this.diagnostics.push(message);
                }
            }
            agent.y = this.height(agent);
        }
        this.clearReleasedPoses();
    }
    /** A larger body can exhaust the free gaps even though the authored yard still fits the herd.
     * Repack only after local recovery fails, prefer current poses, and never relax source clearance. */
    private repackYard(changed: Agent, candidates: readonly Point2[]) {
        this.metrics.yardRepackAttempts++;
        const herd = [...this.agents.values()].filter(actor => actor.kind === 'cattle' &&
            actor.entity.status.grazingZone === 'yard' &&
            actor.entity.status.assignment === changed.entity.status.assignment &&
            this.yardSurfaces.has(actor.key));
        const members = new Set(herd);
        const outside = [...this.agents.values()].filter(actor => !members.has(actor));
        const options = herd.map(actor => ({ actor, points: [actor, ...candidates]
            .filter(point => this.safe(actor, point) && outside.every(other =>
                Math.hypot(other.x - point.x, other.z - point.z) >= this.radius(other) + this.radius(actor)))
            .sort((a, b) => Math.hypot(a.x - actor.x, a.z - actor.z) -
                Math.hypot(b.x - actor.x, b.z - actor.z)) }));
        // Constrained/newly invalid actors reserve their support first; the others retain their pose if possible.
        options.sort((a, b) => Number(this.safe(a.actor, a.actor)) - Number(this.safe(b.actor, b.actor)) ||
            a.points.length - b.points.length || a.actor.key.localeCompare(b.actor.key));
        const assigned = new Map<Agent, Point2>();
        let attempts = 0;
        const place = (index: number): boolean => {
            if (index === options.length) return true;
            const { actor, points } = options[index];
            for (const point of points) {
                if (attempts >= 12000) return false;
                attempts++;
                if ([...assigned].some(([other, p]) =>
                    Math.hypot(p.x - point.x, p.z - point.z) < this.radius(actor) + this.radius(other))) continue;
                assigned.set(actor, point);
                if (place(index + 1)) return true;
                assigned.delete(actor);
            }
            return false;
        };
        const success = place(0);
        this.metrics.yardRepackNodes += attempts;
        if (!success) {
            this.metrics.yardRepackFailures++;
            return false;
        }
        // Copy coordinates before applying them: an unchanged option may be the live agent itself.
        const poses = [...assigned].map(([actor, point]) => ({ actor, x: point.x, z: point.z }));
        for (const { actor, x, z } of poses) {
            if (actor.x !== x || actor.z !== z) {
                this.social.remove(actor.key);
                actor.x = x;
                actor.z = z;
                actor.path = [];
                actor.detour = [];
                actor.state = 'Idle';
                actor.speed = 0;
            }
            actor.y = this.height(actor);
        }
        return true;
    }
    private radius(a: Agent) {
        return a.kind === 'persona' ? residentMovementConfig.radius : a.entity.status.stage === 'Young' ? .5 : a.entity.status.stage === 'Young Adult' ? .7 : .9;
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
        if (a.kind === 'persona' && Math.hypot(p.x - a.anchor.x, p.z - a.anchor.z) > 75)
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
            // Use the conservative house rectangle until actual source walls/fences are bound.
            // The authored footprint is irregular and contains usable alcoves within that proxy.
            if (!this.yardSurfaces.has(a.key) &&
                Math.abs(p.x - farm.x) < 2.8 && Math.abs(p.z - farm.z) < 2.8)
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
        const nearby = this.natureCells.get(Math.floor(p.x / 8) + ',' + Math.floor(p.z / 8));
        return !nearby?.some(n => Math.hypot(p.x - n.x, p.z - n.z) < Math.max(.5, n.clearance) + .35);
    }
    private segment(a: Agent, from: Point2, to: Point2) {
        const steps = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.z - from.z) / .2));
        for (let i = 1; i <= steps; i++)
            if (!this.safe(a, { x: from.x + (to.x - from.x) * i / steps, z: from.z + (to.z - from.z) * i / steps }))
                return false;
        return true;
    }
    private route(a: Agent, goal?: Point2) {
        this.metrics.routeAttempts++;
        const measured = (nodes: number, path: Point2[]) => {
            this.metrics.routeNodes += nodes;
            this.metrics.maxRouteNodes = Math.max(this.metrics.maxRouteNodes, nodes);
            if (!path.length) this.metrics.rejectedRoutes++;
            return path;
        };
        // A bounded four-neighbour waypoint search works for tents as well as permanent paths.
        const spacing = a.entity.status.grazingZone === 'yard' ? .25 : 1;
        const nodes: Point2[] = [{ x: a.x, z: a.z }], parents = [-1], seen = new Set(['0,0']);
        const open = [0], depth = [0];
        const maximumNodes = goal ? 2000 : 500;
        while (open.length && nodes.length < maximumNodes) {
            if (goal) open.sort((left, right) =>
                depth[left] + Math.hypot(nodes[left].x - goal.x, nodes[left].z - goal.z) -
                depth[right] - Math.hypot(nodes[right].x - goal.x, nodes[right].z - goal.z));
            const i = open.shift()!, from = nodes[i];
            if (goal && Math.hypot(from.x - goal.x, from.z - goal.z) <= .75 &&
                this.segment(a, from, goal) && this.bodyClearance(a, goal, from)) {
                const path: Point2[] = [goal];
                let end = i;
                while (end > 0) { path.unshift(nodes[end]); end = parents[end]; }
                return measured(nodes.length, path);
            }
            for (const [dx, dz] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
                const to = { x: from.x + dx * spacing, z: from.z + dz * spacing };
                const key = Math.round((to.x - a.x) / spacing) + ',' + Math.round((to.z - a.z) / spacing);
                if (seen.has(key))
                    continue;
                seen.add(key);
                if (Math.hypot(to.x - a.x, to.z - a.z) > (a.kind === 'persona' ? (goal ? 75 : 14) : 5))
                    continue;
                if (!goal && a.kind === 'persona' &&
                    Math.hypot(to.x - a.anchor.x, to.z - a.anchor.z) > 28) continue;
                if (!this.segment(a, from, to) || goal && !this.bodyClearance(a, to, from))
                    continue;
                parents.push(i);
                depth.push(depth[i] + spacing);
                open.push(nodes.length);
                nodes.push(to);
            }
        }
        if (goal || nodes.length < 2) return measured(nodes.length, []);
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
        return measured(nodes.length, path);
    }
    advance(seconds: number, running: boolean, visible: boolean) {
        if (!running || !visible || !Number.isFinite(seconds) || seconds <= 0)
            return;
        const started = performance.now();
        const elapsed = Math.min(seconds, 1), steps = Math.ceil(elapsed / .1);
        for (let i = 0; i < steps; i++)
            this.step(elapsed / steps);
        const cost = performance.now() - started;
        this.metrics.updates++;
        this.metrics.lastUpdateMs = cost;
        this.metrics.maxUpdateMs = Math.max(this.metrics.maxUpdateMs, cost);
        this.metrics.totalUpdateMs += cost;
    }
    private encounterActor(a: Agent) {
        const next = a.detour[0] ?? a.path[0];
        const distance = next ? Math.hypot(next.x - a.x, next.z - a.z) : 0;
        return { key: a.key, x: a.x, z: a.z, radius: this.radius(a),
            velocity: distance > .15 ? { x: (next.x - a.x) / distance * a.pace,
                z: (next.z - a.z) / distance * a.pace } : { x: 0, z: 0 },
            enabled: a.kind === 'persona' && a.socialEnabled, busy: a.visit?.phase === 'activity' };
    }
    private bodyClearance(a: Agent, point: Point2, from: Point2 = a) {
        const dx = point.x - from.x, dz = point.z - from.z;
        const lengthSquared = dx * dx + dz * dz;
        for (const other of this.agents.values()) {
            if (other === a) continue;
            const fraction = lengthSquared ? Math.max(0, Math.min(1,
                ((other.x - from.x) * dx + (other.z - from.z) * dz) / lengthSquared)) : 0;
            const closest = Math.hypot(from.x + dx * fraction - other.x,
                from.z + dz * fraction - other.z);
            if (closest < this.radius(a) + this.radius(other) - 1e-7) return false;
        }
        return true;
    }
    private planPassing(a: Agent) {
        if (a.kind !== 'persona' || a.detour.length || !a.path.length) return;
        const clearRoute = (points: Point2[]) => {
            let from: Point2 = a;
            for (const point of points) {
                if (!this.segment(a, from, point)) return false;
                from = point;
            }
            return true;
        };
        const pairs = this.social.activePairs().map(pair => ({
            a: this.agents.get(pair.a)!, b: this.agents.get(pair.b)!,
            clearance: this.radius(this.agents.get(pair.a)!) + this.radius(this.agents.get(pair.b)!),
        }));
        a.detour = passConversation(a, a.path[0], pairs, residentMovementConfig, clearRoute) ??
            passNeighbours(a, a.path[0], [...this.agents.values()].filter(other => other !== a).map(other => ({
                x: other.x, z: other.z, radius: this.radius(other),
                encounterEligible: this.social.eligible(this.encounterActor(a)) &&
                    this.social.eligible(this.encounterActor(other)) && !this.social.blocked(a.key, other.key) &&
                    this.social.approaching(this.encounterActor(a), this.encounterActor(other)),
            })), residentMovementConfig, clearRoute,
                point => this.bodyClearance(a, point)) ?? [];
    }
    private cattleEncounters() {
        const people = [...this.agents.values()].filter(a => a.kind === 'persona' && a.socialEnabled && a.visit?.phase !== 'activity');
        for (const cow of this.agents.values()) {
            if (cow.kind !== 'cattle' || !cow.interactionSeconds || !this.social.available(cow.key)) continue;
            const reference = cattleVariants[cow.entity.asset as keyof typeof cattleVariants];
            if (!reference) continue;
            const nearby = people.filter(person => this.social.available(person.key))
                .sort((a, b) => Math.hypot(a.x - cow.x, a.z - cow.z) - Math.hypot(b.x - cow.x, b.z - cow.z) ||
                    a.key.localeCompare(b.key));
            for (const person of nearby) {
                const distance = Math.hypot(cow.x - person.x, cow.z - person.z);
                const clearance = this.radius(cow) + this.radius(person);
                // Preview spacing is retained, with only the stage-body clearance required by the world.
                const reach = Math.max(reference.humanDistance, clearance + .1);
                if (distance < clearance || distance > reach + .2 ||
                    !this.segment(cow, cow, person) || !this.segment(person, person, cow)) continue;
                if (this.social.reserve(cow.key, person.key, cow.interactionSeconds, 'cattleHuman')) break;
            }
        }
    }
    private step(dt: number) {
        const actors = [...this.agents.values()];
        this.social.advance(dt, actors.map(a => this.encounterActor(a)), (first, second) => {
            const a = this.agents.get(first.key)!, b = this.agents.get(second.key)!;
            return this.segment(a, a, b) && this.segment(b, b, a);
        });
        this.cattleEncounters();
        this.clearReleasedPoses();
        for (const a of this.agents.values()) {
            const encounter = this.social.inspect(a.key);
            if (encounter.partnerKey !== null) {
                const partner = this.agents.get(encounter.partnerKey)!;
                a.rotation = turnToward(a.rotation, Math.atan2(partner.x - a.x, partner.z - a.z),
                    dt, residentMovementConfig.turnSpeed);
                a.speed = 0;
                a.state = encounter.kind === 'cattleHuman' && a.kind === 'cattle' ? 'HumanInteraction' :
                    encounter.state === 'talking' ? 'Talk' : 'Listen';
                continue;
            }
            if (a.visit) {
                const visit = a.visit;
                if (visit.phase !== 'activity') {
                    visit.travelRemaining! -= dt;
                    this.refreshStalledVisit(a, dt);
                    if (visit.travelRemaining! <= 0) {
                        this.cancelVisit(a);
                        continue;
                    }
                }
                if (visit.phase === 'activity') {
                    a.speed = 0;
                    a.rotation = turnToward(a.rotation, Math.atan2(visit.face.x - a.x,
                        visit.face.z - a.z), dt, residentMovementConfig.turnSpeed);
                    a.state = visit.clip;
                    visit.remaining -= dt;
                    if (visit.remaining > 0) continue;
                    visit.phase = 'home';
                    a.path = this.route(a, a.anchor);
                    visit.travelRemaining = this.visitBudget(a, a.path);
                    visit.checkpoint = { x: a.x, z: a.z };
                    visit.checkpointSeconds = 0;
                    a.detour = [];
                    a.state = 'Idle';
                } else if (!a.path.length && !a.detour.length) {
                    if (visit.phase === 'approach' && Math.hypot(a.x - visit.target.x,
                        a.z - visit.target.z) < .15) {
                        a.speed = 0;
                        const heading = Math.atan2(visit.face.x - a.x, visit.face.z - a.z);
                        a.rotation = turnToward(a.rotation, heading, dt, residentMovementConfig.turnSpeed);
                        a.state = 'Idle';
                        if (Math.cos(heading - a.rotation) > .99) visit.phase = 'activity';
                        continue;
                    }
                    a.visit = null;
                    a.visitDelay = 20 + this.random(a) * 25;
                }
            } else if (a.kind === 'persona') {
                a.visitDelay -= dt;
                if (Math.hypot(a.x - a.anchor.x, a.z - a.anchor.z) > 28 && !a.path.length)
                    a.path = this.route(a, a.anchor);
                // A due work visit may replace an ordinary wander. Encounter owners have already
                // continued above, so their retained destinations are never replaced mid-pair.
                if (a.visitDelay <= 0) this.beginVisit(a);
            }
            if (a.state === 'Graze') {
                a.grazeRemaining -= dt;
                a.speed = 0;
                if (a.grazeRemaining > 1e-8) continue;
                a.state = 'Idle';
                a.wait = 0;
            }
            this.planPassing(a);
            if (a.detour.length && Math.hypot(a.detour[0].x - a.x, a.detour[0].z - a.z) < .15) a.detour.shift();
            if (!a.path.length && !a.detour.length) {
                a.speed = 0;
                a.state = 'Idle';
                a.wait -= dt;
                if (a.wait <= 0) {
                    if (a.kind === 'cattle' && a.grazeNext && a.grazeSeconds > 0) {
                        a.state = 'Graze';
                        a.grazeRemaining = a.grazeSeconds;
                        a.grazeNext = false;
                        continue;
                    }
                    a.path = this.route(a);
                    a.grazeNext = true;
                    a.wait = 3 + this.random(a) * 5;
                }
                continue;
            }
            const target = a.detour[0] ?? a.path[0], dx = target.x - a.x, dz = target.z - a.z, distance = Math.hypot(dx, dz);
            if (distance < 1e-7) {
                if (a.detour.length) a.detour.shift();
                else a.path.shift();
                a.speed = 0;
                continue;
            }
            const heading = Math.atan2(dx, dz);
            if (a.kind === 'persona') {
                a.rotation = turnToward(a.rotation, heading, dt, residentMovementConfig.turnSpeed);
                if (Math.cos(heading - a.rotation) < residentMovementConfig.walkAlignment) {
                    a.speed = 0;
                    a.state = 'Idle';
                    continue;
                }
            }
            a.speed = Math.min(a.pace, a.speed + dt * a.pace * 2, Math.sqrt(2 * a.pace * Math.max(.01, distance)));
            const step = Math.min(distance, a.speed * dt), p = { x: a.x + dx / distance * step, z: a.z + dz / distance * step };
            if (!this.segment(a, a, p)) {
                // A passing detour may finish across a parcel from the old waypoint.
                // Reconnect to the valid trip goal through the same terrain authority.
                const goal = a.visit ? a.visit.phase === 'home' ? a.anchor : a.visit.target :
                    a.path[a.path.length - 1];
                a.path = goal && this.safe(a, goal) ? this.route(a, goal) : [];
                a.detour = [];
                a.speed = 0;
                a.state = 'Idle';
                a.wait = 1 + this.random(a) * 2;
                continue;
            }
            if (!this.bodyClearance(a, p)) {
                if (a.kind === 'cattle') {
                    // Herd mates can obstruct a narrow wander indefinitely. Stay on
                    // the safe current support and take the next grazing/rest turn.
                    a.blockedSeconds += dt;
                    if (a.blockedSeconds >= 3) {
                        a.path = [];
                        a.wait = 0;
                        a.grazeNext = true;
                        a.blockedSeconds = 0;
                    }
                }
                // A temporary neighbour cannot discard a resident's retained destination.
                // Re-plan a passing detour if another actor enters its previously clear route.
                a.detour = [];
                a.speed = 0;
                a.state = 'Idle';
                continue;
            }
            a.blockedSeconds = 0;
            if (a.kind !== 'persona') {
                const angle = Math.atan2(Math.sin(heading - a.rotation), Math.cos(heading - a.rotation));
                a.rotation += angle * Math.min(1, dt * 8);
            }
            a.x = p.x;
            a.z = p.z;
            a.y = this.height(a);
            a.state = 'Walk';
            if (distance <= step + 1e-7) {
                if (a.detour.length) a.detour.shift();
                else a.path.shift();
            }
        }
    }
    /** Read-only counters sampled by QA; timing never affects navigation or random choices. */
    inspectMetrics() {
        const actors = [...this.agents.values()];
        let bodyOverlaps = 0;
        for (let i = 0; i < actors.length; i++) for (let j = i + 1; j < actors.length; j++) {
            if (Math.hypot(actors[i].x - actors[j].x, actors[i].z - actors[j].z) <
                this.radius(actors[i]) + this.radius(actors[j]) - 1e-6) bodyOverlaps++;
        }
        return { ...this.metrics, agents: actors.length,
            reservations: this.social.activePairs().length,
            occupationVisits: actors.filter(a => a.visit).length,
            outOfZone: actors.filter(a => !this.safe(a, a)).length, bodyOverlaps };
    }
    inspect() {
        return [...this.agents.values()].map(a => ({ key: a.key, kind: a.kind, x: a.x, y: a.y, z: a.z,
            rotation: a.rotation, state: a.state, speed: a.speed,
            visit: a.visit ? structuredClone(a.visit) : null,
            destination: a.path.length ? { ...a.path[a.path.length - 1] } : null,
            activity: this.social.inspect(a.key).kind,
            partnerKey: this.social.inspect(a.key).partnerKey,
            cooldown: this.social.inspect(a.key).cooldown, walkable: this.safe(a, a) }));
    }
}
