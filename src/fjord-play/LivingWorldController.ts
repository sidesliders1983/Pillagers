import { WaypointQueue } from './WaypointQueue';
import { livestockPresentation } from '../characters/LivestockPresentation';
import { passConversation, passNeighbours } from '../systems/ResidentPassing';
import { SocialEncounters, residentMovementConfig, turnToward } from '../systems/SocialEncounters';
import { settlementCampfire, type SettlementCampfire } from './SettlementCampfire';
import type { FjordEntity } from './FjordProjection';
import type { FjordGround } from './FjordGround';
import type { Point2, WorldBlueprint } from '../world-generation/WorldBlueprint';
import { createBlueprintSurface } from '../world-generation/TerrainQueries';
export type RouteObservation = { agent: string; kind: string; purpose: string; target: string;
    goal: Point2 | null; from: Point2; reason: string; nodes: number; accepted: boolean;
    navigationGeneration: number; reservationGeneration: number; occupancy: string;
    step: number; activeSeconds: number };

const maximumGatheringTrail = 512;
const maximumSuspendedWaypoints = 4096;
type SuspendedIntent = Pick<Agent, 'signature' | 'visit' | 'path' | 'detour' | 'homeTrail' | 'wait' | 'visitDelay'> & {
    occupation: FjordEntity['status']['occupation'];
    workEligible: FjordEntity['status']['workEligible'];
    workHomeId: FjordEntity['status']['workHomeId'];
};
type GatheringParticipant = {
    key: string; target: Point2 | null; arrived: boolean; dropped: boolean;
    origin: Point2 | null; signature: string; trail: Point2[] | null; suspended: SuspendedIntent | null;
    facing?: Point2;
    repair?: { checkpoint: Point2; seconds: number; remaining: number };
};
type GatheringReturn = {
    origin: Point2; signature: string; remaining: number; suspended: SuspendedIntent | null;
};
export interface GatheringInspection {
    eventId: string;
    participants: { key: string; arrived: boolean; dropped: boolean }[];
}

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
    state: 'Idle' | 'Walk' | 'Run' | 'Talk' | 'Listen' | 'Graze' | 'Rest' | 'HumanInteraction' | OccupationClip;
    visit: Visit | null;
    visitDelay: number;
    occupationClips: Partial<Record<OccupationClip, number>>;
    interactionSeconds: number;
    grazeSeconds: number;
    grazeRemaining: number;
    grazeNext: boolean;
    restNext: boolean;
    restSeconds: number;
    restRemaining: number;
    blockedSeconds: number;
    socialEnabled: boolean;
    speed: number;
    anchor: Point2;
    entity: FjordEntity;
    random: number;
    wait: number;
    path: Point2[];
    homeTrail: Point2[];
    detour: Point2[];
    signature: string;
    pace: number;
    runPace: number | null;
    failedRoutes: Map<string, { context: string; expires: number; reason: string }>;
};
/** Ephemeral presentation only. Neither simulation state nor its random stream enters this controller. */
export class LivingWorldController {
    readonly diagnostics: string[] = [];
    private metrics = { routeAttempts: 0, rejectedRoutes: 0, targetAttempts: 0,
        rejectedTargets: 0, routeNodes: 0, maxRouteNodes: 0,
        updates: 0, lastUpdateMs: 0, maxUpdateMs: 0, totalUpdateMs: 0,
        yardRepackAttempts: 0, yardRepackNodes: 0, yardRepackFailures: 0,
        presentationSteps: 0, activeSeconds: 0, visitsStarted: 0, occupationArrivals: 0,
        activitiesCompleted: 0, homeArrivals: 0, visitsCancelled: 0, distanceWalked: 0, failedRouteReuse: 0, homeTrailReuse: 0 };
    private routeObserver?: (observation: RouteObservation) => void;
    private navigationGeneration = 0;
    private navigationSignature = '';
    private treeSignature = '';
    private yardVersions = new Map<string, unknown>();
    private reservationGeneration = 0;
    private reservationSignature = '';
    /** Optional bounded QA consumer; no route rows are allocated during ordinary play. */
    setRouteObserver(observer?: (observation: RouteObservation) => void) {
        this.routeObserver = observer;
    }
    private gathering?: { eventId: string; participants: Map<string, GatheringParticipant> };
    private gatheringReturns = new Map<string, GatheringReturn>();
    private agents = new Map<string, Agent>();
    private social = new SocialEncounters();
    private surface;
    private campfire;
    private yardSurfaces = new Map<string, (x: number, z: number) => number | null>();
    private trees: { key: string; x: number; z: number; clearance: number }[] = [];
    private parcels: FjordEntity[] = [];
    private nature: WorldBlueprint['placementPlan'] = [];
    private natureCells = new Map<string, Array<WorldBlueprint['placementPlan'][number]>>();
    private ground: FjordGround = { plots: [], paths: [] };
    constructor(private world: WorldBlueprint, private mapped?: (x: number, z: number) => boolean,
        campfire: SettlementCampfire = settlementCampfire(world)) {
        this.surface = createBlueprintSurface(world);
        this.campfire = campfire;
    }
    /** Choose one coherent arrangement using the existing known-ground and body-clearance authorities.
     * This bounded check does not route or move anybody; failed routes still use ordinary fallback. */
    chooseGatheringLayout(layouts: readonly Readonly<Record<string, { target: Point2 }>>[]) {
        let best = 0, bestScore = -1;
        for (const [index, layout] of layouts.slice(0, 8).entries()) {
            let score = 0;
            for (const [order, [key, slot]] of Object.entries(layout).slice(0, 8).entries()) {
                const actor = this.agents.get(key);
                if (actor && this.safe(actor, slot.target) && this.bodyClearance(actor, slot.target, slot.target))
                    score += (order < 2 ? 100 : order === 2 ? 10 : 1) -
                        Math.hypot(actor.x - slot.target.x, actor.z - slot.target.z) * .001;
            }
            if (score > bestScore) { best = index; bestScore = score; }
        }
        return best;
    }
    /** Fresh accepted events alone stage bounded visual participants; canonical attendance is untouched. */
    beginGathering(eventId: string, participantKeys: readonly string[], maximumActors: 6 | 8 = 6,
        preferred: Readonly<Record<string, { target: Point2; facing: Point2 }>> = {}) {
        if (!eventId.trim()) return [];
        if (this.gathering?.eventId === eventId)
            return [...this.gathering.participants.values()].filter(person => !person.dropped).map(person => person.key);
        this.releaseGathering();
        const participants = new Map<string, GatheringParticipant>();
        this.gathering = { eventId, participants };
        const center = this.campfire.transform;
        let seed = 0;
        for (const letter of eventId) seed = Math.imul(seed ^ letter.charCodeAt(0), 16777619) >>> 0;
        const phase = seed % 360 * Math.PI / 180;
        const candidates: Point2[] = [];
        for (const radius of [5.5, 6.25, 7]) for (let direction = 0; direction < 8; direction++) {
            const angle = phase + direction * Math.PI / 4;
            candidates.push({ x: center.x + Math.cos(angle) * radius,
                z: center.z + Math.sin(angle) * radius });
        }
        const selectedKeys: string[] = [];
        for (const key of participantKeys) {
            if (selectedKeys.includes(key)) continue;
            selectedKeys.push(key);
            if (selectedKeys.length >= (maximumActors === 8 ? 8 : 6)) break;
        }
        for (const key of selectedKeys) {
            const person: GatheringParticipant = { key, target: null, arrived: false, dropped: true,
                origin: null, signature: '', trail: null, suspended: null };
            participants.set(key, person);
            const actor = this.agents.get(key);
            if (!actor || actor.kind !== 'persona' || actor.entity.status.indoorReason ||
                actor.entity.status.expedition || actor.entity.status.living === false) continue;
            person.origin = { x: actor.x, z: actor.z };
            person.signature = actor.signature;
            // A replaced return is cancelled, not nested into an unbounded stack of old intentions.
            if (!this.gatheringReturns.delete(key)) person.suspended = this.suspendIntent(actor);
            this.social.remove(key);
            this.cancelVisit(actor);
            const options = candidates.filter(point => this.safe(actor, point) &&
                [...participants.values()].every(other => !other.target ||
                    Math.hypot(other.target.x - point.x, other.target.z - point.z) >= 1.2))
                .sort((first, second) => Math.hypot(first.x - actor.x, first.z - actor.z) -
                    Math.hypot(second.x - actor.x, second.z - actor.z));
            const slot = preferred[key];
            if (slot && this.safe(actor, slot.target) && [...participants.values()].every(other =>
                !other.target || Math.hypot(other.target.x - slot.target.x, other.target.z - slot.target.z) >= 1.2)) {
                options.unshift(slot.target);
                person.facing = slot.facing;
                person.repair = { checkpoint: { x: actor.x, z: actor.z }, seconds: 5, remaining: 2 };
            }
            // Initial searches stay bounded; preferred slots alone allow two delayed stalled-route repairs.
            for (const target of options.slice(0, slot ? 5 : 4)) {
                let path = this.route(actor, target, 'cultural-gathering', eventId);
                if (!path.length && slot && target === slot.target)
                    path = this.route(actor, target, 'cultural-gathering', eventId, true);
                if (!path.length) continue;
                person.target = target;
                person.dropped = false;
                person.trail = [{ ...person.origin }];
                actor.path = path;
                break;
            }
            if (person.dropped) {
                this.resumeIntent(actor, person.suspended);
                person.suspended = null;
            }
        }
        return [...participants.values()].filter(person => !person.dropped).map(person => person.key);
    }
    inspectGathering(): GatheringInspection | null {
        if (!this.gathering) return null;
        return { eventId: this.gathering.eventId,
            participants: [...this.gathering.participants.values()].map(({ key, arrived, dropped }) =>
                ({ key, arrived, dropped })) };
    }
    releaseGathering() {
        if (!this.gathering) return;
        for (const person of this.gathering.participants.values()) {
            const actor = this.agents.get(person.key);
            if (actor && person.trail) this.beginGatheringReturn(actor, person);
            else if (actor && !person.dropped && !this.gatheringReturns.has(actor.key)) this.cancelVisit(actor);
        }
        this.gathering = undefined;
    }
    private ownsGathering(key: string) {
        const person = this.gathering?.participants.get(key);
        return Boolean(person && !person.dropped) || this.gatheringReturns.has(key);
    }
    private suspendIntent(actor: Agent): SuspendedIntent | null {
        if (actor.path.length + actor.detour.length + actor.homeTrail.length > maximumSuspendedWaypoints)
            return null;
        // cancelVisit replaces these arrays. Retain the finite original corridor, not another copy.
        return { signature: actor.signature, visit: actor.visit, path: actor.path, detour: actor.detour,
            homeTrail: actor.homeTrail, wait: actor.wait, visitDelay: actor.visitDelay,
            occupation: actor.entity.status.occupation, workEligible: actor.entity.status.workEligible,
            workHomeId: actor.entity.status.workHomeId };
    }
    private resumeIntent(actor: Agent, intent: SuspendedIntent | null) {
        if (!intent || intent.signature !== actor.signature ||
            intent.occupation !== actor.entity.status.occupation ||
            intent.workEligible !== actor.entity.status.workEligible ||
            intent.workHomeId !== actor.entity.status.workHomeId) return;
        const visit = intent.visit;
        if (visit) {
            if (!actor.entity.status.workEligible || visit.clip !== 'Idle' && !actor.occupationClips[visit.clip]) return;
            if (intent.occupation === 'woodworker' || intent.occupation === 'hunter') {
                if (!this.trees.some(tree => tree.key === visit.source)) return;
            } else if (intent.occupation === 'farmer') {
                if (!this.parcels.some(parcel => parcel.selectionKey === visit.source && parcel.status.farmyard)) return;
            } else if (intent.occupation === 'fisher') {
                const index = Number(visit.source.slice('shore:'.length));
                if (!visit.source.startsWith('shore:') || !Number.isInteger(index) || !this.world.coast[index]) return;
            }
            if (!this.safe(actor, visit.phase === 'home' ? actor.anchor : visit.target)) return;
        }
        let from: Point2 = actor;
        for (const point of [...intent.detour, ...intent.path]) {
            if (!this.segment(actor, from, point)) return;
            from = point;
        }
        actor.visit = visit;
        actor.path = intent.path;
        actor.detour = intent.detour;
        actor.homeTrail = intent.homeTrail;
        actor.wait = intent.wait;
        actor.visitDelay = intent.visitDelay;
    }
    private recordGatheringTrail(actor: Agent, force = false) {
        const person = this.gathering?.participants.get(actor.key);
        if (!person?.trail || person.dropped) return;
        const last = person.trail[person.trail.length - 1];
        const distance = Math.hypot(actor.x - last.x, actor.z - last.z);
        if (distance < .75 && (!force || distance < 1e-7)) return;
        if (person.trail.length >= maximumGatheringTrail) {
            // Never truncate a corridor and imply the missing segment was actually traversed.
            person.trail = null;
            person.suspended = null;
            return;
        }
        person.trail.push({ x: actor.x, z: actor.z });
    }
    private beginGatheringReturn(actor: Agent, person: GatheringParticipant) {
        if (this.gatheringReturns.has(actor.key) || !person.origin || !person.trail) return;
        const path = this.retainedTrailPath(actor, person.trail, person.origin, true);
        const suspended = person.suspended;
        person.trail = null;
        person.suspended = null;
        this.cancelVisit(actor);
        if (actor.signature !== person.signature || actor.entity.status.indoorReason ||
            actor.entity.status.expedition || actor.entity.status.living === false || !path) return;
        this.gatheringReturns.set(actor.key, { origin: person.origin, signature: actor.signature,
            suspended, remaining: this.visitBudget(actor, path) });
        actor.path = path;
    }
    reconcile(entities: readonly FjordEntity[], ground: FjordGround) {
        const navigationSignature = JSON.stringify([entities.map(entity => [entity.selectionKey,
            entity.asset, entity.transform, entity.plot, entity.status]), ground]);
        if (navigationSignature !== this.navigationSignature) {
            this.navigationSignature = navigationSignature;
            this.navigationGeneration++;
        }
        this.parcels = entities.filter(e => e.plot);
        this.ground = ground;
        const active = entities.filter(e => e.transform && !e.status.expedition && (e.kind === 'persona' || e.kind === 'cattle'));
        // These are the same plot/anchor/path clearances applied by the scene's nature reconciler.
        const cleared = [{ ...this.campfire.transform, halfWidth: this.campfire.clearingRadius,
            halfDepth: this.campfire.clearingRadius }, ...this.parcels.map(e => e.plot!), ...active.map(e => ({ ...e.transform!, halfWidth: 1, halfDepth: 1 })),
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
                this.yardVersions.delete(key);
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
                    wait: 1 + seed % 40 / 10, path: [], homeTrail: [], detour: [], signature,
                    visit: null, visitDelay: 8 + seed % 130 / 10, occupationClips: {},
                    state: 'Idle', interactionSeconds: 0, grazeSeconds: 0,
                    grazeRemaining: 0, grazeNext: true, restNext: false, restSeconds: 0, restRemaining: 0, blockedSeconds: 0,
                    failedRoutes: new Map(), socialEnabled: true, speed: 0, pace: entity.kind === 'persona' ? .8 : .28,
                    runPace: null,
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
        for (const person of this.gathering?.participants.values() ?? []) {
            const actor = this.agents.get(person.key);
            if (!actor || actor.entity.status.indoorReason || actor.entity.status.expedition ||
                actor.entity.status.living === false) {
                person.dropped = true;
                person.arrived = false;
                if (actor) this.cancelVisit(actor);
            }
        }
        for (const [key, returning] of this.gatheringReturns) {
            const actor = this.agents.get(key);
            if (!actor || actor.signature !== returning.signature || actor.entity.status.indoorReason ||
                actor.entity.status.expedition || actor.entity.status.living === false) {
                this.gatheringReturns.delete(key);
                if (actor) this.cancelVisit(actor);
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
        if (a.visit) this.metrics.visitsCancelled++;
        a.homeTrail = [];
        a.visit = null;
        a.path = [];
        a.detour = [];
        if (this.social.inspect(a.key).partnerKey === null) a.state = 'Idle';
        a.speed = 0;
        a.visitDelay = 20;
    }
    setStandingTrees(trees: readonly { key: string; x: number; z: number; clearance: number }[]) {
        const signature = JSON.stringify(trees);
        if (signature !== this.treeSignature) {
            this.treeSignature = signature;
            this.navigationGeneration++;
        }
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
            const path = this.route(a, visit.target, 'occupation', visit.source);
            if (!path.length) {
                this.metrics.rejectedTargets++;
                continue;
            }
            visit.travelRemaining = this.visitBudget(a, path);
            visit.checkpoint = { x: a.x, z: a.z };
            visit.checkpointSeconds = 0;
            this.metrics.visitsStarted++;
            a.homeTrail = [{ x: a.x, z: a.z }, ...path.map(point => ({ ...point }))];
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
    setActivityClips(key: string, clips: { Graze?: number; Rest?: number; HumanInteraction?: number }) {
        const actor = this.agents.get(key);
        if (!actor) return;
        if (clips.Graze !== undefined && (!Number.isFinite(clips.Graze) || clips.Graze <= 0))
            throw new Error('Invalid grazing clip duration');
        if (clips.HumanInteraction !== undefined &&
            (!Number.isFinite(clips.HumanInteraction) || clips.HumanInteraction <= 0))
            throw new Error('Invalid cattle interaction clip duration');
        if (clips.Rest !== undefined && (!Number.isFinite(clips.Rest) || clips.Rest <= 0))
            throw new Error('Invalid livestock rest clip duration');
        actor.restSeconds = clips.Rest ?? 0;
        if (!actor.restSeconds && actor.state === 'Rest') {
            actor.state = 'Idle';
            actor.restRemaining = 0;
        }
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
    setYardSurface(key: string, sample: (x: number, z: number) => number | null, version: unknown = sample) {
        if (this.yardVersions.get(key) !== version) {
            this.yardVersions.set(key, version);
            this.navigationGeneration++;
        }
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
        return a.kind === 'persona' ? residentMovementConfig.radius : livestockPresentation(a.entity.asset)?.radius ?? .9;
    }
    private height(a: Agent) { return this.yardSurfaces.get(a.key)?.(a.x, a.z) ?? this.surface.surfaceHeightAt(a.x, a.z); }
    /** Optional native Run pace is used only by an active ceremony approach. */
    setPace(key: string, pace: number, runPace?: number) {
        const a = this.agents.get(key);
        if (a && Number.isFinite(pace) && pace > 0) {
            a.pace = pace;
            a.runPace = runPace !== undefined && Number.isFinite(runPace) && runPace > 0 ? runPace : null;
        }
    }
    private runningApproach(a: Agent) {
        const participant = this.gathering?.participants.get(a.key);
        return a.runPace !== null && Boolean(participant && !participant.dropped && !participant.arrived);
    }
    private random(a: Agent) {
        a.random ^= a.random << 13;
        a.random ^= a.random >>> 17;
        a.random ^= a.random << 5;
        return (a.random >>> 0) / 4294967296;
    }
    private safe(a: Agent, p: Point2) {
        if (this.mapped && !this.mapped(p.x, p.z)) return false;
        if (Math.hypot(p.x - this.campfire.transform.x, p.z - this.campfire.transform.z) <=
            this.campfire.obstacleRadius + this.radius(a)) return false;
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
    /** A successful outbound trip is already a bounded proof of the static corridor.
     * Revalidate it against today's terrain/parcels/source obstacles before returning.
     * Traffic remains owned by the normal per-step body checks and passing controller. */
    private homeTrailPath(a: Agent) { return this.retainedTrailPath(a, a.homeTrail, a.anchor); }
    private retainedTrailPath(a: Agent, trail: readonly Point2[], destination: Point2, compact = false) {
        if (!trail.length) return null;
        let nearest = 0;
        for (let i = 1; i < trail.length; i++)
            if (Math.hypot(a.x - trail[i].x, a.z - trail[i].z) <
                Math.hypot(a.x - trail[nearest].x, a.z - trail[nearest].z)) nearest = i;
        if (Math.hypot(a.x - trail[nearest].x, a.z - trail[nearest].z) > 1) return null;
        const path = trail.slice(0, nearest + 1).reverse().map(point => ({ ...point }));
        path.push({ ...destination });
        let from: Point2 = a;
        for (const point of path) {
            if (!this.segment(a, from, point)) return null;
            from = point;
        }
        while (path.length > 1 && Math.hypot(path[0].x - a.x, path[0].z - a.z) < .15) path.shift();
        if (!compact) return path;
        // Historical passing bends need not be replayed around bodies that have since moved.
        // Only nearby retained points may be joined, through the same current segment authority.
        const corridor: Point2[] = [];
        let index = 0;
        from = a;
        while (index < path.length) {
            let next = Math.min(index + 7, path.length - 1);
            while (next > index && !this.segment(a, from, path[next])) next--;
            corridor.push(path[next]);
            from = path[next];
            index = next + 1;
        }
        return corridor;
    }
    private clearsSegment(point: Point2, from: Point2, to: Point2, clearance: number) {
        const dx = to.x - from.x, dz = to.z - from.z;
        const lengthSquared = dx * dx + dz * dz;
        const fraction = lengthSquared ? Math.max(0, Math.min(1,
            ((point.x - from.x) * dx + (point.z - from.z) * dz) / lengthSquared)) : 0;
        return Math.hypot(from.x + dx * fraction - point.x,
            from.z + dz * fraction - point.z) >= clearance;
    }
    /** Bounded corridor compaction through the same terrain/body segment authorities as routing.
     * This is the existing retained-trail shortcut pattern, applied once to a wedding approach. */
    private compactGatheringRoute(actor: Agent, path: Point2[]) {
        if (!this.gathering?.participants.get(actor.key)?.repair || path.length < 3) return path;
        const compact: Point2[] = [];
        let index = 0;
        let previous: Point2 = actor;
        while (index < path.length) {
            let next = Math.min(index + 7, path.length - 1);
            while (next > index && (!this.segment(actor, previous, path[next]) ||
                !this.bodyClearance(actor, path[next], previous))) next--;
            compact.push(path[next]);
            previous = path[next];
            index = next + 1;
        }
        return compact;
    }
    private route(a: Agent, goal?: Point2, purpose = goal ?
        (goal === a.anchor ? 'return-home' : a.visit?.phase === 'home' ? 'visit-home' : 'visit-approach') : 'wander',
        target = goal === a.anchor ? String(a.entity.status.assignment ?? a.key) : a.visit?.source ?? '', fineSearch = false) {
        this.metrics.routeAttempts++;
        const key = goal ? JSON.stringify([purpose, target, goal.x, goal.z, fineSearch]) : '';
        // Moving endpoint blockers invalidate immediately. Other transient traffic is retried
        // within one active second; canonical/static obstacles and reservations invalidate now.
        const context = goal ? JSON.stringify([a.x, a.z, this.navigationGeneration,
            this.reservationGeneration, [...this.agents.values()].filter(other => other !== a &&
                Math.hypot(other.x - goal.x, other.z - goal.z) < this.radius(a) + this.radius(other))
                .map(other => [other.key, other.x, other.z])]) : '';
        const failure = a.failedRoutes.get(key);
        const reused = Boolean(failure && failure.context === context &&
            failure.expires - this.metrics.activeSeconds > 1e-9);
        const measured = (nodes: number, path: Point2[]) => {
            this.metrics.routeNodes += nodes;
            this.metrics.maxRouteNodes = Math.max(this.metrics.maxRouteNodes, nodes);
            const reason = path.length ? 'accepted' : reused ? 'cached-' + failure!.reason :
                goal && !this.safe(a, goal) ? 'unsafe-goal' :
                goal && !this.bodyClearance(a, goal, goal) ? 'occupied-endpoint' :
                nodes >= (goal ? 2000 : 500) ? 'node-cap' : 'no-path';
            if (!path.length) {
                this.metrics.rejectedRoutes++;
                if (goal && !reused) {
                    if (a.failedRoutes.size >= 8 && !a.failedRoutes.has(key))
                        a.failedRoutes.delete(a.failedRoutes.keys().next().value!);
                    a.failedRoutes.set(key, { context, expires: this.metrics.activeSeconds + 1, reason });
                }
            } else if (goal) a.failedRoutes.delete(key);
            if (this.routeObserver) this.routeObserver({ agent: a.key, kind: a.kind, purpose, target,
                goal: goal ? { ...goal } : null, from: { x: a.x, z: a.z }, nodes, accepted: path.length > 0,
                reason,
                navigationGeneration: this.navigationGeneration, reservationGeneration: this.reservationGeneration,
                occupancy: [...this.agents.values()].filter(other => other !== a)
                    .map(other => [other.key, other.x, other.z].join(':')).join('|'),
                step: this.metrics.presentationSteps, activeSeconds: this.metrics.activeSeconds });
            return path;
        };
        if (goal === a.anchor) {
            const trail = this.homeTrailPath(a);
            if (trail) {
                this.metrics.homeTrailReuse++;
                return measured(0, trail);
            }
        }
        if (reused) {
            this.metrics.failedRouteReuse++;
            return measured(0, []);
        }
        // Every valid final segment must end at a safe, unoccupied point.
        if (goal && (!this.safe(a, goal) || !this.bodyClearance(a, goal, goal))) return measured(0, []);
        // A bounded four-neighbour waypoint search works for tents as well as permanent paths.
        const needsFine = fineSearch || (this.gathering?.participants.get(a.key)?.repair?.remaining ?? 2) < 2;
        const spacing = a.entity.status.grazingZone === 'yard' ? .25 : needsFine ? .5 : 1;
        const nodes: Point2[] = [{ x: a.x, z: a.z }], parents = [-1], seen = new Set(['0,0']);
        const open = [0], depth = [0], priority = new WaypointQueue();
        let cursor = 0;
        if (goal) priority.push(0, Math.hypot(a.x - goal.x, a.z - goal.z));
        const maximumNodes = goal ? 2000 : 500;
        while ((goal ? priority.length : cursor < open.length) && nodes.length < maximumNodes) {
            const i = goal ? priority.shift() : open[cursor++], from = nodes[i];
            if (goal && Math.hypot(from.x - goal.x, from.z - goal.z) <= .75 &&
                this.segment(a, from, goal) && this.bodyClearance(a, goal, from)) {
                const path: Point2[] = [goal];
                let end = i;
                while (end > 0) { path.unshift(nodes[end]); end = parents[end]; }
                return measured(nodes.length, this.compactGatheringRoute(a, path));
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
                if (goal) priority.push(nodes.length, depth[depth.length - 1] + Math.hypot(to.x - goal.x, to.z - goal.z));
                else open.push(nodes.length);
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
        const pace = this.runningApproach(a) ? a.runPace! : a.pace;
        return { key: a.key, x: a.x, z: a.z, radius: this.radius(a),
            velocity: distance > .15 ? { x: (next.x - a.x) / distance * pace,
                z: (next.z - a.z) / distance * pace } : { x: 0, z: 0 },
            enabled: a.kind === 'persona' && a.socialEnabled && !this.ownsGathering(a.key), busy: a.visit?.phase === 'activity' };
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
            // A retained ceremony corridor cannot be replaced by a route search if a
            // passing bend ends across a building from its original next waypoint.
            return !this.ownsGathering(a.key) || this.segment(a, from, a.path[0]);
        };
        const pairs = this.social.activePairs().map(pair => ({
            a: this.agents.get(pair.a)!, b: this.agents.get(pair.b)!,
            clearance: this.radius(this.agents.get(pair.a)!) + this.radius(this.agents.get(pair.b)!),
        }));
        a.detour = passConversation(a, a.path[0], pairs, residentMovementConfig, clearRoute) ??
            passNeighbours(a, a.path[0], [...this.agents.values()].filter(other => {
                if (other === a) return false;
                // Ceremony and retained return corridors already have safe waypoints.
                // Anticipate bodies on that segment, rather than beyond its next turn.
                return !this.ownsGathering(a.key) || !this.clearsSegment(other, a, a.path[0],
                    this.radius(a) + this.radius(other));
            }).map(other => ({
                x: other.x, z: other.z, radius: this.radius(other),
                encounterEligible: this.social.eligible(this.encounterActor(a)) &&
                    this.social.eligible(this.encounterActor(other)) && !this.social.blocked(a.key, other.key) &&
                    this.social.approaching(this.encounterActor(a), this.encounterActor(other)),
            })), residentMovementConfig, clearRoute,
                point => this.bodyClearance(a, point)) ?? [];
    }
    private cattleEncounters() {
        const people = [...this.agents.values()].filter(a => a.kind === 'persona' && a.socialEnabled && !this.ownsGathering(a.key) && a.visit?.phase !== 'activity');
        for (const cow of this.agents.values()) {
            if (cow.kind !== 'cattle' || cow.state === 'Rest' || !cow.interactionSeconds || !this.social.available(cow.key)) continue;
            const reference = livestockPresentation(cow.entity.asset);
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
        this.metrics.presentationSteps++;
        this.metrics.activeSeconds += dt;
        const actors = [...this.agents.values()];
        this.social.advance(dt, actors.map(a => this.encounterActor(a)), (first, second) => {
            const a = this.agents.get(first.key)!, b = this.agents.get(second.key)!;
            return this.segment(a, a, b) && this.segment(b, b, a);
        });
        this.cattleEncounters();
        this.clearReleasedPoses();
        const reservations = this.social.activePairs().map(pair => pair.a + ':' + pair.b).sort().join('|');
        if (reservations !== this.reservationSignature) {
            this.reservationSignature = reservations;
            this.reservationGeneration++;
        }
        for (const a of this.agents.values()) {
            const gathering = this.gathering?.participants.get(a.key);
            const returning = this.gatheringReturns.get(a.key);
            if (returning) {
                returning.remaining -= dt;
                if (returning.remaining <= 0 || !a.path.length && !a.detour.length) {
                    this.gatheringReturns.delete(a.key);
                    a.speed = 0;
                    a.state = 'Idle';
                    if (Math.hypot(a.x - returning.origin.x, a.z - returning.origin.z) < .15)
                        this.resumeIntent(a, returning.suspended);
                    else this.cancelVisit(a);
                    continue;
                }
            }
            if (gathering?.repair && !gathering.arrived && !gathering.dropped && gathering.target) {
                const repair = gathering.repair;
                repair.seconds -= dt;
                if (repair.seconds <= 0 && repair.remaining > 0) {
                    const oldDistance = Math.hypot(repair.checkpoint.x - gathering.target.x, repair.checkpoint.z - gathering.target.z);
                    const distance = Math.hypot(a.x - gathering.target.x, a.z - gathering.target.z);
                    if (oldDistance - distance < .3) {
                        repair.remaining--;
                        const path = this.route(a, gathering.target, 'cultural-gathering', this.gathering!.eventId);
                        if (path.length) { a.path = path; a.detour = []; }
                    }
                    repair.seconds = 5;
                    repair.checkpoint = { x: a.x, z: a.z };
                }
            }
            if (gathering && !gathering.dropped && !a.path.length && !a.detour.length) {
                a.speed = 0;
                a.state = 'Idle';
                if (gathering.target && Math.hypot(a.x - gathering.target.x, a.z - gathering.target.z) < .15) {
                    const center = gathering.facing ?? this.campfire.transform;
                    const heading = Math.atan2(center.x - a.x, center.z - a.z);
                    a.rotation = turnToward(a.rotation, heading, dt, residentMovementConfig.turnSpeed);
                    gathering.arrived = Math.cos(heading - a.rotation) > .99;
                    continue;
                }
                gathering.arrived = false;
                gathering.dropped = true;
                this.beginGatheringReturn(a, gathering);
            }
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
                    this.metrics.activitiesCompleted++;
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
                        if (Math.cos(heading - a.rotation) > .99) {
                            this.metrics.occupationArrivals++;
                            visit.phase = 'activity';
                        }
                        continue;
                    }
                    if (visit.phase === 'home' && Math.hypot(a.x - a.anchor.x, a.z - a.anchor.z) < .15) {
                        this.metrics.homeArrivals++;
                        a.homeTrail = [];
                    }
                    a.visit = null;
                    a.visitDelay = 20 + this.random(a) * 25;
                }
            } else if (a.kind === 'persona' && !this.ownsGathering(a.key)) {
                a.visitDelay -= dt;
                if (Math.hypot(a.x - a.anchor.x, a.z - a.anchor.z) > 28 && !a.path.length)
                    a.path = this.route(a, a.anchor);
                // A due work visit may replace an ordinary wander. Encounter owners have already
                // continued above, so their retained destinations are never replaced mid-pair.
                if (a.visitDelay <= 0) this.beginVisit(a);
            }
            if (a.state === 'Rest') {
                a.restRemaining -= dt;
                a.speed = 0;
                if (a.restRemaining > 1e-8) continue;
                a.state = 'Idle';
                a.wait = 0;
            }
            if (a.state === 'Graze') {
                a.grazeRemaining -= dt;
                a.speed = 0;
                if (a.grazeRemaining > 1e-8) continue;
                a.state = 'Idle';
                a.wait = 0;
            }
            // Compact wedding routes already account for bodies. The ordinary passing detour
            // can continually bend them around a seated attendee; keep the bounded route instead.
            if (!gathering?.repair) this.planPassing(a);
            // Native running approaches retain exact bend corners for the slower walk back.
            if (a.detour.length && Math.hypot(a.detour[0].x - a.x, a.detour[0].z - a.z) <
                (a.runPace !== null && this.ownsGathering(a.key) ? 1e-7 : .15)) a.detour.shift();
            if (!a.path.length && !a.detour.length) {
                a.speed = 0;
                a.state = 'Idle';
                a.wait -= dt;
                if (a.wait <= 0) {
                    if (a.kind === 'cattle' && a.grazeNext && a.grazeSeconds > 0) {
                        if (a.restNext && a.restSeconds > 0) {
                            a.state = 'Rest';
                            a.restRemaining = a.restSeconds;
                        } else {
                            a.state = 'Graze';
                            a.grazeRemaining = a.grazeSeconds;
                        }
                        a.restNext = !a.restNext;
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
            const run = this.runningApproach(a), pace = run ? a.runPace! : a.pace;
            a.speed = Math.min(pace, a.speed + dt * pace * 2, Math.sqrt(2 * pace * Math.max(.01, distance)));
            const step = Math.min(distance, a.speed * dt), p = { x: a.x + dx / distance * step, z: a.z + dz / distance * step };
            if (!this.segment(a, a, p)) {
                if (gathering && !gathering.dropped) {
                    gathering.arrived = false;
                    gathering.dropped = true;
                    this.beginGatheringReturn(a, gathering);
                    continue;
                }
                if (returning) {
                    this.gatheringReturns.delete(a.key);
                    this.cancelVisit(a);
                    continue;
                }
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
            this.metrics.distanceWalked += step;
            a.x = p.x;
            a.z = p.z;
            a.y = this.height(a);
            a.state = run ? 'Run' : 'Walk';
            this.recordGatheringTrail(a, distance <= step + 1e-7);
            if (distance <= step + 1e-7) {
                if (a.detour.length) a.detour.shift();
                else a.path.shift();
            }
        }
    }
    private intentWaypoints(intent: SuspendedIntent | null) {
        return intent ? intent.path.length + intent.detour.length + intent.homeTrail.length : 0;
    }
    /** Read-only counters sampled by QA; timing never affects navigation or random choices. */
    inspectMetrics() {
        const actors = [...this.agents.values()];
        let bodyOverlaps = 0;
        for (let i = 0; i < actors.length; i++) for (let j = i + 1; j < actors.length; j++) {
            if (Math.hypot(actors[i].x - actors[j].x, actors[i].z - actors[j].z) <
                this.radius(actors[i]) + this.radius(actors[j]) - 1e-6) bodyOverlaps++;
        }
        return { ...this.metrics, navigationGeneration: this.navigationGeneration,
            reservationGeneration: this.reservationGeneration,
            retainedHomeWaypoints: actors.reduce((sum, actor) => sum + actor.homeTrail.length, 0),
            retainedGatheringWaypoints: [...(this.gathering?.participants.values() ?? [])].reduce((sum, person) =>
                sum + (person.trail?.length ?? 0) + this.intentWaypoints(person.suspended), 0) +
                [...this.gatheringReturns].reduce((sum, [key, returning]) => {
                    const actor = this.agents.get(key);
                    return sum + (actor?.path.length ?? 0) + (actor?.detour.length ?? 0) +
                        this.intentWaypoints(returning.suspended);
                }, 0),
            returningGatheringActors: this.gatheringReturns.size, agents: actors.length,
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
