import { Color } from 'three';
import { seasonBlend } from '../config/timeVisualization';

/** Borrowed render values: consumers copy these into their existing materials/uniforms. */
export interface SeasonAppearance {
    readonly ground: Color;
    readonly foliage: Color;
    readonly snowAmount: number;
}

class AppearanceFrame implements SeasonAppearance {
    readonly ground = new Color();
    readonly foliage = new Color();
    snowAmount = 0;

    blend(from: SeasonAppearance, to: SeasonAppearance, weight: number) {
        this.ground.copy(from.ground).lerp(to.ground, weight);
        this.foliage.copy(from.foliage).lerp(to.foliage, weight);
        this.snowAmount = from.snowAmount + (to.snowAmount - from.snowAmount) * weight;
    }
}

/** Smooth confirmed visual-season endpoints; never derive snow from the annual sunlight clock. */
export class SeasonAppearanceTransition {
    readonly current = new AppearanceFrame();
    private readonly from = new AppearanceFrame();
    private readonly target = new AppearanceFrame();
    private readonly nextColor = new Color();
    private progress: number | null | undefined;
    private duration = 0;
    private elapsed = 0;

    anchor(progress: number | null, seconds = 0) {
        // Held winter and repeated scene reconciliations must not restart an in-flight blend.
        if (this.progress === progress) {
            return seconds === 0 ? this.finish() : false;
        }
        this.from.blend(this.current, this.current, 0);
        if (progress === null) {
            this.target.ground.setHex(0xffffff);
            this.target.foliage.setHex(0xffffff);
            this.target.snowAmount = 0;
        } else {
            const { from, to, mix } = seasonBlend(progress);
            this.target.ground.setHex(from.ground).lerp(this.nextColor.setHex(to.ground), mix);
            this.target.foliage.setHex(from.foliage).lerp(this.nextColor.setHex(to.foliage), mix);
            const winter = from.name === 'Winter' ? 1 - mix : to.name === 'Winter' ? mix : 0;
            this.target.snowAmount = winter * .65;
        }
        this.duration = this.progress !== undefined && Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
        this.progress = progress;
        this.elapsed = 0;
        if (!this.duration) {
            this.current.blend(this.target, this.target, 0);
            return true;
        }
        return false;
    }

    advance(delta: number, running: boolean) {
        if (!running || !Number.isFinite(delta) || delta <= 0 || this.elapsed >= this.duration) return false;
        this.elapsed = Math.min(this.duration, this.elapsed + delta);
        this.current.blend(this.from, this.target, this.elapsed / this.duration);
        return true;
    }

    finish() {
        if (this.elapsed >= this.duration) return false;
        this.elapsed = this.duration;
        this.current.blend(this.target, this.target, 0);
        return true;
    }
}
