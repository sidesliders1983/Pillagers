import type { SharedSettlement, SettlementSelection } from '../play/SharedSettlement';
import type { FamilyTree, FamilyNode, FamilyRelation } from './FamilyTree';
import { PersonalHistoryView } from './PersonalHistoryView';
import { updateView } from '../gameplay-lab/updateView';
import { ordinal } from './NarrativeTime';
import './family-tree.css';
const escape = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[char]!));
const cardWidth = 176, cardHeight = 136, gapX = 20, gapY = 54;
/** Text/SVG reader surface; selecting a relative never changes or controls the world behind it. */
export class FamilyTreeView {
    private selectedId: string | null = null;
    private epoch = -1;
    private renderedRevision = -1;
    private origin = 800;
    private data: FamilyTree | null = null;
    private history: PersonalHistoryView;
    constructor(private root: HTMLElement, private owner: SharedSettlement) {
        this.history = new PersonalHistoryView(root, owner, () => this.selection, 'family-tree');
        root.addEventListener('click', this.click);
    }
    get selection(): SettlementSelection {
        return this.selectedId ? { kind: 'persona', id: this.selectedId } : null;
    }
    update(force = false): void {
        const epoch = this.owner.session.personalHistoryEpoch;
        if (this.epoch !== epoch) {
            this.selectedId = null;
            this.epoch = epoch;
            this.renderedRevision = -1;
        }
        const data = this.owner.session.familyTree();
        if (!force && this.renderedRevision === data.revision) {
            this.history.refresh();
            return;
        }
        this.data = data;
        this.origin = this.owner.session.book.snapshot().originWinter;
        if (!data.nodes.some(node => node.id === this.selectedId))
            this.selectedId = null;
        const maxColumn = Math.max(0, ...data.nodes.map(node => node.column));
        const maxRow = Math.max(0, ...data.nodes.map(node => node.row));
        const width = (maxColumn + 1) * (cardWidth + gapX) + 24, height = (maxRow + 1) * (cardHeight + gapY) + 30;
        const related = new Set(this.selectedId ? [this.selectedId] : []);
        for (const edge of data.edges)
            if (edge.from === this.selectedId || edge.to === this.selectedId) {
                related.add(edge.from);
                related.add(edge.to);
            }
        const position = (node: FamilyNode) => ({ x: 20 + node.column * (cardWidth + gapX), y: 28 + node.row * (cardHeight + gapY) });
        const connectors = data.edges.map(edge => {
            const from = data.nodes.find(node => node.id === edge.from)!, to = data.nodes.find(node => node.id === edge.to)!;
            const a = position(from), b = position(to), parent = edge.kind === 'parent';
            const x1 = a.x + cardWidth / 2, y1 = a.y + (parent ? cardHeight : cardHeight / 2), x2 = b.x + cardWidth / 2, y2 = b.y + (parent ? 0 : cardHeight / 2);
            const path = parent ? `M ${x1} ${y1} C ${x1} ${(y1 + y2) / 2} ${x2} ${(y1 + y2) / 2} ${x2} ${y2}` : `M ${x1} ${y1} L ${x2} ${y2}`;
            const key = edge.kind + JSON.stringify([edge.from, edge.to]);
            return '<path data-view-key="' + escape(key) + '" class="family-edge ' + edge.kind + '" ' +
                ((edge.from === this.selectedId || edge.to === this.selectedId) ? 'data-selected="true" ' : '') +
                'd="' + path + '"><title>' + escape(parent ? 'Recorded parent–child link' : edge.status) + '</title></path>';
        }).join('');
        const cards = data.nodes.map(node => {
            const point = position(node), selected = node.id === this.selectedId;
            return '<button type="button" id="family-node-' + encodeURIComponent(node.id) + '" data-family-node="' + escape(node.id) +
                '" data-founder="' + node.founder + '" data-row="' + node.row + '" data-view-key="person:' + escape(node.id) +
                '" data-epoch="' + epoch + '" aria-pressed="' + selected + '"' + (related.has(node.id) ? ' data-related="true"' : '') +
                ' style="left:' + point.x + 'px;top:' + point.y + 'px"><strong>' + escape(node.name) + '</strong><span>' + escape(node.occupation) +
                '</span><span>' + this.age(node) + ' · ' + escape(node.sex) + '</span><small>' + escape((node.founder ? 'Founder · ' : '') + node.status) +
                '</small>' + (node.branch === 'Independent family' ? '<small>Independent family</small>' : '') + '</button>';
        }).join('');
        updateView(this.root, '<p>Current campaign and recorded family connections. Ages and occupations are current or explicitly last known.</p>' +
            '<div class="family-tree-tools"><button type="button" data-family-reset>Reset view</button><span>Solid: parent–child · Dashed: partnership</span></div>' +
            '<div class="family-tree-diagram" tabindex="0" aria-label="Scrollable family diagram"><div class="family-tree-canvas" style="width:' + width + 'px;height:' + height + 'px">' +
            '<svg width="' + width + '" height="' + height + '" aria-hidden="true">' + connectors + '</svg>' + cards + '</div></div>' +
            '<section id="family-person-details" data-epoch="' + epoch + '" aria-live="polite">' + this.details() + '</section>' +
            (data.diagnostics.length ? '<details><summary>Incomplete relationship records</summary><p>Some source links cannot establish a valid generation layout.</p><pre>' + escape(data.diagnostics.join('\n')) + '</pre></details>' : ''));
        this.renderedRevision = data.revision;
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
    private click = (event: MouseEvent): void => {
        const button = (event.target as Element).closest<HTMLButtonElement>('button');
        if (!button)
            return;
        if (button.hasAttribute('data-family-reset')) {
            this.root.querySelector('.family-tree-diagram')?.scrollTo(0, 0);
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
        document.getElementById('family-node-' + encodeURIComponent(id!))?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    };
    dispose(): void { this.history.dispose(); this.root.removeEventListener('click', this.click); }
}
