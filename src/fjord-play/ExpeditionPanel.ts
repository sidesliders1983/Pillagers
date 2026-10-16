import { expeditionEligible, inspectWorld } from '../simulation/WorldExpeditions';
import { inspectSpatialExpeditions } from '../simulation/SpatialExpeditions';
import type { GameplaySession } from '../gameplay-lab/GameplaySession';
import type { SimulationCommand } from '../simulation/SimulationCore';
const escape = (value: string) => value.replace(/[&<>"']/g,
    char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));

/** Local intent only. Every group, cost, eligibility and journey comes from Core. */
export class ExpeditionPanel {
    private groupId = '';
    private choosing = false;
    private pending?: { x: number; z: number };
    constructor(private root: HTMLElement, private session: GameplaySession,
        private command: (command: SimulationCommand) => void,
        private targetChanged: (point?: { x: number; z: number }) => void) {
        root.innerHTML = `<p>Only expedition groups receive travel orders.</p>
            <label>Group<select id="expedition-group"><option value="">New group</option></select></label>
            <div id="expedition-editor"><label>Group name<input id="expedition-name" maxlength="60" autocomplete="off"></label>
            <details><summary>Members</summary><div id="expedition-members"></div></details>
            <button id="expedition-save" type="button">Create group</button></div>
            <button id="expedition-explore" type="button">Explore Area</button>
            <button id="expedition-recall" type="button">Return home</button>
            <p id="expedition-status" role="status" aria-live="polite"></p>
            <div id="expedition-proposal" hidden><p id="expedition-estimate"></p>
                <button id="expedition-confirm" type="button">Send group</button>
                <button id="expedition-cancel" type="button">Cancel target</button></div>
            <details><summary>Recent journeys</summary><div id="expedition-history"></div></details>`;
        root.querySelector('#expedition-group')!.addEventListener('change', event => {
            this.groupId = (event.target as HTMLSelectElement).value;
            const group = this.session.readSnapshot().world?.groups[this.groupId];
            this.name.value = group?.name ?? '';
            for (const field of this.members()) field.checked = group?.memberIds.includes(field.value) ?? false;
            this.cancelTarget(); this.refresh();
        });
        root.querySelector('#expedition-save')!.addEventListener('click', () => {
            const memberIds = this.members().filter(field => field.checked).map(field => field.value);
            this.command(this.groupId ? { type: 'EditExpeditionGroup', groupId: this.groupId,
                name: this.name.value, memberIds } : { type: 'CreateExpeditionGroup', name: this.name.value, memberIds });
        });
        root.querySelector('#expedition-explore')!.addEventListener('click', () => {
            this.root.querySelector<HTMLDetailsElement>('details')!.open = false;
            this.choosing = true; this.pending = undefined; this.targetChanged();
            this.root.querySelector('#expedition-estimate')!.textContent = '';
            this.status.textContent = 'Tap a land destination on the island. Drag and pinch still control the camera.';
            this.root.querySelector<HTMLElement>('#expedition-proposal')!.hidden = false;
            this.root.querySelector<HTMLButtonElement>('#expedition-confirm')!.disabled = true;
        });
        root.querySelector('#expedition-recall')!.addEventListener('click', () =>
            this.command({ type: 'RecallExpedition', groupId: this.groupId }));
        root.querySelector('#expedition-confirm')!.addEventListener('click', () => {
            if (!this.pending) return;
            this.command({ type: 'ExploreArea', groupId: this.groupId, target: { ...this.pending } });
        });
        root.querySelector('#expedition-cancel')!.addEventListener('click', () => this.cancelTarget());
    }
    private get name() { return this.root.querySelector<HTMLInputElement>('#expedition-name')!; }
    private get status() { return this.root.querySelector<HTMLElement>('#expedition-status')!; }
    private members() { return Array.from(this.root.querySelectorAll<HTMLInputElement>('#expedition-members input')); }
    get targeting() { return this.choosing; }
    cancelTarget() {
        this.choosing = false; this.pending = undefined; this.targetChanged();
        this.root.querySelector<HTMLElement>('#expedition-proposal')!.hidden = true;
        this.status.textContent = '';
    }
    committed() {
        this.cancelTarget();
        if (!this.groupId) {
            const groups = Object.values(this.session.readSnapshot().world?.groups ?? {});
            this.groupId = groups.at(-1)?.id ?? '';
        }
        this.refresh();
    }
    chooseTarget(point: { x: number; z: number }) {
        if (!this.choosing) return false;
        try {
            const offer = this.session.exploreOffer(this.groupId, point);
            this.pending = { ...point };
            this.targetChanged(point);
            this.root.querySelector('#expedition-estimate')!.textContent =
                `Planned round trip: about ${offer.plannedTicks} ticks · ${offer.foodCost} Food for ${offer.members} members. `+
                'Includes return provisions. No refund on recall. The party returns automatically.';
            this.root.querySelector<HTMLButtonElement>('#expedition-confirm')!.disabled = false;
            this.status.textContent = 'Destination selected. Confirm to send this group.';
        } catch (error) {
            this.pending = undefined; this.targetChanged();
            this.root.querySelector('#expedition-estimate')!.textContent = '';
            this.root.querySelector<HTMLButtonElement>('#expedition-confirm')!.disabled = true;
            this.status.textContent = String(error);
        }
        return true;
    }
    refresh() {
        const state = this.session.readSnapshot(), view = inspectWorld(state);
        if (this.groupId && !state.world?.groups[this.groupId]) {
            this.groupId = ''; this.name.value = ''; this.cancelTarget();
            for (const field of this.members()) field.checked = false;
        }
        const select = this.root.querySelector<HTMLSelectElement>('#expedition-group')!;
        const options = '<option value="">New group</option>'+view.groups.map(group =>
            `<option value="${escape(group.id)}">${escape(group.name)} · ${group.status}</option>`).join('');
        if (select.innerHTML !== options) { select.innerHTML = options; select.value = this.groupId; }
        const checked = new Set(this.members().filter(field => field.checked).map(field => field.value));
        const rows = Object.values(state.personas).filter(p => p.deathWinter === null).map(person => {
            const eligible = expeditionEligible(state, person.id, this.groupId || undefined);
            return `<label class="expedition-member"><input type="checkbox" value="${escape(person.id)}" `+
                `${eligible ? '' : 'disabled'} ${checked.has(person.id) ? 'checked' : ''}>`+
                `${escape(person.name)} · ${escape(person.occupation ?? 'No occupation')} · `+
                `${eligible ? 'Available' : 'Unavailable'}</label>`;
        }).join('');
        const members = this.root.querySelector('#expedition-members')!;
        // Keep focused/checked inputs stable on ordinary clock ticks.
        if (members.innerHTML !== rows) members.innerHTML = rows;
        const group = view.groups.find(group => group.id === this.groupId);
        const active = inspectSpatialExpeditions(state).missions.find(m => m.groupId === this.groupId && m.status !== 'Returned');
        this.root.querySelector<HTMLElement>('#expedition-editor')!.hidden = !!active;
        this.root.querySelector('#expedition-save')!.textContent = this.groupId ? 'Save group' : 'Create group';
        this.root.querySelector<HTMLButtonElement>('#expedition-save')!.disabled = !!group && group.status !== 'Ready' && group.status !== 'Unavailable';
        this.root.querySelector<HTMLButtonElement>('#expedition-explore')!.disabled = group?.status !== 'Ready' || !state.discovery;
        this.root.querySelector<HTMLButtonElement>('#expedition-recall')!.disabled = !active || active.status === 'Returning';
        if (!this.choosing) this.status.textContent = !state.discovery ?
            'Explore Area is available in the discovery prototype for new island campaigns.' :
            active ? `${active.groupName} · ${active.status}` : group ? `${group.name} · ${group.status}` : 'Create a group of eligible residents.';
        this.root.querySelector('#expedition-history')!.innerHTML = inspectSpatialExpeditions(state).missions.slice(-4).reverse()
            .map(m => `<p>${escape(m.groupName)} · ${m.status}${m.outcome ? ' · '+m.outcome : ''} · ${m.foodCost} Food supplied</p>`).join('');
    }
}