import type { SharedSettlement, SettlementSelection } from '../play/SharedSettlement';
import type { FamilyTree, FamilyNode, FamilyRelation } from './FamilyTree';
import { PersonalHistoryView } from './PersonalHistoryView';
import { FamilyTreePortraits, type FamilyPortraitSource } from './FamilyTreePortraits';
import { familyCard, layoutFamilyTree, type FamilyLayout } from './FamilyTreeLayout';
import { updateView } from '../gameplay-lab/updateView';
import { ordinal } from './NarrativeTime';
import './family-tree.css';

const escape = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[char]!));

/** The shared book's factual genealogy, with lightweight HTML cards and SVG links. */
export class FamilyTreeView {
    private selectedId: string | null = null;
    private epoch = -1;
    private renderedRevision = -1;
    private origin = 800;
    private data: FamilyTree | null = null;
    private layout?: FamilyLayout;
    private active = false;
    private viewport?: { left: number; top: number };
    private history: PersonalHistoryView;
    private portraits: FamilyTreePortraits;
    private drag?: { id: number; x: number; y: number; left: number; top: number };

    constructor(private root: HTMLElement, private owner: SharedSettlement, portrait?: FamilyPortraitSource) {
        this.history = new PersonalHistoryView(root, owner, () => this.selection, 'family-tree');
        this.portraits = new FamilyTreePortraits(root, () => owner.session.personalHistoryEpoch, portrait);
        root.addEventListener('click', this.click);
        root.addEventListener('pointerdown', this.pointerDown);
        root.addEventListener('pointermove', this.pointerMove);
        root.addEventListener('pointerup', this.pointerUp);
        root.addEventListener('pointercancel', this.pointerUp);
    }

    get selection(): SettlementSelection {
        return this.selectedId ? { kind: 'persona', id: this.selectedId } : null;
    }

    setVisible(visible: boolean) {
        if (this.active === visible) return;
        const diagram = this.root.querySelector<HTMLElement>('.family-tree-diagram');
        if (!visible && diagram) this.viewport = { left: diagram.scrollLeft, top: diagram.scrollTop };
        this.active = visible;
        this.portraits.update(this.data?.nodes ?? [], this.epoch, visible);
        if (visible && diagram && this.viewport && this.epoch === this.owner.session.personalHistoryEpoch) {
            diagram.scrollLeft = this.viewport.left;
            diagram.scrollTop = this.viewport.top;
        }
    }

    openPersona(id: string) {
        this.update();
        if (!this.data?.nodes.some(node => node.id === id)) return false;
        this.selectedId = id;
        this.update(true);
        this.focusPersona(id);
        return true;
    }

    update(force = false): void {
        const epoch = this.owner.session.personalHistoryEpoch;
        const reset = this.epoch !== epoch;
        if (reset) {
            this.selectedId = null;
            this.epoch = epoch;
            this.renderedRevision = -1;
            this.layout = undefined;
            this.viewport = undefined;
            this.portraits.update([], epoch, false);
        }
        const data = this.owner.session.familyTree();
        if (!force && this.renderedRevision === data.revision) {
            this.history.refresh();
            return;
        }
        this.data = data;
        this.origin = this.owner.session.book.snapshot().originWinter;
        if (!data.nodes.some(node => node.id === this.selectedId)) this.selectedId = null;
        this.layout = layoutFamilyTree(data, this.layout?.points);
        const { points, width, height, generations, newest } = this.layout;
        const related = new Set(this.selectedId ? [this.selectedId] : []);
        for (const edge of data.edges) {
            if (edge.from === this.selectedId || edge.to === this.selectedId) {
                related.add(edge.from);
                related.add(edge.to);
            }
        }
        const connectors = data.edges.map(edge => {
            const from = points.get(edge.from), to = points.get(edge.to);
            if (!from || !to) return '';
            const parent = edge.kind === 'parent';
            const y1 = from.y + familyCard.height / 2, y2 = to.y + familyCard.height / 2;
            const x1 = from.x + familyCard.width, x2 = to.x;
            let path: string;
            if (parent && to.generation === from.generation + 1) {
                const middle = (x1 + x2) / 2;
                path = 'M ' + x1 + ' ' + y1 + ' C ' + middle + ' ' + y1 + ' ' + middle + ' ' + y2 + ' ' + x2 + ' ' + y2;
            } else if (parent) {
                // Deep-parent links cross the header gutter, never an intervening person's card.
                path = 'M ' + x1 + ' ' + y1 + ' H ' + (x1 + 26) + ' V 58 H ' + (x2 - 26) + ' V ' + y2 + ' H ' + x2;
            } else if (from.generation === to.generation) {
                path = 'M ' + from.x + ' ' + y1 + ' H ' + (from.x - 18) + ' V ' + y2 + ' H ' + to.x;
            } else {
                path = 'M ' + from.x + ' ' + y1 + ' H ' + (from.x - 18) + ' V 64 H ' + (to.x - 18) + ' V ' + y2 + ' H ' + to.x;
            }
            const selected = edge.from === this.selectedId || edge.to === this.selectedId;
            return '<path data-view-key="' + escape(edge.kind + JSON.stringify([edge.from, edge.to])) +
                '" class="family-edge ' + edge.kind + '"' + (selected ? ' data-selected="true"' : '') +
                ' d="' + path + '"><title>' + escape(parent ? 'Recorded parent–child link' : edge.status) + '</title></path>';
        }).join('');
        const columns = generations.map(generation => {
            const familyRoots = generation === 0 && data.nodes.some(node => node.row === 0 && !node.founder);
            const title = generation === 0 ? (familyRoots ? 'Founders & family roots' : 'Founders') :
                'Generation ' + (generation + 1);
            const x = familyCard.inset + generation * (familyCard.width + familyCard.columnGap);
            return '<div class="family-generation" data-view-key="generation:' + generation + '" data-generation="' +
                generation + '"' + (generation === newest ? ' data-newest="true"' : '') +
                ' style="left:' + (x - 12) + 'px;width:' + (familyCard.width + 24) + 'px;height:' + height +
                'px"><h3 id="family-generation-' + generation + '">' +
                title +
                '<small>' + (generation === newest ? 'Newest recorded generation' : generation === 0 ?
                    (familyRoots ? 'Original residents & recorded roots' : 'The people who began your clan') : 'Recorded descendants & family roots') + '</small></h3></div>';
        }).join('');
        const cards = data.nodes.map(node => {
            const point = points.get(node.id)!;
            const image = this.portraits.image(node);
            const initials = node.name.trim().split(/\s+/).filter(Boolean).map(part => Array.from(part)[0])
                .filter(Boolean).filter((_, index, all) => index === 0 || index === all.length - 1).join('');
            const status = node.status === 'Present' ? 'Living' : node.status;
            return '<button type="button" id="family-node-' + encodeURIComponent(node.id) + '" data-family-node="' +
                escape(node.id) + '" data-founder="' + node.founder + '" data-generation="' + point.generation +
                '" data-row="' + node.row + '" data-view-key="person:' + escape(node.id) + '" data-epoch="' + epoch +
                '" data-status="' + escape(node.status) + '" aria-pressed="' + (node.id === this.selectedId) +
                '" aria-describedby="family-generation-' + point.generation + '"' +
                (related.has(node.id) ? ' data-related="true"' : '') +
                ' style="left:' + point.x + 'px;top:' + point.y + 'px">' +
                '<span class="family-card-avatar" aria-hidden="true"><span>' + escape(initials || '?') + '</span>' +
                (image ? '<img src="' + escape(image) + '" width="64" height="64" alt="">' : '') + '</span>' +
                '<span class="family-card-copy"><strong>' + escape(node.name) + '</strong><span class="family-card-work">' +
                escape(this.context(node)) + '</span><span class="family-card-age">' + this.age(node) +
                (node.status === 'Deceased' ? ' at death' : node.status.includes('last known') ? ' last known' : '') +
                '</span><small class="family-card-status">' + escape((node.founder ? 'Founder · ' : '') + status) +
                '</small>' + (node.branch === 'Independent family' ? '<small>Independent family</small>' : '') + '</span></button>';
        }).join('');
        const selected = data.nodes.find(node => node.id === this.selectedId);
        updateView(this.root,
            '<div class="family-tree-tools"><div class="family-tree-caption"><strong>Your clan, through generations</strong>' +
            '<span>Founders on the left. Follow their descendants to the right.</span></div>' +
            '<div class="family-tree-controls"><button type="button" data-family-reset>Reset view</button>' +
            '<button type="button" data-family-newest>Newest generation →</button></div></div>' +
            '<p class="family-tree-legend"><span>Solid: parent–child</span><span>Dashed: partnership</span>' +
            '<small>Scroll or drag the space between cards.</small></p>' +
            '<div id="family-tree-diagram" class="family-tree-diagram" tabindex="0" aria-label="Family generations. Scroll horizontally and vertically.">' +
            '<div class="family-tree-canvas" style="width:' + width + 'px;height:' + height + 'px">' + columns +
            '<svg width="' + width + '" height="' + height + '" aria-hidden="true">' + connectors + '</svg>' + cards +
            '</div></div><section id="family-person-details" data-epoch="' + epoch + '" aria-live="polite">' +
            (selected ? '<details class="family-profile"' + (window.matchMedia?.('(max-height: 520px)')?.matches ? '' : ' open') + ' data-view-key="profile:' + escape(selected.id) +
                '"><summary><strong>' + escape(selected.name) + '</strong><span>Family & personal history</span></summary>' +
                '<div class="family-profile-content">' + this.details() + '</div></details>' :
                '<p>Select a person to explore their relationships and personal history.</p>') +
            '</section>' + (data.diagnostics.length ? '<details class="family-tree-diagnostics"><summary>Incomplete relationship records</summary>' +
                '<p>Some source links cannot establish a valid generation layout.</p><pre>' +
                escape(data.diagnostics.join('\n')) + '</pre></details>' : ''));
        this.renderedRevision = data.revision;
        if (reset) {
            const diagram = this.root.querySelector<HTMLElement>('.family-tree-diagram')!;
            diagram.scrollLeft = diagram.scrollTop = 0;
        }
        this.portraits.update(data.nodes, epoch, this.active);
    }

    private context(node: FamilyNode): string {
        if (node.age !== null && node.age < 18) return node.age < 5 ? 'Young child' : 'Child';
        const label = node.occupation[0]?.toUpperCase() + node.occupation.slice(1);
        return node.status === 'Deceased' || node.status.includes('last known') ? 'Last work: ' + label : label;
    }

    private age(node: FamilyNode): string {
        return node.age === null ? 'Age not observed' : node.age + ' ' + (node.age === 1 ? 'winter' : 'winters');
    }
    private date(winter: number): string {
        const gap = winter - this.origin;
        return gap === 0 ? 'the arrival year' : 'the ' + ordinal(Math.abs(gap)) + ' winter ' + (gap < 0 ? 'before' : 'after') + ' arrival';
    }
    private link(relation: FamilyRelation): string {
        const attribute = relation.visibility === 'included' ? 'data-family-person' : 'data-family-reference';
        return '<button type="button" class="family-person-link" ' + attribute + '="' + escape(relation.id) + '" data-epoch="' + this.epoch + '">' +
            escape(relation.name) + (relation.visibility === 'included' ? '' : ' (' + relation.visibility + ' relation)') + '</button>';
    }
    private details(): string {
        const node = this.data?.nodes.find(node => node.id === this.selectedId);
        if (!node)
            return '<p>Select a person to read their family relationships and personal history.</p>';
        const children = node.children;
        const childGroups = new Map<string, FamilyRelation[]>();
        for (const child of children) {
            const role = child.role;
            const group = childGroups.get(role) ?? [];
            group.push(child);
            childGroups.set(role, group);
        }
        const partners = this.data!.edges.filter(edge => edge.kind === 'partnership' && (edge.from === node.id || edge.to === node.id));
        return '<h3>' + escape(node.name) + '</h3><p>' + escape(node.status) + ' · ' + this.age(node) + ' · ' + escape(node.sex) +
            '<br>' + escape(node.status === 'Deceased' ? 'Work at death: ' : node.status.includes('last known') ? 'Last-known occupation: ' : 'Occupation: ') + escape(node.occupation) +
            (node.deathWinter !== null ? '<br>Died in ' + escape(this.date(node.deathWinter)) : '') +
            (node.observedWinter !== null ? '<br>Last observed in ' + escape(this.date(node.observedWinter)) : '') + '</p>' +
            '<h4>Child of</h4>' + (node.parents.length ? node.parents.map(parent => '<p>' + parent.role + ': ' + this.link(parent) + '</p>').join('') : '<p>Parents not recorded.</p>') +
            [...childGroups].map(([role, children]) => '<details open data-view-key="children:' + role + '"><summary>' + role + ' of (' + children.length + ')</summary>' + children.map(child => this.link(child)).join('') + '</details>').join('') +
            (!children.length ? '<p>No recorded children.</p>' : '') +
            '<h4>Recorded partnerships</h4>' + (partners.length ? partners.map(edge => {
            const other = this.data!.nodes.find(person => person.id === (edge.from === node.id ? edge.to : edge.from))!;
            return '<p>' + this.link({
                id: other.id, name: other.name, role: 'Parent', visibility: 'included', age: other.age
            }) + ' · ' + escape(edge.status) + '</p>';
        }).join('') : '<p>No recorded partnership.</p>') + this.history.render() +
            '<details><summary>Identity source</summary><p>' + escape(node.id) + '</p></details><div id="family-external-reference"></div>';
    }
    private focusPersona(id: string) {
        const diagram = this.root.querySelector<HTMLElement>('.family-tree-diagram');
        const point = this.layout?.points.get(id);
        const card = this.root.querySelector<HTMLElement>('[id="family-node-' + encodeURIComponent(id) + '"]');
        if (!diagram || !point || !card) return;
        if (diagram.clientWidth) {
            if (point.x < diagram.scrollLeft || point.x + familyCard.width > diagram.scrollLeft + diagram.clientWidth)
                diagram.scrollLeft = Math.max(0, point.x - 24);
            if (point.y < diagram.scrollTop + 60 || point.y + familyCard.height > diagram.scrollTop + diagram.clientHeight)
                diagram.scrollTop = Math.max(0, point.y - 56);
        }
        card.focus({ preventScroll: true });
    }

    private pointerDown = (event: PointerEvent) => {
        if (event.pointerType !== 'mouse' || event.button !== 0 ||
            (event.target as Element).closest('button, summary')) return;
        const diagram = (event.target as Element).closest<HTMLElement>('.family-tree-diagram');
        if (!diagram) return;
        this.drag = { id: event.pointerId, x: event.clientX, y: event.clientY,
            left: diagram.scrollLeft, top: diagram.scrollTop };
        diagram.setPointerCapture(event.pointerId);
        diagram.dataset.dragging = 'true';
        event.preventDefault();
    };

    private pointerMove = (event: PointerEvent) => {
        if (!this.drag || this.drag.id !== event.pointerId) return;
        const diagram = this.root.querySelector<HTMLElement>('.family-tree-diagram')!;
        diagram.scrollLeft = this.drag.left - (event.clientX - this.drag.x);
        diagram.scrollTop = this.drag.top - (event.clientY - this.drag.y);
    };

    private pointerUp = (event: PointerEvent) => {
        if (!this.drag || this.drag.id !== event.pointerId) return;
        const diagram = this.root.querySelector<HTMLElement>('.family-tree-diagram')!;
        if (diagram.hasPointerCapture(event.pointerId)) diagram.releasePointerCapture(event.pointerId);
        delete diagram.dataset.dragging;
        this.drag = undefined;
    };

    private click = (event: MouseEvent): void => {
        const button = (event.target as Element).closest<HTMLButtonElement>('button');
        if (!button)
            return;
        if (button.hasAttribute('data-family-reset')) {
            this.root.querySelector('.family-tree-diagram')?.scrollTo(0, 0);
            return;
        }
        if (button.hasAttribute('data-family-newest')) {
            const diagram = this.root.querySelector<HTMLElement>('.family-tree-diagram')!;
            diagram.scrollLeft = diagram.scrollWidth - diagram.clientWidth;
            return;
        }
        const id = button.dataset.familyNode ?? button.dataset.familyPerson;
        const reference = button.dataset.familyReference;
        if (!id && !reference)
            return;
        event.stopPropagation();
        if (this.owner.transferring || !button.isConnected || Number(button.dataset.epoch) !== this.owner.session.personalHistoryEpoch)
            return;
        if (reference) {
            const selected = this.data?.nodes.find(node => node.id === this.selectedId);
            const known = [...(selected?.parents ?? []), ...(selected?.children ?? [])].find(person => person.id === reference);
            if (!known)
                return;
            updateView(this.root.querySelector<HTMLElement>('#family-external-reference')!, '<p>' + escape(known.name) + ' · ' + escape(selected?.parents.some(parent => parent.id === reference) ? known.role : 'Recorded child') + ' · ' + escape(known.visibility === 'external' ? 'External, last-known relation' : 'Incomplete identity reference') +
                ' · ' + (known.age === null ? 'Age not observed' : known.age + ' winters' + (known.deathWinter != null ? ' at death' : '')) + '</p><details><summary>Reference source</summary>' + escape(known.id) + '</details>');
            return;
        }
        if (!this.owner.session.familyTree().nodes.some(node => node.id === id))
            return;
        this.selectedId = id!;
        this.update(true);
        this.focusPersona(id!);
    };
    dispose(): void {
        this.history.dispose();
        this.portraits.dispose();
        this.root.removeEventListener('click', this.click);
        this.root.removeEventListener('pointerdown', this.pointerDown);
        this.root.removeEventListener('pointermove', this.pointerMove);
        this.root.removeEventListener('pointerup', this.pointerUp);
        this.root.removeEventListener('pointercancel', this.pointerUp);
    }
}
