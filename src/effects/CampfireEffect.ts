import { AdditiveBlending, DataTexture, Group, MeshBasicMaterial, NormalBlending,
    RGBAFormat, UnsignedByteType, Vector3 } from 'three';
import { BatchedRenderer, Bezier, ColorOverLife, ConeEmitter, ConstantColor, ConstantValue,
    Gradient, IntervalValue, ParticleSystem, PiecewiseBezier, RenderMode, SizeOverLife } from 'three.quarks';
import { Vector3 as ColorVector, Vector4, type Particle } from 'quarks.core';

import { effectProfiles, type EffectQuality } from '../config/PresentationQuality';
export type { EffectQuality } from '../config/PresentationQuality';

/** Only presentation randomness. Never reads or writes the simulation's saved RNG. */
function stream(seed: number) {
    let state = (seed ^ 0x97ca4f1e) >>> 0;
    return () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
}
class SeededRange extends IntervalValue {
    constructor(a: number, b: number, private random: () => number) { super(a, b); }
    startGen() { }
    genValue() { return this.a + (this.b - this.a) * this.random(); }
}
class HearthEmitter extends ConeEmitter {
    constructor(radius: number, private random: () => number) { super({ radius }); }
    initialize(particle: Particle) {
        const angle = this.random() * Math.PI * 2, radius = Math.sqrt(this.random()) * this.radius;
        particle.position.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
        particle.velocity.set((this.random() - .5) * .3, particle.startSpeed, (this.random() - .5) * .3);
    }
}

/** Locally authored soft particle mask, shared by all three systems; no external image/preset. */
export function particleTexture() {
    const size = 32, pixels = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        const offset = (y * size + x) * 4;
        const radius = Math.hypot((x + .5) / size * 2 - 1, (y + .5) / size * 2 - 1);
        pixels[offset] = pixels[offset + 1] = pixels[offset + 2] = 255;
        pixels[offset + 3] = Math.round(Math.pow(Math.max(0, 1 - radius), 1.5) * 255);
    }
    const texture = new DataTexture(pixels, size, size, RGBAFormat, UnsignedByteType);
    texture.needsUpdate = true;
    return texture;
}

/** One stable settlement anchor, three bounded systems, one shared mask. */
export class CampfireEffect {
    readonly root = new Group();
    private renderer = new BatchedRenderer();
    private texture = particleTexture();
    private systems: { system: ParticleSystem; rate: number; cap: number }[] = [];
    private materials: MeshBasicMaterial[] = [];
    private lit: boolean;
    private quality: EffectQuality = 'low';
    private reducedMotion = false;
    private disposed = false;
    private heat: number;
    private time = 0;
    private random: () => number;

    constructor(readonly key: string, anchor: Vector3, seed: number, lit: boolean) {
        this.root.name = key + ':effects';
        this.root.add(this.renderer);
        this.random = stream(seed);
        this.lit = lit;
        // Restoring a burning save starts warm; no historical emissions are replayed.
        this.heat = lit ? 1 : 0;
        this.createSystem(anchor, 'flame', 22, 36, [.7, 1.3], [1.3, 2.2], [.75, 1.2], .8,
            [[new ColorVector(1, .8, .25), 0], [new ColorVector(1, .18, .015), .55], [new ColorVector(.35, .035, .005), 1]],
            [[0, 0], [.9, .12], [.7, .5], [0, 1]], true, new Bezier(.6, 1, .6, 0));
        this.createSystem(anchor.clone().add(new Vector3(0, .6, 0)), 'smoke', 5, 26,
            [2.5, 4.5], [.5, .8], [.8, 1.2], .45,
            [[new ColorVector(.18, .17, .16), 0], [new ColorVector(.36, .35, .34), 1]],
            [[0, 0], [.22, .2], [.12, .6], [0, 1]], false, new Bezier(.5, 1, 1.6, 2.3));
        this.createSystem(anchor, 'sparks', 2, 6, [1, 2], [1.8, 3], [.07, .12], .55,
            [[new ColorVector(1, .65, .15), 0], [new ColorVector(1, .12, .01), 1]],
            [[1, 0], [.8, .6], [0, 1]], true, new Bezier(1, 1, .6, 0));
        this.configure('low', false);
    }

    private createSystem(anchor: Vector3, name: string, rate: number, cap: number,
        life: [number, number], speed: [number, number], size: [number, number], radius: number,
        colors: [ColorVector, number][], alpha: [number, number][], additive: boolean, sizeCurve: Bezier) {
        const material = new MeshBasicMaterial({ map: this.texture, transparent: true,
            depthWrite: false, depthTest: true, blending: additive ? AdditiveBlending : NormalBlending,
            toneMapped: false });
        this.materials.push(material);
        const system = new ParticleSystem({ duration: 10, looping: true, prewarm: false, autoDestroy: false,
            shape: new HearthEmitter(radius, this.random), material, worldSpace: true,
            startLife: new SeededRange(...life, this.random), startSpeed: new SeededRange(...speed, this.random),
            startSize: new SeededRange(...size, this.random), startRotation: new ConstantValue(0),
            startColor: new ConstantColor(new Vector4(1, 1, 1, 1)), emissionOverTime: new ConstantValue(0),
            renderMode: RenderMode.BillBoard,
            behaviors: [new ColorOverLife(new Gradient(colors, alpha)),
                new SizeOverLife(new PiecewiseBezier([[sizeCurve, 0]]))] });
        system.emitter.name = this.key + ':' + name;
        system.emitter.position.copy(anchor);
        system.emitter.raycast = () => { };
        this.root.add(system.emitter);
        this.renderer.addSystem(system);
        this.systems.push({ system, rate, cap });
        for (const batch of this.renderer.batches) batch.raycast = () => { };
    }

    configure(quality: EffectQuality, reducedMotion: boolean) {
        this.quality = quality;
        this.reducedMotion = reducedMotion;
        if (!this.enabled) {
            for (const { system } of this.systems) system.restart();
            // Clear GPU instance counts too, including quality changes while paused.
            for (const batch of this.renderer.batches) batch.update();
        }
        this.root.visible = this.enabled;
    }
    private get enabled() { return effectProfiles[this.quality].enabled && !this.reducedMotion; }
    setLit(lit: boolean) { this.lit = lit; }
    update(delta: number, active: boolean) {
        if (this.disposed || !active) return;
        const step = Math.max(0, Math.min(.1, delta));
        this.time += step;
        // Slow, local thaw/return. Quality changes never reset this transition.
        this.heat = this.lit ? Math.min(1, this.heat + step / 3) : Math.max(0, this.heat - step / 6);
        if (!this.enabled) return;
        for (const entry of this.systems) {
            const budget = effectProfiles[this.quality];
            const limit = Math.ceil(entry.cap * budget.fireCapScale);
            const rate = this.lit && entry.system.particleNum < limit
                ? entry.rate * budget.fireRateScale : 0;
            (entry.system.emissionOverTime as ConstantValue).value = rate;
        }
        this.renderer.update(step);
    }
    inspect() {
        return { key: this.key, lit: this.lit, heat: this.heat, time: this.time,
            quality: this.quality, reducedMotion: this.reducedMotion,
            particles: this.systems.reduce((sum, entry) => sum + entry.system.particleNum, 0),
            systems: this.systems.length, batches: this.renderer.batches.length,
            visible: this.enabled, snowMultiplier: 1 - this.heat };
    }
    dispose() {
        if (this.disposed) return;
        this.disposed = true;
        for (const { system } of this.systems) system.dispose();
        for (const batch of this.renderer.batches) {
            batch.dispose();
            for (const material of Array.isArray(batch.material) ? batch.material : [batch.material]) material.dispose();
            batch.settings.material.dispose();
        }
        for (const material of this.materials) material.dispose();
        this.texture.dispose();
        this.renderer.clear();
        this.renderer.batches.length = 0;
        this.systems.length = 0;
        this.root.removeFromParent();
        this.root.clear();
    }
}
