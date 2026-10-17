import { applyCommand, inspectWork, inspectCattle, occupationAptitude, occupationIds, personaAge, landingSummary } from '../simulation/SimulationCore';
import type { Occupation, SimulationCommand, SimulationState } from '../simulation/SimulationCore';
import type { SharedSettlement, SettlementSelection } from '../play/SharedSettlement';
import { commandAvailability } from '../play/SharedSettlement';
import { housingName } from '../simulation/HousingNames';
import { traitKeys, heritageKeys } from '../characters/CharacterDNA';
import { heritageLabels } from '../characters/heritageProfiles';
import { updateView } from '../gameplay-lab/updateView';
import { icon, occupationIcon, occupationLabel, workLabel, type FjordIcon } from './FjordIcons';
import { proposeWork, previewWork, workCandidates, type WorkDraft } from './WorkPlan';
import { homeImprovements, previewHomeSpecialization, homeLevel } from './HomeImprovements';
import './fjord-interface.css';

const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const pct = (value: number) => (value / 100).toFixed(1) + '%';
const button = (action: string, label: string, glyph: FjordIcon, attrs = '') =>
    `<button type="button" data-ui="${action}" ${attrs}>${icon(glyph)}<span>${label}</span></button>`;
const meter = (label: string, value: number) => `<div class="fjord-meter"><div><span>${esc(label)}</span>
    <strong>${Math.round(value * 100)}%</strong></div><meter min="0" max="1" value="${value}">${Math.round(value * 100)}%</meter></div>`;

interface InterfaceHooks {
    select: (kind: string, id: string) => void;
    refresh: () => void;
    commit: (commands: SimulationCommand[] | (() => SimulationCommand[]), done: () => void) => void;
    notify: (message: string) => void;
}
type Task = 'work-menu' | 'work-plan' | 'occupation' | 'specialization' | 'risk' | null;

/** Option C: a compact context card, one focused task, and real canonical commands. */
export class FjordInterface {
    private task: Task = null;
    private draft?: WorkDraft;
    private pending?: SimulationCommand;
    private result = '';
    private selectionKey = '';
    private surface = '';
    private directory = 'persona';
    private search = '';
    private advanced = false;
    private abort = new AbortController();
    private lastFocus?: HTMLElement;
    private panel = document.querySelector<HTMLElement>('#entity-panel')!;
    private management = document.querySelector<HTMLElement>('#fjord-management')!;
    private workspace = document.querySelector<HTMLElement>('#fjord-workspace')!;

    constructor(private owner: SharedSettlement, private hooks: InterfaceHooks) {
        document.querySelector('#fjord-navigation')!.addEventListener('click', event => {
            const target = (event.target as Element).closest<HTMLElement>('[data-surface]');
            if (target) this.open(target.dataset.surface!);
        }, { signal: this.abort.signal });
        document.querySelectorAll('[data-stock]').forEach(node => node.addEventListener('click', () => {
            const stock = (node as HTMLElement).dataset.stock!;
            if (stock === 'settlement') this.directory = 'persona';
            this.open(stock, stock === 'settlement');
        }, { signal: this.abort.signal }));
        this.workspace.addEventListener('click', this.click, { signal: this.abort.signal });
        this.panel.addEventListener('change', this.change, { signal: this.abort.signal });
        this.panel.addEventListener('toggle', event => {
            const details = event.target;
            if (details instanceof HTMLDetailsElement && details.hasAttribute('data-legacy-management') &&
                details.open !== this.advanced) {
                this.advanced = details.open;
                this.hooks.refresh();
            }
        }, { capture: true, signal: this.abort.signal });
        this.workspace.addEventListener('input', event => {
            const input = event.target as HTMLInputElement;
            if (input.id === 'fjord-search') { this.search = input.value; this.renderSurface(); }
        }, { signal: this.abort.signal });
        document.addEventListener('keydown', event => {
            if (event.key !== 'Escape' || document.querySelector('dialog[open]')) return;
            if (this.surface) this.close();
            else if (this.task) { this.task = null; this.hooks.refresh(); }
            else if (this.owner.selection) this.hooks.select('', '');
        }, { signal: this.abort.signal });
    }
    dispose() { this.abort.abort(); }
    private get state() { return this.owner.session.readSnapshot(); }
    private link(kind: string, id: string, label: string) {
        return button('inspect', esc(label), kind === 'persona' ? 'people' : kind === 'cattle' ? 'cattle' : 'home',
            `class="fjord-link" data-kind="${kind}" data-id="${esc(id)}"`);
    }
    private heading(title: string, subtitle: string, glyph: FjordIcon) {
        return `<div class="fjord-card-heading"><span class="fjord-emblem">${icon(glyph)}</span><div>
            <small>Settlement</small><h2>${esc(title)}</h2><p>${esc(subtitle)}</p></div>
            ${button('close-card', '', 'close', 'class="fjord-close" aria-label="Close selection"')}</div>`;
    }
    private household(selection = this.owner.selection) {
        const state = this.state;
        return selection?.kind === 'household' ? state.households[selection.id] :
            Object.values(state.households).find(home => selection?.kind === 'persona'
                ? home.memberIds.includes(selection.id) : home.residenceId &&
                    state.residences[home.residenceId]?.buildingId === selection?.id);
    }
    private homeBuildingId() {
        const selection = this.owner.selection;
        if (selection?.kind === 'building') return selection.id;
        const home = this.household();
        return home?.residenceId ? this.state.residences[home.residenceId]?.buildingId : null;
    }
    private improvements(state: SimulationState, buildingId: string): string {
        const home = homeImprovements(state, buildingId);
        const role = home.building.specialization;
        const maintenance = home.occupied ? `${home.upkeep} Materials/year` :
            `0 Materials/year while vacant · ${home.upkeep} when occupied`;
        const reason = home.availability.reason;
        const workerPreview = home.next?.workers.map(worker =>
            `<p class="fjord-caption">${esc(state.personas[worker.id].name)}: ${pct(worker.before.productivityBps)} → ${pct(worker.after.productivityBps)} productivity${worker.after.reason ? ' · ' + esc(worker.after.reason.replaceAll('-', ' ')) : ''}</p>`).join('') ?? '';
        return `<section class="fjord-home-improvements" aria-label="Home specialization and upgrades">
            <div class="fjord-home-specialization">${icon(role ? occupationIcon(role) : 'home')}<strong>${role ? esc(workLabel(role)) : 'Unspecialized'}</strong><span>Level ${homeLevel(home.upgradeLevel)}</span>${button('specialization', 'Change', 'work', 'class="fjord-home-change" aria-label="Change specialization"')}</div>
            <p>${home.matching.length} matching resident${home.matching.length === 1 ? '' : 's'} · +${home.bonusBps / 100}% bonus to matching work</p>
            ${role && state.mechanics!.config.occupations[role].resource === null ? '<p class="fjord-caption">This occupation has no production output in the current campaign rules.</p>' : ''}
            ${role && !home.matching.length ? '<p class="fjord-caption">No resident currently matches this specialization. Changing a specialization keeps every resident’s occupation.</p>' : ''}
            <p>Upkeep: <strong>${maintenance}</strong></p>
            ${home.debtWinters ? `<p class="fjord-risk">Maintenance debt: ${home.debtWinters}/${state.mechanics!.config.collapseDebtWinters} years before collapse.</p>` : ''}
            <div class="fjord-home-upgrade">
                ${home.cost !== undefined ? `<p class="fjord-upgrade-preview"><strong>Upgrade to ${homeLevel(home.upgradeLevel + 1)}</strong><span>Bonus +${home.bonusBps / 100}% → +${home.nextBonusBps / 100}%<br>Occupied upkeep ${home.upkeep} → ${home.nextUpkeep} Materials/year</span></p>` : '<p>Maximum upgrade level reached.</p>'}
                ${home.cost !== undefined ? button('upgrade-home', `Upgrade to ${homeLevel(home.upgradeLevel + 1)} · ${home.cost} Materials`, 'home',
                    `data-building="${esc(buildingId)}" data-upgrade-level="${home.upgradeLevel}" ${home.availability.allowed ? '' : 'disabled aria-describedby="fjord-upgrade-reason"'}`) : ''}
                ${reason && home.cost !== undefined ? `<p id="fjord-upgrade-reason" class="fjord-caption">${esc(reason)}</p>` : ''}
                ${workerPreview ? `<details class="fjord-worker-preview"><summary>Resident productivity preview</summary>${workerPreview}</details>` : ''}
            </div></section>`;
    }
    private person(state: SimulationState, id: string, history: string) {
        const person = state.personas[id];
        const home = this.household();
        const work = inspectWork(state, id);
        const children = Object.values(state.personas).filter(p => p.parentIds.includes(id));
        const relative = (id: string) => this.link('persona', id,
            state.personas[id]?.name ?? state.personaArchive?.[id]?.name ?? id);
        const experience = person.occupationHistory.filter(h => h.occupation === person.occupation).reduce((years, h) => {
            const end = h.endedAt ?? state.time;
            return years + end.winter - h.startedAt.winter + (end.tick - h.startedAt.tick) / state.ticksPerWinter;
        }, 0);
        return this.heading(person.name, `${personaAge(state, id)} Winters · ${person.dna.sex === 'male' ? 'Male' : 'Female'} · ${occupationLabel(person.occupation)}`, 'people') +
            `<div class="fjord-card-body"><p class="fjord-status">${person.deathWinter !== null ? 'Deceased · Winter ' + person.deathWinter :
                work.reason ? esc(work.reason.replaceAll('-', ' ')) : 'Working · ' + esc(work.resource ?? 'occupation')}</p>
            <div class="fjord-profile-stats">${meter('Productivity', work.productivityBps / 10000)}${meter('Occupation fit', work.aptitudeBps / 10000)}</div>
            <p class="fjord-caption">${experience.toFixed(1)} recorded years in current occupation · ${state.mechanics!.people[id].occupationLocked ? 'Assigned career' : 'Autonomous career'}</p>
            <div class="fjord-traits">${traitKeys.map(key => meter(key[0].toUpperCase() + key.slice(1), person.dna.traits[key])).join('')}</div>
            <dl class="fjord-relations"><div><dt>Household</dt><dd>${home ? this.link('household', home.id, housingName(state, 'household', home.id)) : 'None'}</dd></div>
            <div><dt>Partner</dt><dd>${person.partnerId ? relative(person.partnerId) : 'None'}</dd></div>
            <div><dt>Children</dt><dd>${children.map(child => relative(child.id)).join('') || 'None'}</dd></div></dl>
            <div class="fjord-actions">${button('occupation', 'Change work', 'work')}</div>
            <details data-view-key="profile-extra:${esc(id)}"><summary>Heritage, parents & occupation aptitudes</summary>
            <p>Parents: ${person.parentIds.map(relative).join('') || 'No recorded parents'}</p>
            ${heritageKeys.filter(key => person.dna.heritage[key] > 0).map(key => meter(heritageLabels[key], person.dna.heritage[key])).join('')}
            ${occupationIds.map(role => meter(occupationLabel(role), occupationAptitude(state, id, role) / 10000)).join('')}</details>
            ${history}</div>`;
    }
    refresh(state: SimulationState, selection: SettlementSelection, history: string, legacy: () => string) {
        const key = selection ? selection.kind + ':' + selection.id : '';
        if (key !== this.selectionKey) {
            this.selectionKey = key;
            this.task = null;
            this.result = '';
            this.advanced = false;
            if (selection) this.close(false);
        }
        this.management.hidden = !selection || !!this.surface;
        this.management.classList.toggle('fjord-focus', !!this.task);
        this.management.classList.toggle('fjord-home-card', !!selection &&
            ['household', 'building'].includes(selection.kind) && !this.task);
        let html = '';
        if (selection && !this.surface) {
            if (this.task) html = this.renderTask(state);
            else if (selection.kind === 'persona' && state.personas[selection.id]) html = this.person(state, selection.id, history);
            else if (selection.kind === 'persona') html = this.heading(state.personaArchive?.[selection.id]?.name ?? 'Historical identity',
                'Archived identity · current status is not observed', 'people') + `<div class="fjord-card-body">${history}</div>`;
            else if (['household', 'building'].includes(selection.kind)) {
                const home = this.household(selection);
                const residence = home?.residenceId ? state.residences[home.residenceId] : null;
                const buildingId = selection.kind === 'building' ? selection.id : residence?.buildingId;
                const house = !!buildingId && state.buildings[buildingId]?.kind === 'house';
                const yard = house && state.landing ? landingSummary(state).farmyards.find(y => y.id === buildingId) : null;
                html = this.heading(house ? 'Home' : home ? 'Tent' : 'Building',
                    `${buildingId ?? selection.id} · ` + (house ? 'Permanent home' + (yard ? ' · Active farmyard' : '') : home ? 'Household in a tent' : 'Vacant building'), house ? 'home' : 'tent') +
                    `<div class="fjord-card-body">${home ? `<details class="fjord-home-residents" data-view-key="home-residents:${esc(home.id)}"><summary><span title="${esc(housingName(state, 'household', home.id))}">${esc(housingName(state, 'household', home.id))}</span><small>Residents · ${home.memberIds.length}</small></summary>${home.memberIds.map(id => `<div class="fjord-member">${this.link('persona', id, state.personas[id].name)}<small>${esc(occupationLabel(state.personas[id].occupation))}</small></div>`).join('')}</details>` : '<p class="fjord-caption">Vacant home</p>'}
                    ${house ? this.improvements(state, buildingId!) : ''}
                    ${yard ? `<p>${yard.occupants}/${yard.capacity} livestock sheltered · overcrowding ${yard.overcrowding}</p>` : ''}
                    <div class="fjord-actions">${home && !house ? button('build', `Build house · ${state.mechanics!.config.houseCost} Materials`, 'home',
                        this.owner.availability({ type: 'BuildHouse', householdId: home.id }).allowed ? '' : 'disabled title="Insufficient Materials or household unavailable"') : ''}
                    ${home ? button('work-menu', 'Manage work', 'work') : ''}</div>
                    ${home && !house && !this.owner.availability({ type: 'BuildHouse', householdId: home.id }).allowed ?
                        `<p class="fjord-caption">${esc(this.owner.availability({ type: 'BuildHouse', householdId: home.id }).reason)}</p>` : ''}</div>`;
            } else html = this.heading(selection.kind === 'cattle' ? 'Livestock · ' + selection.id :
                selection.kind === 'campfire' ? 'Settlement campfire' : 'Longship', 'Current settlement record',
                selection.kind === 'cattle' ? 'cattle' : selection.kind === 'longship' ? 'ship' : 'home');
            if (!this.task) {
                html += `<div class="fjord-card-body">${this.result ? `<p class="fjord-result" role="status">${esc(this.result)}</p>` : ''}
                    ${['cattle', 'campfire', 'longship'].includes(selection.kind) ? legacy() :
                        `<details data-legacy-management data-view-key="advanced:${esc(key)}"><summary>More management</summary>${this.advanced ? legacy() : ''}</details>`}</div>`;
            }
        }
        const preserved = new Set(Array.from(this.panel.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input,select'))
            .filter(field => !field.dataset.draft && !field.dataset.cattle &&
                (this.owner.session.running || field === document.activeElement)).map(field => field.id));
        updateView(this.panel, html, preserved);
        const count = this.attentionCount(state);
        document.querySelector('#fjord-attention-count')!.textContent = String(count);
        document.querySelector('#fjord-attention')!.setAttribute('aria-label', `Attention: ${count} current conditions`);
        if (this.surface) this.renderSurface();
    }
    private renderTask(state: SimulationState): string {
        if (this.task === 'risk') return this.heading('Review consequences', 'Your campaign has not changed.', 'alert') +
            `<div class="fjord-card-body"><p class="fjord-risk">${esc(this.result)}</p><div class="fjord-actions">
            ${button('confirm-risk', 'Confirm change', 'work')}${button('cancel-task', 'Cancel', 'close')}</div></div>`;
        if (this.task === 'specialization') {
            const buildingId = this.homeBuildingId();
            if (!buildingId || !state.buildings[buildingId]) return this.heading('Home unavailable', 'Select a permanent home.', 'home');
            const home = homeImprovements(state, buildingId);
            return this.heading('Change specialization', 'Choose the work this home supports. Occupations and upgrade level are kept.', 'work') +
                `<div class="fjord-card-body"><p>Level ${homeLevel(home.upgradeLevel)} · +${home.bonusBps / 100}% matching-work bonus · ${home.upkeep} Materials/year when occupied.</p>
                <div class="fjord-choice-grid">${[null, ...occupationIds].map(role => {
                    const matching = home.residents.filter(id => role !== null && state.personas[id].occupation === role);
                    return button('choose-specialization', `${role ? esc(workLabel(role)) : 'Unspecialized'}<small>${role ? matching.length + ' matching residents · no Materials cost' + (state.mechanics!.config.occupations[role].resource === null ? ' · no production output' : '') : 'No workplace bonus · level and upkeep kept'}</small>`,
                        role ? occupationIcon(role) : 'home', `data-role="${role ?? ''}" aria-pressed="${home.building.specialization === role}"`);
                }).join('')}</div>${button('cancel-task', 'Back', 'close')}</div>`;
        }
        const home = this.household();
        if (this.task === 'occupation' && this.owner.selection?.kind === 'persona') {
            const id = this.owner.selection.id;
            return this.heading('Change work', state.personas[id].name, 'work') + `<div class="fjord-card-body"><div class="fjord-choice-grid">` +
                occupationIds.map(role => {
                    const status = this.owner.availability({ type: 'AssignOccupation', personaId: id, occupation: role });
                    return button('choose-occupation', `${esc(occupationLabel(role))}<small>${pct(occupationAptitude(state, id, role))} fit${status.reason ? ' · ' + esc(status.reason) : ''}</small>`,
                        occupationIcon(role), `data-role="${role}" ${status.allowed ? '' : 'disabled'}`);
                }).join('') + `</div>${button('cancel-task', 'Back', 'close')}</div>`;
        }
        if (!home) return this.heading('Work setup', 'Select a household first.', 'work');
        if (this.task === 'work-menu') return this.heading('Household work', 'Housing and occupations are separate choices.', 'work') +
            `<div class="fjord-card-body"><div class="fjord-choice-grid">${occupationIds.map(role =>
                button('plan', workLabel(role), occupationIcon(role), `data-role="${role}"`)).join('')}
            ${button('farmyard', 'Set up farmyard', 'cattle')}</div>${button('cancel-task', 'Back', 'close')}</div>`;
        const draft = this.draft!;
        const candidates = workCandidates(state, home.id, draft.occupation);
        const residence = home.residenceId ? state.residences[home.residenceId] : null;
        let summary = '', error = '';
        try {
            const plan = previewWork(state, draft);
            summary = `<p><strong>${plan.materials} Materials</strong> · ${plan.upkeep} Materials/year home upkeep</p>
                <p>${esc(state.personas[draft.workerId].name)}: ${esc(occupationLabel(state.personas[draft.workerId].occupation))} → ${esc(occupationLabel(draft.occupation))}.
                ${state.personas[draft.workerId].occupation === draft.occupation ? 'Existing career settings are kept.' : 'The occupation becomes player-assigned; the existing career-switch rules apply.'}</p>
                ${plan.farmyard ? `<p>Farmyard after setup: ${plan.farmyard.occupants}/${plan.farmyard.capacity} livestock · overcrowding ${plan.farmyard.overcrowding}.</p>` : ''}
                ${plan.unsheltered.length ? `<p class="fjord-risk">Livestock losing shelter: ${plan.unsheltered.map(esc).join(', ')}.</p>` : ''}`;
        } catch (reason) { error = reason instanceof Error ? reason.message : String(reason); }
        return this.heading(draft.kind === 'farmyard' ? 'Set up farmyard' : 'Set up ' + workLabel(draft.occupation).toLowerCase(),
            'Review the whole task before applying it.', occupationIcon(draft.occupation)) + `<div class="fjord-card-body">
            <div class="fjord-task-columns"><section><h3>Resident</h3><div class="fjord-choice-grid">${candidates.map(id => button('worker',
                `${esc(state.personas[id].name)}<small>${pct(occupationAptitude(state, id, draft.occupation))} fit · ${esc(occupationLabel(state.personas[id].occupation))}</small>`,
                'people', `data-id="${esc(id)}" aria-pressed="${id === draft.workerId}"`)).join('') || '<p>No eligible resident available.</p>'}</div>
            ${residence?.kind !== 'house' ? `<label class="fjord-check"><input type="checkbox" data-draft="buildHouse" ${draft.buildHouse ? 'checked' : ''}> Build permanent home · ${state.mechanics!.config.houseCost} Materials</label>` : '<p>Reuse the existing permanent home.</p>'}
            ${residence?.kind === 'house' || draft.buildHouse ? `<label class="fjord-check"><input type="checkbox" data-draft="specialize" ${draft.specialize ? 'checked' : ''}> Specialize the home for ${esc(workLabel(draft.occupation).toLowerCase())}</label>` : ''}
            </section>${draft.kind === 'farmyard' ? `<section><h3>Livestock</h3><p class="fjord-caption">Suggested animals are unassigned. Other farmyard assignments are kept unless explicitly chosen.</p>
            <div class="fjord-animal-list">${Object.values(state.landing?.cattle ?? {}).filter(c => c.deathWinter === null || draft.cattleIds.includes(c.id)).map(c =>
                `<label class="fjord-check"><input type="checkbox" data-cattle="${esc(c.id)}" ${draft.cattleIds.includes(c.id) ? 'checked' : ''}>${icon('cattle')} ${esc(c.id)} · ${c.deathWinter !== null ? 'Unavailable · died in Winter ' + c.deathWinter : c.farmyardId ? 'Move from ' + esc(housingName(state, 'building', c.farmyardId)) : 'Unassigned'}</label>`).join('')}</div></section>` : ''}</div>
            <section class="fjord-plan-review">${summary}${error ? `<p class="fjord-risk" role="status">${esc(error)}</p>` : ''}
            <div class="fjord-actions">${button('commit-plan', 'Confirm setup', 'work', error ? 'disabled' : '')}${button('cancel-task', 'Cancel', 'close')}</div></section></div>`;
    }
    handle(button: HTMLButtonElement): boolean {
        const action = button.dataset.ui;
        if (!action) return false;
        const state = this.state;
        const home = this.household();
        switch (action) {
            case 'inspect': this.close(false); this.hooks.select(button.dataset.kind!, button.dataset.id!); return true;
            case 'close-workspace': this.close(); return true;
            case 'directory': this.directory = button.dataset.kind!; this.search = ''; this.renderSurface(); return true;
            case 'close-card': this.hooks.select('', ''); return true;
            case 'campaign-settings': {
                this.close(false);
                document.querySelector<HTMLDetailsElement>('#fjord-menu')!.open = true;
                document.querySelector<HTMLDetailsElement>('#fjord-campaign')!.open = true;
                document.querySelector<HTMLElement>('#fjord-exploration')!.focus();
                return true;
            }
            case 'cancel-task': this.task = null; this.pending = undefined; break;
            case 'specialization': this.task = 'specialization'; break;
            case 'choose-specialization': {
                const buildingId = this.homeBuildingId();
                if (!buildingId) return true;
                const role = (button.dataset.role || null) as Occupation | null;
                if (state.buildings[buildingId]?.specialization === role) { this.task = null; break; }
                this.run(() => [previewHomeSpecialization(this.state, buildingId, role).command],
                    'Home specialization updated. Occupations and upgrade level kept.');
                return true;
            }
            case 'upgrade-home': {
                const buildingId = button.dataset.building;
                if (buildingId) {
                    const level = Number(button.dataset.upgradeLevel);
                    this.run(() => {
                        if (this.state.mechanics?.buildings[buildingId]?.upgradeLevel !== level)
                            throw new Error('The home has changed. Review the updated upgrade before trying again.');
                        return [{ type: 'UpgradeBuilding', buildingId }];
                    }, 'Home upgraded.');
                }
                return true;
            }
            case 'work-menu': this.task = 'work-menu'; break;
            case 'occupation': this.task = 'occupation'; break;
            case 'plan': case 'farmyard':
                if (!home) return true;
                this.draft = proposeWork(state, home.id, action === 'farmyard' ? 'farmer' : button.dataset.role as Occupation,
                    action === 'farmyard' ? 'farmyard' : 'work');
                this.task = 'work-plan'; break;
            case 'worker': if (this.draft) this.draft.workerId = button.dataset.id!; break;
            case 'build':
                if (home) this.run([{ type: 'BuildHouse', householdId: home.id }], 'Permanent home built. Occupations and livestock assignments are kept.');
                return true;
            case 'choose-occupation': {
                if (this.owner.selection?.kind !== 'persona') return true;
                const command: SimulationCommand = { type: 'AssignOccupation', personaId: this.owner.selection.id,
                    occupation: button.dataset.role as Occupation };
                if (state.personas[this.owner.selection.id].occupation === command.occupation) {
                    this.task = null; this.result = 'Current occupation and career settings kept.'; break;
                }
                const next = applyCommand(state, command);
                const losses = Object.values(state.landing?.cattle ?? {}).filter(c => c.farmyardId && next.landing?.cattle[c.id]?.farmyardId === null);
                if (losses.length) {
                    this.pending = command; this.task = 'risk';
                    this.result = `Changing the last farmer leaves ${losses.map(c => c.id).join(', ')} without farmyard shelter.`;
                } else this.run([command], 'Occupation updated.');
                break;
            }
            case 'confirm-risk': if (this.pending) this.run([this.pending], 'Occupation updated.'); return true;
            case 'commit-plan': {
                if (!this.draft) return true;
                try {
                    const plan = previewWork(state, this.draft);
                    const draft = structuredClone(this.draft);
                    this.run(() => previewWork(this.state, draft).commands,
                        this.draft.kind === 'farmyard' ? 'Farmyard setup completed.' : 'Household work setup completed.');
                } catch (reason) { this.hooks.notify(String(reason)); }
                return true;
            }
            default: return false;
        }
        this.hooks.refresh();
        return true;
    }
    private run(commands: SimulationCommand[] | (() => SimulationCommand[]), message: string) {
        this.hooks.commit(commands, () => {
            this.task = null; this.pending = undefined; this.result = message;
            this.hooks.notify(message);
        });
    }
    private click = (event: Event) => {
        const target = (event.target as Element).closest<HTMLButtonElement>('button');
        if (target && !target.disabled) this.handle(target);
    };
    private change = (event: Event) => {
        if (!this.draft || this.task !== 'work-plan') return;
        const input = event.target as HTMLInputElement;
        if (input.dataset.draft === 'buildHouse') this.draft.buildHouse = input.checked;
        if (input.dataset.draft === 'specialize') this.draft.specialize = input.checked;
        if (input.dataset.cattle) this.draft.cattleIds = input.checked ?
            [...this.draft.cattleIds, input.dataset.cattle] : this.draft.cattleIds.filter(id => id !== input.dataset.cattle);
        this.hooks.refresh();
    };
    showExplorationMap() {
        this.surface = 'expeditions';
        this.workspace.dataset.surface = 'expeditions';
        this.workspace.hidden = true;
        this.management.hidden = true;
    }
    async approve(command: SimulationCommand): Promise<boolean> {
        const irreversible = ['SalvageBuilding', 'SalvageLongship', 'SlaughterCattle'].includes(command.type);
        const state = this.state;
        const next = applyCommand(state, command);
        const losses = Object.values(state.landing?.cattle ?? {}).filter(c => c.farmyardId &&
            next.landing?.cattle[c.id]?.farmyardId === null).map(c => c.id);
        if (!irreversible && !losses.length) return true;
        const target = 'buildingId' in command ? command.buildingId : 'longshipId' in command ?
            command.longshipId : 'cattleId' in command ? command.cattleId : 'personaId' in command ? command.personaId : '';
        const dialog = document.createElement('dialog');
        dialog.id = 'fjord-command-review';
        dialog.setAttribute('aria-labelledby', 'fjord-command-title');
        dialog.innerHTML = `<h2 id="fjord-command-title">Review consequences</h2>
            <p>${esc(command.type.replace(/([a-z])([A-Z])/g, '$1 $2'))}: ${esc(target)}.</p>
            ${irreversible ? '<p>This permanently removes the selected subject.</p>' : ''}
            <p>Stock change: ${next.stocks.food - state.stocks.food} Food · ${next.stocks.materials - state.stocks.materials} Materials.</p>
            ${losses.length ? `<p class="fjord-risk">Livestock losing shelter: ${losses.map(esc).join(', ')}.</p>` : ''}
            <div class="fjord-actions"><button type="button" data-confirm>Confirm action</button><button type="button" data-cancel>Cancel</button></div>`;
        document.querySelector('#fjord-play')!.append(dialog);
        return new Promise(resolve => {
            const finish = (confirmed: boolean) => {
                dialog.close(); dialog.remove(); this.abort.signal.removeEventListener('abort', cancel);
                resolve(confirmed);
            };
            const cancel = () => finish(false);
            dialog.querySelector('[data-confirm]')!.addEventListener('click', () => finish(true), { once: true });
            dialog.querySelector('[data-cancel]')!.addEventListener('click', cancel, { once: true });
            dialog.addEventListener('cancel', cancel, { once: true });
            this.abort.signal.addEventListener('abort', cancel, { once: true });
            dialog.showModal();
        });
    }
    private attentionCount(state: SimulationState) {
        return (state.stocks.food <= 0 ? 1 : 0) +
            Object.values(state.households).filter(h => h.memberIds.some(id => state.personas[id]?.deathWinter === null) &&
                (!h.residenceId || state.residences[h.residenceId]?.kind === 'tent')).length +
            (state.landing ? landingSummary(state).unshelteredCattle : 0);
    }
    open(surface: string, force = false) {
        if (surface === 'livestock') { this.directory = 'cattle'; surface = 'settlement'; force = true; }
        if (surface === this.surface && !force && !this.workspace.hidden) { this.close(); return; }
        this.lastFocus = document.activeElement as HTMLElement;
        this.surface = surface;
        this.workspace.hidden = false;
        this.management.hidden = true;
        this.renderSurface();
        this.workspace.focus();
        this.hooks.refresh();
    }
    private close(restoreFocus = true) {
        this.surface = '';
        this.workspace.hidden = true;
        if (restoreFocus && this.lastFocus?.isConnected) this.lastFocus.focus();
        this.management.hidden = !this.owner.selection;
    }
    private renderSurface() {
        const state = this.state;
        this.workspace.dataset.surface = this.surface;
        for (const node of Array.from(this.workspace.querySelectorAll<HTMLElement>('[data-workspace-area]'))) {
            node.hidden = node.dataset.workspaceArea !== this.surface;
        }
        document.querySelector('#fjord-workspace-title')!.textContent = ({ settlement: 'Settlement',
            expeditions: 'Expeditions', attention: 'Attention & recent events', food: 'Food stocks', materials: 'Materials stocks' } as Record<string, string>)[this.surface] ?? 'Settlement';
        const content = document.querySelector<HTMLElement>('#fjord-directory')!;
        content.hidden = this.surface !== 'settlement' && !['food', 'materials'].includes(this.surface);
        if (this.surface === 'attention') {
            const homes = Object.values(state.households).filter(h => h.memberIds.some(id => state.personas[id]?.deathWinter === null) &&
                (!h.residenceId || state.residences[h.residenceId]?.kind === 'tent'));
            const cattle = Object.values(state.landing?.cattle ?? {}).filter(c => c.deathWinter === null && !inspectCattle(state, c.id).sheltered);
            document.querySelector('#fjord-attention-summary')!.innerHTML =
                (state.stocks.food <= 0 ? '<p class="fjord-risk">Food stocks are empty.</p>' : '') +
                `<h3>${homes.length} households in tents</h3>` + homes.map(h => this.link('household', h.id, housingName(state, 'household', h.id))).join('') +
                `<h3>${cattle.length} livestock without shelter</h3>` + cattle.map(c => this.link('cattle', c.id, c.id)).join('');
        } else if (this.surface === 'settlement') {
            const kinds = { persona: 'Residents', household: 'Homes', cattle: 'Livestock', longship: 'Vehicles' };
            const records = this.directory === 'persona' ? Object.values({ ...state.personaArchive, ...state.personas }).map(p =>
                ({ id: p.id, label: p.name, detail: state.personas[p.id] ? occupationLabel(p.occupation) + (p.deathWinter !== null ? ' · deceased' : '') : 'Historical record' })) :
                this.directory === 'household' ? Object.values(state.households).map(h => ({ id: h.id, label: housingName(state, 'household', h.id),
                    detail: h.residenceId && state.residences[h.residenceId]?.kind === 'house' ? 'Permanent home' : 'Tent' })) :
                this.directory === 'cattle' ? Object.values(state.landing?.cattle ?? {}).map(c => ({ id: c.id, label: c.id,
                    detail: c.deathWinter !== null ? 'Died · Winter ' + c.deathWinter : c.farmyardId ? 'Assigned to a farmyard' : 'Unassigned cattle' })) :
                Object.values(state.landing?.longships ?? {})
                    .filter(ship => ship.salvagedWinter === null)
                    .map(ship => ({ id: ship.id, label: ship.id, detail: 'Longship' }));
            const html = `<div class="fjord-tabs">${Object.entries(kinds).map(([kind, label]) => button('directory', label, kind === 'persona' ? 'people' : kind === 'cattle' ? 'cattle' : kind === 'longship' ? 'ship' : 'home', `data-kind="${kind}" aria-pressed="${kind === this.directory}"`)).join('')}</div>
                <label class="fjord-search-label">Find an identity<input id="fjord-search" type="search" value="${esc(this.search)}" placeholder="Name or identifier"></label>
                <div class="fjord-directory-list">${records.filter(r => (r.label + ' ' + r.id).toLocaleLowerCase().includes(this.search.toLocaleLowerCase())).map(r =>
                    `<div>${this.link(this.directory, r.id, r.label)}<small>${esc(r.detail)}</small></div>`).join('') || '<p>No matching identities.</p>'}</div>`;
            updateView(content, html, new Set(['fjord-search']));
        } else if (this.surface === 'food' || this.surface === 'materials') {
            const resource = this.surface;
            content.innerHTML = `<p class="fjord-stock-total">${state.stocks[resource]} <span>${resource === 'food' ? 'Food' : 'Materials'} available</span></p>
                <p>Current stocks. Production depends on occupation, working conditions and weather.</p><h3>Current producers</h3>` +
                Object.values(state.personas).filter(p => p.deathWinter === null && inspectWork(state, p.id).resource === resource)
                    .map(p => `<div class="fjord-member">${this.link('persona', p.id, p.name)}<small>${pct(inspectWork(state, p.id).productivityBps)} productivity</small></div>`).join('');
        }
    }
}
