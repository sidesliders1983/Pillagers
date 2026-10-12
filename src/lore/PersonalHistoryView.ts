import type { SharedSettlement } from '../play/SharedSettlement';
import type { PersonalHistory, PersonalRecord } from './PersonalHistory';
import { updateView } from '../gameplay-lab/updateView';
import './personal-history.css';
const escape = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));
const pageSize = 10;
/** Lazy resident disclosure shared by the board and Fjord, independent of Family Tree admission. */
export class PersonalHistoryView {
    private epoch = -1;
    private pages = new Map<string, {
        open: boolean;
        offset: number;
    }>();
    constructor(private root: HTMLElement, private owner: SharedSettlement) {
        root.addEventListener('toggle', this.toggle, true);
        root.addEventListener('click', this.click);
    }
    render(): string {
        if (this.epoch !== this.owner.session.personalHistoryEpoch) {
            this.epoch = this.owner.session.personalHistoryEpoch;
            this.pages.clear();
        }
        const selected = this.owner.selection;
        if (selected?.kind !== 'persona')
            return '';
        const page = this.pages.get(selected.id) ?? { open: false, offset: 0 };
        this.pages.set(selected.id, page);
        return '<details data-personal-history data-view-key="history:' + escape(this.epoch + ':' + selected.id) +
            '" data-persona="' + escape(selected.id) + '" data-epoch="' + this.epoch + '"' +
            (page.open ? ' open' : '') + '><summary>Personal history</summary><div class="personal-history-content">' +
            (page.open ? this.content(selected.id, page.offset) : '') + '</div></details>';
    }
    private current(element: HTMLElement): boolean {
        return element.isConnected && !this.owner.transferring &&
            Number(element.dataset.epoch) === this.owner.session.personalHistoryEpoch &&
            this.owner.selection?.kind === 'persona' && this.owner.selection.id === element.dataset.persona;
    }
    private toggle = (event: Event): void => {
        const element = event.target;
        if (!(element instanceof HTMLDetailsElement) || !element.hasAttribute('data-personal-history') ||
            !this.current(element))
            return;
        const page = this.pages.get(element.dataset.persona!);
        if (!page)
            return;
        page.open = element.open;
        if (page.open)
            this.paint(element, page.offset);
    };
    private click = (event: MouseEvent): void => {
        const button = (event.target as Element).closest<HTMLButtonElement>('[data-history-page]');
        if (!button)
            return;
        event.stopPropagation();
        const element = button.closest<HTMLElement>('[data-personal-history]');
        if (!element || !this.current(element))
            return;
        const offset = Number(button.dataset.historyPage);
        if (!Number.isSafeInteger(offset) || offset < 0)
            return;
        const page = this.pages.get(element.dataset.persona!)!;
        page.offset = offset;
        this.paint(element, offset);
        element.querySelector('.personal-history-records')?.scrollTo(0, 0);
    };
    private paint(element: HTMLElement, offset: number): void {
        updateView(element.querySelector<HTMLElement>('.personal-history-content')!, this.content(element.dataset.persona!, offset));
    }
    private content(personaId: string, offset: number): string {
        const history = this.owner.session.personalHistory(personaId, pageSize, offset);
        let html = '<p class="muted">Recorded life events, newest first.</p>';
        if (history.partialAttribution)
            html += '<p class="muted">Some older housing records have no recorded residents and are not attributed.</p>';
        if (!history.totalRecords)
            return html + '<p>No personal events recorded yet.</p>';
        html += '<ol class="personal-history-records" aria-label="Personal history records">' +
            history.records.map(record => this.record(history, record)).join('') + '</ol>';
        return html + '<nav aria-label="Personal history pages"><button type="button" data-history-page="' +
            Math.max(0, offset - pageSize) + '"' + (offset === 0 ? ' disabled' : '') + '>Newer records</button>' +
            '<span>' + (offset + 1) + '–' + Math.min(offset + pageSize, history.totalRecords) +
            ' of ' + history.totalRecords + '</span><button type="button" data-history-page="' +
            (offset + pageSize) + '"' + (offset + pageSize >= history.totalRecords ? ' disabled' : '') +
            '>Older records</button></nav>';
    }
    private record(history: PersonalHistory, record: PersonalRecord): string {
        const links = record.publications.map(reference => {
            const context = reference.excerpt === undefined;
            return (context ? '' : '<details data-view-key="excerpt:' + reference.chapterIndex + ':' +
                reference.paragraphIndex + '"><summary>Published passage</summary><blockquote>' +
                escape(reference.excerpt) + '</blockquote></details>') +
                '<button type="button" data-history-chapter="' + reference.chapterIndex +
                '" data-history-paragraph="' + (reference.paragraphIndex ?? '') +
                '" data-history-source="' + escape(record.sourceEventId) +
                '" data-history-persona="' + escape(history.personaId) +
                '" data-history-epoch="' + this.epoch + '">Read in Saga Book' + (context ? ' (context)' : '') + '</button>';
        }).join('');
        return '<li data-view-key="' + escape(record.sourceEventId) + '"><strong>' + escape(record.date) +
            '</strong><small>' + (record.status === 'recent' ? 'Recent — not yet included in a checkpoint' : 'Recorded') +
            ' · ' + escape(record.roles.join(', ')) + '</small><p>' + escape(record.text) + '</p>' +
            (record.roles.includes('expedition participant') ? '<p class="muted">Recorded group expedition, not individual loot.</p>' : '') +
            links + '<details data-view-key="source"><summary>Source record</summary><p>' + escape(record.sourceEventId) +
            ' · ' + escape(record.kind) + '<br>Winter ' + record.time.winter + ', tick ' + record.time.tick +
            '</p></details></li>';
    }
    dispose(): void {
        this.root.removeEventListener('toggle', this.toggle, true);
        this.root.removeEventListener('click', this.click);
    }
}
