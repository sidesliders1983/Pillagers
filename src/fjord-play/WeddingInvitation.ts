import { gatheringOffer, weddingCandidates } from '../simulation/SimulationCore';
import type { SimulationCommand } from '../simulation/SimulationCore';
import type { SharedSettlement } from '../play/SharedSettlement';
import { renderGatheringPrice, type GatheringOffer } from './CulturalGatheringView';
import './wedding-invitation.css';

interface InvitationHooks {
    changed: () => void;
    commit: (commands: SimulationCommand[] | (() => SimulationCommand[]), accepted: () => void, rejected: (error: unknown) => void) => void;
}
const escape = (value: unknown) => String(value ?? '').replace(/[&<>"']/g,
    character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]!));

/** Optional delivery of an unread real partnership; Attention owns persistent acknowledgement. */
export class WeddingInvitation {
    readonly root = document.createElement('section');
    private abort = new AbortController();
    private sourceId?: string;
    private quote?: GatheringOffer;
    private pending = false;
    private feedback = '';
    private epoch = -1;
    private deferRevision = -1;
    private rendered = '';
    private previousFocus?: HTMLElement;

    constructor(parent: HTMLElement, private owner: SharedSettlement, private hooks: InvitationHooks) {
        this.root.className = 'fjord-wedding-invitation';
        this.root.hidden = true;
        this.root.tabIndex = -1;
        this.root.setAttribute('role', 'dialog');
        this.root.setAttribute('aria-modal', 'false');
        this.root.setAttribute('aria-labelledby', 'fjord-wedding-invitation-title');
        parent.append(this.root);
        this.root.addEventListener('click', this.click, { signal: this.abort.signal });
        for (const type of ['pointerdown', 'pointerup'])
            this.root.addEventListener(type, event => event.stopPropagation(), { signal: this.abort.signal });
        document.addEventListener('keydown', this.keydown, { capture: true, signal: this.abort.signal });
    }

    update(suspended = false): void {
        if (this.epoch !== this.owner.session.personalHistoryEpoch) {
            this.epoch = this.owner.session.personalHistoryEpoch;
            this.clear();
        }
        if (suspended || this.owner.transferring) { this.root.hidden = true; return; }
        if (!this.owner.session.inspectCulture().enabled) { this.clear(); return; }
        const unread = this.owner.fjord.attentionView().records.filter(record =>
            record.canonicalType === 'PartnershipFormed' && !record.read);
        if (unread.length === 0) { this.clear(); return; }
        const state = this.owner.session.readSnapshot();
        const candidates = weddingCandidates(state).filter(candidate => !candidate.celebratedEventId &&
            unread.some(record => record.eventId === candidate.sourceEventId));
        if (this.sourceId && !candidates.some(candidate => candidate.sourceEventId === this.sourceId)) {
            this.clear(); return;
        }
        if (!this.sourceId && this.deferRevision === this.owner.session.revision) return;
        const candidate = candidates.find(item => item.sourceEventId === this.sourceId) ?? candidates[0];
        if (!candidate) { this.clear(); return; }
        if (!this.sourceId) this.previousFocus = document.activeElement as HTMLElement;
        this.sourceId = candidate.sourceEventId;
        this.root.dataset.weddingSource = this.sourceId;
        if (!this.pending) this.quote = gatheringOffer(state, 'wedding', this.sourceId);
        const quote = this.quote!;
        const resourcesMissing = state.stocks.food < quote.foodCost || state.stocks.materials < quote.materialsCost;
        const html = `<header><h2 id="fjord-wedding-invitation-title">Wedding celebration</h2>
            <button type="button" data-wedding-action="close" aria-label="Close wedding invitation"${this.pending ? ' disabled' : ''}>×</button></header>
            <p class="fjord-wedding-couple">${escape(candidate.spouses.map(person => person.name).join(' & '))}</p>
            <p>Their partnership is recorded. Would you like to support its celebration?</p>
            ${renderGatheringPrice(quote)}
            <p class="fjord-caption">You can celebrate within one year of their partnership. Declining does not change their relationship.</p>
            <p role="status">${escape(this.feedback || (this.pending ? 'Confirming celebration…' : quote.reason ?? ''))}</p>
            <div class="fjord-actions"><button type="button" data-wedding-action="confirm"${this.pending || !quote.allowed ? ' disabled' : ''}>${resourcesMissing ? 'Not enough resources' : 'Confirm'}</button>
                <button type="button" data-wedding-action="decline"${this.pending ? ' disabled' : ''}>Not now</button></div>`;
        if (html !== this.rendered) { this.root.innerHTML = html; this.rendered = html; }
        this.root.hidden = false;
    }

    private confirm(): void {
        const quote = this.quote, sourceId = this.sourceId, epoch = this.epoch;
        if (!quote?.allowed || !sourceId || this.pending) return;
        this.pending = true;
        this.feedback = '';
        this.update();
        this.hooks.commit(() => {
            if (this.owner.transferring || epoch !== this.owner.session.personalHistoryEpoch)
                throw new Error('This invitation no longer belongs to the active campaign.');
            return [{ type: 'SponsorGathering', occasion: 'wedding', sourceEventId: sourceId,
                expectedSequence: quote.expectedSequence, quotedFood: quote.foodCost,
                quotedMaterials: quote.materialsCost, expectedParticipantIds: [...quote.participantIds] }];
        }, () => {
            if (epoch !== this.owner.session.personalHistoryEpoch) return;
            this.owner.fjord.markAttentionRead([sourceId]);
            if (this.sourceId === sourceId) {
                this.deferRevision = this.owner.session.revision;
                this.clear();
            }
            this.hooks.changed();
            if (this.previousFocus?.isConnected) this.previousFocus.focus({ preventScroll: true });
        }, error => {
            if (epoch !== this.owner.session.personalHistoryEpoch || this.sourceId !== sourceId) return;
            this.pending = false;
            this.feedback = error instanceof Error ? error.message : String(error);
            this.update();
        });
    }
    private decline(): void {
        if (!this.sourceId || this.pending) return;
        this.owner.fjord.markAttentionRead([this.sourceId]);
        this.deferRevision = this.owner.session.revision;
        this.clear();
        this.hooks.changed();
        if (this.previousFocus?.isConnected) this.previousFocus.focus({ preventScroll: true });
    }
    private click = (event: MouseEvent): void => {
        event.stopPropagation();
        const button = (event.target as Element).closest<HTMLButtonElement>('[data-wedding-action]');
        if (!button || button.disabled || this.owner.transferring) return;
        if (button.dataset.weddingAction === 'confirm') this.confirm();
        else if (button.dataset.weddingAction === 'decline' || button.dataset.weddingAction === 'close') this.decline();
    };
    private keydown = (event: KeyboardEvent): void => {
        if (event.key !== 'Escape' || this.root.hidden || this.pending) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        this.decline();
    };
    private clear(): void {
        this.sourceId = undefined;
        this.quote = undefined;
        this.feedback = '';
        this.pending = false;
        delete this.root.dataset.weddingSource;
        this.root.hidden = true;
    }
    dispose(): void { this.abort.abort(); this.root.remove(); }
}
