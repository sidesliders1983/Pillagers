import type { SharedSettlement } from '../play/SharedSettlement';
import { attentionLimits, type AttentionRecord, type AttentionTarget } from './AttentionHistory';
import { resolveAttentionTarget, type AttentionNavigation } from './AttentionNavigation';
import { attentionGroups } from './AttentionState';
import './attention.css';

const escape = (value: unknown) => String(value ?? '').replace(/[&<>"']/g,
    char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));
const when = (record: AttentionRecord) => 'Year ' + record.time.winter + ' · tick ' + record.time.tick;
const plurals: Record<string, string> = { ChildBorn: 'births', PersonaDied: 'deaths', PartnershipFormed: 'partnerships',
    HouseBuilt: 'completed homes', BuildingCollapsed: 'home collapses', ExpeditionDeparted: 'departures',
    ExpeditionReturned: 'expedition returns', ExploreAreaDeparted: 'exploration departures', ExploreAreaReturned: 'exploration returns' };
const targetLabels: Record<AttentionTarget['kind'], string> = { persona: 'Open character', household: 'Open household',
    building: 'Open home', livestock: 'Open livestock', site: 'Open discovered site', expedition: 'Open current expedition',
    surface: 'Open Food stocks', wildlife: 'Open wildlife in Clan Book' };

/** The existing Attention workspace owns this view; opening it never changes clock intent. */
export class AttentionView {
    private mode: 'unread' | 'all' | 'chronicle' = 'unread';
    private detail?: { kind: 'group' | 'event' | 'alert'; id: string };
    private page = 0;
    private detailPage = 0;
    private before?: number;
    private epoch = -1;
    private rendered = '';
    constructor(private root: HTMLElement, private owner: SharedSettlement,
        private changed: () => void, private navigation: AttentionNavigation) {
        root.addEventListener('click', this.click);
        root.addEventListener('keydown', this.keydown);
    }
    private button(action: string, label: string, id = '') {
        const pressed = ['unread', 'all', 'chronicle'].includes(action) ? ' aria-pressed="' + (this.mode === action) + '"' : '';
        return '<button type="button"' + pressed + ' data-attention-action="' + action + '" data-attention-id="' + escape(id) +
            '" data-attention-epoch="' + this.owner.session.personalHistoryEpoch + '">' + escape(label) + '</button>';
    }
    private groups() {
        return attentionGroups(this.owner.fjord.attentionView().records, this.owner.fjord.attentionSave(), this.mode === 'unread');
    }
    openInbox() {
        this.mode = 'unread'; this.detail = undefined; this.page = 0; this.render();
    }
    openAlert(id: string) {
        this.render();
        if (!this.owner.fjord.attentionView().alerts.some(alert => alert.id === id)) return;
        this.detail = { kind: 'alert', id }; this.render();
    }
    openEvent(id: string) {
        this.render();
        if (!this.owner.fjord.attentionSource(id)) return;
        this.detail = { kind: 'event', id };
        this.owner.fjord.markAttentionRead([id]); this.changed(); this.render();
    }
    render() {
        if (this.epoch !== this.owner.session.personalHistoryEpoch) {
            this.epoch = this.owner.session.personalHistoryEpoch;
            this.detail = undefined; this.page = 0; this.before = undefined;
        }
        const view = this.owner.fjord.attentionView();
        let html = '<nav class="attention-modes" aria-label="Attention views">' +
            this.button('unread', 'Unread (' + view.unreadCount + ')') + this.button('all', 'All recent') +
            this.button('chronicle', 'Chronicle') + '</nav><div class="attention-actions">' +
            this.button('read-all', 'Mark events read') + '</div>';
        if (this.detail) html += this.renderDetail();
        else if (this.mode === 'chronicle') {
            const page = this.owner.session.attentionHistory().chroniclePage(this.owner.session.readSnapshot().events, this.before);
            html += '<h3>Chronicle</h3><p>Recorded facts. Routine events do not add to the Attention badge.</p>' +
                this.button('newest', 'Newest facts') + '<ul class="attention-list">' + page.records.map(record =>
                    '<li><small>' + when(record) + '</small><p>' + escape(record.headline) + '</p>' +
                    this.button('event', 'View details', record.eventId) + '</li>').join('') + '</ul>' +
                (!page.records.length ? '<p>No formatted facts in this part of the history.</p>' : '') +
                (page.nextBefore > 0 ? this.button('older', 'Earlier facts', String(page.nextBefore)) : '');
        } else {
            const alerts = view.alerts.filter(alert => this.mode !== 'unread' || !alert.acknowledged);
            html += '<h3>Current conditions</h3>' + (alerts.length ? '<ul class="attention-list">' + alerts.map(alert =>
                '<li class="attention-condition" data-severity="' + alert.severity + '"><strong>' +
                (alert.severity === 'critical' ? 'Critical' : 'Actionable') + '</strong><p>' + escape(alert.headline) + '</p>' +
                this.button('alert', 'Details', alert.id) + (alert.acknowledged ? '<small>Acknowledged</small>' :
                    this.button('ack', 'Acknowledge', alert.id + '|' + alert.since)) + '</li>').join('') + '</ul>' :
                '<p>No unacknowledged current conditions.</p>');
            const groups = this.groups();
            this.page = Math.min(this.page, Math.max(0, Math.ceil(groups.length / attentionLimits.page) - 1));
            html += '<h3>Events</h3>' +
                '<ul class="attention-list">' + groups.slice(this.page * attentionLimits.page, (this.page + 1) * attentionLimits.page)
                    .map(group => { const first = group.records[0]; return '<li><small>' + escape(first.category) + ' · Year ' +
                        first.time.winter + ' · ' + group.unread + ' unread</small><p>' + escape(group.records.length === 1 ? first.headline :
                            group.records.length + ' ' + (plurals[first.canonicalType] ?? 'recorded events')) + '</p>' +
                        (group.records.length === 1 ? this.button('event', 'View details', first.eventId) :
                            this.button('group', 'View ' + group.records.length + ' events', group.id)) + '</li>'; }).join('') + '</ul>' +
                (!groups.length ? '<p>Nothing new right now. Your clan’s story will continue here.</p>' : '') +
                '<nav aria-label="Attention pages">' + (this.page > 0 ? this.button('page', 'Previous groups', String(this.page - 1)) : '') +
                ((this.page + 1) * attentionLimits.page < groups.length ? this.button('page', 'More groups', String(this.page + 1)) : '') + '</nav>';
        }
        if (html !== this.rendered) {
            const focused = this.root.contains(this.root.ownerDocument.activeElement) ?
                (this.root.ownerDocument.activeElement as HTMLElement).closest<HTMLElement>('[data-attention-action]') : null;
            const action = focused?.dataset.attentionAction, id = focused?.dataset.attentionId;
            this.root.innerHTML = html;
            this.rendered = html;
            if (action) Array.from(this.root.querySelectorAll<HTMLElement>('[data-attention-action]'))
                .find(button => button.dataset.attentionAction === action && button.dataset.attentionId === id)?.focus();
        }
    }
    private renderDetail() {
        const detail = this.detail!, state = this.owner.session.readSnapshot();
        let html = this.button('back', 'Back to Attention');
        if (detail.kind === 'group') {
            const records = this.owner.fjord.attentionView().records.filter(record =>
                record.canonicalType + ':' + record.time.winter === detail.id).slice().reverse();
            html += '<h3>Recorded events</h3>' + this.button('read-group', 'Mark these events read', detail.id) +
                '<ul class="attention-list">' + records.slice(this.detailPage * 20, this.detailPage * 20 + 20).map(record =>
                    '<li><small>' + when(record) + '</small><p>' + escape(record.headline) + '</p>' +
                    this.button('event', 'View details', record.eventId) + '</li>').join('') + '</ul>' +
                (this.detailPage > 0 ? this.button('detail-page', 'Newer events', String(this.detailPage - 1)) : '') +
                ((this.detailPage + 1) * 20 < records.length ? this.button('detail-page', 'Older events', String(this.detailPage + 1)) : '');
        } else if (detail.kind === 'alert') {
            const alert = this.owner.fjord.attentionView().alerts.find(alert => alert.id === detail.id);
            if (!alert) return html + '<p>This condition has resolved.</p>';
            html += '<h3>Current condition</h3><p>' + escape(alert.headline) + '</p>' +
                (!alert.acknowledged ? this.button('ack', 'Acknowledge', alert.id + '|' + alert.since) : '<p>Acknowledged.</p>');
            if (resolveAttentionTarget(state, alert.target)) html += this.button('target-alert', targetLabels[alert.target!.kind], alert.id);
        } else {
            const record = this.owner.fjord.attentionSource(detail.id);
            if (!record) return html + '<p>This source record is not available in this campaign.</p>';
            const event = state.events[Number(record.eventId.slice(6)) - 1];
            const people = Array.isArray(event.details?.people) ? event.details.people as { id: string; name: string }[] : [];
            html += '<h3>Historical record</h3><small>' + when(record) + '</small><p>' + escape(record.headline) + '</p>';
            if (resolveAttentionTarget(state, record.target)) html += this.button('target', targetLabels[record.target!.kind], record.eventId);
            else html += '<p>The live destination is unavailable. This historical record is retained.</p>';
            if (record.actorIds.length) html += '<h4>Recorded participants</h4><ul>' + record.actorIds.map(id => {
                const person = people.find(person => person?.id === id), name = person?.name ??
                    (event.personaId === id && typeof event.details?.name === 'string' ? event.details.name : 'Name not recorded');
                return '<li>' + escape(name) + (this.navigation.family && (state.personas[id] || state.personaArchive?.[id]) ?
                    this.button('family', 'Open recorded family', record.eventId + '|' + id) : '') + '</li>';
            }).join('') + '</ul>';
            html += '<details><summary>Source record</summary><p>' + escape(record.eventId) + ' · ' + escape(record.canonicalType) + '</p></details>';
        }
        return html;
    }
    private click = (event: MouseEvent) => {
        const button = (event.target as Element).closest<HTMLButtonElement>('[data-attention-action]');
        if (!button || this.owner.transferring || Number(button.dataset.attentionEpoch) !== this.owner.session.personalHistoryEpoch) return;
        const action = button.dataset.attentionAction!, id = button.dataset.attentionId ?? '';
        if (['unread', 'all', 'chronicle'].includes(action)) { this.mode = action as typeof this.mode; this.detail = undefined; this.page = 0; this.before = undefined; }
        else if (action === 'event') { this.openEvent(id); return; }
        else if (action === 'group') { this.detail = { kind: 'group', id }; this.detailPage = 0; }
        else if (action === 'alert') this.detail = { kind: 'alert', id };
        else if (action === 'back') this.detail = undefined;
        else if (action === 'read-all') { this.owner.fjord.markAllAttentionRead(); this.changed(); }
        else if (action === 'read-group') {
            this.owner.fjord.markAttentionRead(this.owner.fjord.attentionView().records.filter(record =>
                record.canonicalType + ':' + record.time.winter === id).map(record => record.eventId)); this.changed();
        } else if (action === 'ack') {
            const [alertId, since] = id.split('|'); this.owner.fjord.acknowledgeAttention(alertId, Number(since)); this.changed();
        } else if (action === 'page' || action === 'detail-page') {
            const page = Number(id);
            if (!Number.isSafeInteger(page) || page < 0 || page > attentionLimits.inbox) return;
            if (action === 'page') this.page = page; else this.detailPage = page;
        } else if (action === 'older' || action === 'newest') {
            if (action === 'older' && (!Number.isSafeInteger(Number(id)) || Number(id) < 0 || Number(id) > this.owner.session.readSnapshot().events.length)) return;
            this.before = action === 'older' ? Number(id) : undefined;
        }
        else if (action === 'family') {
            const [eventId, personaId] = id.split('|'), record = this.owner.fjord.attentionSource(eventId);
            if (record?.actorIds.includes(personaId)) this.navigation.family?.(personaId);
        } else if (action === 'target' || action === 'target-alert') {
            const record = action === 'target' ? this.owner.fjord.attentionSource(id) : undefined;
            const target = resolveAttentionTarget(this.owner.session.readSnapshot(), record?.target ??
                this.owner.fjord.attentionView().alerts.find(alert => alert.id === id)?.target);
            if (target) this.navigation.target(target, record ?? undefined);
        }
        this.render();
    };
    private keydown = (event: KeyboardEvent) => {
        if (event.key !== 'Escape' || !this.detail) return;
        event.preventDefault(); event.stopPropagation(); this.detail = undefined; this.render();
    };
    dispose() { this.root.removeEventListener('click', this.click); this.root.removeEventListener('keydown', this.keydown); }
}
