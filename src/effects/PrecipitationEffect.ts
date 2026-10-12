import { Group, MeshBasicMaterial, NormalBlending, Vector3 } from 'three';
import { BatchedRenderer, ColorOverLife, ConstantColor, ConstantValue, Gradient,
    IntervalValue, ParticleSystem, RectangleEmitter, RenderMode } from 'three.quarks';
import { Vector3 as ColorVector, Vector4, type Particle } from 'quarks.core';
import { particleTexture, type EffectQuality } from './CampfireEffect';
import type { PrecipitationKind } from '../fjord-play/FjordProjection';

type FallingKind = Exclude<PrecipitationKind, 'none'>;
type Coverage = { center: Vector3; radius: number; height: number; sizeScale: number };
type EffectEntry = { kind: FallingKind; system: ParticleSystem; weight: number };

class LocalRange extends IntervalValue {
    constructor(a: number, b: number, private random: () => number) { super(a, b); }
    startGen() { }
    genValue() { return this.a + (this.b - this.a) * this.random(); }
}

/** A bounded volume around the camera focus. Existing particles stay in world space. */
class FallingEmitter extends RectangleEmitter {
    constructor(private coverage: Coverage, private surface: (x: number, z: number) => number,
        private random: () => number) { super(); }
    initialize(particle: Particle) {
        const { center, radius, height } = this.coverage;
        const angle = this.random() * Math.PI * 2;
        const distance = Math.sqrt(this.random()) * radius;
        const x = center.x + Math.cos(angle) * distance;
        const z = center.z + Math.sin(angle) * distance;
        const floor = this.surface(x, z);
        const altitude = 1 + this.random() * height;
        particle.position.set(x, floor + altitude, z);
        particle.velocity.set(0, -particle.startSpeed, 0);
        particle.life = altitude / particle.startSpeed;
        particle.startSize.multiplyScalar(this.coverage.sizeScale);
        particle.size.copy(particle.startSize);
    }
}

/** Fade the whole shower as well as individual flakes/drops; no extra shader or physics. */
class ShowerColor extends ColorOverLife {
    constructor(private weight: () => number, color: ColorVector, opacity: number) {
        super(new Gradient([[color, 0], [color, 1]],
            [[0, 0], [opacity, .1], [opacity, .8], [0, 1]]));
    }
    update(particle: Particle, delta: number) {
        super.update(particle, delta);
        particle.color.w *= this.weight();
    }
}

/** Calendar decoration only: one snow batch and one rain batch, with independent RNG. */
export class PrecipitationEffect {
    readonly root = new Group();
    private renderer = new BatchedRenderer();
    private texture = particleTexture();
    private material = new MeshBasicMaterial({ map: this.texture, transparent: true,
        depthTest: true, depthWrite: false, blending: NormalBlending, toneMapped: false });
    private coverage: Coverage = { center: new Vector3(), radius: 25, height: 18, sizeScale: 1 };
    private entries: EffectEntry[] = [];
    private kind: PrecipitationKind = 'none';
    private quality: EffectQuality = 'low';
    private reducedMotion = false;
    private time = 0;
    private disposed = false;
    private random: () => number;

    constructor(seed: number, surface: (x: number, z: number) => number) {
        let value = (seed ^ 0x5ea50a1) >>> 0;
        this.random = () => {
            value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
            return value / 4294967296;
        };
        this.root.name = 'seasonal-precipitation';
        this.root.add(this.renderer);
        this.create('snow', surface);
        this.create('rain', surface);
    }

    private create(kind: FallingKind, surface: (x: number, z: number) => number) {
        const snow = kind === 'snow';
        const entry = { kind, weight: 0 } as EffectEntry;
        entry.system = new ParticleSystem({ duration: 10, looping: true,
            prewarm: false, autoDestroy: false, worldSpace: true, material: this.material,
            shape: new FallingEmitter(this.coverage, surface, this.random),
            startLife: new ConstantValue(1), // The emitter ends each fall at the sampled surface.
            startSpeed: new LocalRange(snow ? 1.2 : 14, snow ? 2.1 : 19, this.random),
            startSize: new LocalRange(snow ? .2 : .075, snow ? .4 : .11, this.random),
            startRotation: new ConstantValue(0), startColor: new ConstantColor(new Vector4(1, 1, 1, 1)),
            emissionOverTime: new ConstantValue(0),
            renderMode: snow ? RenderMode.BillBoard : RenderMode.StretchedBillBoard,
            rendererEmitterSettings: snow ? {} : { speedFactor: 0, lengthFactor: 8 },
            behaviors: [new ShowerColor(() => entry.weight,
                snow ? new ColorVector(.95, .98, 1) : new ColorVector(.65, .8, .92), snow ? .9 : .65)] });
        entry.system.emitter.name = 'precipitation:' + kind;
        entry.system.emitter.raycast = () => { };
        this.root.add(entry.system.emitter);
        this.renderer.addSystem(entry.system);
        this.entries.push(entry);
        for (const batch of this.renderer.batches) batch.raycast = () => { };
    }

    setWeather(kind: PrecipitationKind) { this.kind = kind; }

    configure(quality: EffectQuality, reducedMotion: boolean) {
        if (quality !== this.quality || reducedMotion !== this.reducedMotion) {
            for (const entry of this.entries) entry.system.restart();
            // Clear GPU counts even when the campaign is paused.
            for (const batch of this.renderer.batches) batch.update();
        }
        this.quality = quality;
        this.reducedMotion = reducedMotion;
        this.root.visible = this.enabled;
    }

    private get enabled() { return this.quality !== 'off' && !this.reducedMotion; }

    update(delta: number, active: boolean, focus: Vector3, cameraPosition: Vector3) {
        if (this.disposed || !active || !this.enabled) return;
        const step = Math.max(0, Math.min(.1, delta));
        if (!step) return;
        this.time += step;
        this.coverage.center.copy(focus);
        const distance = focus.distanceTo(cameraPosition);
        this.coverage.radius = Math.max(12, Math.min(44, distance * .4));
        this.coverage.height = Math.max(12, Math.min(28, distance * .3));
        // Preserve readability at the settlement overview without increasing particle count.
        this.coverage.sizeScale = Math.max(1, Math.min(4, distance / 35));
        for (const entry of this.entries) {
            const target = entry.kind === this.kind ? 1 : 0;
            entry.weight += Math.sign(target - entry.weight) * Math.min(Math.abs(target - entry.weight), step / 2);
            const snow = entry.kind === 'snow';
            const low = this.quality === 'low';
            const cap = snow ? (low ? 300 : 700) : (low ? 250 : 600);
            const rate = snow ? (low ? 70 : 140) : (low ? 180 : 400);
            // Reserve one fractional emission so the library cannot overshoot the live budget.
            (entry.system.emissionOverTime as ConstantValue).value = target
                ? Math.min(rate * entry.weight, Math.max(0, cap - entry.system.particleNum - 1) / step) : 0;
            if (entry.weight === 0 && entry.system.particleNum) entry.system.restart();
        }
        this.renderer.update(step);
    }

    inspect() {
        return { kind: this.kind, quality: this.quality, reducedMotion: this.reducedMotion,
            enabled: this.enabled, time: this.time,
            snow: this.entries[0]?.system.particleNum ?? 0,
            rain: this.entries[1]?.system.particleNum ?? 0,
            snowWeight: this.entries[0]?.weight ?? 0, rainWeight: this.entries[1]?.weight ?? 0,
            radius: this.coverage.radius, center: this.coverage.center.toArray(),
            batches: this.renderer.batches.length };
    }

    dispose() {
        if (this.disposed) return;
        this.disposed = true;
        for (const entry of this.entries) entry.system.dispose();
        for (const batch of this.renderer.batches) {
            batch.dispose();
            for (const material of Array.isArray(batch.material) ? batch.material : [batch.material]) material.dispose();
            batch.settings.material.dispose();
        }
        this.material.dispose();
        this.texture.dispose();
        this.renderer.clear();
        this.renderer.batches.length = 0;
        this.entries.length = 0;
        this.root.removeFromParent();
        this.root.clear();
    }
}
