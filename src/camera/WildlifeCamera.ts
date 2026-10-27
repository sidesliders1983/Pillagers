import { MathUtils, PerspectiveCamera, Vector3 } from 'three';
import type { LiveWildlifeAnchor, LiveWildlifeTarget } from '../wildlife/WildlifeLayer';
import type { RTSCameraController } from './RTSCameraController';

type View = { position: number[]; target: number[] };
type Session = {
    target: LiveWildlifeTarget;
    origin: Vector3;
    pivot: Vector3;
    from: View;
    radius: number;
    rise: number;
    angle: number;
    arc: number;
    elapsed: number;
    reduced: boolean;
};
const entrySeconds = 1.4;
const orbitSeconds = 10;
const maximumFollowMetres = 12;
const ease = (value: number) => {
    const t = MathUtils.clamp(value, 0, 1);
    return t * t * (3 - 2 * t);
};
export function wildlifeCameraPivot(anchor: LiveWildlifeAnchor) {
    const center = new Vector3(...anchor.bounds.min).add(new Vector3(...anchor.bounds.max)).multiplyScalar(.5);
    if (anchor.movement === 'water') center.y = Math.max(center.y, anchor.waterLevel + .25);
    return center;
}

/** One view-only session. Native camera input stays enabled; ending never restores an earlier view. */
export class WildlifeCamera {
    private session?: Session;
    private disposed = false;
    private releaseInput: () => void;
    private reason = 'idle';
    onEnd?: (reason: string) => void;
    constructor(private readonly camera: PerspectiveCamera, private readonly controller: RTSCameraController,
        private readonly query: (target: LiveWildlifeTarget) => LiveWildlifeAnchor | undefined,
        private readonly safe: (view: View) => boolean = () => true) {
        this.releaseInput = controller.onNavigationIntent(() => this.cancel('manual-navigation'));
    }
    private anchor(target: LiveWildlifeTarget) {
        const anchor = this.query(target);
        if (!anchor || anchor.worldId !== target.worldId || anchor.speciesId !== target.speciesId ||
            anchor.wildlifeInstanceId !== target.wildlifeInstanceId ||
            ![...anchor.position, ...anchor.bounds.min, ...anchor.bounds.max].every(Number.isFinite)) return;
        return anchor;
    }
    private view(position: Vector3, target: Vector3, maximumLift: number): View | undefined {
        const view = this.controller.previewView({ position: position.toArray(), target: target.toArray() });
        if (!view || view.position[1] - position.y > maximumLift || !this.safe(view)) return;
        return view;
    }
    private circle(session: Session, progress: number) {
        const angle = session.angle + session.arc * progress;
        return session.pivot.clone().add(new Vector3(
            Math.sin(angle) * session.radius, session.rise, Math.cos(angle) * session.radius));
    }
    begin(target: LiveWildlifeTarget, reducedMotion: boolean): boolean {
        this.cancel('replaced');
        if (this.disposed || !this.controller.enabled) return false;
        const anchor = this.anchor(target);
        if (!anchor) return false;
        const pivot = wildlifeCameraPivot(anchor);
        const size = new Vector3(...anchor.bounds.max).sub(new Vector3(...anchor.bounds.min));
        const span = Math.max(size.x, size.y, size.z, .3);
        const halfFov = Math.atan(Math.tan(MathUtils.degToRad(this.camera.fov) / 2) * Math.min(1, this.camera.aspect));
        const radius = MathUtils.clamp(span / (2 * Math.tan(halfFov)) * 1.45,
            anchor.movement === 'air' ? 10 : 6, 48);
        const rise = MathUtils.clamp(size.y * .7 + 2, 2.5, 6);
        const direction = this.camera.position.clone().sub(pivot);
        const startAngle = Math.atan2(direction.x, direction.z);
        const from = { position: this.camera.position.toArray(), target: this.controller.focus.toArray() };
        for (const offset of [0, Math.PI / 4, -Math.PI / 4, Math.PI / 2, -Math.PI / 2, Math.PI]) {
            const session: Session = { target: { ...target }, origin: pivot.clone(), pivot: pivot.clone(),
                from, radius, rise, angle: startAngle + offset, arc: 0, elapsed: 0, reduced: reducedMotion };
            const first = this.view(this.circle(session, 0), pivot, 3);
            if (!first) continue;
            let entrySafe = true;
            for (let step = 0; step <= 8; step++) {
                const t = step / 8;
                const eye = new Vector3().fromArray(from.position).lerp(new Vector3().fromArray(first.position), t);
                const focus = new Vector3().fromArray(from.target).lerp(pivot, t);
                if (!this.view(eye, focus, 3)) { entrySafe = false; break; }
            }
            if (!entrySafe) continue;
            if (!reducedMotion) {
                // A contiguous safe arc only: never jump across a blocked angle to reach another safe one.
                for (let step = 1; step <= 32; step++) {
                    session.arc = step / 32 * Math.PI * 2;
                    if (!this.view(this.circle(session, 1), pivot, 3)) {
                        session.arc = (step - 1) / 32 * Math.PI * 2;
                        break;
                    }
                }
            }
            this.session = session;
            this.reason = 'active';
            return true;
        }
        this.reason = 'no-safe-view';
        return false;
    }
    advance(deltaSeconds: number) {
        const session = this.session;
        if (!session) return;
        if (!this.controller.enabled) { this.cancel('camera-unavailable'); return; }
        const anchor = this.anchor(session.target);
        if (!anchor) { this.cancel('animal-unavailable'); return; }
        const current = wildlifeCameraPivot(anchor);
        if (current.distanceTo(session.origin) > maximumFollowMetres) { this.cancel('animal-moved-away'); return; }
        const delta = Number.isFinite(deltaSeconds) ? MathUtils.clamp(deltaSeconds, 0, .1) : 0;
        session.elapsed += delta;
        session.pivot.lerp(current, 1 - Math.exp(-3 * delta));
        const progress = session.reduced ? 0 : ease((session.elapsed - entrySeconds) / orbitSeconds);
        let eye = this.circle(session, progress), focus = session.pivot.clone();
        if (session.elapsed < entrySeconds) {
            const enter = ease(session.elapsed / entrySeconds);
            eye.lerp(new Vector3().fromArray(session.from.position), 1 - enter);
            focus.lerp(new Vector3().fromArray(session.from.target), 1 - enter);
        }
        const view = this.view(eye, focus, 3);
        if (!view) { this.cancel('view-obstructed'); return; }
        this.controller.setView(view, { presentation: true });
        if (session.elapsed >= (session.reduced ? 2.8 : entrySeconds + orbitSeconds)) this.cancel('complete');
    }
    cancel(reason = 'cancelled') {
        const active = !!this.session;
        this.session = undefined;
        this.reason = reason;
        if (active) this.onEnd?.(reason);
    }
    get saveView(): View | undefined {
        const view = this.session?.from;
        return view ? { position: [...view.position], target: [...view.target] } : undefined;
    }
    get active() { return !!this.session; }
    inspect() {
        return { active: this.active, reason: this.reason, elapsed: this.session?.elapsed ?? 0,
            arcRadians: this.session?.arc ?? 0, target: this.session ? { ...this.session.target } : undefined };
    }
    dispose() {
        if (this.disposed) return;
        this.cancel('disposed');
        this.disposed = true;
        this.releaseInput();
        this.onEnd = undefined;
    }
}
