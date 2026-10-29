import { DataTexture, Euler, LinearFilter, LinearSRGBColorSpace, PMREMGenerator, Quaternion, RGBAFormat, Scene, Vector3,
    type WebGLRenderer, type WebGLRenderTarget } from 'three';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';

export type HdrEnvironmentLoader = (signal: AbortSignal) => Promise<WebGLRenderTarget>;

/** The original, source-locked Poly Haven daylight pilot, with temporary resources released. */
export async function loadHdrEnvironment(renderer: WebGLRenderer, baseURL: string,
    signal: AbortSignal): Promise<WebGLRenderTarget> {
    if (signal.aborted) throw new Error('HDR loading cancelled.');
    const request = new AbortController();
    const cancel = () => request.abort();
    signal.addEventListener('abort', cancel, { once: true });
    const timeout = setTimeout(cancel, 15000);
    let bytes: ArrayBuffer;
    try {
        const response = await fetch(baseURL + 'lighting/lonely-road/lonely_road_afternoon_puresky_1k.hdr',
            { signal: request.signal });
        if (!response.ok) throw new Error('HDR lighting could not be loaded.');
        bytes = await response.arrayBuffer();
    } finally {
        clearTimeout(timeout);
        signal.removeEventListener('abort', cancel);
    }
    if (signal.aborted || request.signal.aborted) throw new Error('HDR loading cancelled.');
    const parsed = new HDRLoader().parse(bytes);
    const source = new DataTexture(parsed.data, parsed.width, parsed.height, RGBAFormat, parsed.type);
    // Same linear data-texture settings as native HDRLoader.load, with abortable input above.
    source.colorSpace = LinearSRGBColorSpace;
    source.minFilter = source.magFilter = LinearFilter;
    source.generateMipmaps = false;
    source.flipY = true;
    source.needsUpdate = true;
    let generator: PMREMGenerator | undefined;
    try {
        generator = new PMREMGenerator(renderer);
        return generator.fromEquirectangular(source);
    } finally {
        source.dispose();
        generator?.dispose();
    }
}

/** One optional material-lighting owner. It never replaces the sky or changes simulation state. */
export class FjordHdrLighting {
    private target?: WebGLRenderTarget;
    private pending?: Promise<void>;
    private abort?: AbortController;
    private generation = 0;
    private alive = true;
    private suspended = false;
    private enabled = false;
    private failure = false;
    private darkness = 0;
    private direction = new Vector3(0, 1, 0);
    private alignedDirection = new Vector3();
    private sampling = new Euler();
    private rotation = new Quaternion();
    // Original HDR peak at (614,230), 1024x512; preserve the reviewed source alignment.
    private sourceSun = new Vector3(
        Math.cos(36.03515625 * Math.PI / 180) * Math.cos(8.96484375 * Math.PI / 180),
        Math.sin(8.96484375 * Math.PI / 180),
        Math.sin(36.03515625 * Math.PI / 180) * Math.cos(8.96484375 * Math.PI / 180));
    private previous: { environment: Scene['environment']; intensity: number; rotation: Euler };
    private changed = () => { void this.select(); };
    constructor(private scene: Scene, private input: HTMLInputElement, private status: HTMLElement,
        private load: HdrEnvironmentLoader) {
        this.previous = { environment: scene.environment, intensity: scene.environmentIntensity,
            rotation: scene.environmentRotation.clone() };
        input.addEventListener('change', this.changed);
        void this.select();
    }
    get ready() { return this.pending ?? Promise.resolve(); }
    private release() {
        this.generation++;
        this.abort?.abort();
        this.abort = undefined;
        this.pending = undefined;
        this.scene.environment = this.previous.environment;
        this.scene.environmentIntensity = this.previous.intensity;
        this.scene.environmentRotation.copy(this.previous.rotation);
        this.target?.dispose();
        this.target = undefined;
        this.alignedDirection.set(0, 0, 0);
    }
    private select(): Promise<void> {
        if (!this.alive) return Promise.resolve();
        this.enabled = this.input.checked;
        if (!this.enabled || this.suspended) {
            this.release();
            this.failure = false;
            this.apply();
            return Promise.resolve();
        }
        if (this.target || this.pending) {
            this.apply();
            return this.ready;
        }
        const generation = ++this.generation, abort = new AbortController();
        this.abort = abort;
        this.failure = false;
        this.status.textContent = 'Loading HDR lighting…';
        this.pending = Promise.resolve().then(() => this.load(abort.signal)).then(target => {
            if (!this.alive || generation !== this.generation || !this.enabled || this.suspended) {
                target.dispose();
                return;
            }
            this.target = target;
        }).catch(() => {
            if (this.alive && generation === this.generation) this.failure = true;
        }).finally(() => {
            if (this.alive && generation === this.generation) {
                this.pending = undefined;
                this.apply();
            }
        });
        return this.pending;
    }
    update(direction: Vector3, darkness: number) {
        if (!this.alive) return;
        this.direction.copy(direction);
        if (!Number.isFinite(this.direction.lengthSq()) || this.direction.lengthSq() < 1e-12)
            this.direction.set(0, 1, 0);
        this.direction.normalize();
        this.darkness = Number.isFinite(darkness) ? Math.max(0, Math.min(1, darkness)) : 1;
        this.apply();
    }
    private apply() {
        const active = this.alive && this.enabled && !this.suspended && this.target && this.darkness < .999;
        if (active) {
            this.scene.environment = this.target!.texture;
            this.scene.environmentIntensity = .15 * (1 - this.darkness);
            if (this.direction.distanceToSquared(this.alignedDirection) > 1e-12) {
                this.rotation.setFromUnitVectors(this.direction, this.sourceSun);
                this.sampling.setFromQuaternion(this.rotation, 'XYZ');
                // Native Three negates XYZ environment rotation for its left-handed sampling frame.
                this.scene.environmentRotation.set(-this.sampling.x, -this.sampling.y, -this.sampling.z, 'XYZ');
                this.alignedDirection.copy(this.direction);
            }
        } else {
            this.scene.environment = this.previous.environment;
            this.scene.environmentIntensity = this.previous.intensity;
            this.scene.environmentRotation.copy(this.previous.rotation);
            this.alignedDirection.set(0, 0, 0);
        }
        const message = !this.enabled ? 'HDR lighting off.' : this.failure ?
            'HDR lighting unavailable. Turn it off and on to retry.' : this.suspended ?
            'HDR lighting suspended.' : this.pending ? 'Loading HDR lighting…' :
            this.darkness >= .999 ? 'HDR lighting pauses at night.' : 'HDR lighting enabled.';
        if (this.status.textContent !== message) this.status.textContent = message;
    }
    suspend() {
        if (!this.alive) return;
        this.suspended = true;
        this.release();
        this.apply();
    }
    resume() {
        if (!this.alive) return;
        this.suspended = false;
        void this.select();
    }
    inspect() { return { requested: this.enabled, active: this.scene.environment === this.target?.texture,
        loaded: !!this.target, pending: !!this.pending, failed: this.failure,
        intensity: this.target && this.scene.environment === this.target.texture ? this.scene.environmentIntensity : 0 }; }
    dispose() {
        if (!this.alive) return;
        this.alive = false;
        this.input.removeEventListener('change', this.changed);
        this.release();
    }
}
