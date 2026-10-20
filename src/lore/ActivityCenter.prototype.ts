// THROWAWAY: three structures on /fjord-play?activityPrototype=1&variant=focus|inbox|journal.
// Question: which structure best supports noticing, understanding, acting and returning to the world?
import type { SharedSettlement } from '../play/SharedSettlement';
import { icon, type FjordIcon } from '../fjord-play/FjordIcons';
import { resolveAttentionTarget } from './AttentionNavigation';
import './activity-center.prototype.css';

type Item = { id: string; title: string; category: string; kind: 'alert' | 'event'; read: boolean;
    critical: boolean; date: string; source: string; context: string; people: string[] };
type Variant = 'focus' | 'inbox' | 'journal';
const variants: Variant[] = ['focus', 'inbox', 'journal'];
const names: Record<Variant, string> = { focus: 'Focus', inbox: 'Inbox', journal: 'Journal' };
const categoryNames: Record<string, string> = { settlement: 'Settlement', life: 'Clan life', expedition: 'Expeditions', discovery: 'Discoveries' };
const glyphs: Record<string, FjordIcon> = { settlement: 'home', life: 'people', expedition: 'route', discovery: 'map' };
const escape = (value: unknown) => String(value ?? '').replace(/[&<>"']/g,
    char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));
const contextNames: Record<string, string> = { surface: 'Food stocks', persona: 'Character details', household: 'Household',
    building: 'Home', livestock: 'Livestock', site: 'Discovered site', expedition: 'Expedition group', wildlife: 'Wildlife in Clan Book' };

/** Real frozen projection; all reads, acknowledgements and destinations below are in-memory stubs. */
export class ActivityCenterPrototype {
    private variant: Variant;
    private read = new Set<string>();
    private seen = new Set<string>();
    private selected = '';
    private mode: 'overview' | 'history' = 'overview';
    private category = '';
    private destination = '';
    private items: Item[];
    private switcher = document.createElement('nav');
    private inspector = document.createElement('details');

    constructor(private root: HTMLElement, owner: SharedSettlement) {
        const requested = new URL(location.href).searchParams.get('variant') as Variant;
        this.variant = variants.includes(requested) ? requested : 'focus';
        const state = owner.session.readSnapshot(), view = owner.fjord.attentionView();
        this.items = view.alerts.map(alert => ({ id: 'alert:' + alert.id, title: alert.headline, category: alert.category,
            kind: 'alert', read: alert.acknowledged, critical: alert.severity === 'critical', date: 'Active now',
            source: alert.canonicalType, context: contextNames[resolveAttentionTarget(state, alert.target)?.kind ?? ''] ?? '', people: [] }));
        const records = new Map(view.records.map(record => [record.eventId, record]));
        for (const record of owner.session.attentionHistory().chroniclePage(state.events).records)
            if (!records.has(record.eventId)) records.set(record.eventId, { ...record, read: true });
        for (const record of [...records.values()].sort((a, b) => Number(b.eventId.slice(6)) - Number(a.eventId.slice(6)))) {
            const event = state.events[Number(record.eventId.slice(6)) - 1];
            const people = Array.isArray(event?.details?.people) ? event.details.people as { id: string; name: string }[] : [];
            this.items.push({ id: record.eventId, title: record.shortText ?? record.headline, category: record.category,
                kind: 'event', read: record.read, critical: false, date: 'Year ' + record.time.winter,
                source: record.eventId + ' · ' + record.canonicalType,
                context: contextNames[resolveAttentionTarget(state, record.target)?.kind ?? ''] ?? '',
                people: people.filter(person => record.actorIds.includes(person.id)).map(person => person.name) });
        }
        this.root.classList.add('ac-prototype');
        document.querySelector('#fjord-play')!.classList.add('activity-prototyping');
        this.root.setAttribute('aria-label', 'Activity Center design prototype');
        this.switcher.className = 'ac-prototype-switcher';
        this.switcher.setAttribute('aria-label', 'Prototype design switcher');
        this.switcher.innerHTML = '<button type="button" data-ac-cycle="-1" aria-label="Previous design">←</button>' +
            '<span><small>READ-ONLY DESIGN PREVIEW</small><strong></strong></span>' +
            '<button type="button" data-ac-cycle="1" aria-label="Next design">→</button>';
        this.inspector.className = 'ac-prototype-inspector';
        this.inspector.innerHTML = '<summary>Prototype state</summary><pre></pre>';
        document.querySelector('#fjord-play')!.append(this.switcher, this.inspector);
        this.root.addEventListener('click', this.click);
        this.switcher.addEventListener('click', this.cycleClick);
        document.addEventListener('keydown', this.keydown);
        this.render();
    }

    private unread(item: Item) { return !item.read && !(item.kind === 'alert' ? this.seen : this.read).has(item.id); }
    private button(action: string, label: string, id = '', extra = '') {
        return '<button type="button" data-ac-action="' + action + '" data-ac-id="' + escape(id) + '" ' + extra + '>' + label + '</button>';
    }
    private rows(items: Item[]) {
        return items.length ? '<div class="ac-rows">' + items.map(item => this.button('open',
            '<span class="ac-item-icon">' + icon(item.critical ? 'alert' : glyphs[item.category] ?? 'book') + '</span>' +
            '<span class="ac-item-text"><span class="ac-meta">' + escape(categoryNames[item.category]) + ' · ' + item.date + '</span>' +
            '<strong>' + escape(item.title) + '</strong>' + (item.kind === 'alert' && !this.unread(item) ? '<small>Seen · still active</small>' : '') + '</span>' +
            '<span class="ac-indicator">' + (this.unread(item) ? '<span class="ac-dot" aria-label="Unread"></span>' : '›') + '</span>', item.id,
            'class="ac-row" data-critical="' + item.critical + '"')).join('') + '</div>' :
            '<div class="ac-empty">' + icon('check') + '<p>You are caught up.</p><small>New activity will appear here.</small></div>';
    }
    private tabs() {
        return '<nav class="ac-tabs" aria-label="Activity views">' + this.button('mode', 'Overview', 'overview',
            'aria-pressed="' + (this.mode === 'overview') + '"') + this.button('mode', 'History', 'history',
            'aria-pressed="' + (this.mode === 'history') + '"') + '</nav>';
    }
    private detail() {
        const item = this.items.find(item => item.id === this.selected);
        if (!item) return '';
        return '<section class="ac-detail"><div class="ac-detail-top">' + this.button('back', '← Back') +
            '<small>' + escape(categoryNames[item.category]) + '</small></div><h3 tabindex="-1" data-ac-detail-heading>' + escape(item.title) + '</h3>' +
            '<p class="ac-meta">' + item.date + '</p>' + (item.people.length ? '<h4>People involved</h4><p>' +
                item.people.map(escape).join(' · ') + '</p>' : '') +
            (item.context ? this.button('context', 'Open ' + escape(item.context), item.id, 'class="ac-primary"') :
                '<p class="ac-meta">The original destination is unavailable. The recorded event remains.</p>') +
            (item.kind === 'alert' ? '<p class="ac-meta">Confirming you have seen this does not resolve the condition.</p>' +
                this.button('seen', this.unread(item) ? 'Confirm seen' : 'Seen · still active', item.id) : '') +
            (this.destination ? '<p class="ac-preview-destination" role="status">Preview destination: ' + escape(this.destination) + '</p>' : '') +
            '<details><summary>Recorded source</summary><small>' + escape(item.source) + '</small></details></section>';
    }

    /** Priority-led overview: conditions first, then the unread story, with history one tab away. */
    private renderFocus() {
        const issues = this.items.filter(item => item.kind === 'alert');
        const updates = this.items.filter(item => item.kind === 'event' && this.unread(item));
        return this.tabs() + (this.selected ? this.detail() : this.mode === 'history' ?
            '<div class="ac-section-heading"><h3>Recent history</h3><small>Reading does not change the world</small></div>' +
                this.rows(this.items.filter(item => item.kind === 'event')) :
            '<section class="ac-priority"><div class="ac-section-heading"><h3>Needs attention</h3><span>' +
                issues.filter(item => this.unread(item)).length + ' to review</span></div>' + this.rows(issues) + '</section>' +
            '<section><div class="ac-section-heading"><h3>New activity</h3>' + this.button('read-all', 'Mark updates read') + '</div>' + this.rows(updates) + '</section>');
    }

    /** Mailbox structure: one compact ordered list, with a master/detail layout on wider screens. */
    private renderInbox() {
        const rows = this.items.filter(item => this.mode === 'history' || this.unread(item));
        return '<div class="ac-mailbox-heading"><strong>' + rows.filter(item => this.unread(item)).length + ' unread</strong>' +
            this.button('read-all', 'Mark updates read') + '</div>' + this.tabs() +
            '<div class="ac-inbox-layout"><section><h3 class="ac-visually-hidden">Activity inbox</h3>' + this.rows(rows) +
            '</section><aside>' + (this.selected ? this.detail() : '<div class="ac-inbox-hint">Select an update to see its context.</div>') + '</aside></div>';
    }

    /** Topic-led journal: pick a subject, then inspect its timeline; conditions remain separate. */
    private renderJournal() {
        const events = this.items.filter(item => item.kind === 'event');
        const issues = this.items.filter(item => item.kind === 'alert');
        if (this.selected) return this.detail();
        if (this.category) return this.button('subjects', '← All subjects') + '<h3>' + escape(categoryNames[this.category]) + '</h3>' +
            this.rows(events.filter(item => item.category === this.category));
        return '<details class="ac-journal-issues" open><summary>Current conditions · ' + issues.length + '</summary>' + this.rows(issues) + '</details>' +
            '<h3>Explore your clan’s journal</h3><div class="ac-subjects">' + Object.entries(categoryNames).map(([category, label]) => {
                const records = events.filter(item => item.category === category);
                return this.button('subject', icon(glyphs[category]) + '<strong>' + escape(label) + '</strong><small>' +
                    records.filter(item => this.unread(item)).length + ' new · ' + records.length + ' recorded</small>', category);
            }).join('') + '</div>';
    }

    render() {
        this.root.innerHTML = '<div class="ac-context"><span>ACTIVITY CENTER</span><small>Year ' +
            (this.items.find(item => item.kind === 'event')?.date.replace('Year ', '') ?? '—') + '</small></div>' +
            ({ focus: () => this.renderFocus(), inbox: () => this.renderInbox(), journal: () => this.renderJournal() })[this.variant]();
        this.switcher.querySelector('strong')!.textContent = names[this.variant] + ' · ' + (variants.indexOf(this.variant) + 1) + ' / 3';
        this.inspector.querySelector('pre')!.textContent = JSON.stringify({ variant: this.variant, mode: this.mode, category: this.category,
            selectedSource: this.selected || null, previewDestination: this.destination || null,
            localRead: [...this.read], localSeenConditions: [...this.seen],
            snapshot: this.items.map(item => ({ id: item.id, category: item.category, kind: item.kind, unread: this.unread(item) })) }, null, 2);
    }
    private click = (event: MouseEvent) => {
        const button = (event.target as Element).closest<HTMLElement>('[data-ac-action]');
        if (!button) return;
        const id = button.dataset.acId ?? '', action = button.dataset.acAction;
        if (action === 'open') {
            const item = this.items.find(item => item.id === id);
            if (!item) return;
            this.selected = id; this.destination = '';
            if (item.kind === 'event') this.read.add(id);
        } else if (action === 'back') { this.selected = ''; this.destination = ''; }
        else if (action === 'mode') { this.mode = id as typeof this.mode; this.selected = ''; }
        else if (action === 'read-all') this.items.filter(item => item.kind === 'event').forEach(item => this.read.add(item.id));
        else if (action === 'seen') this.seen.add(id);
        else if (action === 'subject') this.category = id;
        else if (action === 'subjects') this.category = '';
        else if (action === 'context') this.destination = this.items.find(item => item.id === id)?.context ?? '';
        this.render();
        if (this.selected) this.root.querySelector<HTMLElement>('[data-ac-detail-heading]')?.focus({ preventScroll: true });
    };
    private cycle(delta: number) {
        this.variant = variants[(variants.indexOf(this.variant) + delta + variants.length) % variants.length];
        this.selected = ''; this.category = ''; this.destination = '';
        const url = new URL(location.href); url.searchParams.set('variant', this.variant);
        history.replaceState(null, '', url); this.render();
    }
    private cycleClick = (event: MouseEvent) => {
        const button = (event.target as Element).closest<HTMLElement>('[data-ac-cycle]');
        if (button) this.cycle(Number(button.dataset.acCycle));
    };
    private keydown = (event: KeyboardEvent) => {
        if ((event.target as Element).closest('input, textarea, select, [contenteditable="true"]')) return;
        if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
        event.preventDefault(); event.stopPropagation(); this.cycle(event.key === 'ArrowRight' ? 1 : -1);
    };
    dispose() {
        this.root.removeEventListener('click', this.click); this.switcher.removeEventListener('click', this.cycleClick);
        document.removeEventListener('keydown', this.keydown); this.switcher.remove(); this.inspector.remove();
        document.querySelector('#fjord-play')?.classList.remove('activity-prototyping');
    }
}
