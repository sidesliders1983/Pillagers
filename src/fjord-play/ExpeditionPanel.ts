import { expeditionEligible, groupMission, personaAway } from '../simulation/WorldExpeditions';
import { defaultExpeditionFoodPerMember, inspectSpatialExpeditions,
    maximumTestExpeditionFoodPerMember } from '../simulation/SpatialExpeditions';
import { isProvidingCare, personaAge } from '../simulation/SimulationCore';
import type { GameplaySession } from '../gameplay-lab/GameplaySession';
import type { SimulationCommand, SimulationState } from '../simulation/SimulationCore';
import type { Point2 } from '../world-generation/WorldBlueprint';
import { icon, occupationIcon, occupationLabel, type FjordIcon } from './FjordIcons';
import { isMobileLayout } from './MobileShell';

type Mission = ReturnType<typeof inspectSpatialExpeditions>['missions'][number];
type Group = NonNullable<SimulationState['world']>['groups'][string];
interface ExpeditionNavigation {
    showMap: () => void;
    showGroups: () => void;
    focus: (point: Point2) => void;
    toggleClock: () => void;
}
const escape = (value: string) => value.replace(/[&<>"']/g,
    char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));
const button = (label: string, glyph: FjordIcon, attrs = '') =>
    `<button type="button" ${attrs}>${icon(glyph)}<span>${label}</span></button>`;
const phase = (mission?: Mission) => ({ Prepared: 'Ready to depart', Traveling: 'Travelling',
    Exploring: 'Exploring', Returning: 'Returning home', Returned: 'Home again',
    Stranded: 'Stranded' })[mission?.status ?? 'Returned'];

/** A preparation workspace and a persistent map toolbar, backed by the same Core commands. */
export class ExpeditionPanel {
    private groupId = '';
    private choosing = false;
    private pendingStart = '';
    private pendingCrew = '';
    private pendingFood = 0;
    private pendingTestFoodPerMember?: number;
    private testFoodDrafts = new Map<string, string>();
    private controlsHTML = '';
    private toolbarHTML = '';
    private toolbarExpanded = false;
    private message = '';
    private markerKey = '';
    private abort = new AbortController();
    private toolbar: HTMLElement;
    private shortcuts: HTMLElement;
    private shortcutsHTML = '';
    private hiddenGroups = new Set<string>();

    constructor(
        private root: HTMLElement,
        private session: GameplaySession,
        private command: (command: SimulationCommand) => void,
        private targetChanged: (point?: Point2, valid?: boolean) => void,
        private origins: (memberIds: readonly string[]) => Record<string, Point2>,
        private navigation: ExpeditionNavigation,
    ) {
        root.innerHTML = `<div id="expedition-controls"></div>
            <p id="expedition-status" class="fjord-expedition-message" role="status" aria-live="polite"></p>
            <dialog id="expedition-start-dialog" aria-labelledby="expedition-start-title">
                <span class="fjord-expedition-eyebrow">Expedition supplies</span>
                <h2 id="expedition-start-title">Prepare for the island</h2>
                <div id="expedition-start-summary"></div>
                <div class="fjord-expedition-actions">
                    ${button('Pack supplies', 'food', 'id="expedition-start-confirm" class="fjord-primary"')}
                    ${button('Back', 'back', 'id="expedition-start-cancel"')}
                </div>
            </dialog>`;
        this.toolbar = document.createElement('aside');
        this.toolbar.id = 'expedition-mode';
        this.toolbar.setAttribute('aria-label', 'Exploration controls');
        this.toolbar.hidden = true;
        root.closest('.fjord-stage')!.append(this.toolbar);
        this.shortcuts = document.createElement('div');
        this.shortcuts.id = 'expedition-group-shortcuts';
        this.shortcuts.setAttribute('aria-label', 'Active expedition controls');
        document.querySelector('#fjord-navigation')!.append(this.shortcuts);
        this.shortcuts.addEventListener('click', this.click, { signal: this.abort.signal });
        root.addEventListener('click', this.click, { signal: this.abort.signal });
        document.addEventListener('fjord-layout-change', () => this.refresh(), { signal: this.abort.signal });
        this.toolbar.addEventListener('click', this.click, { signal: this.abort.signal });
        root.addEventListener('change', event => {
            const input = event.target;
            if (!(input instanceof HTMLInputElement) || !input.dataset.memberGroup || !input.dataset.member) return;
            this.groupId = input.dataset.memberGroup;
            this.command({ type: 'SetExplorationMember', groupId: this.groupId,
                personaId: input.dataset.member, included: input.checked });
        }, { signal: this.abort.signal });
        root.addEventListener('input', event => {
            const input = event.target;
            if (!(input instanceof HTMLInputElement) || !input.dataset.testFood) return;
            this.testFoodDrafts.set(input.dataset.testFood, input.value);
            this.refresh();
        }, { signal: this.abort.signal });
        root.querySelector('dialog')!.addEventListener('close', () => { this.pendingStart = ''; },
            { signal: this.abort.signal });
        document.addEventListener('keydown', event => {
            if (event.key !== 'Escape' || !this.choosing || document.querySelector('dialog[open]')) return;
            event.preventDefault();
            event.stopImmediatePropagation();
            this.cancelTarget();
            this.shortcuts.querySelector<HTMLButtonElement>('[aria-expanded]')?.focus();
        }, { capture: true, signal: this.abort.signal });
    }

    dispose() {
        this.abort.abort();
        this.clearTarget();
        this.root.closest('.fjord-stage')?.classList.remove('is-choosing-expedition');
        this.toolbar.remove(); this.shortcuts.remove();
    }
    get targeting() { return this.choosing; }
    get targetingGroup() { return this.choosing ? this.groupId : undefined; }
    private get dialog() { return this.root.querySelector<HTMLDialogElement>('#expedition-start-dialog')!; }
    private activeMission(state = this.session.readSnapshot(), groupId = this.groupId) {
        return inspectSpatialExpeditions(state).missions
            .find(mission => mission.groupId === groupId && mission.status !== 'Returned');
    }
    private notify(message: string) { this.message = message; this.refresh(); }
    private showTarget(point?: Point2, valid?: boolean) {
        const key = point ? `${point.x},${point.z},${valid}` : 'none';
        if (key !== this.markerKey) { this.markerKey = key; this.targetChanged(point, valid); }
    }
    private destinationOffer(point: Point2) {
        const members = this.session.readSnapshot().world!.groups[this.groupId].memberIds;
        const mission = this.activeMission();
        const origins = mission?.status === 'Prepared' ? this.origins(members) : undefined;
        return { offer: this.session.exploreOffer(this.groupId, point, origins), origins };
    }
    /** Read-only, using the same route authority as confirmation; never dispatches a command. */
    previewTarget(point?: Point2) {
        if (!this.choosing) return;
        if (!point) {
            this.showTarget();
            return;
        }
        try {
            this.destinationOffer(point);
            this.showTarget(point, true);
            return true;
        } catch {
            this.showTarget(point, false);
            return false;
        }
    }
    private clearTarget() {
        this.choosing = false;
        this.showTarget();
    }
    cancelTarget() {
        this.hiddenGroups.delete(this.groupId);
        this.clearTarget();
        this.notify('Destination selection cancelled. The current expedition is unchanged.');
    }
    private beginTargeting(groupId: string) {
        this.groupId = groupId;
        this.hiddenGroups.add(groupId);
        this.choosing = true;
        this.message = '';
        this.showTarget();
        this.navigation.showMap();
        this.refresh();
        Array.from(this.shortcuts.querySelectorAll<HTMLButtonElement>('button'))
            .find(button => button.dataset.expeditionToggle === groupId)?.focus({ preventScroll: true });
    }

    private click = (event: Event) => {
        const target = (event.target as Element).closest<HTMLButtonElement>('button');
        if (!target || target.disabled) return;
        if (target.dataset.expeditionToggle) {
            const groupId = target.dataset.expeditionToggle;
            const hide = !this.toolbar.hidden && this.toolbar.dataset.group === groupId;
            if (groupId !== this.groupId) this.clearTarget();
            this.groupId = groupId;
            if (hide) this.hiddenGroups.add(groupId);
            else { this.hiddenGroups.delete(groupId); this.navigation.showMap(); }
            this.refresh();
            return;
        }
        if (this.toolbar.contains(target) && this.toolbar.dataset.group) this.groupId = this.toolbar.dataset.group;
        if (target.dataset.expeditionGroup) {
            this.clearTarget();
            this.groupId = target.dataset.expeditionGroup;
            this.message = '';
            this.refresh();
            return;
        }
        if (target.id === 'expedition-create') {
            this.groupId = '';
            this.command({ type: 'CreateExplorationGroup' });
        }
        if (target.dataset.start) this.reviewDeparture(target.dataset.start);
        if (target.id === 'expedition-start-cancel') this.dialog.close();
        if (target.id === 'expedition-start-confirm' && this.pendingStart) {
            try {
                const testFoodPerMember = this.pendingTestFoodPerMember;
                const offer = this.session.startExpeditionOffer(this.pendingStart, testFoodPerMember);
                const crew = this.session.readSnapshot().world!.groups[this.pendingStart].memberIds.join(',');
                if (offer.foodCost !== this.pendingFood || crew !== this.pendingCrew)
                    throw new Error('The crew or supplies have changed. Go back and review the departure again.');
                const groupId = this.pendingStart;
                this.pendingStart = '';
                this.dialog.close();
                this.command({ type: 'StartExpedition', groupId,
                    ...(testFoodPerMember === undefined ? {} : { testFoodPerMember }) });
            } catch (error) { this.root.querySelector('#expedition-start-summary')!.textContent = String(error); }
        }
        if (target.dataset.explore) this.beginTargeting(target.dataset.explore);
        if (target.dataset.recall) this.command({ type: 'RecallExpedition', groupId: target.dataset.recall });
        if (target.dataset.cancelExpedition)
            this.command({ type: 'CancelExpedition', groupId: target.dataset.cancelExpedition });
        if (target.id === 'expedition-cancel') this.cancelTarget();
        if (target.id === 'expedition-details') {
            this.toolbarExpanded = !this.toolbarExpanded;
            this.refresh();
        }
        if (target.dataset.expeditionAction === 'groups') {
            this.clearTarget();
            this.navigation.showGroups();
            this.refresh();
        }
        if (target.dataset.expeditionAction === 'focus') {
            const mission = this.activeMission();
            if (mission) {
                this.navigation.showMap();
                this.navigation.focus(mission.position);
                this.refresh();
            }
        }
        if (target.dataset.expeditionAction === 'clock') this.navigation.toggleClock();
    };

    private reviewDeparture(groupId: string) {
        try {
            const testFoodPerMember = this.testFoodPerMember(groupId);
            const offer = this.session.startExpeditionOffer(groupId, testFoodPerMember);
            this.groupId = this.pendingStart = groupId;
            this.pendingTestFoodPerMember = testFoodPerMember;
            this.pendingFood = offer.foodCost;
            this.pendingCrew = this.session.readSnapshot().world!.groups[groupId].memberIds.join(',');
            this.root.querySelector('#expedition-start-summary')!.innerHTML = `
                <div class="fjord-expedition-quote">${icon('food')}<strong>${offer.foodCost}</strong><span>Food from clan stocks</span></div>
                <p>${escape(this.session.readSnapshot().world!.groups[groupId].name)} · ${offer.members} residents · ${offer.foodPerMember} Food each · packed once.</p>
                ${testFoodPerMember === undefined ? '' : '<p class="fjord-caption">Test pack: custom carrying capacity for this expedition.</p>'}
                <p>Next, choose a destination on the island. Travel, exploration and returning home share this pack.</p>
                <p class="fjord-caption">Unused supplies are discarded when the expedition ends. The clock stays ${this.session.running ? 'running' : 'paused'}.</p>`;
            this.dialog.showModal();
            this.root.querySelector<HTMLButtonElement>('#expedition-start-cancel')!.focus();
        } catch (error) { this.notify(error instanceof Error ? error.message : String(error)); }
    }

    committed(command: SimulationCommand) {
        const state = this.session.readSnapshot();
        if (command.type === 'CreateExplorationGroup') this.groupId = Object.keys(state.world!.groups).at(-1)!;
        if ('groupId' in command) this.groupId = command.groupId;
        if (command.type === 'StartExpedition') { this.beginTargeting(command.groupId); return; }
        if (['ExploreArea', 'RecallExpedition', 'CancelExpedition'].includes(command.type)) this.clearTarget();
        if (command.type === 'ExploreArea') {
            this.hiddenGroups.add(command.groupId);
            this.message = 'Destination set. No extra Food was charged.';
        }
        if (command.type === 'RecallExpedition') this.message = 'Return home ordered.';
        if (command.type === 'CancelExpedition') this.message = 'Expedition ended. Unused supplies were discarded.';
        this.refresh();
    }

    /** A valid destination uses the already purchased pack immediately; invalid taps keep targeting active. */
    chooseTarget(point: Point2) {
        if (!this.choosing) return false;
        try {
            const { offer, origins } = this.destinationOffer(point);
            this.message = 'Setting destination…';
            this.command({ type: 'ExploreArea', groupId: this.groupId, target: { ...offer.target }, origins });
        } catch (error) {
            this.showTarget(point, false);
            this.message = error instanceof Error ? error.message : String(error);
            this.hiddenGroups.delete(this.groupId);
        }
        this.refresh();
        return true;
    }

    private unavailableReason(state: SimulationState, id: string, groupId: string) {
        const person = state.personas[id];
        if (person.deathWinter !== null) return 'Deceased';
        if (personaAge(state, id) < (state.mechanics?.config.workAge ?? 16)) return 'Below working age';
        if (isProvidingCare(state, id)) return 'Providing childcare';
        if (personaAway(state, id)) return 'Away on an expedition';
        if (Object.values(state.world!.groups).some(group => group.id !== groupId && group.memberIds.includes(id)))
            return 'Assigned to another group';
        return 'Unavailable';
    }
    private crew(state: SimulationState, group: Group) {
        const people = Object.values(state.personas).filter(person => person.deathWinter === null ||
            group.memberIds.includes(person.id));
        const row = (id: string, available: boolean) => {
            const person = state.personas[id];
            const included = group.memberIds.includes(id);
            return `<label class="fjord-crew-choice ${included ? 'is-selected' : ''}">
                <input type="checkbox" data-member="${escape(id)}" data-member-group="${escape(group.id)}"
                    ${included ? 'checked' : ''} ${available || included ? '' : 'disabled'}>
                ${icon(occupationIcon(person.occupation))}<span><strong>${escape(person.name)}</strong>
                    <small>${escape(available ? occupationLabel(person.occupation) : this.unavailableReason(state, id, group.id))}</small></span>
            </label>`;
        };
        const available = people.filter(person => expeditionEligible(state, person.id, group.id));
        const unavailable = people.filter(person => !expeditionEligible(state, person.id, group.id));
        available.sort((a, b) => Number(group.memberIds.includes(b.id)) - Number(group.memberIds.includes(a.id)));
        return `<div class="fjord-expedition-section-heading"><h3>${icon('people')}Choose your crew</h3>
                <span>${group.memberIds.length} selected</span></div>
            <div class="fjord-expedition-members" aria-label="Group members">${available.map(person => row(person.id, true)).join('')}</div>
            ${unavailable.length ? `<details class="fjord-crew-unavailable"><summary>Unavailable residents · ${unavailable.length}</summary>
                <div class="fjord-expedition-members">${unavailable.map(person => row(person.id, false)).join('')}</div></details>` : ''}`;
    }
    private supplies(mission: Mission) {
        if (mission.missionType) return `<p class="fjord-caption">${escape(mission.missionType)} · ${mission.foodCost} Food paid. Travel and return are included in the mission duration.</p>`;
        if (!mission.supplies) return '<p class="fjord-caption">Return home to prepare a new expedition with carried supplies.</p>';
        const remaining = mission.supplies.explorationTicksRemaining;
        const total = mission.supplies.foodPerMember * mission.supplies.ticksPerFood;
        const percentage = Math.round(remaining / total * 100);
        const seconds = Math.round(remaining * this.session.effectiveMinutesPerWinter * 60 /
            this.session.readSnapshot().ticksPerWinter);
        return `<div class="fjord-expedition-supplies ${percentage <= 25 ? 'is-low' : ''}">
            <div>${icon('food')}<span>Exploration supplies</span><strong>${percentage}%</strong></div>
            <meter min="0" max="${total}" value="${remaining}" aria-label="Exploration supplies">${percentage}%</meter>
            <small title="${remaining} active ticks available before the protected return allowance">${mission.status === 'Stranded' ? 'Movement unavailable' :
                `≈ ${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, '0')}s exploration remaining`}</small>
            <small>Supplies for the journey home are reserved.</small>
            ${mission.supplies.testCapacity ? `<small>Test pack · ${mission.supplies.foodPerMember} Food per resident</small>` : ''}
        </div>`;
    }
    private actions(mission: Mission) {
        const stranded = mission.status === 'Stranded';
        if (mission.missionType) return button(mission.status === 'Returning' ? 'Returning home' : 'Return home', 'home',
            `data-recall="${escape(mission.groupId)}" ${stranded || mission.status === 'Returning' ? 'disabled' : ''}`);
        return button(mission.status === 'Prepared' ? 'Choose destination' : 'Change destination', 'destination',
            `data-explore="${escape(mission.groupId)}" class="fjord-primary" ${stranded || !mission.supplies ? 'disabled' : ''}`) +
            (mission.status === 'Prepared' ? button('End expedition', 'close', `data-cancel-expedition="${escape(mission.groupId)}"`) :
                button(mission.status === 'Returning' ? 'Returning home' : 'Return home', 'home',
                    `data-recall="${escape(mission.groupId)}" ${stranded || mission.status === 'Returning' ? 'disabled' : ''}`));
    }
    private journey(group: Group, mission?: Mission) {
        const step = !mission ? 0 : mission.status === 'Prepared' ? 1 : 2;
        return `<ol class="fjord-expedition-steps" aria-label="Expedition steps">${[
            ['people', 'Crew'], ['destination', 'Destination'], ['route', mission?.missionType ? 'Mission & return' : 'Explore & return'],
        ].map(([glyph, label], index) => `<li ${index === step ? 'aria-current="step"' : ''} class="${index < step ? 'is-complete' : ''}">
            ${icon(index < step ? 'check' : glyph as FjordIcon)}<span>${label}</span></li>`).join('')}</ol>
            <div class="fjord-expedition-group-heading"><h3>${escape(group.name)}</h3>
                <span class="fjord-expedition-badge">${mission ? phase(mission) : 'At home'}</span></div>`;
    }
    private testFoodPerMember(groupId: string) {
        const draft = this.testFoodDrafts.get(groupId) ?? String(defaultExpeditionFoodPerMember);
        const amount = draft.trim() ? Number(draft) : NaN;
        return amount === defaultExpeditionFoodPerMember ? undefined : amount;
    }
    private preparation(state: SimulationState, group: Group) {
        let offer: ReturnType<GameplaySession['startExpeditionOffer']> | undefined;
        let reason = 'Choose at least one available resident.';
        if (group.memberIds.length) {
            try { offer = this.session.startExpeditionOffer(group.id, this.testFoodPerMember(group.id)); reason = ''; }
            catch (error) { reason = error instanceof Error ? error.message : String(error); }
        }
        return `${this.crew(state, group)}
            <details class="fjord-expedition-test-supplies" data-expedition-test-options>
                <summary>Test supplies</summary>
                <label><span>Food per resident (test)</span>
                    <input type="number" inputmode="numeric" min="1" max="${maximumTestExpeditionFoodPerMember}" step="1"
                        data-test-food="${escape(group.id)}" value="${escape(this.testFoodDrafts.get(group.id) ?? String(defaultExpeditionFoodPerMember))}"></label>
                <p class="fjord-caption">Normal pack: ${defaultExpeditionFoodPerMember} per resident. Choose up to ${maximumTestExpeditionFoodPerMember} for testing. Food is paid once from clan stocks.</p>
            </details><div class="fjord-expedition-departure">
            <div>${icon('food')}<span>${offer ? `<strong>${offer.foodCost} Food</strong><small>${offer.foodPerMember} per resident · paid once</small>` :
                '<strong>Prepare supplies</strong><small>Food is confirmed before packing</small>'}</span></div>
            ${button('Prepare expedition', 'route', `data-start="${escape(group.id)}" class="fjord-primary" ${offer ? '' : 'disabled'}`)}
            ${reason ? `<p class="fjord-caption">${escape(reason)}</p>` : ''}
        </div>`;
    }
    private missionDescription(mission: Mission) {
        if (mission.missionType) return mission.status === 'Exploring' ? `${mission.missionType} in progress. Results are reported after returning home.` :
            mission.status === 'Traveling' ? `Travelling for ${mission.missionType}. Return home to change missions.` :
            mission.status === 'Returning' ? 'The group is returning home with its report.' :
            mission.status === 'Stranded' ? 'The return route is blocked. The group is stranded.' : 'Mission completed.';
        if (mission.returnReason === 'low-supplies')
            return 'Returning home — supplies needed for the journey home. No exploration time remains.';
        if (mission.returnReason === 'outward-route-blocked')
            return 'Returning home — the onward route is blocked.';
        return ({ Prepared: 'Supplies are packed. Choose a flag on the island to leave home.',
            Traveling: 'The group is travelling to your flag. You can redirect them or call them home.',
            Exploring: 'The group is revealing nearby land. Choose another destination to continue.',
            Returning: 'The group is on its way home. You can still choose another destination using the same pack.',
            Returned: 'This expedition has ended.',
            Stranded: 'This group cannot travel or return. Its expedition is stranded.' })[mission.status];
    }

    openGroup(groupId: string) {
        if (!this.session.readSnapshot().world?.groups[groupId]) return;
        this.groupId = groupId;
        this.navigation.showGroups();
        this.toolbarExpanded = true;
        this.refresh();
    }
    refresh() {
        const state = this.session.readSnapshot();
        const groups = Object.values(state.world?.groups ?? {});
        const rawMissions = Object.values(state.world?.spatial?.missions ?? {});
        const activeGroups = new Set(rawMissions.filter(mission => mission.status !== 'Returned').map(mission => mission.groupId));
        if (!groups.some(group => group.id === this.groupId)) {
            this.clearTarget();
            this.groupId = groups.find(group => activeGroups.has(group.id))?.id ?? groups[0]?.id ?? '';
        }
        const workspace = this.root.closest<HTMLElement>('#fjord-workspace')!;
        // Changing workspace cancels only the unconfirmed flag, never the canonical expedition.
        if (this.choosing && (!workspace.hidden || !activeGroups.has(this.groupId))) this.clearTarget();
        this.root.closest('.fjord-stage')!.classList.toggle('is-choosing-expedition', this.choosing);
        const open = !workspace.hidden && workspace.dataset.surface === 'expeditions';
        if (!open && !activeGroups.size && !this.choosing) {
            this.toolbar.hidden = true;
            this.shortcuts.replaceChildren();
            this.shortcutsHTML = '';
            this.showTarget();
            return;
        }
        const group = groups.find(candidate => candidate.id === this.groupId);
        const missions = inspectSpatialExpeditions(state).missions;
        const mission = missions.find(candidate => candidate.groupId === this.groupId && candidate.status !== 'Returned');
        if (this.choosing && (!mission || mission.status === 'Stranded')) this.clearTarget();
        this.renderToolbar(group, mission, groups.filter(candidate => activeGroups.has(candidate.id)));
        if (!open) return;
        const controls = this.root.querySelector<HTMLElement>('#expedition-controls')!;
        let html: string;
        if (!state.discovery) {
            html = `<div class="fjord-expedition-empty">${icon('destination')}<h3>A new island to discover</h3>
                <p>This saved campaign has exploration disabled. Enable exploration &amp; rival clan when starting a new island campaign.</p>
                ${button('New campaign options', 'route', 'data-ui="campaign-settings"')}
                ${button('New group', 'plus', 'id="expedition-create" disabled')}</div>`;
        } else {
            html = `<div class="fjord-expedition-intro"><p>Prepare a crew. Place a flag. Discover your island.</p>
                ${button('New group', 'plus', 'id="expedition-create"')}</div>
                <nav class="fjord-expedition-groups" aria-label="Exploration groups">${groups.map(candidate =>
                    button(`<strong>${escape(candidate.name)}</strong><small>${candidate.memberIds.length} residents${activeGroups.has(candidate.id) ? ' · active' : ''}</small>`, 'people',
                        `data-expedition-group="${escape(candidate.id)}" aria-pressed="${candidate.id === this.groupId}"`)).join('')}</nav>`;
            if (!group) html += `<div class="fjord-expedition-empty">${icon('route')}<h3>Your first expedition</h3>
                <p>Create a group, choose available residents and pack supplies. Tap a valid destination to begin travelling.</p></div>`;
            else {
                html += this.journey(group, mission);
                if (!mission && groupMission(state, group.id)) html += '<p>This group is away on an earlier expedition. Its crew can be edited after it returns.</p>';
                else if (!mission) html += this.preparation(state, group);
                else html += `<p class="fjord-expedition-description">${this.missionDescription(mission)}</p>
                    <p class="fjord-expedition-crew">${icon('people')}${group.memberIds.map(id => escape(state.personas[id]?.name ?? id)).join(', ')}</p>
                    ${this.supplies(mission)}<div class="fjord-expedition-actions">${this.actions(mission)}
                        ${button('Show group on map', 'locate', 'data-expedition-action="focus"')}
                        ${!isMobileLayout() && mission.status !== 'Prepared' && mission.status !== 'Stranded' ? button(this.session.running ? 'Pause travel' : 'Resume travel',
                            this.session.running ? 'pause' : 'play', 'data-expedition-action="clock"') : ''}
                    </div><p class="fjord-caption">${!this.session.running ? 'Clock paused. Resume travel when you are ready.' :
                        'The clock is running.'} ${mission.missionType ? 'Return home before starting another mission.' : 'New destinations use the same carried supplies.'}</p>`;
                const latest = missions.filter(candidate => candidate.groupId === group.id).at(-1);
                if (!mission && latest) html += `<p class="fjord-expedition-history">${icon('check')}Previous expedition: ${escape(latest.outcome ?? latest.status)} · ${latest.foodCost} Food supplied</p>`;
            }
        }
        this.replace(controls, html, this.controlsHTML);
        this.controlsHTML = html;
        const status = this.root.querySelector<HTMLElement>('#expedition-status')!;
        status.textContent = this.message;
        status.hidden = !this.message;
        this.root.hidden = false;
    }

    private renderToolbar(group: Group | undefined, mission: Mission | undefined, activeGroups: Group[]) {
        // An idle selected group must not hide another group's active expedition.
        if (!mission && !this.choosing && activeGroups.length) {
            group = activeGroups[0];
            mission = this.activeMission(this.session.readSnapshot(), group.id);
        }
        const workspace = this.root.closest<HTMLElement>('#fjord-workspace')!;
        this.toolbar.hidden = !group || !mission || !workspace.hidden || this.hiddenGroups.has(group.id);
        this.toolbar.style.setProperty('--fjord-shortcut-space', `${Math.min(activeGroups.length, 3) * 50}px`);
        const shortcutsHTML = activeGroups.map(candidate => button(
            escape(candidate.name), 'route',
            `data-expedition-toggle="${escape(candidate.id)}" aria-label="Toggle ${escape(candidate.name)} controls"
                aria-controls="expedition-mode" aria-expanded="${!this.toolbar.hidden && candidate.id === group?.id}"`
        )).join('');
        if (this.shortcutsHTML !== shortcutsHTML) {
            this.replace(this.shortcuts, shortcutsHTML, this.shortcutsHTML);
            this.shortcutsHTML = shortcutsHTML;
        }
        if (!group || !mission) { this.showTarget(); return; }
        if (!this.choosing) this.showTarget(mission.status === 'Prepared' || mission.status === 'Stranded' ? undefined : mission.target);
        this.toolbar.dataset.group = group.id;
        const title = this.choosing ? 'Choose a destination' : phase(mission);
        if (isMobileLayout()) {
            this.renderMobileToolbar(group, mission, title);
            return;
        }
        const instruction = this.choosing ?
            'Click walkable land to travel there. Drag to pan · scroll to zoom · Esc to cancel.' : this.missionDescription(mission);
        const controls = this.choosing ?
            button('Cancel', 'close', 'id="expedition-cancel"') :
            this.actions(mission) + (mission.status !== 'Prepared' && mission.status !== 'Stranded' ?
                button(this.session.running ? 'Pause travel' : 'Resume travel', this.session.running ? 'pause' : 'play',
                    'data-expedition-action="clock"') : '');
        const html = `<div class="fjord-exploration-overline">${icon('destination')}<span>${mission.missionType ?? 'Exploration'} mode</span>
                ${button(`${escape(group.name)}${activeGroups.length > 1 ? ` · ${activeGroups.length} active groups` : ''}`, 'people', 'data-expedition-action="groups"')}
                <span class="fjord-exploration-clock">${this.session.running ? 'Clock running' : 'Clock paused'}</span></div>
            <div class="fjord-exploration-content"><div class="fjord-exploration-instruction"><h2>${title}</h2><p>${instruction}</p></div>
                ${this.supplies(mission)}</div>
            <div class="fjord-expedition-actions">${controls}
                ${button('Show group', 'locate', 'data-expedition-action="focus"')}
            </div><p class="fjord-exploration-hint">${mission.missionType ? 'Travel and return are included in the paid mission.' : `${this.choosing ? 'No extra Food charged. ' : ''}Travel, exploration and the return share this pack.`}</p>
            <p class="fjord-expedition-message" role="status" aria-live="polite" ${this.message ? '' : 'hidden'}>${escape(this.message)}</p>`;
        this.replace(this.toolbar, html, this.toolbarHTML);
        this.toolbarHTML = html;
    }

    private renderMobileToolbar(group: Group, mission: Mission, title: string) {
        const controls = this.choosing ?
            button('Cancel', 'close', 'id="expedition-cancel"') : this.actions(mission);
        const instruction = this.choosing ?
            'Tap walkable land to travel there. Drag to orbit · pinch to zoom.' :
            mission.status === 'Prepared' ? 'Your pack is ready. Choose where to explore.' :
            mission.status === 'Stranded' || mission.returnReason === 'low-supplies' ? this.missionDescription(mission) :
            this.session.running ? this.missionDescription(mission) : 'Clock paused. Resume using Play in the status strip.';
        const html = `<div class="fjord-mobile-expedition-heading">
                ${button(`<strong>${escape(group.name)}</strong><small>${title}</small>`, 'people',
                    'data-expedition-action="groups" aria-label="Open expedition group"')}
                ${button(mission.missionType ? 'Mission' : 'Supplies', 'food', `id="expedition-details" aria-expanded="${this.toolbarExpanded}" aria-controls="expedition-mobile-details"`)}
                ${button('', 'locate', 'data-expedition-action="focus" aria-label="Show group on map"')}
            </div><p class="fjord-mobile-instruction">${instruction}</p>
            <div id="expedition-mobile-details" ${this.toolbarExpanded ? '' : 'hidden'}>
                <p class="fjord-caption">${group.memberIds.map(id => escape(this.session.readSnapshot().personas[id]?.name ?? id)).join(', ')}</p>
                ${this.supplies(mission)}<p class="fjord-caption">${mission.missionType ? 'The paid mission includes travel and return.' : 'Travel, exploration and return share this pack.'}</p>
            </div><div class="fjord-expedition-actions">${controls}</div>
            <p class="fjord-expedition-message" role="status" aria-live="polite" ${this.message ? '' : 'hidden'}>${escape(this.message)}</p>`;
        this.replace(this.toolbar, html, this.toolbarHTML);
        this.toolbarHTML = html;
    }

    private replace(element: HTMLElement, html: string, previous: string) {
        if (html === previous) return;
        const focused = element.contains(document.activeElement) ? document.activeElement as HTMLElement : undefined;
        const focusAttribute = focused && ['data-test-food', 'data-member', 'data-expedition-group', 'data-expedition-action',
            'data-explore', 'data-recall', 'data-cancel-expedition', 'data-start', 'data-expedition-toggle', 'id'].find(attribute => focused.hasAttribute(attribute));
        const focusKey = focusAttribute && focused?.getAttribute(focusAttribute);
        const roster = element.querySelector<HTMLElement>('.fjord-expedition-members');
        const scrollTop = roster?.scrollTop ?? 0;
        const expanded = element.querySelector<HTMLDetailsElement>('.fjord-crew-unavailable')?.open;
        const testOptionsOpen = element.querySelector<HTMLDetailsElement>('[data-expedition-test-options]')?.open;
        element.innerHTML = html;
        const nextRoster = element.querySelector<HTMLElement>('.fjord-expedition-members');
        if (nextRoster) nextRoster.scrollTop = scrollTop;
        const details = element.querySelector<HTMLDetailsElement>('.fjord-crew-unavailable');
        if (details) details.open = !!expanded;
        const testOptions = element.querySelector<HTMLDetailsElement>('[data-expedition-test-options]');
        if (testOptions) testOptions.open = !!testOptionsOpen;
        if (focusAttribute && focusKey) Array.from(element.querySelectorAll<HTMLElement>('button,input'))
            .find(candidate => candidate.getAttribute(focusAttribute) === focusKey)?.focus({ preventScroll: true });
    }
}
