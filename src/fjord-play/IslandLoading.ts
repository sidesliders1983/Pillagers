import { projectFjordCalendar } from './FjordCalendar';
import type { SettlementRestoreMetadata } from '../play/SharedSettlement';
import type { FoundingBookWindow } from '../lore/FoundingBookWindow';
import { browserGeneration } from '../world-generation/BrowserGeneration';
import { adoptCampaignIsland, islandRecipe } from './CampaignIsland';
import type { IslandRecipe } from './CampaignIsland';
import type { GenerationProgress } from '../world-generation/GenerationTask';
import type { TerrainPreview } from '../world-generation/TerrainPreview';
import type { RTSCameraController } from '../camera/RTSCameraController';
import type { WorldBlueprint } from '../world-generation/WorldBlueprint';
import './island-loading.css';

export const yieldForInput = () => new Promise<void>(resolve => setTimeout(resolve, 0));
export function generationLabel(stage: string) {
    if (stage.includes('terrain')) return 'Shaping coast & valleys';
    if (/zoning|nature/.test(stage)) return 'Ground & nature';
    if (/validation|freeze/.test(stage)) return 'Checking the island';
    return 'Choosing settlement areas';
}
type CameraPose = { position: number[]; target: number[] };

/** Disposable presentation of a new campaign. No Core commands or discovery mutations. */
export class IslandLoading {
    readonly signal: AbortSignal;
    readonly root = document.createElement('section');
    readonly evidence = { started: performance.now(), firstPreview: 0, previewBytes: 0, resultJsonBytes: null as number | null,
        samples: [] as { stage: string; milliseconds: number; startedAt?: number }[], arrived: 0 };
    private abort = new AbortController();
    private worker = browserGeneration();
    private canvas: HTMLCanvasElement;
    private map?: HTMLCanvasElement;
    private previousMap?: HTMLCanvasElement;
    private mapShownAt = 0;
    private finished = false;
    private frame = 0;
    private resultSentAt = 0;
    private skipped = false;
    private inertRoots = new Map<HTMLElement, boolean>();
    private previousFocus = document.activeElement as HTMLElement | null;
    private status: HTMLElement;
    private retry: HTMLButtonElement;
    private skip: HTMLButtonElement;
    constructor(private canReturnToGame = false, book?: FoundingBookWindow, private resume?: SettlementRestoreMetadata,
        private options: { backLabel?: string; recipe?: IslandRecipe; founding?: SettlementRestoreMetadata } = {}) {
        this.signal = this.abort.signal;
        this.root.id = 'island-loading';
        this.root.tabIndex = -1;
        this.root.setAttribute('role', 'dialog');
        this.root.setAttribute('aria-modal', 'true');
        this.root.setAttribute('aria-label', 'Preparing a new island campaign');
        this.root.innerHTML = `<canvas aria-label="Top-down preview of the generated island"></canvas>
            <div class="island-preview-space" aria-hidden="true"></div><div class="island-loading-copy"><p class="island-loading-eyebrow">FjordSide · a new shore</p>
            <h1 id="island-loading-status" role="status" aria-live="polite">Shaping coast &amp; valleys</h1>
            <p class="island-loading-help">Preparing your Summer landing. The campaign clock has not started.</p>
            <div class="island-loading-actions"><button type="button" id="island-loading-cancel" ${canReturnToGame ? '' : 'hidden'}>Cancel &amp; Return to Game</button>
            <button type="button" id="island-loading-retry" hidden>Retry generation</button>
            <button type="button" id="island-loading-skip" hidden>Skip camera arrival</button></div></div>`;
        this.root.dataset.mode = resume ? 'resume' : 'new';
        if (options.backLabel) this.root.querySelector('#island-loading-cancel')!.textContent = options.backLabel;
        if (options.founding) {
            const calendar = projectFjordCalendar(options.founding.time, options.founding.ticksPerWinter);
            this.root.querySelector('.island-loading-help')!.textContent =
                `Preparing your ${calendar.season} ${calendar.year} landing. The campaign clock has not started.`;
        }
        if (resume) {
            const calendar = projectFjordCalendar(resume.time, resume.ticksPerWinter);
            this.root.setAttribute('aria-label', 'Returning to your settlement');
            this.root.querySelector('.island-loading-eyebrow')!.textContent = 'FjordSide · saved campaign';
            this.root.querySelector('#island-loading-status')!.textContent = 'Returning to your settlement…';
            this.root.querySelector('.island-loading-help')!.textContent =
                calendar.season + ' ' + calendar.year + ' · campaign ' + resume.seed + '. The clock is paused.';
            this.root.querySelector('#island-loading-retry')!.textContent = 'Retry restoration';
        }
        if (book) {
            this.root.classList.add('island-has-book');
            this.root.append(book.root);
        }
        this.canvas = this.root.querySelector('canvas')!;
        this.status = this.root.querySelector('#island-loading-status')!;
        this.retry = this.root.querySelector('#island-loading-retry')!;
        this.skip = this.root.querySelector('#island-loading-skip')!;
        this.root.querySelector('#island-loading-cancel')!.addEventListener('click', () => this.cancel());
        this.skip.addEventListener('click', () => { this.skipped = true; });
        this.root.addEventListener('keydown', event => {
            if (event.key === 'Escape' && this.canReturnToGame) this.cancel();
            if (event.key !== 'Tab') return;
            const buttons = Array.from(this.root.querySelectorAll<HTMLElement>('button, [tabindex="0"]'))
                .filter(element => !element.hidden && element.getClientRects().length > 0);
            if (!buttons.length) { event.preventDefault(); this.root.focus(); return; }
            const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
            event.preventDefault();
            buttons[(index + (event.shiftKey ? buttons.length - 1 : 1)) % buttons.length].focus();
        });
        this.mount();
        this.frame = requestAnimationFrame(this.draw);
        window.addEventListener('pagehide', this.cancel, { once: true });
    }
    mount() {
        document.body.append(this.root);
        document.body.classList.add('island-preparing');
        for (const child of Array.from(document.body.children)) if (child instanceof HTMLElement && child !== this.root) {
            if (!this.inertRoots.has(child)) this.inertRoots.set(child, child.inert);
            child.inert = true;
        }
        (this.root.querySelector<HTMLButtonElement>('button:not([hidden])') ?? this.root).focus();
    }
    cancel = () => { this.abort.abort(); this.worker.cancel(); };
    fail(error: Error) { this.abort.abort(error); this.worker.cancel(); }
    check() { this.signal.throwIfAborted(); }
    stage(label: string) {
        this.check();
        if (this.resume) this.root.querySelector('.island-loading-eyebrow')!.textContent = 'FjordSide · ' + label;
        else if (this.status.textContent !== label) this.status.textContent = label;
        this.root.dataset.stage = label;
    }
    async measure<T>(stage: string, operation: () => T | Promise<T>,
        options: { timeoutMs?: number } = {}): Promise<T> {
        this.check();
        await yieldForInput();
        this.check();
        const start = performance.now();
        // Resource-building operations must drain before their owner disposes
        // sources. Only explicitly bounded, result-free GPU waits may detach.
        if (options.timeoutMs === undefined) {
            try { return await operation(); }
            finally {
                this.evidence.samples.push({ stage, startedAt: start, milliseconds: performance.now() - start });
            }
        }
        let aborted: () => void;
        const cancelled = new Promise<never>((_, reject) => {
            aborted = () => reject(this.signal.reason);
            this.signal.addEventListener('abort', aborted, { once: true });
        });
        const timeout = setTimeout(() => {
            this.fail(new Error('Preparing graphics took too long. Please retry loading the campaign.'));
        }, options.timeoutMs);
        try {
            // The browser's GPU compiler cannot be aborted. Stop waiting for it;
            // the scene owner disposes stale resources and ignores late results.
            return await Promise.race([Promise.resolve().then(operation), cancelled]);
        }
        finally {
            clearTimeout(timeout);
            this.signal.removeEventListener('abort', aborted!);
            this.evidence.samples.push({ stage, startedAt: start, milliseconds: performance.now() - start });
        }
    }
    private progress = (event: GenerationProgress) => {
        if (this.signal.aborted) return;
        if (event.type === 'phase') this.stage(this.resume ? 'Restoring saved geography' : generationLabel(event.stage));
        if (event.type === 'timing') this.evidence.samples.push({ stage: event.stage, milliseconds: event.milliseconds });
        if (event.type === 'preview' && !this.resume) this.setPreview(event.preview);
        if (event.type === 'transport') {
            this.evidence.resultJsonBytes = event.jsonBytes;
            this.evidence.samples.push({ stage: 'worker-serialization', milliseconds: event.serializationMs });
            this.resultSentAt = event.sentAt;
        }
    };
    async prepare(seed: number) {
        for (;;) {
            this.check();
            this.retry.hidden = true;
            this.stage(this.resume ? 'Restoring saved terrain' : 'Shaping coast & valleys');
            try {
                const recipe = this.options.recipe ?? this.resume?.island ?? islandRecipe(seed);
                const result = await this.worker.generate({ kind: 'campaign', seed, recipe,
                    profile: new URLSearchParams(location.search).has('profileLoading') }, this.progress);
                this.check();
                if (this.resultSentAt) this.evidence.samples.push({ stage: 'worker-result-transfer',
                    milliseconds: performance.timeOrigin + performance.now() - this.resultSentAt });
                await this.measure('receive-and-freeze', () => adoptCampaignIsland(seed, result.world, result.plan!, recipe));
                this.stage('Preparing FjordSide');
                return;
            } catch (error) {
                this.check();
                this.status.textContent = (this.resume ? 'Could not restore the settlement. ' : 'Could not prepare the island. ') + (error instanceof Error ? error.message : String(error));
                this.retry.hidden = false;
                this.retry.focus();
                await new Promise<void>((resolve, reject) => {
                    const done = () => { cleanup(); resolve(); };
                    const aborted = () => { cleanup(); reject(this.signal.reason); };
                    const cleanup = () => {
                        this.retry.removeEventListener('click', done);
                        this.signal.removeEventListener('abort', aborted);
                    };
                    this.retry.addEventListener('click', done, { once: true });
                    this.signal.addEventListener('abort', aborted, { once: true });
                });
            }
        }
    }
    private setPreview(preview: TerrainPreview) {
        if (!this.evidence.firstPreview) this.evidence.firstPreview = performance.now();
        this.evidence.previewBytes += preview.heights.byteLength + preview.ground.byteLength;
        const map = document.createElement('canvas');
        map.width = preview.columns; map.height = preview.rows;
        const context = map.getContext('2d')!;
        const pixels = context.createImageData(map.width, map.height);
        const palette = [[40, 83, 96], [101, 132, 87], [194, 175, 126], [104, 98, 76], [130, 141, 143]];
        for (let i = 0; i < preview.heights.length; i++) {
            if (preview.heights[i] <= preview.waterLevel) continue;
            const left = preview.heights[Math.max(0, i - 1)], up = preview.heights[Math.max(0, i - map.width)];
            const shade = Math.max(.55, Math.min(1.2, .92 + (left + up - preview.heights[i] * 2) * .035));
            const color = palette[preview.ground[i]] ?? palette[1];
            pixels.data.set([color[0] * shade, color[1] * shade, color[2] * shade, 255], i * 4);
        }
        context.putImageData(pixels, 0, 0);
        this.previousMap = this.map;
        this.map = map;
        this.mapShownAt = performance.now();
        this.root.dataset.preview = String(preview.heights.length);
    }
    private draw = (time: number) => {
        const width = Math.max(1, innerWidth), height = Math.max(1, innerHeight);
        if (this.canvas.width !== width || this.canvas.height !== height) {
            this.canvas.width = width; this.canvas.height = height;
        }
        const ctx = this.canvas.getContext('2d')!;
        ctx.fillStyle = '#163b48'; ctx.fillRect(0, 0, width, height);
        const glow = ctx.createRadialGradient(width * .5, height * .4, 0, width * .5, height * .4, Math.max(width, height) * .65);
        glow.addColorStop(0, '#346371'); glow.addColorStop(1, '#102c36');
        ctx.fillStyle = glow; ctx.fillRect(0, 0, width, height);
        if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
            ctx.strokeStyle = '#a7c4ba18'; ctx.lineWidth = 1;
            for (let i = 0; i < 6; i++) {
                const radius = ((time * .008 + i * 100) % 650) + 50;
                ctx.beginPath(); ctx.ellipse(width * .5, height * .4, radius, radius * .65, 0, 0, Math.PI * 2); ctx.stroke();
            }
        }
        if (this.map) {
            const area = this.root.querySelector('.island-preview-space')!.getBoundingClientRect();
            const size = Math.min(area.width * .94, area.height * .94);
            ctx.imageSmoothingEnabled = true;
            const x = area.x + (area.width - size) / 2, y = area.y + (area.height - size) / 2;
            const fade = matchMedia('(prefers-reduced-motion: reduce)').matches ? 1 : Math.min(1, (time - this.mapShownAt) / 600);
            if (this.previousMap) ctx.drawImage(this.previousMap, x, y, size, size);
            ctx.globalAlpha = fade;
            ctx.drawImage(this.map, x, y, size, size);
            ctx.globalAlpha = 1;
            if (fade === 1) this.previousMap = undefined;
        }
        if (!this.resume) this.frame = requestAnimationFrame(this.draw);
    };
    async arrive(controller: RTSCameraController, world: WorldBlueprint, end: CameraPose,
        heightAt: (x: number, z: number) => number) {
        if (this.resume) return;
        this.stage('Arriving at your settlement');
        this.skip.hidden = false;
        this.root.classList.add('island-loading-arrival');
        const { camera } = controller;
        const bounds = world.terrain.bounds;
        const maxHeight = world.terrain.heights.reduce((a, b) => Math.max(a, b), 0);
        const altitude = Math.max(world.config.width / Math.max(.3, camera.aspect), world.config.depth) * 1.35 + maxHeight;
        const start = { position: [(bounds.minX + bounds.maxX) / 2, altitude, (bounds.minZ + bounds.maxZ) / 2 + .1],
            target: [(bounds.minX + bounds.maxX) / 2, 0, (bounds.minZ + bounds.maxZ) / 2] };
        const oldFar = camera.far;
        camera.far = Math.max(oldFar, altitude * 2); camera.updateProjectionMatrix();
        const offset = end.position.map((v, i) => v - end.target[i]);
        const endDistance = Math.hypot(...offset);
        const endYaw = Math.atan2(offset[0], offset[2]);
        const endElevation = Math.atan2(offset[1], Math.hypot(offset[0], offset[2]));
        controller.setView(start);
        let elapsed = 0, last = performance.now();
        try {
            while (elapsed < 2600 && !this.skipped && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
                this.check();
                const now = await new Promise<number>(resolve => requestAnimationFrame(resolve));
                if (!document.hidden) elapsed += Math.min(50, now - last);
                last = now;
                const t = Math.min(1, elapsed / 2600), blend = t * t * (3 - 2 * t);
                const lerp = (a: number[], b: number[]) => a.map((v, i) => v + (b[i] - v) * blend);
                const target = lerp(start.target, end.target);
                const distance = altitude + (endDistance - altitude) * blend;
                const elevation = Math.PI / 2 - .001 + (endElevation - Math.PI / 2 + .001) * blend;
                const yaw = endYaw * blend, horizontal = distance * Math.cos(elevation);
                const position = [target[0] + Math.sin(yaw) * horizontal,
                    target[1] + distance * Math.sin(elevation), target[2] + Math.cos(yaw) * horizontal];
                // Use the existing controller and canonical height query, never fly through a ridge.
                position[1] = Math.max(position[1], heightAt(position[0], position[2]) + 8);
                target[1] = Math.max(target[1], heightAt(target[0], target[2]));
                controller.setView({ position, target });
            }
            this.check();
            controller.setView(end);
            this.evidence.arrived = performance.now();
        } finally {
            camera.far = oldFar; camera.updateProjectionMatrix();
        }
    }
    finish() {
        if (this.finished) return;
        this.finished = true;
        document.body.classList.remove('island-preparing');
        this.worker.dispose();
        cancelAnimationFrame(this.frame);
        window.removeEventListener('pagehide', this.cancel);
        this.root.remove();
        for (const [element, inert] of this.inertRoots) element.inert = inert;
        this.previousFocus?.isConnected && this.previousFocus.focus();
        this.map = undefined;
    }
}
