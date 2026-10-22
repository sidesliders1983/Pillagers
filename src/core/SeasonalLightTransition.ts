import { Color, Fog, Vector3 } from 'three';
import type { SeasonalLightState } from '../config/NorthernSeasonalLight';

/** Reusable render values. These buffers never become a public mutable light state. */
class LightFrame {
    readonly direction = new Vector3();
    readonly solarColor = new Color();
    readonly skyFill = new Color();
    readonly groundFill = new Color();
    readonly sky = new Color();
    readonly fog = new Color();
    progress = 0;
    solarStrength = 0;
    ambientStrength = 0;
    darkness = 0;
    fogNear = 0;
    fogFar = 0;
    exposure = 0;

    capture(state: SeasonalLightState, sky: Color, fog: Fog, exposure: number) {
        this.direction.fromArray(state.sunDirection);
        this.solarColor.fromArray(state.solarColor);
        this.skyFill.fromArray(state.ambient.skyColor);
        this.groundFill.fromArray(state.ambient.groundColor);
        this.sky.copy(sky);
        this.fog.copy(fog.color);
        this.progress = state.yearProgress;
        this.solarStrength = state.solarStrength;
        this.ambientStrength = state.ambient.strength;
        this.darkness = state.darkness;
        this.fogNear = fog.near;
        this.fogFar = fog.far;
        this.exposure = exposure;
    }

    blend(from: LightFrame, to: LightFrame, weight: number) {
        this.direction.lerpVectors(from.direction, to.direction, weight).normalize();
        this.solarColor.copy(from.solarColor).lerp(to.solarColor, weight);
        this.skyFill.copy(from.skyFill).lerp(to.skyFill, weight);
        this.groundFill.copy(from.groundFill).lerp(to.groundFill, weight);
        this.sky.copy(from.sky).lerp(to.sky, weight);
        this.fog.copy(from.fog).lerp(to.fog, weight);
        this.progress = from.progress + (to.progress - from.progress) * weight;
        this.solarStrength = from.solarStrength + (to.solarStrength - from.solarStrength) * weight;
        this.ambientStrength = from.ambientStrength + (to.ambientStrength - from.ambientStrength) * weight;
        this.darkness = from.darkness + (to.darkness - from.darkness) * weight;
        this.fogNear = from.fogNear + (to.fogNear - from.fogNear) * weight;
        this.fogFar = from.fogFar + (to.fogFar - from.fogFar) * weight;
        this.exposure = from.exposure + (to.exposure - from.exposure) * weight;
    }
}

/** Interpolate only towards confirmed Core samples, using the existing active frame delta. */
export class SeasonalLightTransition {
    readonly current = new LightFrame();
    private readonly from = new LightFrame();
    private readonly target = new LightFrame();
    private initialized = false;
    private duration = 0;
    private elapsed = 0;
    private state?: SeasonalLightState;

    anchor(state: SeasonalLightState, sky: Color, fog: Fog, exposure: number, seconds: number) {
        this.from.blend(this.current, this.current, 0);
        this.target.capture(state, sky, fog, exposure);
        // A small forward calendar step may cross midwinter; never blend backwards through summer.
        this.target.progress += Math.floor(this.from.progress);
        if (this.target.progress < this.from.progress) this.target.progress++;
        this.duration = this.initialized && Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
        this.elapsed = 0;
        this.initialized = true;
        this.state = undefined;
        if (!this.duration) {
            this.target.progress = state.yearProgress;
            this.current.blend(this.target, this.target, 0);
            this.state = state;
        }
    }

    advance(delta: number, running: boolean) {
        if (!running || !Number.isFinite(delta) || delta <= 0 || this.elapsed >= this.duration) return;
        this.elapsed = Math.min(this.duration, this.elapsed + delta);
        // Linear interpolation keeps consecutive clock samples moving at a steady rate.
        this.current.blend(this.from, this.target, this.elapsed / this.duration);
        this.state = undefined;
    }

    /** Hidden-tab/context recovery reanchors without replaying missed presentation time. */
    finish() {
        if (this.elapsed >= this.duration) return;
        this.elapsed = this.duration;
        this.current.blend(this.target, this.target, 0);
        this.state = undefined;
    }

    /** Frozen snapshots are allocated only for readers, not by the render interpolation loop. */
    snapshot(): SeasonalLightState {
        if (this.state) return this.state;
        const frame = this.current;
        const rgb = (color: Color) => Object.freeze(color.toArray()) as readonly [number, number, number];
        return this.state ??= Object.freeze({
            profile: 'northern-v1',
            yearProgress: ((frame.progress % 1) + 1) % 1,
            sunElevation: Math.asin(frame.direction.y),
            sunDirection: Object.freeze(frame.direction.toArray()) as readonly [number, number, number],
            solarColor: rgb(frame.solarColor),
            solarStrength: frame.solarStrength,
            ambient: Object.freeze({ skyColor: rgb(frame.skyFill), groundColor: rgb(frame.groundFill),
                strength: frame.ambientStrength }),
            darkness: frame.darkness,
        });
    }
}
