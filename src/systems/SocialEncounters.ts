export const residentMovementConfig = {
    radius: .48, speed: .65, conversationDistance: 1.35, conversationSeconds: 5,
    cooldownSeconds: 3, separationDistance: 1.8, predictionSeconds: 1.5,
    turnSpeed: 4, walkAlignment: .85,
};

export interface EncounterActor {
    key: string;
    x: number;
    z: number;
    radius: number;
    velocity: { x: number; z: number };
    enabled: boolean;
    busy: boolean;
}
export type EncounterState = 'none' | 'talking' | 'listening' | 'resume';
type InteractionKind = 'resident' | 'cattleHuman';
type Status = { kind: InteractionKind | null; state: EncounterState; partnerKey: string | null; cooldownUntil: number };
type Pair = { a: string; b: string; endsAt: number };

/** Shared Fjordside predictive pairing. It reserves actors; each view still owns navigation. */
export class SocialEncounters {
    private time = 0;
    private states = new Map<string, Status>();
    private pairs: Pair[] = [];
    private released = new Map<string, { a: string; b: string; until: number }>();
    constructor(private config = { ...residentMovementConfig }) {}
    private key(a: string, b: string) { return JSON.stringify([a, b].sort()); }
    private status(key: string) {
        let state = this.states.get(key);
        if (!state) {
            state = { kind: null, state: 'none', partnerKey: null, cooldownUntil: 0 };
            this.states.set(key, state);
        }
        return state;
    }
    inspect(key: string) {
        const state = this.status(key);
        return { ...state, cooldown: Math.max(0, state.cooldownUntil - this.time) };
    }
    activePairs() { return this.pairs.map(pair => ({ ...pair })); }
    blocked(a: string, b: string) { return this.released.has(this.key(a, b)); }
    eligible(actor: EncounterActor) {
        const state = this.status(actor.key);
        return !actor.busy && actor.enabled && state.state === 'none' &&
            this.time >= state.cooldownUntil && Math.hypot(actor.velocity.x, actor.velocity.z) > 0;
    }
    /** Shared closest-approach prediction; waypoint turns are not head-on encounters. */
    approaching(a: EncounterActor, b: EncounterActor) {
        const dx = b.x - a.x, dz = b.z - a.z;
        const vx = b.velocity.x - a.velocity.x, vz = b.velocity.z - a.velocity.z;
        const velocitySquared = vx * vx + vz * vz;
        if (velocitySquared === 0 || dx * vx + dz * vz >= 0) return false;
        const prediction = Math.min(this.config.predictionSeconds,
            Math.max(0, -(dx * vx + dz * vz) / velocitySquared));
        return Math.hypot(dx + vx * prediction, dz + vz * prediction) <= a.radius + b.radius + .1;
    }
    available(key: string) {
        const state = this.status(key);
        return state.state === 'none' && this.time >= state.cooldownUntil;
    }
    reserve(a: string, b: string, seconds: number, kind: InteractionKind) {
        if (!Number.isFinite(seconds) || seconds <= 0) throw new Error('Invalid interaction duration');
        if (a === b || !this.states.has(a) || !this.states.has(b) ||
            !this.available(a) || !this.available(b) || this.blocked(a, b)) return false;
        Object.assign(this.status(a), { kind, state: 'talking', partnerKey: b });
        Object.assign(this.status(b), { kind, state: 'listening', partnerKey: a });
        this.pairs.push({ a, b, endsAt: this.time + seconds });
        return true;
    }
    private finish(pair: Pair) {
        for (const key of [pair.a, pair.b]) {
            const state = this.status(key);
            state.kind = null;
            state.state = 'resume';
            state.partnerKey = null;
            state.cooldownUntil = this.time + this.config.cooldownSeconds;
        }
        this.released.set(this.key(pair.a, pair.b), {
            a: pair.a, b: pair.b, until: this.time + this.config.cooldownSeconds,
        });
    }
    remove(key: string) {
        for (const pair of this.pairs.filter(pair => pair.a === key || pair.b === key))
            this.finish(pair);
        this.pairs = this.pairs.filter(pair => pair.a !== key && pair.b !== key);
        for (const [id, pair] of this.released)
            if (pair.a === key || pair.b === key) this.released.delete(id);
        this.states.delete(key);
    }
    advance(seconds: number, actors: readonly EncounterActor[],
        canMeet: (a: EncounterActor, b: EncounterActor) => boolean = () => true) {
        if (!Number.isFinite(seconds) || seconds < 0) throw new Error('Invalid encounter timestep');
        if (seconds === 0) return;
        const active = new Map(actors.map(actor => [actor.key, actor]));
        for (const key of this.states.keys()) if (!active.has(key)) this.remove(key);
        this.time += seconds;
        for (const [key, pair] of this.released) {
            const a = active.get(pair.a), b = active.get(pair.b);
            if (!a || !b || this.time >= pair.until &&
                Math.hypot(a.x - b.x, a.z - b.z) > this.config.separationDistance)
                this.released.delete(key);
        }
        for (const actor of actors) {
            const state = this.status(actor.key);
            if (state.state === 'resume' && this.time >= state.cooldownUntil) state.state = 'none';
        }
        for (const pair of this.pairs)
            if (this.time + 1e-8 >= pair.endsAt) this.finish(pair);
        this.pairs = this.pairs.filter(pair => this.time + 1e-8 < pair.endsAt);
        for (let i = 0; i < actors.length; i++) for (let j = i + 1; j < actors.length; j++) {
            const a = actors[i], b = actors[j];
            if (!this.eligible(a) || !this.eligible(b) || this.blocked(a.key, b.key)) continue;
            const dx = b.x - a.x, dz = b.z - a.z, distance = Math.hypot(dx, dz);
            const clearance = a.radius + b.radius;
            if (distance > this.config.conversationDistance || distance < clearance) continue;
            if (!this.approaching(a, b) || !canMeet(a, b)) continue;
            this.reserve(a.key, b.key, this.config.conversationSeconds, 'resident');
        }
    }
}

/** The original turn-rate limit, used by both navigation owners. */
export function turnToward(current: number, target: number, seconds: number, speed: number) {
    const difference = Math.atan2(Math.sin(target - current), Math.cos(target - current));
    return current + Math.max(-speed * seconds, Math.min(speed * seconds, difference));
}
