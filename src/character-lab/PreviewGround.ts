import {GridHelper, Group, Material, Mesh, MeshStandardMaterial, PlaneGeometry} from 'three';
import './PreviewGround.css';

/** Shared ground, raster, playback phase and controls for the Character Lab previews. */
export class PreviewGround {
    readonly root = new Group();
    private grid = new Group();
    private major = new GridHelper(20, 20, '#97a38b', '#97a38b');
    private minor = new GridHelper(20, 80, '#b8c0ae', '#b8c0ae');
    private floor: Mesh<PlaneGeometry, MeshStandardMaterial>;
    private distance = 0;
    private pace = 0;
    private rate = 1;
    private paused = true;
    private enabled = true;
    private input?: HTMLInputElement;
    private output?: HTMLOutputElement;
    private shownSpeed = -1;
    private change = () => {
        this.enabled = this.input!.checked;
        this.report();
    };

    constructor(options: {color?: string; floorHeight?: number} = {}) {
        this.floor = new Mesh(new PlaneGeometry(20, 20), new MeshStandardMaterial({
            color: options.color ?? '#d3d7cc', roughness: 1,
            polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
        }));
        this.floor.rotation.x = -Math.PI / 2;
        this.floor.position.y = options.floorHeight ?? -.015;
        this.floor.receiveShadow = true;
        this.grid.position.y = -.001;
        this.grid.add(this.minor, this.major);
        this.root.add(this.floor, this.grid);
    }

    bindControls(container: HTMLElement, prefix = 'lab') {
        container.classList.add('preview-ground-controls');
        container.innerHTML = `<label class="preview-ground-toggle"><input id="${prefix}-moving-ground" type="checkbox" checked>Moving ground</label><output id="${prefix}-ground-pace" aria-label="Ground pace"></output>`;
        this.input = container.querySelector('input')!;
        this.output = container.querySelector('output')!;
        this.input.checked = this.enabled;
        this.input.addEventListener('change', this.change);
        this.report();
    }

    /** Pace is metres per source clip second; rate follows the animation playback rate. */
    setPlayback(pace: number, rate: number, paused: boolean) {
        this.pace = pace;
        this.rate = rate;
        this.paused = paused;
        this.report();
    }

    sample(distance: number) {
        this.distance = distance;
        // One-metre wrapping keeps the grid continuous across repeated animation loops.
        this.grid.position.z = -(distance % 1);
    }

    advance(delta: number) {
        this.sample(this.distance + Math.max(0, delta) * this.speed);
    }

    private get speed() {
        return this.enabled && !this.paused ? this.pace * this.rate : 0;
    }

    private report() {
        if (!this.output || this.speed === this.shownSpeed) return;
        this.shownSpeed = this.speed;
        this.output.textContent = 'Ground pace: ' + this.speed.toFixed(2) + ' m/s · 1 m grid';
    }

    dispose() {
        this.input?.removeEventListener('change', this.change);
        this.floor.geometry.dispose();
        this.floor.material.dispose();
        for (const grid of [this.major, this.minor]) {
            grid.geometry.dispose();
            const materials = grid.material as Material | Material[];
            for (const material of Array.isArray(materials) ? materials : [materials]) {
                material.dispose();
            }
        }
    }
}
