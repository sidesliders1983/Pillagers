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
    private pendingStart = '';
    private showingDestination = false;
    constructor(private root: HTMLElement, private session: GameplaySession,
        private command: (command: SimulationCommand) => void,
        private targetChanged: (point?: Point2) => void,
        private selection: () => { kind: string; id: string } | null,
        private origins: (memberIds: readonly string[]) => Record<string, Point2>) {
        root.innerHTML = '<div id="expedition-controls"></div>' +
            '<p id="expedition-status" role="status" aria-live="polite"></p>' +
            '<div id="expedition-proposal" hidden><p id="expedition-estimate"></p>' +
            '<button id="expedition-cancel" type="button">Cancel target</button></div>' +
            '<dialog id="expedition-start-dialog" aria-labelledby="expedition-start-title">' +
            '<h2 id="expedition-start-title">Start Expedition</h2><p id="expedition-start-summary"></p>' +
            '<button id="expedition-start-confirm" type="button">Start Expedition</button> ' +
            '<button id="expedition-start-cancel" type="button">Cancel</button></dialog>';
        root.addEventListener('click', event => {
            const button = (event.target as Element).closest<HTMLButtonElement>('button');
            if (!button || button.disabled) return;
            const dialog = this.root.querySelector<HTMLDialogElement>('#expedition-start-dialog')!;
            if (button.dataset.start) {
                try {
                    const offer = this.session.startExpeditionOffer(button.dataset.start);
                    this.groupId = this.pendingStart = button.dataset.start;
                    this.root.querySelector('#expedition-start-summary')!.textContent =
                        'This will cost ' + offer.foodCost + ' food (2 food per member). Are you sure?';
                    dialog.showModal();
                } catch (error) { this.status.textContent = error instanceof Error ? error.message : String(error); }
            }
            if (button.id === 'expedition-start-cancel') { dialog.close(); this.pendingStart = ''; }
            if (button.id === 'expedition-start-confirm' && this.pendingStart) {
                try {
                    this.session.startExpeditionOffer(this.pendingStart);
                    const groupId = this.pendingStart;
                    dialog.close(); this.pendingStart = '';
                    this.command({ type: 'StartExpedition', groupId });
                } catch (error) {
                    this.root.querySelector('#expedition-start-summary')!.textContent = error instanceof Error ? error.message : String(error);
                }
            }
            if (button.dataset.cancelExpedition)
                this.command({ type: 'CancelExpedition', groupId: button.dataset.cancelExpedition });
            if (button.id === 'expedition-create') this.command({ type: 'CreateExplorationGroup' });
            if (button.dataset.explore) {
                this.groupId = button.dataset.explore;
                this.choosing = true; this.targetChanged();
                this.root.querySelector('#expedition-estimate')!.textContent = 'Choose a land destination. The same carried supplies cover travel, exploring and a safe return. No Food is bought when choosing or changing destinations.';
                this.status.textContent = 'Tap a land destination. Drag and pinch still control the camera.';
                this.root.querySelector<HTMLElement>('#expedition-proposal')!.hidden = false;
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
            if (button.id === 'expedition-cancel') this.cancelTarget();
        });
    }
    private get status() { return this.root.querySelector<HTMLElement>('#expedition-status')!; }
    get targeting() { return this.choosing; }
    cancelTarget() {
        this.choosing = false; this.showingDestination = false; this.targetChanged();
        this.root.querySelector<HTMLElement>('#expedition-proposal')!.hidden = true;
        this.status.textContent = '';
    }
    committed(dispatched = false) {
        this.cancelTarget();
        if (dispatched) {
            const mission = inspectSpatialExpeditions(this.session.readSnapshot()).missions
                .find(m => m.groupId === this.groupId && m.status !== 'Returned');
            if (mission) {
                this.showingDestination = true;
                this.targetChanged(mission.target);
            }
        }
        this.refresh();
        const last = this.root.querySelectorAll<HTMLDetailsElement>('details[data-group]');
        if (last.length) last[last.length - 1].open = true;
    }
    chooseTarget(point: Point2) {
        if (!this.choosing) return false;
        try {
            const members = this.session.readSnapshot().world!.groups[this.groupId].memberIds;
            const away = inspectSpatialExpeditions(this.session.readSnapshot()).missions.some(m => m.groupId === this.groupId && m.status !== 'Returned' && m.status !== 'Prepared');
            const origins = away ? undefined : this.origins(members);
            const offer = this.session.exploreOffer(this.groupId, point, origins);
            this.targetChanged(offer.target);
            this.command({ type: 'ExploreArea', groupId: this.groupId, target: { ...offer.target }, origins });
            this.choosing = false;
            this.root.querySelector<HTMLElement>('#expedition-proposal')!.hidden = true;
            this.status.textContent = (offer.adjusted ? 'Group sent to nearby walkable ground. ' : 'Group sent. ') +
                (away ? 'Using the same carried supplies.' : 'Using the reserved supplies.') + (this.session.running ? '' : ' Clock paused: press Start to travel.');
        } catch (error) {
            this.targetChanged();
            this.status.textContent = error instanceof Error ? error.message : String(error);
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
                    '</p>' + (!active ? '<button data-start="' + escape(group.id) + '" ' +
                        (group.status !== 'Ready' || !state.discovery ? 'disabled' : '') + '>Start Expedition</button>' :
                        '<button data-explore="' + escape(group.id) + '" ' + (active.status === 'Stranded' || !active.supplies ? 'disabled' : '') +
                        '>Explore Area</button> ' + (active.status === 'Prepared' ? '<button data-cancel-expedition="' +
                            escape(group.id) + '">Cancel expedition</button>' : '<button data-recall="' + escape(group.id) + '" ' +
                            (active.status === 'Returning' || active.status === 'Stranded' ? 'disabled' : '') + '>Return Home</button>')) +
                    (latest ? '<p>' + escape(latest.status !== 'Returned' ? latest.status : latest.outcome ?? latest.status) +
                        ' · ' + latest.foodCost + ' Food supplied</p>' : '') +
                    (latest?.supplies ? '<p>Supplies remaining: ' + latest.supplies.activeTicksRemaining +
                        ' active ticks. No extra Food is charged for new destinations.</p>' : '') +
                    (active && !active.supplies ? '<p>Return home to start a new expedition with carried supplies.</p>' : '') +
                    (!this.session.running && active && active.status !== 'Stranded' ?
                        '<p>Clock paused: press Start to travel. You can choose a destination now.</p>' : '') + '</details>';
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
        if (this.showingDestination && !inspectSpatialExpeditions(state).missions.some(m =>
            m.groupId === this.groupId && m.status !== 'Returned')) {
            this.showingDestination = false; this.targetChanged();
        }
        if (!state.discovery && !selected && !this.choosing)
            this.status.textContent = 'Exploration is available in discovery prototype campaigns.';
    }
}
