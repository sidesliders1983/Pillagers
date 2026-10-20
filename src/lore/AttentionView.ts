import { icon, type FjordIcon } from '../fjord-play/FjordIcons';
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
const categories: Record<AttentionRecord['category'], { label: string; glyph: FjordIcon }> = {
    life: { label: 'Clan life', glyph: 'people' },
    expedition: { label: 'Expeditions', glyph: 'route' },
    settlement: { label: 'Settlement', glyph: 'home' },
    discovery: { label: 'Discoveries', glyph: 'map' },
};
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
        const selected = action === 'all' ? this.mode !== 'unread' : this.mode === action;
        const pressed = ['unread', 'all'].includes(action) ? ' aria-pressed="' + selected + '"' : '';
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
    private row(action: string, id: string, title: string, meta: string, glyph: FjordIcon,
        unread = false, severity?: 'critical' | 'noteworthy') {
        return '<li' + (severity ? ' data-severity="' + severity + '"' : '') + '><button type="button" class="attention-row" data-attention-action="' + action +
            '" data-attention-id="' + escape(id) + '" data-attention-epoch="' + this.epoch + '">' +
            '<span class="attention-row-icon" aria-hidden="true">' + icon(glyph) + '</span>' +
            '<span class="attention-row-copy"><small>' + escape(meta) + '</small><span>' + escape(title) + '</span></span>' +
            (unread ? '<span class="attention-unread" aria-label="Unread"></span>' : '') +
            '<span class="attention-row-arrow" aria-hidden="true">›</span></button></li>';
    }

    private renderConditions() {
        const alerts = this.owner.fjord.attentionView().alerts.slice().sort((a, b) =>
            Number(b.severity === 'critical') - Number(a.severity === 'critical'));
        const unseen = alerts.filter(alert => !alert.acknowledged).length;
        return '<section class="attention-section" aria-labelledby="attention-conditions-title">' +
            '<div class="attention-section-heading"><h3 id="attention-conditions-title">Needs attention</h3>' +
            '<small>' + unseen + ' to review</small></div>' +
            (alerts.length ? '<ul class="attention-list attention-conditions">' + alerts.map(alert =>
                this.row('alert', alert.id, alert.headline,
                    (alert.severity === 'critical' ? 'Critical' : 'Current condition') +
                    (alert.acknowledged ? ' · Seen · still active' : ' · Review'),
                    'alert', !alert.acknowledged, alert.severity)).join('') + '</ul>' :
                '<p class="attention-empty">No current problems. New conditions will appear here.</p>') + '</section>';
    }

    private renderActivity() {
        const groups = this.groups();
        this.page = Math.min(this.page, Math.max(0, Math.ceil(groups.length / attentionLimits.page) - 1));
        const overview = this.mode === 'unread';
        let html = '<section class="attention-section" aria-labelledby="attention-activity-title">' +
            '<div class="attention-section-heading"><h3 id="attention-activity-title">' +
            (overview ? 'New activity' : 'Recent activity') + '</h3>' +
            (overview && groups.length ? this.button('read-all', 'Mark updates read') : '') + '</div>';
        html += '<ul class="attention-list">' + groups.slice(this.page * attentionLimits.page,
            (this.page + 1) * attentionLimits.page).map(group => {
                const first = group.records[0], category = categories[first.category];
                const title = group.records.length === 1 ? first.headline :
                    group.records.length + ' ' + (plurals[first.canonicalType] ?? 'recorded events');
                const meta = category.label + ' · Year ' + first.time.winter +
                    (group.unread ? ' · ' + group.unread + ' unread' : ' · Read');
                return this.row(group.records.length === 1 ? 'event' : 'group',
                    group.records.length === 1 ? first.eventId : group.id, title, meta, category.glyph, group.unread > 0);
            }).join('') + '</ul>';
        if (!groups.length) html += '<p class="attention-empty">' + (overview ?
            'You’re up to date. Earlier updates are in History.' : 'No recent activity recorded yet.') + '</p>';
        html += '<nav class="attention-pagination" aria-label="Activity pages">' +
            (this.page > 0 ? this.button('page', 'Previous', String(this.page - 1)) : '') +
            ((this.page + 1) * attentionLimits.page < groups.length ?
                this.button('page', 'More updates', String(this.page + 1)) : '') + '</nav>';
        if (!overview) html += '<div class="attention-history-footer"><p>Looking further back?</p>' +
            this.button('chronicle', 'Browse recorded history') + '</div>';
        return html + '</section>';
    }

    private renderHistory() {
        const page = this.owner.session.attentionHistory().chroniclePage(
            this.owner.session.readSnapshot().events, this.before);
        return '<section class="attention-section"><div class="attention-section-heading">' +
            '<h3>Recorded history</h3>' + this.button('all', 'Recent activity') + '</div>' +
            '<p class="attention-hint">Includes routine facts. These do not add to the Attention count.</p>' +
            '<ul class="attention-list">' + page.records.map(record => this.row('event', record.eventId,
                record.headline, categories[record.category].label + ' · ' + when(record),
                categories[record.category].glyph)).join('') + '</ul>' +
            (!page.records.length ? '<p class="attention-empty">No formatted facts in this part of the history.</p>' : '') +
            '<nav class="attention-pagination" aria-label="Recorded history pages">' +
            (this.before !== undefined ? this.button('newest', 'Newest records') : '') +
            (page.nextBefore > 0 ? this.button('older', 'Earlier records', String(page.nextBefore)) : '') + '</nav></section>';
    }

    render() {
        if (this.epoch !== this.owner.session.personalHistoryEpoch) {
            this.epoch = this.owner.session.personalHistoryEpoch;
            this.detail = undefined;
            this.page = 0;
            this.before = undefined;
        }
        this.root.dataset.activityView = this.mode === 'unread' ? 'overview' : 'history';
        let html = '<nav class="attention-modes" aria-label="Activity Center views">' +
            this.button('unread', 'Overview') + this.button('all', 'History') + '</nav>';
        if (this.detail) html += '<div class="attention-detail">' + this.renderDetail() + '</div>';
        else if (this.mode === 'chronicle') html += this.renderHistory();
        else html += (this.mode === 'unread' ? this.renderConditions() : '') + this.renderActivity();
        if (html === this.rendered) return;
        const focused = this.root.contains(this.root.ownerDocument.activeElement) ?
            (this.root.ownerDocument.activeElement as HTMLElement).closest<HTMLElement>('[data-attention-action]') : null;
        const action = focused?.dataset.attentionAction, id = focused?.dataset.attentionId;
        this.root.innerHTML = html;
        this.rendered = html;
        if (action) {
            const replacement = Array.from(this.root.querySelectorAll<HTMLElement>('[data-attention-action]'))
                .find(button => button.dataset.attentionAction === action && button.dataset.attentionId === id);
            const fallback = this.detail ? '[data-attention-action="back"]' : '.attention-modes [aria-pressed="true"]';
            (replacement ?? this.root.querySelector<HTMLElement>(fallback))?.focus();
        }
    }
    private renderDetail() {
        const detail = this.detail!, state = this.owner.session.readSnapshot();
        let html = this.button('back', this.mode === 'unread' ? 'Back to overview' : 'Back to history');
        if (detail.kind === 'group') {
            const records = this.owner.fjord.attentionView().records.filter(record =>
                record.canonicalType + ':' + record.time.winter === detail.id).slice().reverse();
            html += '<h3>Recorded events</h3>' + this.button('read-group', 'Mark these events read', detail.id) +
                '<ul class="attention-list">' + records.slice(this.detailPage * 20, this.detailPage * 20 + 20).map(record =>
                    this.row('event', record.eventId, record.headline, when(record), categories[record.category].glyph, !record.read)).join('') + '</ul>' +
                (this.detailPage > 0 ? this.button('detail-page', 'Newer events', String(this.detailPage - 1)) : '') +
                ((this.detailPage + 1) * 20 < records.length ? this.button('detail-page', 'Older events', String(this.detailPage + 1)) : '');
        } else if (detail.kind === 'alert') {
            const alert = this.owner.fjord.attentionView().alerts.find(alert => alert.id === detail.id);
            if (!alert) return html + '<p>This condition has resolved.</p>';
            html += '<h3>' + escape(alert.headline) + '</h3><p class="attention-hint">' +
                (alert.severity === 'critical' ? 'Critical condition' : 'Current condition') + '</p>';
            if (resolveAttentionTarget(state, alert.target)) html += this.button('target-alert', targetLabels[alert.target!.kind], alert.id);
            html += '<div class="attention-confirm">' + (!alert.acknowledged ?
                this.button('ack', 'Confirm seen', alert.id + '|' + alert.since) : '<p>Seen · still active</p>') +
                '<p class="attention-hint">Confirming removes this alert from the count. The condition stays here until resolved.</p></div>';
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
