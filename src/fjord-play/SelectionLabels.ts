import { Camera, Vector3 } from 'three';
import { updateView } from '../gameplay-lab/updateView';
import type { SelectionMarker } from '../play/SelectionPresentation';

export type SelectionLabel = Pick<SelectionMarker, 'selectionKey' | 'role' | 'label'> & {
    anchor: number[];
    color: string;
};
type LabelBox = { left: number; top: number; width: number; height: number };
const overlaps = (a: LabelBox, b: LabelBox) => a.left < b.left + b.width + 6 &&
    b.left < a.left + a.width + 6 && a.top < b.top + b.height + 6 && b.top < a.top + a.height + 6;
const escape = (text: string) => text.replace(/[&<>"']/g, character =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]!));

/** Screen-space labels remain readable without changing canonical positions or picking. */
export class SelectionLabels {
    private items: { element: HTMLElement; line: SVGLineElement; anchor: Vector3 }[] = [];
    constructor(private labels: HTMLElement, private leaders: SVGSVGElement) {}

    sync(markers: readonly SelectionLabel[]) {
        updateView(this.labels, markers.map(marker => `<span data-view-key="${escape(marker.selectionKey)}"
            class="${marker.role === 'selected' ? 'selected' : 'related'}">${escape(marker.role[0].toUpperCase() + marker.role.slice(1))} · ${escape(marker.label)}</span>`).join(''));
        this.leaders.innerHTML = markers.map(marker => `<line stroke="${escape(marker.color)}"/>`).join('');
        this.items = Array.from(this.labels.children).map((element, index) => ({
            element: element as HTMLElement,
            line: this.leaders.children[index] as SVGLineElement,
            anchor: new Vector3().fromArray(markers[index].anchor)
        }));
    }

    update(camera: Camera, width: number, height: number) {
        const placed: LabelBox[] = [];
        for (const item of this.items) {
            const point = item.anchor.clone().project(camera);
            const visible = point.z >= -1 && point.z <= 1 && Math.abs(point.x) <= 1 && Math.abs(point.y) <= 1;
            item.element.hidden = !visible;
            item.line.style.display = 'none';
            if (!visible) continue;
            const x = (point.x + 1) / 2 * width, y = (1 - point.y) / 2 * height;
            const box: LabelBox = { width: item.element.offsetWidth, height: item.element.offsetHeight,
                left: 0, top: y - item.element.offsetHeight - 4 };
            box.left = Math.max(4, Math.min(width - box.width - 4, x - box.width / 2));
            let collisions = placed.filter(other => overlaps(box, other));
            while (collisions.length) {
                box.top = Math.min(...collisions.map(other => other.top)) - box.height - 8;
                collisions = placed.filter(other => overlaps(box, other));
            }
            if (box.top < 4) {
                box.top = y + 8;
                collisions = placed.filter(other => overlaps(box, other));
                while (collisions.length) {
                    box.top = Math.max(...collisions.map(other => other.top + other.height)) + 8;
                    collisions = placed.filter(other => overlaps(box, other));
                }
            }
            if (box.top + box.height > height - 4) {
                item.element.hidden = true;
                continue;
            }
            placed.push(box);
            item.element.style.transform = `translate(${box.left}px,${box.top}px)`;
            item.line.setAttribute('x1', String(x));
            item.line.setAttribute('y1', String(y));
            item.line.setAttribute('x2', String(box.left + box.width / 2));
            item.line.setAttribute('y2', String(box.top > y ? box.top : box.top + box.height));
            item.line.style.display = '';
        }
    }
}
