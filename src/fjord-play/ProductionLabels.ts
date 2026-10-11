import { Camera, Vector3 } from 'three';
import type { ProductionOutput } from './FjordProduction';

type OutputLabel = ProductionOutput & { anchor?: number[]; started: number; element?: HTMLSpanElement };
const duration = 2800;
const concurrency = 6;

/** Exact pending awards survive the display limit. Only visual fading uses wall time. */
export class ProductionLabels {
    private pending = new Map<string, OutputLabel>();
    private active = new Map<string, OutputLabel>();
    private anchors = new Map<string, number[]>();
    private totals = new Map<string, ProductionOutput>();
    constructor(private root: HTMLElement) {}

    reset() {
        this.pending.clear();
        this.active.clear();
        this.anchors.clear();
        this.totals.clear();
        this.root.replaceChildren();
        this.root.dataset.totals = '[]';
    }

    setAnchors(entries: { id: string; kind: string; bounds: { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } } }[]) {
        this.anchors.clear();
        for (const entry of entries) {
            if (entry.kind !== 'persona' && entry.kind !== 'cattle') continue;
            const { min, max } = entry.bounds;
            this.anchors.set(entry.kind + ':' + entry.id, [(min.x + max.x) / 2, max.y + .6, (min.z + max.z) / 2]);
        }
    }

    enqueue(outputs: readonly ProductionOutput[]) {
        for (const output of outputs) {
            const producer = output.kind + ':' + output.id;
            const key = producer + ':' + output.resource;
            const total = this.totals.get(key) ?? { ...output, units: 0 };
            total.units += output.units;
            this.totals.set(key, total);
            const existing = this.active.get(key) ?? this.pending.get(key);
            if (existing) {
                existing.units += output.units;
                existing.started = performance.now();
                if (existing.element) this.text(existing);
            } else {
                this.pending.set(key, { ...output, anchor: this.anchors.get(producer), started: 0 });
            }
        }
        this.root.dataset.totals = JSON.stringify([...this.totals.values()]);
    }

    private text(item: OutputLabel) {
        const element = item.element!;
        element.textContent = '+' + item.units + (item.resource === 'food' ? ' Food' : ' Materials');
        element.dataset.units = String(item.units);
    }

    update(camera: Camera, width: number, height: number) {
        const now = performance.now();
        for (const [key, item] of this.active) {
            if (now - item.started >= duration) {
                item.element!.remove();
                this.active.delete(key);
            }
        }
        for (const [key, item] of this.pending) {
            if (this.active.size >= concurrency) break;
            this.pending.delete(key);
            const element = document.createElement('span');
            element.className = item.resource;
            element.dataset.producerKind = item.kind;
            element.dataset.producerId = item.id;
            if (item.kind === 'persona') element.dataset.personaId = item.id;
            else element.dataset.cattleId = item.id;
            element.dataset.resource = item.resource;
            element.dataset.anchor = item.anchor ? 'world' : 'historical-producer';
            item.element = element;
            item.started = now;
            this.text(item);
            this.root.append(element);
            this.active.set(key, item);
        }
        const occupied: { x: number; y: number; width: number; height: number }[] = [];
        for (const item of this.active.values()) {
            const element = item.element!;
            const anchor = this.anchors.get(item.kind + ':' + item.id) ?? item.anchor;
            const point = anchor ? new Vector3().fromArray(anchor).project(camera) : undefined;
            element.hidden = Boolean(point && (point.z < -1 || point.z > 1 || Math.abs(point.x) > 1 || Math.abs(point.y) > 1));
            if (element.hidden) continue;
            const age = (now - item.started) / duration;
            const box = { x: point ? (point.x + 1) / 2 * width - element.offsetWidth / 2 : 8,
                y: point ? (1 - point.y) / 2 * height - 25 - age * 36 : height - 55,
                width: element.offsetWidth, height: element.offsetHeight };
            box.x = Math.max(4, Math.min(width - box.width - 4, box.x));
            const collisions = () => occupied.filter(other => box.x < other.x + other.width + 5 &&
                other.x < box.x + box.width + 5 && box.y < other.y + other.height + 5 && other.y < box.y + box.height + 5);
            let hits = collisions();
            while (hits.length) {
                box.y = Math.min(...hits.map(hit => hit.y)) - box.height - 6;
                hits = collisions();
            }
            box.y = Math.max(4, box.y);
            occupied.push(box);
            element.style.transform = 'translate(' + box.x + 'px,' + box.y + 'px)';
            element.style.opacity = String(1 - age);
        }
        this.root.dataset.pending = String(this.pending.size);
    }
}
