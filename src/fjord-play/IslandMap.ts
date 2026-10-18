import { PerspectiveCamera, Plane, Raycaster, Vector2, Vector3, type Object3D } from 'three';
import type { DiscoveryView } from '../simulation/ClanDiscovery';
import { terrainPreview, type TerrainPreviewSource } from '../world-generation/TerrainPreview';
import { intersectNavigationTerrain } from '../world/TerrainNavigation';
import { IslandMapProjection, mapPoint, expeditionMapDestinations, type MapMission } from './IslandMapProjection';
import { icon } from './FjordIcons';
import './island-map.css';

interface MapActions {
    focus(point: { x: number; z: number }): void;
    home(): void;
}

/** Cached 2D geography plus cheap SVG camera marks. It owns no simulation or WebGL renderer. */
export class IslandMap {
    private controls = document.createElement('div');
    private dialog = document.createElement('dialog');
    private canvas: HTMLCanvasElement;
    private toggle: HTMLButtonElement;
    private svg: SVGSVGElement;
    private status: HTMLElement;
    private abort = new AbortController();
    private source?: TerrainPreviewSource;
    private model?: IslandMapProjection;
    private surface?: Object3D;
    private home = { x: 0, z: 0 };
    private cursor = { x: .5, y: .5 };
    private lastUpdate = -Infinity;
    private cameraSignature = '';
    private destinations: ReturnType<typeof expeditionMapDestinations> = [];
    private ray = new Raycaster();
    private hit = new Vector3();
    private plane = new Plane();
    private metrics = { baseBuilds: 0, baseMs: 0, maskUpdates: 0, maskMs: 0,
        cameraUpdates: 0, maximumCameraMs: 0, rasterBytes: 0 };

    constructor(private root: HTMLElement, private actions: MapActions) {
        this.controls.id = 'fjord-map-controls';
        this.controls.innerHTML = `<button id="fjord-map-toggle" type="button" aria-label="Show island map" title="Map" aria-controls="fjord-island-map" aria-expanded="false">${icon('map')}</button>
            <button id="fjord-map-home" type="button" aria-label="Return camera home" title="Return camera home">${icon('home')}</button>`;
        this.dialog.id = 'fjord-island-map';
        this.dialog.setAttribute('aria-labelledby', 'fjord-map-heading');
        this.dialog.innerHTML = `<div class="fjord-map-heading"><h2 id="fjord-map-heading">Island map</h2>
            <button type="button" data-map-home aria-label="Return camera home" title="Return camera home">${icon('home')}</button>
            <button type="button" data-map-close aria-label="Close island map" title="Close map">${icon('close')}</button></div>
            <div class="fjord-map-image"><canvas id="fjord-map-canvas" tabindex="0" aria-label="Island map. Use arrow keys to choose a point, Enter to focus the camera, or Home to return to the settlement."></canvas>
            <svg viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden="true"></svg><span class="fjord-map-north">N ↑</span></div>
            <p class="fjord-map-legend"><span>◇ Home</span><span>● Camera focus</span><span>⚑ Group destinations</span><span>Dim: unexplored</span></p>
            <p data-map-status role="status">Choose explored ground to move the camera.</p>`;
        this.root.append(this.controls, this.dialog);
        this.canvas = this.dialog.querySelector('canvas')!;
        this.svg = this.dialog.querySelector('.fjord-map-image > svg')!;
        this.status = this.dialog.querySelector('[data-map-status]')!;
        this.toggle = this.controls.querySelector('#fjord-map-toggle')!;
        const options = { signal: this.abort.signal };
        this.toggle.addEventListener('click', () => this.dialog.open ? this.close() : this.open(), options);
        this.controls.querySelector('#fjord-map-home')!.addEventListener('click', () => this.actions.home(), options);
        this.dialog.querySelector('[data-map-close]')!.addEventListener('click', () => this.close(), options);
        this.dialog.querySelector('[data-map-home]')!.addEventListener('click', () => this.actions.home(), options);
        this.dialog.addEventListener('close', () => {
            this.toggle.setAttribute('aria-expanded', 'false');
            this.toggle.setAttribute('aria-label', 'Show island map');
            this.toggle.focus({ preventScroll: true });
        }, options);
        this.dialog.addEventListener('keydown', event => {
            event.stopPropagation();
            if (event.key === 'Escape') { event.preventDefault(); this.close(); }
        }, options);
        this.controls.addEventListener('keydown', event => event.stopPropagation(), options);
        this.canvas.addEventListener('click', event => {
            const rect = this.canvas.getBoundingClientRect();
            this.choose({ x: (event.clientX - rect.left) / rect.width, y: (event.clientY - rect.top) / rect.height });
        }, options);
        this.canvas.addEventListener('keydown', event => {
            const arrows: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
            if (arrows[event.key]) {
                event.preventDefault();
                const [x, y] = arrows[event.key];
                this.cursor = { x: Math.max(0, Math.min(.999, this.cursor.x + x / 32)),
                    y: Math.max(0, Math.min(.999, this.cursor.y + y / 32)) };
                this.cameraSignature = '';
            } else if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault(); this.choose(this.cursor);
            } else if (event.key === 'Home') {
                event.preventDefault(); this.actions.home();
            }
        }, options);
        document.addEventListener('fjord-layout-change', () => { if (this.dialog.open) this.close(); }, options);
    }
    private open() {
        if (!this.model) return;
        if (this.root.classList.contains('fjord-mobile')) this.dialog.showModal();
        else this.dialog.show();
        this.toggle.setAttribute('aria-expanded', 'true');
        this.toggle.setAttribute('aria-label', 'Hide island map');
        this.cameraSignature = '';
    }
    private close() { this.dialog.close(); }
    private choose(point: { x: number; y: number }) {
        const destination = this.model?.destination(point);
        if (!destination) { this.status.textContent = 'That area has not been explored.'; return; }
        this.cursor = point;
        this.actions.focus(destination);
        this.status.textContent = 'Camera moved. Expedition orders are unchanged.';
        this.cameraSignature = '';
    }
    setWorld(source: TerrainPreviewSource, home: { x: number; z: number }, knowledge?: DiscoveryView, surface?: Object3D) {
        this.home = { x: home.x, z: home.z };
        this.surface = surface;
        if (source === this.source) { this.setKnowledge(knowledge); return; }
        const started = performance.now();
        this.source = source;
        this.model = new IslandMapProjection(terrainPreview(source), knowledge);
        this.metrics.baseBuilds++;
        this.metrics.baseMs = performance.now() - started;
        this.metrics.rasterBytes = this.model.bytes;
        this.canvas.width = this.model.preview.columns;
        this.canvas.height = this.model.preview.rows;
        this.dialog.style.setProperty('--island-map-aspect', String(this.model.aspect));
        this.cursor = mapPoint(source.terrain.bounds, this.home);
        this.paint();
    }
    setKnowledge(knowledge?: DiscoveryView) {
        const started = performance.now();
        if (!this.model?.setKnowledge(knowledge)) return;
        this.metrics.maskUpdates++;
        this.metrics.maskMs = performance.now() - started;
        this.paint();
    }
    setExpeditions(missions: readonly MapMission[]) {
        const destinations = expeditionMapDestinations(missions, this.home);
        if (JSON.stringify(destinations) === JSON.stringify(this.destinations)) return;
        this.destinations = destinations;
        this.cameraSignature = '';
    }
    private paint() {
        this.canvas.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(this.model!.pixels),
            this.canvas.width, this.canvas.height), 0, 0);
        this.cameraSignature = '';
    }
    update(camera: PerspectiveCamera, focus: Vector3, now: number) {
        if (!this.dialog.open || !this.model || now - this.lastUpdate < 100) return;
        this.lastUpdate = now;
        const signature = JSON.stringify([camera.matrixWorld.elements, camera.projectionMatrix.elements, focus.toArray(), this.cursor]);
        if (signature === this.cameraSignature) return;
        const started = performance.now();
        this.cameraSignature = signature;
        const bounds = this.model.preview.bounds;
        const mapped = (point: { x: number; z: number }) => {
            const p = mapPoint(bounds, point); return `${p.x * 1000},${p.y * 1000}`;
        };
        this.plane.set(new Vector3(0, 1, 0), -focus.y);
        const footprint = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, y]) => {
            this.ray.setFromCamera(new Vector2(x, y), camera);
            const terrainHit = this.surface ? intersectNavigationTerrain(this.surface, this.ray.ray, this.hit) : undefined;
            const point = terrainHit ?? this.ray.ray.intersectPlane(this.plane, this.hit) ??
                this.ray.ray.at(Math.max(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ) * 2, this.hit);
            return mapped(point);
        });
        this.svg.innerHTML = `<polygon points="${footprint.join(' ')}" class="fjord-map-view"/>
            <polyline points="${mapped(camera.position)} ${mapped(focus)}" class="fjord-map-direction"/>
            <g transform="translate(${mapped(this.home)})"><path d="M0,-22 22,0 0,22 -22,0Z" class="fjord-map-home"/></g>
            <g transform="translate(${mapped(camera.position)})"><circle r="10" class="fjord-map-eye"/></g>
            <g transform="translate(${mapped(focus)})"><circle r="15" class="fjord-map-focus"/></g>
            <g transform="translate(${this.cursor.x * 1000},${this.cursor.y * 1000})"><circle r="24" class="fjord-map-cursor"/></g>`;
        for (const destination of this.destinations) {
            const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            group.setAttribute('transform', `translate(${mapped(destination)})`);
            group.setAttribute('class', 'fjord-map-expedition');
            group.dataset.group = destination.groupId;
            const title = document.createElementNS(group.namespaceURI, 'title');
            title.textContent = destination.label + ' · ' + destination.status;
            const flag = document.createElementNS(group.namespaceURI, 'path');
            flag.setAttribute('d', 'M0,0V-65h53l-10,19 10,19H0');
            const label = document.createElementNS(group.namespaceURI, 'text');
            label.setAttribute('x', '12'); label.setAttribute('y', '-36');
            label.textContent = destination.groupId.replace(/^group-/, '');
            group.append(title, flag, label); this.svg.append(group);
        }
        this.metrics.cameraUpdates++;
        this.metrics.maximumCameraMs = Math.max(this.metrics.maximumCameraMs, performance.now() - started);
    }
    inspect() { return { ...this.metrics, open: this.dialog.open, cameraMaximumHz: 10,
        columns: this.model?.preview.columns, rows: this.model?.preview.rows,
        canvasBytes: this.canvas.width * this.canvas.height * 4 }; }
    dispose() {
        this.abort.abort(); this.dialog.close(); this.dialog.remove(); this.controls.remove();
        this.model = undefined; this.source = undefined; this.surface = undefined;
        this.canvas.width = this.canvas.height = 1;
    }
}
