import { updateView } from '../gameplay-lab/updateView';
import type { SimulationState } from '../simulation/SimulationCore';
import { inspectMerchants, merchantNegotiator, merchantOffer, type MerchantCommand } from '../simulation/VisitingMerchants';
import { tradeGoods, cargoUsed, type TradeManifest } from '../simulation/TradeGoods';
import { tradeGoodSupported, tradeStock } from '../simulation/TradeInventory';

const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g,
    char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));
export const tradeManifestText = (manifest: TradeManifest) => manifest.map(line =>
    line.quantity + ' ' + tradeGoods[line.goodId].label).join(' + ');

/** Transient quote window only; the authoritative visit and stocks stay in Core. */
export class MerchantPanel {
    private root = document.createElement('section');
    private abort = new AbortController();
    private draft?: MerchantCommand;
    private pending = false;
    private message = '';
    private lastFocus?: HTMLElement;
    private html = '';
    private campaignEpoch = -1;
    constructor(host: HTMLElement, private read: () => SimulationState,
        private commit: (command: MerchantCommand) => void | Promise<void>, private epoch = () => 0) {
        this.campaignEpoch = epoch();
        this.root.className = 'fjord-merchant';
        this.root.hidden = true;
        this.root.setAttribute('role', 'dialog');
        this.root.setAttribute('aria-modal', 'true');
        this.root.setAttribute('aria-label', 'Visiting merchant');
        this.root.tabIndex = -1;
        host.append(this.root);
        this.root.addEventListener('click', event => {
            const button = (event.target as Element).closest<HTMLButtonElement>('button');
            if (!button || button.disabled) return;
            if (button.hasAttribute('data-merchant-close')) this.close();
            if (button.hasAttribute('data-merchant-cancel')) { this.draft = undefined; this.message = ''; this.refresh(); }
            if (button.dataset.merchantReview) {
                const quote = merchantOffer(this.read(), button.dataset.merchantReview);
                this.draft = quote.available ? structuredClone(quote.command) : undefined;
                this.message = quote.reason ?? '';
                this.refresh();
                this.root.querySelector<HTMLButtonElement>('[data-merchant-confirm]')?.focus();
            }
            if (button.hasAttribute('data-merchant-confirm')) void this.confirm();
        }, { signal: this.abort.signal });
        this.root.addEventListener('keydown', event => {
            event.stopPropagation();
            if (event.key === 'Escape') { event.preventDefault(); this.close(); }
            if (event.key !== 'Tab') return;
            const buttons = Array.from(this.root.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
            const first = buttons[0], last = buttons.at(-1);
            if (event.shiftKey && (document.activeElement === first || document.activeElement === this.root)) {
                event.preventDefault(); last?.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault(); first?.focus();
            }
        }, { signal: this.abort.signal });
    }
    open() {
        this.campaignEpoch = this.epoch();
        this.lastFocus = document.activeElement as HTMLElement;
        this.draft = undefined;
        this.message = '';
        this.root.hidden = false;
        this.refresh();
        this.root.focus();
    }
    close() {
        if (this.pending) return;
        this.root.hidden = true;
        this.draft = undefined;
        if (this.lastFocus?.isConnected) this.lastFocus.focus();
    }
    private async confirm() {
        if (!this.draft || this.pending) return;
        this.pending = true;
        const command = structuredClone(this.draft);
        this.refresh();
        try {
            await this.commit(command);
            this.draft = undefined;
            this.message = 'Exchange completed.';
        } catch (error) {
            this.draft = undefined;
            this.message = (error as Error).message;
        } finally { this.pending = false; this.refresh(); }
    }
    refresh() {
        if (this.campaignEpoch !== this.epoch()) {
            this.campaignEpoch = this.epoch();
            this.root.hidden = true;
            this.draft = undefined;
            return;
        }
        if (this.root.hidden || this.abort.signal.aborted) return;
        const state = this.read(), view = inspectMerchants(state), visit = view.visit;
        const negotiator = merchantNegotiator(state);
        const button = (attribute: string, label: string, disabled = false) =>
            `<button type="button" data-view-key="${esc(attribute)}" ${attribute} ${disabled ? 'disabled' : ''}>${label}</button>`;
        const stocks = Object.values(tradeGoods).filter(good => tradeGoodSupported(state, good.goodId))
            .map(good => `${tradeStock(state, good.goodId)} ${good.label}`).join(' · ');
        const title = visit ? (visit.profile === 'supply' ? 'Supply merchant' : 'Craft merchant') : 'Trading at the shore';
        const html = `<header><h2>${title}</h2>${button('data-merchant-close aria-label="Close merchant"', '×', this.pending)}</header>
            <p class="fjord-caption">Trade with the visiting ship.</p>
            <p class="fjord-caption">Stored here: ${esc(stocks)}. Worn equipment is excluded.</p>
            ${this.message ? `<p role="status">${esc(this.message)}</p>` : ''}
            ${!view.enabled ? '<p>Visiting trade is not enabled for this saved campaign.</p>' : !visit ?
                '<p>No merchant is visiting. Watch the Activity Center for the next arrival.</p>' : this.draft ?
                `<section aria-label="Confirm barter"><h3>Confirm exchange</h3>
                    <p><strong>Give ${esc(tradeManifestText(this.draft.give))}</strong></p>
                    <p><strong>Receive ${esc(tradeManifestText(this.draft.receive))}</strong></p>
                    <p>Exchange these stored goods? Your ship and travel supplies are kept.</p>
                    <div class="fjord-actions">${button('data-merchant-confirm', this.pending ? 'Exchanging…' : 'Confirm exchange', this.pending)}
                    ${button('data-merchant-cancel', 'Not now', this.pending)}</div></section>` :
                `<p>${negotiator.traderId ? esc(negotiator.name) + ' negotiates using their Trader aptitude. Whole-unit prices may round to the same amount.' :
                    'Standard terms. An available adult Trader at home can improve the rate.'}</p>
                <p class="fjord-caption">Leaves in ${((visit.departureTick - state.time.winter * state.ticksPerWinter - state.time.tick) / state.ticksPerWinter).toFixed(1)} Winters.</p>
                <div class="fjord-merchant-offers">${visit.offers.map(entry => {
                    const offer = merchantOffer(state, entry.id);
                    return `<article data-view-key="${entry.id}"><h3>${esc(tradeManifestText(offer.receive))}</h3>
                        <p>Give <strong>${esc(tradeManifestText(offer.give))}</strong></p>
                        <p class="fjord-caption">${entry.remainingLots} ${entry.remainingLots === 1 ? 'exchange' : 'exchanges'} left · ${cargoUsed(offer.receive)} CU of goods</p>
                        ${button(`data-merchant-review="${entry.id}"`, 'Review exchange', !offer.available)}
                        ${offer.reason ? `<p class="fjord-caption">${esc(offer.reason)}</p>` : ''}</article>`;
                }).join('')}</div>`}
            <details><summary>Cargo Units &amp; barter</summary><p>Cargo Units (CU) measure space on a ship. Barter rates determine the exact goods exchanged.
                This shore exchange keeps your own ship available. Assigned equipment stays with its resident.</p></details>`;
        if (html !== this.html) { updateView(this.root, html); this.html = html; }
    }
    dispose() { this.abort.abort(); this.root.remove(); }
}
