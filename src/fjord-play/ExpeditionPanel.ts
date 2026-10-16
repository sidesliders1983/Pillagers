import { expeditionEligible, groupMission, inspectWorld } from '../simulation/WorldExpeditions';
import { inspectSpatialExpeditions } from '../simulation/SpatialExpeditions';
import type { GameplaySession } from '../gameplay-lab/GameplaySession';
import type { SimulationCommand } from '../simulation/SimulationCore';
import type { Point2 } from '../world-generation/WorldBlueprint';
const escape = (value: string) => value.replace(/[&<>"']/g,
    char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));

/** Selection supplies context; all membership, eligibility, costs and travel remain Core commands. */
export class ExpeditionPanel {
    private groupId = '';
    private controlsHTML = '';
    private choosing = false;
    private pending?: Point2;
    private quotedCost?: number;
    constructor(private root: HTMLElement, private session: GameplaySession,
        private command: (command: SimulationCommand) => void,
        private targetChanged: (point?: Point2) => void,
        private selection: () => { kind: string; id: string } | null,
        private origins: (memberIds: readonly string[]) => Record<string, Point2>) {
        root.innerHTML = '<div id="expedition-controls"></div>' +
            '<p id="expedition-status" role="status" aria-live="polite"></p>' +
            '<div id="expedition-proposal" hidden><p id="expedition-estimate"></p>' +
            '<button id="expedition-confirm" type="button">Send group</button>' +
            '<button id="expedition-cancel" type="button">Cancel target</button></div>';
        root.addEventListener('click', event => {
            const button = (event.target as Element).closest<HTMLButtonElement>('button');
            if (!button || button.disabled) return;
            if (button.id === 'expedition-create') this.command({ type: 'CreateExplorationGroup' });
            if (button.dataset.explore) {
                this.groupId = button.dataset.explore;
                this.choosing = true; this.pending = undefined; this.targetChanged();
                this.root.querySelector('#expedition-estimate')!.textContent = '';
                this.status.textContent = 'Tap a land destination. Drag and pinch still control the camera.';
                this.root.querySelector<HTMLElement>('#expedition-proposal')!.hidden = false;
                this.root.querySelector<HTMLButtonElement>('#expedition-confirm')!.disabled = true;
            }
            if (button.dataset.recall)
                this.command({ type: 'RecallExpedition', groupId: button.dataset.recall });
            if (button.id === 'expedition-add' || button.dataset.remove) {
                const person = this.selection();
                const groupId = button.dataset.remove ?? this.root.querySelector<HTMLSelectElement>('#expedition-join')!.value;
                if (person?.kind === 'persona' && groupId)
                    this.command({
                        type: 'SetExplorationMember', groupId, personaId: person.id,
                        included: !button.dataset.remove
                    });
            }
            if (button.id === 'expedition-confirm' && this.pending) {
                try {
                    const members = this.session.readSnapshot().world!.groups[this.groupId].memberIds;
                    const origins = this.origins(members);
                    const offer = this.session.exploreOffer(this.groupId, this.pending, origins);
                    if (offer.foodCost !== this.quotedCost) {
                        this.showOffer(offer);
                        this.status.textContent = 'The journey estimate changed as residents moved. Confirm the updated provisions.';
                        return;
                    }
                    this.command({ type: 'ExploreArea', groupId: this.groupId, target: { ...this.pending }, origins });
                } catch (error) {
                    this.status.textContent = error instanceof Error ? error.message : String(error);
                }
            }
            if (button.id === 'expedition-cancel') this.cancelTarget();
        });
    }
    private get status() { return this.root.querySelector<HTMLElement>('#expedition-status')!; }
    get targeting() { return this.choosing; }
    cancelTarget() {
        this.choosing = false; this.pending = undefined; this.quotedCost = undefined; this.targetChanged();
        this.root.querySelector<HTMLElement>('#expedition-proposal')!.hidden = true;
        this.status.textContent = '';
    }
    committed() {
        this.cancelTarget(); this.refresh();
        const last = this.root.querySelectorAll<HTMLDetailsElement>('details[data-group]');
        if (last.length) last[last.length - 1].open = true;
    }
    private showOffer(offer: { plannedTicks: number; foodCost: number; members: number }) {
        this.quotedCost = offer.foodCost;
        this.root.querySelector('#expedition-estimate')!.textContent =
            'Planned round trip: about ' + offer.plannedTicks + ' ticks · ' + offer.foodCost + ' Food for ' + offer.members +
            ' members. Includes return provisions and waiting for the group. No refund on recall. Automatic return.';
    }
    chooseTarget(point: Point2) {
        if (!this.choosing) return false;
        try {
            const members = this.session.readSnapshot().world!.groups[this.groupId].memberIds;
            const offer = this.session.exploreOffer(this.groupId, point, this.origins(members));
            this.pending = { ...offer.target }; this.targetChanged(offer.target); this.showOffer(offer);
            this.root.querySelector<HTMLButtonElement>('#expedition-confirm')!.disabled = false;
            this.status.textContent = offer.adjusted ?
                'Destination adjusted to nearby walkable ground. Review the marker before sending the group.' :
                'Destination selected. Send the group from their current positions.';
        } catch (error) {
            this.pending = undefined; this.targetChanged();
            this.root.querySelector('#expedition-estimate')!.textContent = '';
            this.root.querySelector<HTMLButtonElement>('#expedition-confirm')!.disabled = true;
            this.status.textContent = String(error);
        }
        return true;
    }
    refresh() {
        const state = this.session.readSnapshot(), selected = this.selection(), view = inspectWorld(state);
        const controls = this.root.querySelector<HTMLElement>('#expedition-controls')!;
        const open = new Set(Array.from(controls.querySelectorAll<HTMLDetailsElement>('details[open]')).map(d => d.dataset.group));
        const selectedGroup = controls.querySelector<HTMLSelectElement>('#expedition-join')?.value;
        let html = '';
        if (!selected) {
            html = '<button id="expedition-create" type="button" ' + (!state.discovery ? 'disabled' : '') +
                '>Create exploration group</button>';
            html += view.groups.map(group => {
                const journeys = inspectSpatialExpeditions(state).missions.filter(m => m.groupId === group.id);
                const active = journeys.find(m => m.status !== 'Returned');
                const latest = journeys.at(-1);
                return '<details data-group="' + escape(group.id) + '"><summary>' + escape(group.name) + ' · ' +
                    group.members.length + ' members · ' + group.status + '</summary><p>' + (group.members.length ?
                        group.members.map(p => escape(p.name)).join(', ') : 'Select residents on the island to add them to this group.') +
                    '</p><button data-explore="' + escape(group.id) + '" ' + (group.status !== 'Ready' || !state.discovery ? 'disabled' : '') +
                    '>Explore Area</button> <button data-recall="' + escape(group.id) + '" ' +
                    (!active || active.status === 'Returning' ? 'disabled' : '') + '>Return Home</button>' +
                    (latest ? '<p>' + escape(latest.outcome ?? latest.status) + ' · ' + latest.foodCost + ' Food supplied</p>' : '') +
                    '</details>';
            }).join('');
        } else if (selected.kind === 'persona') {
            const current = Object.values(state.world?.groups ?? {}).find(g => g.memberIds.includes(selected.id));
            if (current) html = '<p>Exploration group: ' + escape(current.name) + '</p><button data-remove="' + escape(current.id) + '" ' +
                (groupMission(state, current.id) ? 'disabled' : '') + '>Leave group</button>';
            else {
                const groups = view.groups.filter(g => !groupMission(state, g.id));
                const eligible = expeditionEligible(state, selected.id) && groups.length > 0;
                html = '<label>Add to exploration group<select id="expedition-join" ' + (!eligible ? 'disabled' : '') + '>' +
                    groups.map(g => '<option value="' + escape(g.id) + '">' + escape(g.name) + '</option>').join('') +
                    '</select></label><button id="expedition-add" ' + (!eligible ? 'disabled' : '') + '>Add to group</button>' +
                    (!groups.length ? '<p>Clear the selection to create an exploration group.</p>' : '');
            }
        }
        if (this.controlsHTML !== html) {
            this.controlsHTML = html;
            controls.innerHTML = html;
            for (const detail of Array.from(controls.querySelectorAll<HTMLDetailsElement>('details[data-group]')))
                detail.open = open.has(detail.dataset.group);
            const join = controls.querySelector<HTMLSelectElement>('#expedition-join');
            if (join && selectedGroup && Array.from(join.options).some(o => o.value === selectedGroup)) join.value = selectedGroup;
        }
        this.root.hidden = !html && !this.choosing;
        if (this.groupId && !state.world?.groups[this.groupId]) this.cancelTarget();
        if (!this.choosing) this.status.textContent = !state.discovery && !selected ?
            'Exploration is available in discovery prototype campaigns.' : '';
    }
}
