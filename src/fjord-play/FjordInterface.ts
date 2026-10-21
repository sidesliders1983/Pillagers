import { applyCommand, inspectWork, inspectCattle, inspectLivestock, occupationAptitude, occupationIds, personaAge, landingSummary } from '../simulation/SimulationCore';
import { renderLivestockBreeding, slaughterBreedingWarning } from '../play/LivestockBreedingView';
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
import './mobile-horizon.css';
import { isMobileLayout } from './MobileShell';
import { CharacterPortraits } from '../characters/CharacterPortraits';
import { projectResidentAppearance } from '../characters/ResidentAppearance';
import { fjordWardrobePresentation } from './FjordWardrobe';
import { presentationProfiles } from '../config/PresentationQuality';

const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const pct = (value: number) => (value / 100).toFixed(1) + '%';
const button = (action: string, label: string, glyph: FjordIcon, attrs = '') =>
    `<button type="button" data-ui="${action}" ${attrs}>${icon(glyph)}<span>${label}</span></button>`;
const meter = (label: string, value: number) => `<div class="fjord-meter"><div><span>${esc(label)}</span>
    <strong>${Math.round(value * 100)}%</strong></div><meter min="0" max="1" value="${value}">${Math.round(value * 100)}%</meter></div>`;

interface InterfaceHooks {
    home?: () => void;
    select: (kind: string, id: string) => void;
    refresh: () => void;
    commit: (commands: SimulationCommand[] | (() => SimulationCommand[]), done: () => void) => void;
    notify: (message: string) => void;
}
type Task = 'work-menu' | 'work-plan' | 'occupation' | 'specialization' | 'risk' | null;

/** Shared commands and truthful data, with a mobile peek sheet and a focused task view. */
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
    private expanded = false;
    private abort = new AbortController();
    private lastFocus?: HTMLElement;
    private panelHTML?: string;
    private panelEpoch = -1;
    private panelWorld?: SharedSettlement['fjord']['blueprint'];
    private panelEditable = true;
    private portraits = new CharacterPortraits();
    private portraitAbort?: AbortController;
    private portraitKey = '';
    private portraitImage?: string;
    private panel = document.querySelector<HTMLElement>('#entity-panel')!;
    private management = document.querySelector<HTMLElement>('#fjord-management')!;
    private workspace = document.querySelector<HTMLElement>('#fjord-workspace')!;

    constructor(private owner: SharedSettlement, private hooks: InterfaceHooks) {
        document.addEventListener('fjord-layout-change', () => this.hooks.refresh(),
            { signal: this.abort.signal });
        for (const region of [this.panel, this.workspace]) {
            region.addEventListener('keydown', event => {
                if (isMobileLayout() && event.key !== 'Escape') event.stopPropagation();
            }, { signal: this.abort.signal });
        }
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
    dispose() {
        this.abort.abort();
        this.portraitAbort?.abort();
        this.portraits.dispose();
    }
    private get state() { return this.owner.session.readSnapshot(); }
    private link(kind: string, id: string, label: string) {
        return button('inspect', esc(label), kind === 'persona' ? 'people' : kind === 'cattle' ? 'cattle' : 'home',
            `class="fjord-link" data-kind="${kind}" data-id="${esc(id)}"`);
    }
    private heading(title: string, subtitle: string, glyph: FjordIcon, portrait = false) {
        const emblem = portrait && this.portraitImage
            ? `<img src="${this.portraitImage}" alt="" width="64" height="72">` : icon(glyph);
        return `<div class="fjord-card-heading"><span class="fjord-emblem${portrait ? ' fjord-portrait' : ''}">${emblem}</span><div>
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
        if (isMobileLayout() && !this.expanded) {
            return this.heading(person.name,
                `${personaAge(state, id)} Winters · ${occupationLabel(person.occupation)}`, 'people', true) +
                `<div class="fjord-card-body"><p class="fjord-caption">${person.deathWinter !== null ?
                    'Deceased · Winter ' + person.deathWinter : work.reason ? esc(work.reason.replaceAll('-', ' ')) :
                    'Working · ' + esc(work.resource ?? 'occupation')}</p>
                <div class="fjord-actions">${button('occupation', 'Change work', 'work')}
                    ${button('expand-card', 'Personal details', 'book')}</div></div>`;
        }
        const children = Object.values(state.personas).filter(p => p.parentIds.includes(id));
        const relative = (id: string) => this.link('persona', id,
            state.personas[id]?.name ?? state.personaArchive?.[id]?.name ?? id);
        const experience = person.occupationHistory.filter(h => h.occupation === person.occupation).reduce((years, h) => {
            const end = h.endedAt ?? state.time;
            return years + end.winter - h.startedAt.winter + (end.tick - h.startedAt.tick) / state.ticksPerWinter;
        }, 0);
        return this.heading(person.name, `${personaAge(state, id)} Winters · ${person.dna.sex === 'male' ? 'Male' : 'Female'} · ${occupationLabel(person.occupation)}`, 'people', true) +
            `<div class="fjord-card-body"><p class="fjord-status">${person.deathWinter !== null ? 'Deceased · Winter ' + person.deathWinter :
                work.reason ? esc(work.reason.replaceAll('-', ' ')) : 'Working · ' + esc(work.resource ?? 'occupation')}</p>
            <div class="fjord-profile-stats">${meter('Productivity', work.productivityBps / 10000)}${meter('Occupation fit', work.aptitudeBps / 10000)}</div>
            <p class="fjord-caption">${experience.toFixed(1)} recorded years in current occupation · ${state.mechanics!.people[id].occupationLocked ? 'Assigned career' : 'Autonomous career'}</p>
            <div class="fjord-traits">${traitKeys.map(key => meter(key[0].toUpperCase() + key.slice(1), person.dna.traits[key])).join('')}</div>
            <dl class="fjord-relations"><div><dt>Household</dt><dd>${home ? this.link('household', home.id, housingName(state, 'household', home.id)) : 'None'}</dd></div>
            <div><dt>Partner</dt><dd>${person.partnerId ? relative(person.partnerId) : 'None'}</dd></div>
            <div><dt>Children</dt><dd>${children.map(child => relative(child.id)).join('') || 'None'}</dd></div></dl>
            <div class="fjord-actions">${button('occupation', 'Change work', 'work')}
                ${isMobileLayout() ? button('collapse-card', 'Show less', 'back') : ''}</div>
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
            this.expanded = false;
            if (selection) this.close(false);
        }
        this.management.hidden = !selection || !!this.surface;
        this.management.classList.toggle('fjord-focus', !!this.task);
        this.management.classList.toggle('fjord-expanded', this.expanded || !!this.task);
        this.management.classList.toggle('fjord-home-card', !!selection &&
            ['household', 'building'].includes(selection.kind) && !this.task);
        let html = '';
        this.syncPortrait(state, selection);
        if (selection && !this.surface) {
            if (this.task) html = this.renderTask(state);
            else if (selection.kind === 'persona' && state.personas[selection.id]) html = this.person(state, selection.id, history);
            else if (selection.kind === 'persona') html = this.heading(state.personaArchive?.[selection.id]?.name ?? 'Historical identity',
                'Archived identity · current status is not observed', 'people', true) + `<div class="fjord-card-body">${history}</div>`;
            else if (['household', 'building'].includes(selection.kind)) {
                const home = this.household(selection);
                const residence = home?.residenceId ? state.residences[home.residenceId] : null;
                const buildingId = selection.kind === 'building' ? selection.id : residence?.buildingId;
                const house = !!buildingId && state.buildings[buildingId]?.kind === 'house';
                const yard = house && state.landing ? landingSummary(state).farmyards.find(y => y.id === buildingId) : null;
                html = this.heading(house ? 'Home' : home ? 'Tent' : 'Building',
                    `${buildingId ?? selection.id} · ` + (house ? 'Permanent home' + (yard ? ' · Active farmyard' : '') : home ? 'Household in a tent' : 'Vacant building'), house ? 'home' : 'tent') +
                    `<div class="fjord-card-body">${home ? `<details class="fjord-home-residents" data-view-key="home-residents:${esc(home.id)}"><summary><span title="${esc(housingName(state, 'household', home.id))}">${esc(housingName(state, 'household', home.id))}</span><small>Residents · ${home.memberIds.length}</small></summary>${home.memberIds.map(id => `<div class="fjord-member">${this.link('persona', id, state.personas[id].name)}<small>${esc(occupationLabel(state.personas[id].occupation))}</small></div>`).join('')}</details>` : '<p class="fjord-caption">Vacant home</p>'}
                    ${house && (!isMobileLayout() || this.expanded) ? this.improvements(state, buildingId!) : ''}
                    ${house && isMobileLayout() && !this.expanded ? `<p>${esc(state.buildings[buildingId!].specialization ? workLabel(state.buildings[buildingId!].specialization!) : 'Unspecialized')} · Level ${homeLevel(homeImprovements(state, buildingId!).upgradeLevel)}</p>` : ''}
                    ${yard ? `<p>${yard.occupants} livestock · space ${yard.occupancy}/${yard.capacity} · overcrowding ${yard.overcrowding}</p>` : ''}
                    ${yard ? renderLivestockBreeding(state, { farmyardId: yard.id }) : ''}
                    <div class="fjord-actions">${home && !house ? button('build', `Build house · ${state.mechanics!.config.houseCost} Materials`, 'home',
                        this.owner.availability({ type: 'BuildHouse', householdId: home.id }).allowed ? '' : 'disabled title="Insufficient Materials or household unavailable"') : ''}
                    ${home ? button('work-menu', 'Manage work', 'work') : ''}</div>
                    ${isMobileLayout() ? button(this.expanded ? 'collapse-card' : 'expand-card',
                        this.expanded ? 'Show less' : house ? 'Specialization & upgrades' : 'Household details',
                        this.expanded ? 'back' : 'home') : ''}
                    ${home && !house && !this.owner.availability({ type: 'BuildHouse', householdId: home.id }).allowed ?
                        `<p class="fjord-caption">${esc(this.owner.availability({ type: 'BuildHouse', householdId: home.id }).reason)}</p>` : ''}</div>`;
            } else html = this.heading(selection.kind === 'cattle' ? inspectLivestock(state, selection.id).name :
                selection.kind === 'campfire' ? 'Settlement campfire' : 'Longship', 'Current settlement record',
                selection.kind === 'cattle' ? 'cattle' : selection.kind === 'longship' ? 'ship' : 'home');
            if (!this.task && (!isMobileLayout() || this.expanded ||
                !['persona', 'building', 'household'].includes(selection.kind))) {
                html += `<div class="fjord-card-body">${this.result ? `<p class="fjord-result" role="status">${esc(this.result)}</p>` : ''}
                    ${['cattle', 'campfire', 'longship'].includes(selection.kind) ? legacy() :
                        `<details data-legacy-management data-view-key="advanced:${esc(key)}"><summary>More management</summary>${this.advanced ? legacy() : ''}</details>`}</div>`;
            }
        }
        const panelEpoch = this.owner.session.personalHistoryEpoch;
        const panelWorld = this.owner.fjord.blueprint;
        // HTML remains a current projection. Only skip the redundant DOM patch, and
        // retain normal control reconciliation for forms and replacement campaigns.
        if (html !== this.panelHTML || panelEpoch !== this.panelEpoch ||
            panelWorld !== this.panelWorld || this.panelEditable) {
            const preserved = new Set(Array.from(this.panel.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input,select'))
                .filter(field => !field.dataset.draft && !field.dataset.cattle &&
                    (this.owner.session.running || field === document.activeElement)).map(field => field.id));
            updateView(this.panel, html, preserved);
            this.panelHTML = html;
            this.panelEpoch = panelEpoch;
            this.panelWorld = panelWorld;
            this.panelEditable = this.panel.querySelector('input,select') !== null;
        }
        const count = this.attentionCount(state);
        document.querySelector('#fjord-attention-count')!.textContent = count > 99 ? '99+' : String(count);
        document.querySelector('#fjord-attention')!.setAttribute('aria-label', `Attention: ${count} unread events and current conditions`);
        if (this.surface) this.renderSurface();
    }

    private syncPortrait(state: SimulationState, selection: SettlementSelection) {
        if (selection?.kind !== 'persona' || this.surface || this.task) {
            this.portraitAbort?.abort();
            this.portraitKey = '';
            this.portraitImage = undefined;
            return;
        }
        try {
            const appearance = projectResidentAppearance(state, selection.id);
            if (!appearance) return;
            const person = state.personas[selection.id] ?? state.personaArchive![selection.id];
            const input = { ...appearance, presentation: fjordWardrobePresentation({ kind: 'persona',
                dna: appearance.dna, status: { living: person.deathWinter === null, occupation: person.occupation } }),
                pixelRatio: presentationProfiles[this.owner.presentation?.quality ?? 'low'].maximumPixelRatio };
            const key = selection.id + JSON.stringify(input);
            if (key === this.portraitKey) return;
            this.portraitAbort?.abort();
            const abort = this.portraitAbort = new AbortController();
            this.portraitKey = key;
            this.portraitImage = undefined;
            void this.portraits.request(input, abort.signal).then(image => {
                if (!image || abort.signal.aborted) return;
                this.portraitImage = image;
                this.hooks.refresh();
            }).catch(error => {
                if (!abort.signal.aborted) console.warn('Resident portrait unavailable:', error);
            });
        } catch (error) {
            // Incomplete historical records retain the existing identity emblem.
            this.portraitAbort?.abort();
            this.portraitImage = undefined;
        }
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
                ${plan.farmyard ? `<p>Farmyard after setup: ${plan.farmyard.occupants} livestock · space ${plan.farmyard.occupancy}/${plan.farmyard.capacity} · overcrowding ${plan.farmyard.overcrowding}.</p>` : ''}
                ${plan.unsheltered.length ? `<p class="fjord-risk">Livestock losing shelter: ${plan.unsheltered.map(id => esc(inspectLivestock(state, id).name)).join(', ')}.</p>` : ''}`;
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
                `<label class="fjord-check"><input type="checkbox" data-cattle="${esc(c.id)}" ${draft.cattleIds.includes(c.id) ? 'checked' : ''}>${icon('cattle')} ${esc(inspectLivestock(state, c.id).name)} · ${c.deathWinter !== null ? 'Unavailable · died in Winter ' + c.deathWinter : c.farmyardId ? 'Move from ' + esc(housingName(state, 'building', c.farmyardId)) : 'Unassigned'}</label>`).join('')}</div></section>` : ''}</div>
            <section class="fjord-plan-review">${summary}${error ? `<p class="fjord-risk" role="status">${esc(error)}</p>` : ''}
            <div class="fjord-actions">${button('commit-plan', 'Confirm setup', 'work', error ? 'disabled' : '')}${button('cancel-task', 'Cancel', 'close')}</div></section></div>`;
    }
    handle(button: HTMLButtonElement): boolean {
        const action = button.dataset.ui;
        if (!action) return false;
        const state = this.state;
        const home = this.household();
        switch (action) {
            case 'camera-home': this.close(false); this.hooks.home?.(); return true;
            case 'expand-card': this.expanded = true; break;
            case 'collapse-card': this.expanded = false; break;
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
                    this.result = `Changing the last farmer leaves ${losses.map(c => inspectLivestock(state, c.id).name).join(', ')} without farmyard shelter.`;
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
        if (isMobileLayout() && ['expand-card', 'collapse-card', 'work-menu', 'occupation', 'specialization',
            'plan', 'farmyard', 'cancel-task'].includes(action)) {
            const heading = this.panel.querySelector<HTMLElement>('.fjord-card-heading h2');
            heading?.setAttribute('tabindex', '-1');
            heading?.focus({ preventScroll: true });
            this.management.scrollTop = 0;
        }
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
        const irreversible = ['SalvageBuilding', 'SalvageLongship', 'SlaughterCattle', 'SlaughterLivestock'].includes(command.type);
        const state = this.state;
        const next = applyCommand(state, command);
        const losses = Object.values(state.landing?.cattle ?? {}).filter(c => c.farmyardId &&
            next.landing?.cattle[c.id]?.farmyardId === null).map(c => inspectLivestock(state, c.id).name);
        if (!irreversible && !losses.length) return true;
        const target = 'buildingId' in command ? command.buildingId : 'longshipId' in command ?
            command.longshipId : 'livestockId' in command ? inspectLivestock(state, command.livestockId).name :
            'cattleId' in command ? inspectLivestock(state, command.cattleId).name : 'personaId' in command ? command.personaId : '';
        const breedingWarning = command.type === 'SlaughterLivestock' || command.type === 'SlaughterCattle' ?
            slaughterBreedingWarning(state, next, command.type === 'SlaughterLivestock' ? command.livestockId : command.cattleId) : '';
        const dialog = document.createElement('dialog');
        dialog.id = 'fjord-command-review';
        dialog.setAttribute('aria-labelledby', 'fjord-command-title');
        dialog.innerHTML = `<h2 id="fjord-command-title">Review consequences</h2>
            <p>${esc(command.type.replace(/([a-z])([A-Z])/g, '$1 $2'))}: ${esc(target)}.</p>
            ${irreversible ? '<p>This permanently removes the selected subject.</p>' : ''}
            <p>Stock change: ${next.stocks.food - state.stocks.food} Food · ${next.stocks.materials - state.stocks.materials} Materials.</p>
            ${(next.specialistStocks?.hides ?? 0) > (state.specialistStocks?.hides ?? 0) ? `<p>Specialist stock: +${(next.specialistStocks?.hides ?? 0) - (state.specialistStocks?.hides ?? 0)} Hides.</p>` : ''}
            ${losses.length ? `<p class="fjord-risk">Livestock losing shelter: ${losses.map(esc).join(', ')}.</p>` : ''}
            ${breedingWarning ? `<p class="fjord-risk">${esc(breedingWarning)}</p>` : ''}
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
    private attentionCount(_state: SimulationState) {
        return this.owner.fjord.attentionView().unreadCount;
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
            expeditions: 'Expeditions', attention: 'Activity Center', food: 'Food stocks', materials: 'Materials stocks' } as Record<string, string>)[this.surface] ?? 'Settlement';
        const content = document.querySelector<HTMLElement>('#fjord-directory')!;
        content.hidden = this.surface !== 'settlement' && !['food', 'materials'].includes(this.surface);
        if (this.surface === 'attention') {
            // The shared AttentionView renders alerts and history in this existing workspace.
        } else if (this.surface === 'settlement') {
            const kinds = { persona: 'Residents', household: 'Homes', cattle: 'Livestock', longship: 'Vehicles' };
            const records = this.directory === 'persona' ? Object.values({ ...state.personaArchive, ...state.personas }).map(p =>
                ({ id: p.id, label: p.name, detail: state.personas[p.id] ? occupationLabel(p.occupation) + (p.deathWinter !== null ? ' · deceased' : '') : 'Historical record' })) :
                this.directory === 'household' ? Object.values(state.households).map(h => ({ id: h.id, label: housingName(state, 'household', h.id),
                    detail: h.residenceId && state.residences[h.residenceId]?.kind === 'house' ? 'Permanent home' : 'Tent' })) :
                this.directory === 'cattle' ? Object.values({ ...state.landing?.cattleArchive, ...state.landing?.cattle }).map(c => {
                    const animal = inspectLivestock(state, c.id);
                    return { id: c.id, label: animal.name,
                        detail: animal.speciesName + ' · ' + animal.sexTerm + ' · ' + (animal.historical ? 'Historical record' :
                            animal.deathWinter !== null ? 'Died · Winter ' + animal.deathWinter :
                            animal.farmyardId ? 'Assigned to a farmyard' : 'Unassigned') };
                }) :
                Object.values(state.landing?.longships ?? {})
                    .filter(ship => ship.salvagedWinter === null)
                    .map(ship => ({ id: ship.id, label: ship.id, detail: 'Longship' }));
            const html = `${this.hooks.home ? button('camera-home', 'View settlement', 'home') : ''}
                <div class="fjord-tabs">${Object.entries(kinds).map(([kind, label]) => button('directory', label, kind === 'persona' ? 'people' : kind === 'cattle' ? 'cattle' : kind === 'longship' ? 'ship' : 'home', `data-kind="${kind}" aria-pressed="${kind === this.directory}"`)).join('')}</div>
                <label class="fjord-search-label">Find an identity<input id="fjord-search" type="search" value="${esc(this.search)}" placeholder="Name or identifier"></label>
                ${this.directory === 'cattle' ? renderLivestockBreeding(state) : ''}
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
