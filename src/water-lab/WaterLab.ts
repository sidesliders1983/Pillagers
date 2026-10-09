import {
    ACESFilmicToneMapping, Color, DirectionalLight, HemisphereLight, PerspectiveCamera, Scene,
    SRGBColorSpace, Vector3, WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { ReferenceWater, REFERENCE_WATER_DEFAULTS } from '../water/ReferenceWater';
import { FloatingSample } from './FloatingSample';
import './water-lab.css';

type Quality = 'low' | 'medium' | 'high';
type View = 'reference' | 'close' | 'grazing' | 'buoyancy';

/** Integration example: water owns no renderer, camera or animation loop. */
export class WaterLab {
    private readonly scene = new Scene();
    private readonly camera = new PerspectiveCamera(43, 1, 0.1, 3000);
    private readonly water = new ReferenceWater({ size: 80, extent: 2000, quality: 'medium' });
    private readonly floatingSample = new FloatingSample();
    private readonly sampleSun = new DirectionalLight('#fff5db', 2);
    private readonly sampleSky = new HemisphereLight('#b8d8e2', '#365465', 1);
    private renderer!: WebGLRenderer;
    private controls!: OrbitControls;
    private animationFrame = 0;
    private elapsed = 0;
    private previousTime = 0;
    private lastHudUpdate = 0;
    private readonly frameIntervals = new Float64Array(120);
    private frameCount = 0;
    private frameCursor = 0;
    private paused = false;
    private destroyed = false;
    private readonly events = new AbortController();

    start(): void {
        document.title = 'Pillagers · Water Lab';
        document.body.className = 'water-lab';
        document.body.innerHTML = `
            <canvas id="water-canvas" aria-label="Animated water preview"></canvas>
            <header class="water-heading">
                <a href="/" aria-label="Back to Pillagers">PILLAGERS <span>/ WATER STUDIES</span></a>
                <h1>A study in water.</h1>
                <p>Surface, light and motion. Drag to explore.</p>
            </header>
            <details class="water-panel" open>
                <summary>Water controls</summary>
                <div class="water-settings">
                    <label>Quality<select id="water-quality">
                        <option value="low">Mobile · low</option>
                        <option value="medium" selected>Mobile · balanced</option>
                        <option value="high">High detail</option>
                    </select></label>
                    <label class="water-check">
                        <input id="water-float" type="checkbox" checked> Floating sample
                    </label>
                    <label>View<select id="water-view">
                        <option value="buoyancy">Buoyancy close-up</option>
                        <option value="reference">Reference angle</option>
                        <option value="close">Surface detail</option>
                        <option value="grazing">Low angle</option>
                    </select></label>
                    <label>Light<select id="water-light">
                        <option value="day">Soft daylight</option>
                        <option value="overcast">Overcast</option>
                        <option value="sunset">Evening</option>
                    </select></label>
                    <label>Wave height <output id="height-value">1.00×</output>
                        <input id="water-height" type="range" min="0" max="2" step="0.05" value="1">
                    </label>
                    <label>Speed <output id="speed-value">1.00×</output>
                        <input id="water-speed" type="range" min="0" max="2" step="0.05" value="1">
                    </label>
                    <label>Surface detail <output id="detail-value">1.00×</output>
                        <input id="water-detail" type="range" min="0" max="2" step="0.05" value="1">
                    </label>
                    <button id="water-pause" type="button" aria-pressed="false">Pause motion</button>
                    <label>Time <output id="time-value">0.0 s</output>
                        <input id="water-time" type="range" min="0" max="60" step="0.1" value="0">
                    </label>
                    <p class="water-hint">The sample rides four wave support points.
                        Increase wave height to inspect its pitch and roll.
                        Scrub time to compare a still frame.</p>
                </div>
            </details>
            <footer class="water-footer">
                <span>REFERENCE WATER <span class="water-dot">•</span> THREE.JS</span>
                <div class="water-readouts">
                    <output id="water-metrics" aria-label="Rendering statistics">Preparing water…</output>
                    <output id="water-performance" aria-label="Frame cadence">Measuring frame cadence…</output>
                </div>
            </footer>`;

        const canvas = this.element<HTMLCanvasElement>('water-canvas');
        this.renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
        this.renderer.outputColorSpace = SRGBColorSpace;
        this.renderer.toneMapping = ACESFilmicToneMapping;
        this.scene.add(this.water.mesh, this.floatingSample.mesh, this.sampleSun, this.sampleSky);
        if (window.matchMedia('(max-width: 650px)').matches) {
            document.querySelector<HTMLDetailsElement>('.water-panel')!.open = false;
        }
        this.controls = new OrbitControls(this.camera, canvas);
        this.controls.enableDamping = true;
        this.controls.enablePan = false;
        this.controls.minDistance = 5;
        this.controls.maxDistance = 95;
        this.controls.minPolarAngle = 0.1;
        this.controls.maxPolarAngle = Math.PI * 0.485;
        this.setView('buoyancy');
        this.setLight('day');
        this.setQuality('medium');
        this.bindControls();
        window.addEventListener('resize', this.resize, { signal: this.events.signal });
        document.addEventListener('visibilitychange', () => {
            this.previousTime = 0;
            this.frameCount = 0;
            this.frameCursor = 0;
        }, { signal: this.events.signal });
        window.addEventListener('pagehide', () => this.dispose(), { signal: this.events.signal });
        this.resize();
        this.render();
        this.updateLabels();
        canvas.dataset.ready = 'true';
        Object.assign(window, { __waterLab: this });
        this.animationFrame = requestAnimationFrame(this.tick);
    }

    setTime(seconds: number): void {
        if (!Number.isFinite(seconds) || seconds < 0) throw new RangeError('Time must be nonnegative.');
        this.elapsed = seconds;
        this.setPaused(true);
        this.render();
        this.updateLabels();
    }

    setPaused(paused: boolean): void {
        this.paused = paused;
        const button = this.element<HTMLButtonElement>('water-pause');
        button.textContent = paused ? 'Resume motion' : 'Pause motion';
        button.setAttribute('aria-pressed', String(paused));
    }

    setQuality(quality: Quality): void {
        this.water.setQuality(quality);
        this.element<HTMLSelectElement>('water-quality').value = quality;
        const cap = quality === 'low' ? 1 : quality === 'medium' ? 1.5 : 2;
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, cap));
        this.resize();
    }

    setView(view: View): void {
        const positions: Record<View, [number, number, number]> = {
            buoyancy: [5, 3.5, 7],
            reference: [16, 18, 28],
            close: [3, 3, 6],
            grazing: [6, 2.5, 17],
        };
        this.camera.position.set(...positions[view]);
        this.controls.target.set(0, 0, 0);
        this.controls.update();
        this.element<HTMLSelectElement>('water-view').value = view;
    }

    getStats() {
        return {
            ...this.water.getStats(),
            elapsedSeconds: this.elapsed,
            paused: this.paused,
            pixelRatio: this.renderer.getPixelRatio(),
            render: { ...this.renderer.info.render },
            memory: { ...this.renderer.info.memory },
            viewport: { width: window.innerWidth, height: window.innerHeight },
            cadence: this.getCadence(),
            floatingSample: {
                visible: this.floatingSample.mesh.visible,
                position: this.floatingSample.mesh.position.toArray(),
                quaternion: this.floatingSample.mesh.quaternion.toArray(),
                triangles: this.floatingSample.mesh.geometry.index!.count / 3,
            },
        };
    }

    dispose(): void {
        if (this.destroyed) return;
        this.destroyed = true;
        cancelAnimationFrame(this.animationFrame);
        this.events.abort();
        this.controls.dispose();
        this.scene.remove(this.water.mesh);
        this.floatingSample.dispose();
        this.water.dispose();
        this.renderer.dispose();
    }

    private element<T extends HTMLElement>(id: string): T {
        return document.getElementById(id) as T;
    }

    private bindControls(): void {
        const listen = (id: string, event: string, callback: () => void) => {
            this.element(id).addEventListener(event, callback, { signal: this.events.signal });
        };
        listen('water-quality', 'change', () => {
            this.setQuality(this.element<HTMLSelectElement>('water-quality').value as Quality);
        });
        listen('water-view', 'change', () => {
            this.setView(this.element<HTMLSelectElement>('water-view').value as View);
        });
        listen('water-light', 'change', () => {
            this.setLight(this.element<HTMLSelectElement>('water-light').value);
        });
        listen('water-float', 'change', () => {
            this.floatingSample.mesh.visible = this.element<HTMLInputElement>('water-float').checked;
            this.render();
            this.updateLabels();
        });
        listen('water-pause', 'click', () => this.setPaused(!this.paused));
        listen('water-time', 'input', () => {
            this.setTime(Number(this.element<HTMLInputElement>('water-time').value));
        });
        for (const id of ['height', 'speed', 'detail']) {
            listen(`water-${id}`, 'input', () => {
                const value = Number(this.element<HTMLInputElement>(`water-${id}`).value);
                this.element<HTMLOutputElement>(`${id}-value`).value = `${value.toFixed(2)}×`;
                this.water.setParameters({
                    waveAmplitude: Number(this.element<HTMLInputElement>('water-height').value) * REFERENCE_WATER_DEFAULTS.waveAmplitude,
                    waveSpeed: Number(this.element<HTMLInputElement>('water-speed').value),
                    detailStrength: Number(this.element<HTMLInputElement>('water-detail').value) * REFERENCE_WATER_DEFAULTS.detailStrength,
                });
            });
        }
    }

    private setLight(preset: string): void {
        if (preset === 'sunset') {
            this.scene.background = new Color('#b9bfba');
            this.water.setLighting({
                sunDirection: new Vector3(-0.7, 0.3, -0.4),
                sunColor: '#ffd7a2', skyColor: '#9aacbd', intensity: 0.85,
            });
        } else if (preset === 'overcast') {
            this.scene.background = new Color('#cbd5d7');
            this.water.setLighting({
                sunDirection: new Vector3(-0.4, 0.8, -0.5),
                sunColor: '#d7e6ea', skyColor: '#b7ccd3', intensity: 0.35,
            });
        } else {
            this.scene.background = new Color('#7398b3');
            this.water.setLighting({
                sunDirection: new Vector3(-0.6, 0.8, -0.4),
                sunColor: '#fff5db', skyColor: '#709bbb', intensity: 1,
            });
        }
        const uniforms = this.water.mesh.material.uniforms;
        this.sampleSun.color.copy(uniforms.uSunColor.value as Color);
        this.sampleSun.position.copy(uniforms.uSunDirection.value as Vector3).multiplyScalar(10);
        this.sampleSun.intensity = 2 * Number(uniforms.uLightIntensity.value);
        this.sampleSky.color.copy(uniforms.uSkyColor.value as Color);
        this.sampleSky.intensity = 0.7 + Number(uniforms.uLightIntensity.value) * 0.3;
    }

    private readonly resize = (): void => {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.zoom = Math.min(1, this.camera.aspect * 1.5);
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    };

    private render(): void {
        this.water.update(this.elapsed, this.camera);
        this.floatingSample.update(this.water, this.elapsed);
        this.renderer.render(this.scene, this.camera);
    }

    private getCadence() {
        const intervals = Array.from(this.frameIntervals.subarray(0, this.frameCount));
        intervals.sort((left, right) => left - right);
        const total = intervals.reduce((sum, value) => sum + value, 0);
        return {
            samples: intervals.length,
            fps: total > 0 ? intervals.length * 1000 / total : 0,
            p95FrameMs: intervals.length ? intervals[Math.floor((intervals.length - 1) * 0.95)] : 0,
        };
    }

    private updateLabels(): void {
        this.element<HTMLOutputElement>('time-value').value = `${this.elapsed.toFixed(1)} s`;
        this.element<HTMLInputElement>('water-time').value = String(this.elapsed % 60);
        const cadence = this.getCadence();
        this.element<HTMLOutputElement>('water-performance').value = cadence.samples >= 10
            ? `${cadence.fps.toFixed(0)} FPS · p95 ${cadence.p95FrameMs.toFixed(1)} ms · frame cadence`
            : 'Measuring frame cadence…';
        this.element<HTMLOutputElement>('water-metrics').value =
            `${this.water.getStats().quality} · ${this.renderer.info.render.calls} draws · ${this.renderer.info.render.triangles.toLocaleString('en')} triangles`;
    }

    private readonly tick = (timestamp: number): void => {
        if (this.destroyed) return;
        const interval = this.previousTime ? timestamp - this.previousTime : 0;
        const delta = Math.min(interval / 1000, 0.1);
        this.previousTime = timestamp;
        if (!document.hidden) {
            if (interval > 0) {
                this.frameIntervals[this.frameCursor] = interval;
                this.frameCursor = (this.frameCursor + 1) % this.frameIntervals.length;
                this.frameCount = Math.min(this.frameCount + 1, this.frameIntervals.length);
            }
            if (!this.paused) this.elapsed += delta;
            this.controls.update();
            this.render();
            if (timestamp - this.lastHudUpdate >= 250) {
                this.updateLabels();
                this.lastHudUpdate = timestamp;
            }
        }
        this.animationFrame = requestAnimationFrame(this.tick);
    };
}