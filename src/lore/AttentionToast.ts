import type { SharedSettlement } from '../play/SharedSettlement';
import { icon, type FjordIcon } from '../fjord-play/FjordIcons';
import { eventOrdinal } from './AttentionHistory';
import './attention.css';

type ToastTarget = { eventId?: string; alertId?: string };
type Notice = ToastTarget & { text: string; label: string; glyph: FjordIcon };
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

    constructor(private root: HTMLElement, private owner: SharedSettlement,
        private navigate: (target: ToastTarget) => void) {
        root.innerHTML = '<span class="attention-toast-mark"></span><div class="attention-toast-copy">' +
            '<small></small><p role="status" aria-live="polite" aria-atomic="true"></p>' +
            '<button type="button" data-toast-view>View details <span aria-hidden="true">→</span></button></div>' +
            '<button type="button" data-toast-dismiss aria-label="Dismiss notification">' + icon('close') + '</button>';
        this.baseline();
        root.addEventListener('click', this.click);
        root.addEventListener('mouseenter', this.hold);
        root.addEventListener('mouseleave', this.release);
        root.addEventListener('focusin', this.hold);
        root.addEventListener('focusout', this.focusout);
        root.addEventListener('keydown', this.keydown);
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
        this.root.querySelector('.attention-toast-mark')!.innerHTML = icon(notice.glyph);
        this.root.querySelector('small')!.textContent = notice.label;
        this.root.querySelector('p')!.textContent = notice.text;
        this.release();
    }

    private hold = () => {
        if (this.timer !== undefined) window.clearTimeout(this.timer);
        this.timer = undefined;
    };

    private release = () => this.startTimer();

    private startTimer(leavingFocus = false) {
        this.hold();
        if (!this.current || (!leavingFocus && this.root.contains(document.activeElement)) || this.root.matches(':hover')) return;
        this.timer = window.setTimeout(() => this.dismiss(), toastDurationMs);
    }

    private focusout = (event: FocusEvent) => {
        if (!this.root.contains(event.relatedTarget as Node | null)) this.startTimer(true);
    };

    private dismiss(restoreFocus = false) {
        const focused = this.root.contains(document.activeElement);
        this.hold();
        this.current = undefined;
        this.root.hidden = true;
        this.showNext();
        if (restoreFocus && focused) {
            const next = this.current ? this.root.querySelector<HTMLElement>('[data-toast-view]') :
                document.querySelector<HTMLElement>('#fjord-attention');
            next?.focus();
        }
    }

    private click = (event: MouseEvent) => {
        const button = (event.target as Element).closest('button');
        if (!button || !this.current) return;
        if (this.owner.transferring || this.epoch !== this.owner.session.personalHistoryEpoch) {
            this.baseline();
            return;
        }
        if (button.hasAttribute('data-toast-dismiss')) this.dismiss(true);
        else if (button.hasAttribute('data-toast-view')) {
            const target = { eventId: this.current.eventId, alertId: this.current.alertId };
            this.clear();
            this.navigate(target);
        }
    };

    private keydown = (event: KeyboardEvent) => {
        if (event.key !== 'Escape') return;
        event.preventDefault(); event.stopPropagation(); this.dismiss(true);
    };

    private clear() {
        this.hold(); this.pending = []; this.current = undefined; this.root.hidden = true;
    }

    dispose() {
        this.disposed = true; this.clear();
        this.root.removeEventListener('click', this.click);
        this.root.removeEventListener('mouseenter', this.hold);
        this.root.removeEventListener('mouseleave', this.release);
        this.root.removeEventListener('focusin', this.hold);
        this.root.removeEventListener('focusout', this.focusout);
        this.root.removeEventListener('keydown', this.keydown);
    }
}
