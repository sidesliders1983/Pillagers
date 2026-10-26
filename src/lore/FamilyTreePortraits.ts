import type { FamilyNode } from './FamilyTree';

export type FamilyPortraitSource = (id: string, signal: AbortSignal) => Promise<string | undefined>;
const signature = (node: FamilyNode) => JSON.stringify([node.age, node.occupation, node.status]);
interface Thumbnail {
    signature: string;
    abort: AbortController;
    image?: string;
}

/** Visible thumbnails borrow the Character Card's bounded serial cache and scene.
 * This surface owns neither a renderer nor a model, and never queues an entire clan.
 */
export class FamilyTreePortraits {
    private records = new Map<string, Thumbnail>();
    private observer?: IntersectionObserver;
    private active = false;
    private epoch = -1;

    constructor(private root: HTMLElement, private currentEpoch: () => number,
        private source?: FamilyPortraitSource) {}

    image(node: FamilyNode) {
        const record = this.records.get(node.id);
        return record?.signature === signature(node) ? record.image : undefined;
    }

    update(nodes: FamilyNode[], epoch: number, active: boolean) {
        this.observer?.disconnect();
        this.active = active;
        const byId = new Map(nodes.map(node => [node.id, node]));
        for (const [id, record] of this.records) {
            if (!active || this.epoch !== epoch || !byId.has(id) ||
                record.signature !== signature(byId.get(id)!)) {
                record.abort.abort();
                this.records.delete(id);
                this.slot(id)?.querySelector('img')?.remove();
            }
        }
        this.epoch = epoch;
        if (!active || !this.source || epoch !== this.currentEpoch()) return;
        // No observer means a deliberate fallback, rather than rendering all off-screen people.
        if (typeof IntersectionObserver === 'undefined') return;
        const diagram = this.root.querySelector<HTMLElement>('.family-tree-diagram');
        const observer = new IntersectionObserver(entries => {
            if (!this.active || this.observer !== observer || epoch !== this.currentEpoch()) return;
            for (const entry of entries) {
                const card = entry.target as HTMLElement;
                const id = card.dataset.familyNode!;
                if (!entry.isIntersecting) {
                    this.records.get(id)?.abort.abort();
                    this.records.delete(id);
                    this.slot(id)?.querySelector('img')?.remove();
                    continue;
                }
                const node = byId.get(id);
                if (node && !this.records.has(id) && this.records.size < 24)
                    this.request(node, card, epoch);
            }
        }, { root: diagram, rootMargin: '48px 0px' });
        this.observer = observer;
        this.root.querySelectorAll('[data-family-node]').forEach(card => observer.observe(card));
    }

    private slot(id: string) {
        return this.root.querySelector<HTMLElement>('[id="family-node-' + encodeURIComponent(id) + '"]')?.querySelector('.family-card-avatar');
    }

    private request(node: FamilyNode, card: HTMLElement, epoch: number) {
        const record: Thumbnail = { signature: signature(node), abort: new AbortController() };
        this.records.set(node.id, record);
        void this.source!(node.id, record.abort.signal).then(image => {
            if (!image || !this.active || record.abort.signal.aborted || epoch !== this.currentEpoch() ||
                this.records.get(node.id) !== record || !card.isConnected) return;
            // The shared studio emits PNG data URLs; reject a broken/unexpected image source.
            if (!image.startsWith('data:image/png;')) return;
            record.image = image;
            const slot = card.querySelector('.family-card-avatar')!;
            const thumbnail = document.createElement('img');
            thumbnail.src = image;
            thumbnail.alt = '';
            thumbnail.width = thumbnail.height = 64;
            thumbnail.decoding = 'async';
            thumbnail.addEventListener('error', () => {
                record.image = undefined;
                thumbnail.remove();
            }, { once: true });
            slot.replaceChildren(...Array.from(slot.children).filter(child => child.tagName !== 'IMG'), thumbnail);
        }).catch(() => {
            // An unavailable/archived portrait keeps the named initials fallback.
        });
    }

    dispose() {
        this.update([], this.epoch, false);
        this.observer?.disconnect();
    }
}
