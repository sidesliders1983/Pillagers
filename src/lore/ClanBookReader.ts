import { FamilyTreeView } from './FamilyTreeView';
import { isLivestockEvent, recordedLivestock, livestockAction, livestockGroups, livestockQuantity } from './LivestockNarrative';
import type { SimulationEvent } from '../simulation/SimulationCore';
import type { SharedSettlement } from '../play/SharedSettlement';
import type { BookChapter } from './ClanBook';
import './clan-book.css';

const escape = (value: unknown) => String(value ?? '').replace(/[&<>"']/g,
    char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));
function appendix(chapter: BookChapter): string {
    const facts = chapter.facts;
    let html = facts.complete ? '<p>Complete observed checkpoint.</p>' :
        '<p>Partial history: some founding facts or interval coverage are unavailable.</p>';
    if (facts.arrival) html += '<p>Arrival: Summer 800 (calendar year), tick 500.</p>';
    if (facts.period) html += '<p>Observed interval: Winter ' + facts.period.from.winter +
        ', tick ' + facts.period.from.tick + ' through the completed boundary at Winter ' +
        facts.period.through.winter + ', tick ' + facts.period.through.tick + '.</p>';
    if (facts.founders.length) {
        html += '<h3>Founders</h3><ul>' + facts.founders.map(p => '<li>' + escape(p.name) +
            ' · ' + escape(p.occupation ?? 'No occupation') +
            (p.partnerId ? ' · partner: ' + escape(facts.founders.find(q => q.id === p.partnerId)?.name ?? p.partnerId) : '') +
            '</li>').join('') + '</ul>';
        const homes = facts.households;
        html += '<h3>Founding households</h3><ul>' + homes.map(h => '<li>' + escape(h.displayName ?? 'A household') + ': ' +
            h.memberIds.map(id => escape(facts.founders.find(p => p.id === id)?.name ?? id)).join(', ') +
            ' · ' + escape(h.residenceId ? h.residenceName ?? 'A recorded residence' : 'No residence') + '</li>').join('') + '</ul>';
        html += '<details><summary>Housing source identities</summary><ul>' + homes.map(h =>
            '<li>Household: ' + escape(h.id) + ' · Residence: ' + escape(h.residenceId ?? 'none') +
            ' · Members: ' + h.memberIds.map(escape).join(', ') + '</li>').join('') + '</ul></details>';
    }
    if (facts.cattle.length) {
        const animals: SimulationEvent[] = facts.cattle.map(animal => ({
            id: animal.id, type: 'CattleAssigned', time: chapter.checkpoint.time,
            details: { cattleId: animal.id }
        }));
        const quantity = livestockQuantity(animals, facts);
        html += '<h3>Founding livestock</h3><p data-livestock-summary>' +
            escape(quantity[0].toUpperCase() + quantity.slice(1)) + '.</p>';
        html += '<details><summary>Livestock source identities</summary><ul>' +
            facts.cattle.map(animal => '<li>' + escape(facts.livestock?.animals.find(record => record.id === animal.id)?.name ?? 'Recorded livestock') + ' · ' + escape(animal.species ?? 'cattle') + ' · ' + escape(animal.sex) +
                '</li>').join('') + '</ul></details>';
    }
    if (facts.longships.length) html += '<h3>Founding longships</h3><ul>' +
        facts.longships.map(() => '<li>Our longship</li>').join('') + '</ul>';
    if (facts.ledger) {
        html += '<h3>Resource ledger</h3><p>Quantities below are recorded subtotals. Incomplete accounting does not treat missing transactions as zero.</p><div class="book-table-scroll"><table><caption>Actual stock transactions</caption>' +
            '<thead><tr><th>Category</th><th>Food</th><th>Materials</th></tr></thead><tbody>';
        const rows = [['opening', 'Opening stock'], ['production', 'Production'],
            ['residentProduction', 'Of which: residents'], ['cattleProduction', 'Of which: livestock'],
            ['otherReceipts', 'Other receipts'], ['consumption', 'Actual consumption'], ['otherSpending', 'Other spending'], ['spending', 'Total consumed / spent'], ['losses', 'Losses'],
            ['unmetNeed', 'Unmet need (not spent)'], ['closing', 'Closing stock'], ['residual', 'Unexplained difference']] as const;
        for (const [key, label] of rows)
            html += '<tr><th scope="row">' + label + '</th><td>' + facts.ledger.food[key] +
                '</td><td>' + escape(facts.ledger.materials[key] ?? 'Not recorded') + '</td></tr>';
        html += '</tbody></table></div><p>Food accounting: ' + (facts.ledger.food.complete ? 'reconciled' : 'incomplete') +
            '. Materials accounting: ' + (facts.ledger.materials.complete ? 'reconciled' : 'incomplete') + '.</p>';
        if (facts.ledger.provisions) {
            const pack = facts.ledger.provisions;
            html += '<h3>Carried expedition Food</h3><p>Recorded in this interval: ' + pack.reserved +
                ' spent at departure preparation, ' + pack.consumed + ' consumed, ' + pack.discarded + ' unused and discarded, and ' + pack.lost +
                ' unrecovered. Carried consumption is not charged to home stocks a second time. ' +
                'Food is spent at Start Expedition and is never refunded.</p>';
        }
        html += '<details><summary>Transaction sources</summary><ul>' + facts.ledger.transactions.map(t =>
            '<li>' + escape(t.eventId) + ' · ' + escape(t.resource) + ' · ' + escape(t.category) + ' · ' + escape(t.purpose) +
            ' · ' + t.units + '</li>').join('') + '</ul></details>';
    } else if (facts.stocks) html += '<p>Starting stocks: ' + facts.stocks.food + ' Food · ' +
        facts.stocks.materials + ' Materials.</p>';
    if (facts.recordedReceipts?.length) {
        html += '<h3>Recorded founding asset receipts</h3><ul>' + facts.recordedReceipts.map(receipt =>
            '<li>Winter ' + receipt.winter + ': Our longship was salvaged for ' + receipt.units +
            ' Materials. Source: ' + escape(receipt.eventId) + '</li>').join('') + '</ul>';
    }
    if (facts.demographics) {
        html += '<h3>Births and deaths</h3><ul>' + facts.demographics.filter(e => !isLivestockEvent(e.type)).map(e => {
            const details = e.details;
            const people = (details.people ?? []) as { id: string; name: string }[];
            const parents = (details.parentIds ?? []) as string[];
            return '<li>' + escape(details.name ?? details.cattleId ?? e.personaId) + ' · ' + escape(e.type) +
                ' · Winter ' + e.time.winter + (parents.length ? ' · parents: ' + parents.map(id =>
                    escape(people.find(p => p.id === id)?.name ?? id)).join(', ') : '') +
                (e.type.includes('Died') ? ' · ' + escape(details.cause ?? 'Cause not recorded') : '') +
                ' · source: ' + escape(e.eventId) + '</li>';
        }).join('') + '</ul>';
        const livestock = facts.demographics.filter(event => isLivestockEvent(event.type))
            .map(event => ({ ...event, id: event.eventId }));
        if (livestock.length) {
            html += '<h3>Livestock</h3><ul data-livestock-summary>' + livestockGroups(livestock).map(group => {
                const recordedFood = group.every(event => Number.isSafeInteger(event.details?.food)) ?
                    group.reduce((sum, event) => sum + Number(event.details?.food), 0) : null;
                return '<li>Winter ' + group[0].time.winter + ': ' + escape(livestockAction(group, facts)) +
                    (group[0].type.endsWith('Slaughtered') && recordedFood !== null ?
                        ' Recorded receipt: ' + recordedFood + ' Food.' : '') + '</li>';
            }).join('') + '</ul>';
            html += '<details><summary>Livestock source identities</summary><ul>' + livestock.map(event =>
                '<li>' + escape(recordedLivestock(event)?.name ?? 'Recorded livestock') + ' · ' + escape(event.details.livestockId ?? event.details.cattleId) + ' · ' + escape(event.type) +
                ' · Winter ' + event.time.winter + ' · source: ' + escape(event.id) +
                (event.type.endsWith('Slaughtered') ? ' · Food: ' + escape(event.details.food) : '') +
                '</li>').join('') + '</ul></details>';
        }
        if (!facts.demographics.length) html += '<p>No births or deaths were recorded in this interval.</p>';
    }
    return html;
}

/** One non-modal reader; it has no authority over campaign pacing or Core commands. */
export class ClanBookReader {
    private panel = document.createElement('section');
    private bookId = '';
    private tab: 'story' | 'family' = 'story';
    private familyTree: FamilyTreeView;
    private campaignEpoch = -1;
    private chapterIndex = 0;
    private queuedChapter: number | null = null;
    private renderedChapter = '';
    private opener: HTMLElement | null = null;
    constructor(private owner: SharedSettlement, private persist: () => void) {
        this.panel.id = 'clan-book-reader';
        this.panel.hidden = true;
        this.panel.setAttribute('role', 'dialog');
        this.panel.setAttribute('aria-labelledby', 'clan-book-title');
        this.panel.innerHTML = '<header><h2 id="clan-book-title">Clan Book</h2><button id="clan-book-close" type="button" aria-label="Close Clan Book">Close</button></header>' +
            '<div class="book-tabs" role="tablist" aria-label="Book sections">' +
            '<button type="button" id="clan-book-story-tab" role="tab" aria-selected="true" aria-controls="clan-book-story-panel">Story</button>' +
            '<button type="button" id="clan-book-family-tab" role="tab" aria-selected="false" aria-controls="clan-book-tree-panel" tabindex="-1">Family Tree</button></div>' +
            '<button type="button" id="clan-book-new-story" hidden>New story available</button>' +
            '<section id="clan-book-story-panel" role="tabpanel" aria-labelledby="clan-book-story-tab">' +
            '<label>Chapter<select id="clan-book-chapter"></select></label><article id="clan-book-story"></article>' +
            '<details id="clan-book-appendix"><summary>Factual overview</summary><div></div></details></section>' +
            '<section id="clan-book-tree-panel" role="tabpanel" aria-labelledby="clan-book-family-tab" hidden></section>';
        document.body.append(this.panel);
        this.familyTree = new FamilyTreeView(this.panel.querySelector<HTMLElement>('#clan-book-tree-panel')!, owner);
        this.panel.querySelector('#clan-book-story-tab')!.addEventListener('click', () => this.setTab('story'));
        this.panel.querySelector('#clan-book-family-tab')!.addEventListener('click', () => this.setTab('family'));
        this.panel.querySelector('#clan-book-new-story')!.addEventListener('click', () => {
            const chapter = this.owner.session.book.snapshot().chapters.find(chapter => !chapter.notified);
            if (chapter)
                this.open(chapter.index);
        });
        this.panel.querySelector('.book-tabs')!.addEventListener('keydown', (event) => {
            const key = (event as KeyboardEvent).key;
            if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(key))
                return;
            event.preventDefault();
            this.setTab(key === 'Home' ? 'story' : key === 'End' ? 'family' : this.tab === 'story' ? 'family' : 'story');
            this.panel.querySelector<HTMLElement>(this.tab === 'story' ? '#clan-book-story-tab' : '#clan-book-family-tab')!.focus();
        });
        // Internal scrolling/selection must never reach world gesture handlers.
        for (const type of ['pointerdown', 'pointerup', 'wheel'])
            this.panel.addEventListener(type, event => event.stopPropagation());
        this.panel.querySelector('#clan-book-close')!.addEventListener('click', () => this.close());
        this.panel.querySelector('#clan-book-chapter')!.addEventListener('change', event => {
            this.chapterIndex = Number((event.target as HTMLSelectElement).value);
            this.paint();
        });
        this.panel.addEventListener('keydown', event => {
            event.stopPropagation();
            if (event.key === 'Escape') {
                event.preventDefault();
                this.close();
            }
        });
        document.addEventListener('click', this.menuClick);
        window.addEventListener('resize', this.measureBounds);
    }
    private measureBounds = (): void => {
        const hud = document.querySelector('#fjord-header, #play-hud');
        const top = Math.max(12, hud?.getBoundingClientRect().bottom ?? 168) + 12;
        this.panel.style.setProperty('--book-top', top + 'px');
    };
    private menuClick = (event: MouseEvent): void => {
        const link = (event.target as Element).closest<HTMLButtonElement>('[data-history-chapter]');
        if (link) {
            event.stopPropagation();
            const selection = link.dataset.historySurface === 'family-tree' ? this.familyTree.selection : this.owner.selection;
            const chapter = Number(link.dataset.historyChapter);
            const paragraph = link.dataset.historyParagraph === '' ? null : Number(link.dataset.historyParagraph);
            if (this.owner.transferring || !link.isConnected || selection?.kind !== 'persona' ||
                selection.id !== link.dataset.historyPersona ||
                this.owner.session.personalHistoryEpoch !== Number(link.dataset.historyEpoch) ||
                !Number.isSafeInteger(chapter) || chapter < 0 ||
                (paragraph !== null && (!Number.isSafeInteger(paragraph) || paragraph < 0)) ||
                !this.owner.session.personalHistoryReference(selection.id, link.dataset.historySource!, chapter, paragraph))
                return;
            this.open(chapter);
            this.panel.querySelectorAll('[data-history-target]').forEach(node => node.removeAttribute('data-history-target'));
            const target = paragraph === null ? this.panel.querySelector<HTMLElement>('#clan-book-story > h3') :
                this.panel.querySelector<HTMLElement>('[data-passage="' + paragraph + '"]');
            if (target) {
                target.setAttribute('data-history-target', '');
                target.tabIndex = -1;
                target.focus({ preventScroll: true });
                target.scrollIntoView({ block: 'nearest' });
            }
            return;
        }
        if ((event.target as Element).closest('#clan-book-open'))
            this.open();
    };
    update(): void {
        const book = this.owner.session.book.snapshot();
        if (this.bookId !== book.id || this.campaignEpoch !== this.owner.session.personalHistoryEpoch) {
            this.campaignEpoch = this.owner.session.personalHistoryEpoch;
            this.bookId = book.id;
            this.queuedChapter = null;
            this.panel.hidden = true;
            this.renderedChapter = '';
            this.chapterIndex = 0;
        }
        if (this.chapterIndex >= book.chapters.length) {
            this.chapterIndex = 0;
            this.renderedChapter = '';
        }
        if (document.hidden || this.owner.transferring)
            return;
        const pending = book.chapters.find(c => !c.notified);
        const familyOpen = !this.panel.hidden && this.tab === 'family';
        (this.panel.querySelector('#clan-book-new-story') as HTMLElement).hidden = !pending || !familyOpen;
        if (pending && familyOpen)
            this.queuedChapter = pending.index;
        if (pending && !familyOpen && !(this.panel.hidden && this.queuedChapter === pending.index)) {
            this.owner.session.book.notifyPending();
            this.persist();
            if (this.panel.hidden)
                this.open(pending.index);
        }
        if (!this.panel.hidden) {
            if (this.tab === 'family')
                this.familyTree.update();
            else
                this.paint();
        }
    }
    open(index = this.queuedChapter ?? this.chapterIndex): void {
        if (this.owner.transferring || document.hidden)
            return;
        this.opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        if (!Number.isSafeInteger(index) || !this.owner.session.book.snapshot().chapters[index])
            return;
        this.chapterIndex = index;
        this.queuedChapter = null;
        this.owner.session.book.notifyPending();
        this.panel.hidden = false;
        this.setTab('story');
        this.measureBounds();
        this.panel.querySelector<HTMLElement>('#clan-book-close')!.focus();
    }
    private setTab(tab: 'story' | 'family'): void {
        if (this.owner.transferring || document.hidden)
            return;
        this.tab = tab;
        this.panel.dataset.tab = tab;
        for (const value of ['story', 'family'] as const) {
            const active = value === tab, button = this.panel.querySelector<HTMLElement>('#clan-book-' + value + '-tab')!;
            button.setAttribute('aria-selected', String(active));
            button.tabIndex = active ? 0 : -1;
        }
        (this.panel.querySelector('#clan-book-story-panel') as HTMLElement).hidden = tab !== 'story';
        (this.panel.querySelector('#clan-book-tree-panel') as HTMLElement).hidden = tab !== 'family';
        if (tab === 'family')
            this.familyTree.update();
        else
            this.paint();
    }
    private paint(): void {
        const book = this.owner.session.book.snapshot();
        const field = this.panel.querySelector<HTMLSelectElement>('#clan-book-chapter')!;
        if (field.options.length !== book.chapters.length) {
            field.innerHTML = book.chapters.map(c => '<option value="' + c.index + '">' + escape(c.title) + '</option>').join('');
        }
        field.value = String(this.chapterIndex);
        const chapter: BookChapter = book.chapters[this.chapterIndex];
        const signature = book.id + ':' + chapter.index + ':' + chapter.checkpoint.identity;
        if (signature === this.renderedChapter)
            return;
        this.panel.querySelector('#clan-book-story')!.innerHTML = '<h3>' + escape(chapter.title) + '</h3>' +
            chapter.text.split('\n\n').map((p, index) => '<p data-passage="' + index + '">' + escape(p) + '</p>').join('');
        this.panel.querySelector('#clan-book-appendix > div')!.innerHTML = appendix(chapter);
        this.owner.session.book.markRead(chapter.index);
        this.renderedChapter = signature;
        this.persist();
    }
    close(): void {
        this.panel.hidden = true;
        this.persist();
        const fallback = document.querySelector<HTMLElement>('#fjord-menu > summary, #play-settings > summary');
        if (this.opener?.isConnected && this.opener !== document.body && this.opener.getClientRects().length)
            this.opener.focus();
        else
            fallback?.focus();
    }
    dispose(): void {
        document.removeEventListener('click', this.menuClick);
        window.removeEventListener('resize', this.measureBounds);
        this.familyTree.dispose();
        this.panel.remove();
    }
}
