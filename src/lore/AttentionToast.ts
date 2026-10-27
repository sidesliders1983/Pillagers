import type { SharedSettlement } from '../play/SharedSettlement';
import { icon, type FjordIcon } from '../fjord-play/FjordIcons';
import { eventOrdinal } from './AttentionHistory';
import './attention.css';

type Notice = { eventId?: string; alertId?: string } & { text: string; label: string; glyph: FjordIcon };
const toastDurationMs = 8000;
const queueLimit = 3;
/** Ephemeral delivery of new canonical facts. Attention remains the persistent source of truth. */
export class AttentionToast {
    private head = 0;
    private epoch = -1;
    private alerts = new Set<string>();
    private pending: Notice[] = [];
    private current?: Notice;
    private timer?: number;
    private disposed = false;

    constructor(private root: HTMLElement, private owner: SharedSettlement, private openActivity: (eventId?: string) => void) {
        root.innerHTML = '<span class="attention-toast-mark"></span><span class="attention-toast-copy">' +
            '<small></small><span class="attention-toast-text" id="fjord-notification-message" role="status" aria-live="polite" aria-atomic="true"></span></span>';
        root.setAttribute('aria-label', 'Open Activity Center');
        root.setAttribute('aria-describedby', 'fjord-notification-message');
        root.addEventListener('click', this.click);
        root.addEventListener('focusin', this.hold);
        root.addEventListener('focusout', this.resume);
        this.baseline();
    }

    private baseline() {
        this.head = this.owner.session.readSnapshot().events.length;
        this.epoch = this.owner.session.personalHistoryEpoch;
        this.alerts = new Set(this.owner.fjord.attentionView().alerts.map(alert => alert.id + '|' + alert.since));
        this.clear();
    }

    update(suspended = false) {
        if (this.disposed) return;
        if (suspended || this.epoch !== this.owner.session.personalHistoryEpoch) {
            this.baseline();
            return;
        }
        const state = this.owner.session.readSnapshot();
        if (state.events.length === this.head) return;
        const view = this.owner.fjord.attentionView();
        const records = view.records.filter(record => eventOrdinal(record.eventId) > this.head && !record.read);
        const nextAlerts = new Set(view.alerts.map(alert => alert.id + '|' + alert.since));
        const critical = view.alerts.filter(alert => alert.severity === 'critical' && !alert.acknowledged &&
            !this.alerts.has(alert.id + '|' + alert.since));
        this.head = state.events.length;
        this.alerts = nextAlerts;
        const notices: Notice[] = records.map(record => ({ eventId: record.eventId,
            text: record.shortText ?? record.headline,
            label: record.category === 'expedition' ? 'Expedition' : record.category === 'discovery' ? 'Discovery' : 'Clan update',
            glyph: record.category === 'expedition' ? 'route' : record.category === 'discovery' ? 'map' : 'people' }));
        notices.unshift(...critical.map(alert => ({ alertId: alert.id, text: alert.headline,
            label: 'Needs attention', glyph: 'alert' as const })));
        // A fast-forward burst is one invitation to Attention, never a long replay queue.
        if (notices.length > queueLimit) {
            if (critical.length) this.enqueue(notices[0]);
            this.enqueue(this.summary());
        }
        else for (const notice of notices) this.enqueue(notice);
        this.showNext();
    }

    private summary(): Notice {
        return { text: 'New updates from your clan and expeditions.', label: 'Catch up in Attention', glyph: 'book' };
    }

    private enqueue(notice: Notice) {
        if (this.pending.length && !this.pending.at(-1)!.eventId && !this.pending.at(-1)!.alertId) return;
        if (this.pending.length >= queueLimit) this.pending[queueLimit - 1] = this.summary();
        else this.pending.push(notice);
    }

    private showNext() {
        if (this.current || !this.pending.length) return;
        this.current = this.pending.shift()!;
        const notice = this.current;
        this.root.hidden = false;
        const wildlife = this.current.eventId &&
            this.owner.fjord.attentionSource(this.current.eventId)?.canonicalType === 'WildlifeSighted';
        this.root.setAttribute('aria-label', wildlife ? 'View wildlife sighting' : 'Open Activity Center');
        this.root.querySelector('.attention-toast-mark')!.innerHTML = icon(notice.glyph);
        this.root.querySelector('small')!.textContent = notice.label;
        this.root.querySelector('.attention-toast-text')!.textContent = notice.text;
        this.resume();
    }

    private hold = () => {
        if (this.timer !== undefined) window.clearTimeout(this.timer);
        this.timer = undefined;
    };

    private resume = () => {
        this.hold();
        if (this.current) this.timer = window.setTimeout(() => this.dismiss(), toastDurationMs);
    };

    private click = () => {
        if (!this.current) return;
        if (this.owner.transferring || this.epoch !== this.owner.session.personalHistoryEpoch) {
            this.baseline();
            return;
        }
        const eventId = this.current.eventId;
        this.clear();
        this.openActivity(eventId);
    };

    private dismiss() {
        this.hold();
        this.current = undefined;
        this.root.hidden = true;
        this.showNext();
    }

    private clear() {
        this.hold(); this.pending = []; this.current = undefined; this.root.hidden = true;
    }

    dispose() {
        this.disposed = true; this.clear();
        this.root.removeEventListener('click', this.click);
        this.root.removeEventListener('focusin', this.hold);
        this.root.removeEventListener('focusout', this.resume);
    }
}
