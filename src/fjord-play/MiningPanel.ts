import { inspectMining, miningBusy } from '../simulation/Mining';
import { personaAge, personaAway, isProvidingCare, type SimulationCommand, type SimulationState } from '../simulation/SimulationCore';
import { updateView } from '../gameplay-lab/updateView';
import { occupationLabel } from './FjordIcons';
import './mining.css';
const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g,
    char => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[char]!));

export function renderMining(state: SimulationState, id: string): string {
    const view = inspectMining(state), site = view.sites.find(s => s.id === id);
    if (!site) return '<p>This outcrop is not known in the current campaign.</p>';
    const unassessed = site.appearance === 'bog-iron' ?
        'Unassessed deposit. A Miner must reach it to assess its finite reserve.' :
        'Unassessed rock. A Miner must reach the outcrop to assess its finite reserve.';
    const workers = site.workers.map(w => `<p><strong>${esc(state.personas[w.personaId].name)}</strong> &middot;
        ${esc((w.reason ?? w.phase).replaceAll('-', ' '))}
        <button data-mine-recall="${esc(w.personaId)}" ${w.phase === 'Returning' ? 'disabled' : ''}>Return home</button></p>`).join('');
    const candidates = Object.values(state.personas).filter(p => p.deathWinter === null &&
        personaAge(state, p.id) >= state.mechanics!.config.workAge && !personaAway(state, p.id) &&
        !miningBusy(state, p.id) && !isProvidingCare(state, p.id));
    return `<p>${site.appearance === 'bog-iron' ? 'Natural Bog Iron deposit. Collected as Iron Ore.' : 'Rock Iron Ore deposit.'}</p>
        <p><strong>${view.ironOre} Iron Ore</strong> in clan stock</p>
        <p>${site.remainingUnits === undefined ? unassessed :
            `${site.remainingUnits} Iron Ore remaining &middot; ${site.status === 'exhausted' ? 'Exhausted' : 'Assessed'}`}</p>
        <p>${site.appearance === 'bog-iron' ? 'Natural collection: 50% productivity. No mine entrance is needed.' : site.developed ? 'Developed mine: full productivity.' : 'Undeveloped outcrop: 50% productivity.'}</p>
        ${site.appearance !== 'bog-iron' && !site.developed && site.status !== 'exhausted' ? `<button data-mine-develop="${esc(site.id)}"
            ${state.stocks.materials < view.mineCostMaterials ? 'disabled' : ''}>Build mine &middot; ${view.mineCostMaterials} Materials</button>
            ${state.stocks.materials < view.mineCostMaterials ? `<p>Needs ${view.mineCostMaterials} Materials (${state.stocks.materials} available).</p>` : ''}` : ''}
        ${workers || '<p>No Miner assigned.</p>'}
        ${site.status !== 'exhausted' ? `<h3>Assign a resident</h3><p class="fjord-caption">The resident becomes a Miner and walks here from home.
        Regular household food needs continue. No ore is produced while traveling.</p>
        ${candidates.map(p => `<button data-mine-assign="${esc(p.id)}">${esc(p.name)} &middot; ${esc(occupationLabel(p.occupation))}</button>`).join('') ||
            '<p>No available working-age resident at home.</p>'}` : '<p>This deposit does not regenerate.</p>'}`;
}

/** Contextual scene panel; canonical commands own assignments, development, travel and stocks. */
export class MiningPanel {
    private root = document.createElement('section');
    private events = new AbortController();
    private siteId = '';
    private residentId?: string;
    private epoch = -1;
    private html = '';
    private message = '';
    private pending = false;
    private lastFocus?: HTMLElement;
    constructor(host: HTMLElement, private read: () => SimulationState,
        private commit: (commands: SimulationCommand[]) => Promise<void>, private readEpoch: () => number) {
        this.root.className = 'fjord-mining';
        this.root.hidden = true;
        this.root.tabIndex = -1;
        this.root.setAttribute('role', 'dialog');
        this.root.setAttribute('aria-label', 'Iron outcrop');
        host.append(this.root);
        host.addEventListener('click', event => {
            const button = (event.target as Element).closest<HTMLElement>('[data-mining-resident]');
            if (button?.dataset.miningResident) this.openForResident(button.dataset.miningResident);
        }, {signal: this.events.signal});
        this.root.addEventListener('keydown', event => {
            event.stopPropagation();
            if (event.key === 'Escape') this.close();
        }, {signal: this.events.signal});
        this.root.addEventListener('click', event => {
            const button = (event.target as Element).closest<HTMLButtonElement>('button');
            if (!button || button.disabled) return;
            if (button.hasAttribute('data-mine-close')) { this.close(); return; }
            if (this.pending) return;
            if (button.dataset.mineDevelop) {
                this.submit([{type: 'BuildMine', siteId: button.dataset.mineDevelop}]);
                return;
            }
            if (button.dataset.mineSite && this.residentId) {
                const siteId = button.dataset.mineSite;
                this.submit([{type: 'AssignMiner', personaId: this.residentId, siteId}], () => {
                    this.siteId = siteId;
                    this.residentId = undefined;
                });
                return;
            }
            const id = button.dataset.mineAssign ?? button.dataset.mineRecall;
            if (!id) return;
            const command: SimulationCommand = button.dataset.mineAssign ?
                {type: 'AssignMiner', personaId: id, siteId: this.siteId} : {type: 'RecallMiner', personaId: id};
            this.submit(button.dataset.mineAssign && this.read().personas[id]?.occupation !== 'miner' ?
                [{type: 'AssignOccupation', personaId: id, occupation: 'miner'}, command] : [command]);
        }, {signal: this.events.signal});
    }
    open(siteId: string): void {
        const site = inspectMining(this.read()).sites.find(s => s.id === siteId);
        if (!site) return;
        this.root.setAttribute('aria-label', site.appearance === 'bog-iron' ? 'Bog Iron deposit' : 'Iron outcrop');
        if (this.root.hidden) this.lastFocus = document.activeElement as HTMLElement;
        this.residentId = undefined;
        this.siteId = siteId;
        this.epoch = this.readEpoch();
        this.message = '';
        this.root.hidden = false;
        this.refresh();
        this.root.focus();
    }
    openForResident(id: string): void {
        if (this.read().personas[id]?.occupation !== 'miner') return;
        this.root.setAttribute('aria-label', 'Mining site assignment');
        if (this.root.hidden) this.lastFocus = document.activeElement as HTMLElement;
        this.residentId = id;
        this.siteId = '';
        this.epoch = this.readEpoch();
        this.message = '';
        this.root.hidden = false;
        this.refresh();
        this.root.focus();
    }
    private submit(commands: SimulationCommand[], done?: () => void): void {
        this.pending = true;
        void this.commit(commands).then(() => { done?.(); this.message = 'Mining updated.'; },
            error => { this.message = error instanceof Error ? error.message : String(error); })
            .finally(() => { this.pending = false; this.refresh(); });
        this.refresh();
    }
    close(): void {
        if (this.root.hidden) return;
        this.root.hidden = true;
        this.lastFocus?.focus();
    }
    refresh(): void {
        if (this.root.hidden) return;
        if (this.epoch !== this.readEpoch()) { this.close(); return; }
        const state = this.read(), sites = inspectMining(state).sites;
        const worker = this.residentId && state.mining?.workers[this.residentId];
        const body = worker ? `<p>${esc(state.personas[worker.personaId].name)}: ${esc(worker.phase)}.</p>
            <p>Return home before choosing another mining site.</p>
            <button data-mine-recall="${esc(worker.personaId)}" ${worker.phase === 'Returning' ? 'disabled' : ''}>Return home</button>` : this.residentId ? `<p>Choose a known site for <strong>${esc(state.personas[this.residentId]?.name)}</strong>.</p>
            ${sites.map((site, index) => `<button data-mine-site="${esc(site.id)}" ${site.status === 'exhausted' ? 'disabled' : ''}>
                ${site.appearance === 'bog-iron' ? 'Bog Iron deposit' : site.developed ? 'Mine' : 'Iron outcrop'} ${index+1} &middot; ${esc(site.status)}</button>`).join('') ||
                '<p>No known ore sites. Explore the island first.</p>'}` : renderMining(state, this.siteId);
        const html = `<header><h2>Mining</h2><button data-mine-close aria-label="Close mining">&times;</button></header>
            <fieldset ${this.pending ? 'disabled' : ''}>${body}</fieldset><p role="status">${esc(this.message)}</p>`;
        if (html !== this.html) { updateView(this.root, html); this.html = html; }
    }
    dispose(): void { this.events.abort(); this.root.remove(); }
}
