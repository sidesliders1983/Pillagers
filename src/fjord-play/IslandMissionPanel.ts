import { inspectIslandMissions, type IslandTarget } from '../simulation/IslandMissions';
import { expeditionEligible, groupMission, type Cargo, type MissionType } from '../simulation/WorldExpeditions';
import type { SimulationCommand } from '../simulation/SimulationCore';
import type { GameplaySession } from '../gameplay-lab/GameplaySession';
import type { Point2 } from '../world-generation/WorldBlueprint';

const escape = (value: string) => value.replace(/[&<>"']/g,
    char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));

/** Mission-specific controls reuse existing groups, movement and Core offers. */
export class IslandMissionPanel {
    private root: HTMLElement;
    private controls: HTMLElement;
    private dialog: HTMLDialogElement;
    private groupId = '';
    private siteId = '';
    private choosing = false;
    private pending?: { target: IslandTarget; type: MissionType; food: number; crew: string; priorities: Cargo[] };
    private html = '';
    private message = '';
    private abort = new AbortController();
    private targetBar: HTMLElement;

    constructor(host: HTMLElement, private session: GameplaySession,
        private command: (command: SimulationCommand) => void,
        private origins: (members: readonly string[]) => Record<string, Point2>,
        private showMap: () => void, private showGroups: () => void,
        private focus: (point: Point2) => void) {
        this.root = document.createElement('section');
        this.root.id = 'island-mission-panel';
        this.root.setAttribute('aria-label', 'Physical island missions');
        this.root.innerHTML = `<div class="island-mission-controls"></div>
            <p class="island-mission-status" role="status"></p>
            <dialog id="island-mission-dialog" aria-labelledby="island-mission-title">
                <h2 id="island-mission-title">Start mission</h2><div id="island-mission-summary"></div>
                <button type="button" class="fjord-primary" data-island-confirm>Start mission</button>
                <button type="button" data-island-cancel>Back</button>
            </dialog>`;
        host.append(this.root);
        this.controls = this.root.querySelector('.island-mission-controls')!;
        this.dialog = this.root.querySelector('dialog')!;
        // The targeting map hides the workspace; its modal must remain outside that hidden ancestor.
        host.closest('.fjord-stage')!.append(this.dialog);
        this.targetBar = document.createElement('aside');
        this.targetBar.id = 'island-mission-target';
        this.targetBar.className = 'island-mission-target';
        this.targetBar.hidden = true;
        this.targetBar.innerHTML = '<strong>Recon: choose mapped land</strong><p>Tap land to review Recon. Drag and pinch to navigate.</p><button type="button" data-island-stop>Cancel</button><p role="status"></p>';
        host.closest('.fjord-stage')!.append(this.targetBar);
        this.targetBar.addEventListener('click', () => this.cancelTarget(), { signal: this.abort.signal });
        this.root.addEventListener('click', this.click, { signal: this.abort.signal });
        this.dialog.addEventListener('click', this.click, { signal: this.abort.signal });
        host.addEventListener('click', event => {
            const group = (event.target as Element).closest<HTMLElement>('[data-expedition-group]')?.dataset.expeditionGroup;
            if (group) { this.groupId = group; this.refresh(); }
        }, { signal: this.abort.signal });
        this.root.addEventListener('change', event => {
            const input = event.target;
            if (input instanceof HTMLSelectElement && input.id === 'island-mission-group') {
                this.groupId = input.value; this.refresh();
            }
        }, { signal: this.abort.signal });
        document.addEventListener('keydown', event => {
            if (event.key === 'Escape' && this.choosing) this.cancelTarget();
        }, { signal: this.abort.signal });
    }
    dispose() { this.abort.abort(); this.root.remove(); this.dialog.remove(); this.targetBar.remove(); }
    get targeting() { return this.choosing; }
    committed(command: SimulationCommand) {
        if (command.type === 'CreateExplorationGroup') this.groupId = Object.keys(this.session.readSnapshot().world!.groups).at(-1)!;
        else if ('groupId' in command) this.groupId = command.groupId;
    }
    cancelTarget() { this.choosing = false; this.targetBar.hidden = true; }
    selectSite(id: string) {
        if (!inspectIslandMissions(this.session.readSnapshot()).sites.some(site => site.id === id)) return;
        this.siteId = id;
        this.cancelTarget();
        this.showGroups();
        this.refresh();
        this.root.scrollIntoView({ block: 'nearest' });
    }
    chooseTarget(point: Point2) {
        if (!this.choosing) return false;
        this.review({ kind: 'area', position: point }, 'Recon');
        return true;
    }
    private click = (event: Event) => {
        const button = (event.target as Element).closest<HTMLButtonElement>('button');
        if (!button || button.disabled) return;
        if (button.hasAttribute('data-island-area')) {
            this.choosing = true; this.message = ''; this.showMap(); this.targetBar.hidden = false;
        }
        if (button.hasAttribute('data-island-return')) {
            try {
                this.command({ type: 'RecallExpedition', groupId: this.groupId });
                this.message = 'The group is returning home. Missions can depart after homecoming.';
            } catch (error) { this.message = error instanceof Error ? error.message : String(error); }
        }
        if (button.dataset.islandSite) this.selectSite(button.dataset.islandSite);
        if (button.dataset.islandFocus) {
            const site = inspectIslandMissions(this.session.readSnapshot()).sites.find(site => site.id === this.siteId);
            if (site) { this.showMap(); this.focus(site.position); }
        }
        if (button.dataset.islandType && this.siteId)
            this.review({ kind: 'site', siteId: this.siteId }, button.dataset.islandType as MissionType);
        if (button.hasAttribute('data-island-cancel')) { this.pending = undefined; this.dialog.close(); }
        if (button.hasAttribute('data-island-confirm') && this.pending) {
            try {
                const pending = this.pending, state = this.session.readSnapshot();
                const members = state.world!.groups[this.groupId].memberIds;
                const origins = this.origins(members);
                const offer = this.session.islandMissionOffer(this.groupId, pending.target, pending.type, pending.priorities, origins);
                if (members.join(',') !== pending.crew || offer.foodCost !== pending.food)
                    throw new Error('Crew or conditions changed. Review the mission again.');
                this.command({ type: 'DispatchIslandMission', groupId: this.groupId, target: pending.target,
                    mission: pending.type, priorities: pending.priorities, origins });
                this.pending = undefined; this.dialog.close(); this.cancelTarget();
                this.message = 'Mission started. Start the clock to travel.';
                this.showMap();
            } catch (error) { this.dialog.querySelector('#island-mission-summary')!.textContent = String(error); }
        }
        this.refresh();
    };
    private review(target: IslandTarget, type: MissionType) {
        try {
            const members = this.session.readSnapshot().world!.groups[this.groupId].memberIds;
            const priorities = type === 'Pillage' ? Array.from(this.root.querySelectorAll<HTMLInputElement>('[data-cargo]:checked'))
                .map(input => input.dataset.cargo as Cargo) : [];
            const offer = this.session.islandMissionOffer(this.groupId, target, type, priorities, this.origins(members));
            this.pending = { target, type, food: offer.foodCost, crew: members.join(','), priorities };
            this.dialog.querySelector('#island-mission-title')!.textContent = `Start ${type}`;
            this.dialog.querySelector('#island-mission-summary')!.innerHTML = `<p>${escape(this.session.readSnapshot().world!.groups[this.groupId].name)}</p>
                <p>This will cost ${offer.foodCost} Food (${offer.foodPerMember} per member). Are you sure?</p>
                <p class="fjord-caption">${offer.duration} ticks, including travel and return. Success: ${offer.successBps / 100}%. Risk per member: ${offer.casualtyBps / 100}%. No refunds.</p>`;
            this.dialog.showModal();
            this.dialog.querySelector<HTMLButtonElement>('[data-island-cancel]')!.focus();
        } catch (error) {
            this.message = error instanceof Error ? error.message : String(error);
            this.targetBar.querySelector('[role="status"]')!.textContent = this.message;
        }
        this.refresh();
    }
    refresh() {
        const state = this.session.readSnapshot();
        this.root.hidden = state.world?.version !== 2;
        if (this.root.hidden) return;
        const groups = Object.values(state.world!.groups), sites = inspectIslandMissions(state).sites;
        if (!groups.some(group => group.id === this.groupId)) this.groupId = groups[0]?.id ?? '';
        if (!sites.some(site => site.id === this.siteId)) this.siteId = sites[0]?.id ?? '';
        const group = state.world!.groups[this.groupId], site = sites.find(site => site.id === this.siteId);
        const available = !!group?.memberIds.length && !groupMission(state, this.groupId) &&
            group.memberIds.every(id => expeditionEligible(state, id, group.id));
        const active = Object.values(state.world!.spatial?.missions ?? {}).find(m => m.groupId === this.groupId && m.status !== 'Returned');
        let groupReason = '';
        if (!group) groupReason = 'Create or choose a group to send a mission.';
        else if (!group.memberIds.length) groupReason = 'Add eligible residents to this group first.';
        else if (active?.status === 'Returning') groupReason = `${group.name} is returning home. Wait for homecoming, or choose another group at home.`;
        else if (active?.status === 'Stranded') groupReason = `${group.name} is stranded and cannot start another mission.`;
        else if (active?.status === 'Prepared') groupReason = `${group.name} has a prepared expedition. Cancel it first, or choose another group at home.`;
        else if (active) groupReason = `${group.name} is away on ${active.task?.type ?? 'Explore'}. Return this group home, or choose another available group at home.`;
        else if (!available) groupReason = 'This group has unavailable members. Choose a group at home with eligible residents.';
        const canRecall = active && !['Returning', 'Stranded', 'Prepared'].includes(active.status);
        const missionReason = (type: MissionType) => {
            if (type !== 'Recon' && !site?.knowledge?.settlementName)
                return 'A successful Recon must return home and identify this settlement first.';
            if (type === 'Pillage' && !site?.knowledge?.opportunity)
                return 'No viable Pillage opportunity has been reported.';
            return groupReason;
        };
        const reports = Object.values(state.world!.spatial?.missions ?? {}).filter(m => m.groupId === this.groupId && m.task?.result);
        const latest = reports.at(-1)?.task?.result;
        const observationAge = site?.knowledge ? Math.floor((state.time.winter * state.ticksPerWinter +
            state.time.tick - site.knowledge.observedAt) / state.ticksPerWinter) : 0;
        const html = `<h3>Island missions</h3><p class="fjord-caption">Separate missions depart from home. Explore first to map possible destinations.</p>
            <label>Mission group <select id="island-mission-group"><option value="" ${group ? 'hidden' : ''}>Create a group above</option>${groups.map(g =>
                `<option value="${escape(g.id)}" ${g.id === this.groupId ? 'selected' : ''}>${escape(g.name)}</option>`).join('')}</select></label>
            ${groupReason ? `<p class="fjord-caption" id="island-mission-group-block">${escape(groupReason)}</p>` : ''}
            ${canRecall ? '<button type="button" data-island-return>Return group home</button>' : ''}
            ${active?.task ? `<p>${escape(active.task.type)} · ${escape(active.status)}</p>` : ''}
            <button type="button" data-island-area title="${escape(groupReason)}" ${available ? '' : 'disabled aria-describedby="island-mission-group-block"'}>Recon mapped area</button>
            <h4>Known places</h4>${sites.length ? sites.map(s => `<button type="button" data-island-site="${escape(s.id)}"
                aria-pressed="${s.id === this.siteId}">${escape(s.knowledge?.settlementName ?? 'Unidentified settlement')}</button>`).join('') :
                '<p>No settlement has been sighted.</p>'}
            ${site ? `<p>${site.knowledge ? `${escape(site.knowledge.level)} · recorded ${observationAge ? `${observationAge} year${observationAge === 1 ? '' : 's'} ago` : 'this year'}` : 'Sighted. Send Recon from home to identify this settlement.'}</p>
                ${site.knowledge?.resistance ? `<p>Observed resistance: ${site.knowledge.resistance}</p>` : ''}
                <button type="button" data-island-focus="true">Show place on map</button>
                <div class="fjord-expedition-actions">${(['Recon', 'Surveillance', 'Pillage'] as const).map(type =>
                    `<button type="button" data-island-type="${type}" title="${escape(missionReason(type))}" ${missionReason(type) ? 'disabled' : ''}>${type}</button>`).join('')}</div>
                ${!site.knowledge?.settlementName ? '<p class="fjord-caption">Surveillance and Pillage unlock after a successful Recon returns home.</p>' : ''}
                ${site.knowledge?.opportunity ? `<details data-island-cargo-options><summary>Pillage priorities</summary>
                    <p class="fjord-caption">First available category, top to bottom. One category per survivor.</p>
                    <fieldset><legend>Choose cargo</legend>${(['Food', 'Materials', 'Cattle', 'People'] as const).map(cargo =>
                        `<label><input type="checkbox" data-cargo="${cargo}" checked> ${cargo}</label>`).join('')}</fieldset></details>` : ''}` : ''}
            ${latest ? `<article aria-label="Mission report"><h4>Latest mission report</h4><p>${escape(latest.summary)}</p>
                <details data-island-report-details><summary>Recovered assets &amp; crew</summary><p>${latest.food} Food · ${latest.materials} Materials · ${latest.cattleIds.length} cattle · ${latest.personaIds.length} residents recovered.
                ${latest.casualtyIds.length} lost · ${latest.survivorIds.length} returned.</p></details></article>` : ''}`;
        if (html !== this.html) {
            const checked = Array.from(this.controls.querySelectorAll<HTMLInputElement>('[data-cargo]'))
                .map(input => [input.dataset.cargo, input.checked] as const);
            const cargoOpen = this.controls.querySelector<HTMLDetailsElement>('[data-island-cargo-options]')?.open;
            const reportOpen = this.controls.querySelector<HTMLDetailsElement>('[data-island-report-details]')?.open;
            this.controls.innerHTML = html; this.html = html;
            const options = this.controls.querySelector<HTMLDetailsElement>('[data-island-cargo-options]');
            if (options && cargoOpen) options.open = true;
            const reportDetails = this.controls.querySelector<HTMLDetailsElement>('[data-island-report-details]');
            if (reportDetails && reportOpen) reportDetails.open = true;
            for (const input of Array.from(this.controls.querySelectorAll<HTMLInputElement>('[data-cargo]'))) {
                const previous = checked.find(([cargo]) => cargo === input.dataset.cargo);
                if (previous) input.checked = previous[1];
            }
        }
        this.root.querySelector('.island-mission-status')!.textContent = this.message;
    }
}
