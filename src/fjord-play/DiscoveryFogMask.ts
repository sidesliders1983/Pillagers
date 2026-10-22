import type { DiscoveryView } from '../simulation/ClanDiscovery';

/** Persistent raster: one cell owns 4×4 texels; only edge feathering reads its neighbours. */
export class DiscoveryFogMask {
    readonly width: number;
    readonly height: number;
    readonly pixels: Uint8Array;
    readonly fadeSeconds = .8;
    private view: DiscoveryView;
    private states: Uint8Array;
    private target: Uint8Array;
    private start: Uint8Array;
    private marked: Uint8Array;
    private fading = new Set<number>();
    private elapsed = 0;
    private exploredCells = 0;
    private visibleCells = 0;
    private metrics = { maskBuilds: 1, maskUpdates: 0, rasterizedCells: 0, lastRasterizedCells: 0 };

    constructor(view: DiscoveryView) {
        // Keep our comparison baseline even for mutable developer/legacy inputs.
        this.view = { ...view, grid: { ...view.grid, bounds: { ...view.grid.bounds } } };
        this.width = view.grid.columns * 4 + 2;
        this.height = view.grid.rows * 4 + 2;
        const size = this.width * this.height;
        this.pixels = new Uint8Array(size * 4).fill(255);
        this.target = new Uint8Array(size).fill(255);
        this.start = new Uint8Array(size);
        this.marked = new Uint8Array(view.grid.columns * view.grid.rows);
        this.states = this.decode(view);
        for (let cell = 0; cell < this.states.length; cell++) this.rasterize(cell, true);
        this.metrics.lastRasterizedCells = this.states.length;
    }

    private decode(view: DiscoveryView) {
        const states = new Uint8Array(view.grid.columns * view.grid.rows);
        this.exploredCells = this.visibleCells = 0;
        for (let offset = 0; offset < view.explored.length; offset += 2) {
            const explored = parseInt(view.explored.slice(offset, offset + 2), 16);
            const visible = parseInt(view.visible.slice(offset, offset + 2), 16);
            for (let bit = 0; bit < 8; bit++) {
                const cell = offset * 4 + bit;
                if (cell >= states.length) break;
                const value = visible & (1 << bit) ? 2 : explored & (1 << bit) ? 1 : 0;
                states[cell] = value;
                if (value) this.exploredCells++;
                if (value === 2) this.visibleCells++;
            }
        }
        return states;
    }

    private stateAt(col: number, row: number) {
        const { grid, cellSize } = this.view;
        if (col < 0 || row < 0 || col >= grid.columns || row >= grid.rows ||
            grid.bounds.minX + (col + .5) * cellSize >= grid.bounds.maxX ||
            grid.bounds.minZ + (row + .5) * cellSize >= grid.bounds.maxZ) return 0;
        return this.states[row * grid.columns + col];
    }

    private alpha(col: number, row: number, px: number, pz: number) {
        const { grid, cellSize } = this.view;
        const x = grid.bounds.minX + (px - .5) * cellSize / 4;
        const z = grid.bounds.minZ + (pz - .5) * cellSize / 4;
        const known = this.states[row * grid.columns + col];
        if (!known || x >= grid.bounds.maxX || z >= grid.bounds.maxZ) return 255;
        let distance = cellSize;
        for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
            if (this.stateAt(col + dx, row + dz)) continue;
            const minX = grid.bounds.minX + (col + dx) * cellSize;
            const minZ = grid.bounds.minZ + (row + dz) * cellSize;
            distance = Math.min(distance, Math.hypot(
                Math.max(minX - x, x - minX - cellSize, 0),
                Math.max(minZ - z, z - minZ - cellSize, 0)));
        }
        // Match the original inside-only feather and mapped-ground opacity.
        return Math.max(known === 1 ? 55 : 0,
            Math.round(255 * Math.max(0, Math.min(1, 1 - (distance - 1) / (cellSize - 1)))));
    }

    private paint(pixel: number, alpha: number) {
        const offset = pixel * 4;
        this.pixels[offset] = this.pixels[offset + 1] = this.pixels[offset + 2] = alpha;
    }

    private rasterize(cell: number, initial = false) {
        const col = cell % this.view.grid.columns;
        const row = Math.floor(cell / this.view.grid.columns);
        let changed = 0;
        for (let z = 1 + row * 4; z < 5 + row * 4; z++) {
            for (let x = 1 + col * 4; x < 5 + col * 4; x++) {
                const pixel = z * this.width + x;
                const alpha = this.alpha(col, row, x, z);
                if (!initial && alpha === this.target[pixel]) continue;
                changed++;
                this.target[pixel] = alpha;
                // Conceal immediately. Unknown information must never leak during a fade.
                if (initial || alpha >= this.pixels[pixel * 4]) {
                    this.paint(pixel, alpha);
                    this.fading.delete(pixel);
                } else this.fading.add(pixel);
            }
        }
        this.metrics.rasterizedCells++;
        return changed;
    }

    setKnowledge(view: DiscoveryView): boolean {
        const before = this.view;
        if (view.worldId !== before.worldId || view.cellSize !== before.cellSize ||
            view.grid.columns !== before.grid.columns || view.grid.rows !== before.grid.rows ||
            (['minX', 'maxX', 'minZ', 'maxZ'] as const).some(key =>
                view.grid.bounds[key] !== before.grid.bounds[key]))
            throw new Error('Fog belongs to a different world or discovery grid.');
        if (view.explored === before.explored && view.visible === before.visible) return false;
        const next = this.decode(view);
        const dirty: number[] = [];
        const { columns, rows } = view.grid;
        for (let cell = 0; cell < next.length; cell++) {
            if (next[cell] === this.states[cell]) continue;
            const col = cell % columns, row = Math.floor(cell / columns);
            for (let z = Math.max(0, row - 1); z <= Math.min(rows - 1, row + 1); z++) {
                for (let x = Math.max(0, col - 1); x <= Math.min(columns - 1, col + 1); x++) {
                    const neighbour = z * columns + x;
                    if (!this.marked[neighbour]) {
                        this.marked[neighbour] = 1;
                        dirty.push(neighbour);
                    }
                }
            }
        }
        this.states = next;
        this.view = { ...view, grid: before.grid };
        let changed = 0;
        for (const cell of dirty) {
            changed += this.rasterize(cell);
            this.marked[cell] = 0;
        }
        this.metrics.lastRasterizedCells = dirty.length;
        if (!changed) return false;
        this.metrics.maskUpdates++;
        // Interrupted reveals start at their displayed alpha, without stacking masks.
        for (const pixel of this.fading) this.start[pixel] = this.pixels[pixel * 4];
        this.elapsed = 0;
        return true;
    }

    update(delta: number): boolean {
        if (!this.fading.size || !Number.isFinite(delta) || delta <= 0) return false;
        this.elapsed = Math.min(this.fadeSeconds, this.elapsed + delta);
        const progress = this.elapsed / this.fadeSeconds;
        let changed = false;
        for (const pixel of this.fading) {
            const alpha = Math.round(this.start[pixel] + (this.target[pixel] - this.start[pixel]) * progress);
            if (alpha !== this.pixels[pixel * 4]) {
                this.paint(pixel, alpha);
                changed = true;
            }
            if (progress === 1) this.fading.delete(pixel);
        }
        return changed;
    }

    inspect() {
        return { ...this.metrics, exploredCells: this.exploredCells, visibleCells: this.visibleCells,
            unknownCells: this.states.length - this.exploredCells, transitioning: this.fading.size > 0,
            fadingPixels: this.fading.size, fadeSeconds: this.fadeSeconds };
    }
}
