import type { SharedSettlement } from '../play/SharedSettlement';
import type { FoundingBookWindow } from '../lore/FoundingBookWindow';
import { updateView } from '../gameplay-lab/updateView';
import { housingName } from '../simulation/HousingNames';
import { isMobileLayout } from './MobileShell';
import { occupationLabel } from './FjordIcons';
import { firstStepsEvidence, firstStepsFacts, firstStepsStep, inspectFirstSteps,
    newFirstSteps, observeFirstSteps, type FirstStepsInspection, type FirstStepsProgress } from './FirstStepsState';
import type { WorkDraft } from './WorkPlan';
import './first-steps.css';

interface FirstStepsHooks {
    persist(): void;
    pause(): void;
    reveal(): void;
    clockChanged(): void;
    resident(id: string): void;
    household(id: string): void;
    stocks(resource: 'food' | 'materials'): void;
    work(draft: WorkDraft): void;
    expeditions(): void;
}

const esc = (text: unknown) => String(text ?? '').replace(/[&<>"']/g,
    char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));
const headingForStatus = (status: FirstStepsProgress['status']) => status === 'complete' ? 'What’s next?' : 'First steps are set aside';
const button = (action: string, label: string, attributes = '') =>
    `<button type="button" data-guide="${action}" data-view-key="first-steps:${action}" ${attributes}>${esc(label)}</button>`;

/** A small UI projection. Navigation never owns a simulation command or a second clock. */
export class FirstStepsGuide {
    readonly root = document.createElement('section');
    private abort = new AbortController();
    private visible = false;
    private waitingForStory = false;
    private releaseStory?: () => void;
    private ordinaryStart?: () => void;
    private held = false;
    private revision = -1;
    private cursor: number;
    private html = '';

    constructor(private owner: SharedSettlement, private hooks: FirstStepsHooks) {
        this.cursor = owner.session.readSnapshot().events.length;
        this.root.id = 'fjord-first-steps-card';
        this.root.hidden = true;
        this.root.setAttribute('aria-label', 'First steps');
        this.root.addEventListener('click', this.click, { signal: this.abort.signal });
        this.root.addEventListener('keydown', event => {
            if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                this.collapse();
            }
        }, { signal: this.abort.signal });
        for (const type of ['pointerdown', 'pointerup', 'wheel'])
            this.root.addEventListener(type, event => event.stopPropagation(), { signal: this.abort.signal });
        document.querySelector('#fjord-play')!.append(this.root);
        document.querySelector('#fjord-first-steps')!.addEventListener('click', () => this.open(),
            { signal: this.abort.signal });
    }
    get blocksClock() { return this.held; }
    private get state() { return this.owner.session.readSnapshot(); }
    private get progress() { return this.owner.fjord.firstSteps ?? newFirstSteps(); }
    private save(progress: FirstStepsProgress) {
        if (JSON.stringify(progress) === JSON.stringify(this.owner.fjord.firstSteps)) return false;
        this.owner.fjord.firstSteps = progress;
        this.hooks.persist();
        return true;
    }
    /** Only explicit new/restarted histories receive an automatic invitation. */
    newStart(story?: FoundingBookWindow, ordinaryStart?: () => void) {
        this.restore();
        this.save(newFirstSteps());
        this.held = true;
        this.hooks.clockChanged();
        this.ordinaryStart = ordinaryStart;
        this.waitingForStory = !!story?.isOpen;
        if (this.waitingForStory) {
            this.releaseStory = story!.whenClosed(() => {
                this.waitingForStory = false;
                this.hooks.reveal();
                this.visible = true;
                this.render();
            });
        } else {
            this.hooks.reveal();
            this.visible = true;
        }
        this.render();
    }
    /** Continue/import/context recovery retain progress but never open or replay the guide. */
    restore() {
        this.releaseStory?.();
        this.releaseStory = undefined;
        this.ordinaryStart = undefined;
        this.held = false;
        this.hooks.clockChanged();
        this.waitingForStory = false;
        this.visible = false;
        this.cursor = this.state.events.length;
        this.revision = -1;
        this.root.hidden = true;
    }
    open() {
        const menu = document.querySelector<HTMLDetailsElement>('#fjord-menu');
        if (menu) menu.open = false;
        if (this.waitingForStory) return;
        this.hooks.reveal();
        this.visible = true;
        this.save({ ...this.progress, collapsed: false });
        if (this.progress.status === 'offered') {
            this.hooks.pause();
            this.held = true;
            this.hooks.clockChanged();
        }
        if (this.progress.status === 'active' && this.progress.watch && !this.progress.evidenceId)
            this.save(observeFirstSteps(this.progress, this.state, this.progress.watch.afterEvent));
        this.render();
        this.root.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
    }
    inspected(kind: FirstStepsInspection, id?: string) {
        if (!this.owner.fjord.firstSteps) return;
        const changed = this.save(inspectFirstSteps(this.progress, this.state, kind, id));
        if (changed && this.visible) this.render();
    }
    update(suspended = false) {
        if (this.owner.session.revision !== this.revision) {
            this.revision = this.owner.session.revision;
            if (this.owner.fjord.firstSteps)
                this.save(observeFirstSteps(this.progress, this.state, this.cursor));
            this.cursor = this.state.events.length;
            if (this.visible) this.render();
        }
        this.root.hidden = !this.visible || this.waitingForStory || suspended;
    }
    private collapse() {
        if (this.progress.status === 'offered') {
            this.choose(false);
            return;
        }
        this.save({ ...this.progress, collapsed: true });
        this.render();
        this.root.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
    }
    private choose(guided: boolean) {
        const ordinary = this.ordinaryStart;
        this.ordinaryStart = undefined;
        this.held = false;
        this.hooks.clockChanged();
        this.save({ ...this.progress, status: guided ? 'active' : 'skipped', collapsed: false });
        this.visible = guided;
        if (guided) this.hooks.pause();
        else ordinary?.();
        this.render();
        if (guided) this.focusHeading();
        else document.querySelector<HTMLElement>('#fjord-run')?.focus({ preventScroll: true });
    }
    private click = (event: MouseEvent) => {
        const action = (event.target as Element).closest<HTMLElement>('[data-guide]')?.dataset.guide;
        if (!action) return;
        if (action === 'guide' || action === 'explore') { this.choose(action === 'guide'); return; }
        if (action === 'expand') { this.open(); return; }
        if (action === 'collapse') { this.collapse(); return; }
        if (action === 'skip' || action === 'dismiss') {
            if (this.progress.status === 'active') this.save({ ...this.progress, status: 'skipped' });
            this.visible = false;
            this.root.hidden = true;
            document.querySelector<HTMLElement>('#fjord-menu > summary')?.focus({ preventScroll: true });
            return;
        }
        if (action === 'replay' || action === 'resume') {
            this.hooks.pause();
            const progress: FirstStepsProgress = { ...(action === 'replay' ? newFirstSteps() : this.progress),
                status: 'active', collapsed: false };
            this.save(observeFirstSteps(progress, this.state, progress.watch?.afterEvent ?? this.state.events.length));
            this.cursor = this.state.events.length;
            this.render();
            this.focusHeading();
            return;
        }
        const facts = firstStepsFacts(this.state, this.progress, command => this.owner.availability(command));
        if (action === 'watch' && facts.worker && facts.work?.resource === 'materials' && this.progress.householdId === facts.home?.id && !facts.housing.allowed) {
            this.save({ ...this.progress, watch: { kind: 'work', id: facts.worker.id,
                afterEvent: this.state.events.length }, evidenceId: null });
            this.render();
            return;
        }
        if (action === 'understood' && firstStepsEvidence(this.state, this.progress)) {
            this.save({ ...this.progress, status: 'complete', collapsed: false });
            this.render();
            this.focusHeading();
            return;
        }
        // On touch screens the navigation link yields its space to the actual game panel.
        if (isMobileLayout()) this.save({ ...this.progress, collapsed: true });
        if (action === 'resident' && facts.person) this.hooks.resident(facts.person.id);
        if (action === 'worker' && facts.worker) this.hooks.resident(facts.worker.id);
        if (action === 'home' && facts.home) this.hooks.household(facts.home.id);
        if (action === 'next-home' && facts.temporaryHome) this.hooks.household(facts.temporaryHome.id);
        if (action === 'materials' || action === 'food') this.hooks.stocks(action);
        if (action === 'work' && facts.workPlan) this.hooks.work(facts.workPlan);
        if (action === 'expeditions') this.hooks.expeditions();
        this.render();
    };
    private focusHeading() {
        const heading = this.root.querySelector<HTMLElement>('h2');
        heading?.setAttribute('tabindex', '-1');
        heading?.focus({ preventScroll: true });
    }
    private render() {
        const progress = this.progress;
        const state = this.state;
        const facts = firstStepsFacts(state, progress, command => this.owner.availability(command));
        const step = firstStepsStep(progress);
        const goals = ['Meet someone', 'Understand work', 'Help a household', 'Watch consequences'];
        this.root.dataset.step = progress.status === 'active' ? String(step + 1) : progress.status;
        this.root.classList.toggle('first-steps-collapsed', progress.collapsed);
        let html: string;
        if (progress.status === 'offered') {
            html = `<h2 id="first-steps-title">Build a home for the next generation.</h2>
                <p>Your people live and work independently. Guide their community through housing, work, resources and expeditions.</p>
                <p>Residents act on their own. You assign work and housing; you direct expedition groups, not individual footsteps.</p>
                <p class="first-steps-muted">The game is paused while you choose. The founding story remains in the Clan Book.</p>
                <div class="first-steps-actions">${button('guide', 'Guide me')}${button('explore', 'Explore on my own')}</div>`;
        } else if (progress.collapsed) {
            html = button('expand', progress.status === 'active' ? `First steps · ${step + 1}/4 · ${goals[step]}` : 'First steps · Help',
                'aria-expanded="false" aria-controls="fjord-first-steps-card"');
        } else {
            const heading = progress.status === 'active' ? `${step + 1}/4 · ${goals[step]}` :
                progress.status === 'complete' ? 'What’s next?' : 'First steps are set aside';
            html = `<div class="first-steps-heading"><h2 id="first-steps-title">${esc(heading)}</h2>
                ${button('collapse', '−', 'aria-label="Collapse first steps" aria-expanded="true"')}</div>`;
            if (progress.status === 'active') {
                if (step === 0) html += `<p>Meet a real person: their face, work and household make up your clan.</p>
                    ${facts.person ? button('resident', `Meet ${facts.person.name}`) : '<p>No resident is currently available here. You can return later.</p>'}`;
                if (step === 1) html += `<p>Food sustains the clan; Materials pay for homes and upkeep. Workers produce over time, not when you click.</p>
                    <p>${state.stocks.food} Food · ${state.stocks.materials} Materials.</p>
                    ${facts.workPlan ? '<p>No Materials producer is currently working. Review a valid woodworker plan; applying it is your choice.</p>' :
                        facts.worker ? `<p>${esc(facts.worker.name)} is already a working ${esc(occupationLabel(facts.worker.occupation).toLowerCase())}. Keep a suitable assignment.</p>` : '<p>No worker is currently available. Inspect the existing work conditions.</p>'}
                    <div class="first-steps-actions">${button('materials', 'Inspect stocks')}
                        ${facts.workPlan ? button('work', 'Review Materials work') : facts.worker ? button('worker', 'Inspect a worker') : ''}</div>`;
                if (step === 2) html += `<p>A permanent home supports a household’s future. Housing and work are separate choices.</p>
                    <p>${facts.home ? esc(housingName(state, 'household', facts.home.id)) + ': ' : ''}
                    ${facts.buildingId ? 'already has a permanent home; inspect it without building another.' :
                        `${facts.cost} Materials upfront · ${facts.upkeep} Materials/year when occupied.`}</p>
                    ${!facts.buildingId && !facts.housing.allowed ? `<p>${facts.shortfall ? `You need ${facts.shortfall} more Materials. ` : ''}${esc(facts.housing.reason)}.
                        ${facts.workPlan ? 'Nobody is currently producing Materials. Review an eligible work plan before waiting.' : 'Inspect production and use Play to let real work progress.'}</p>` : ''}
                    <div class="first-steps-actions">${facts.home ? button('home', 'Inspect household') : ''}
                        ${!facts.buildingId && !facts.housing.allowed ? button('materials', 'See Materials workers') : ''}
                        ${facts.workPlan ? button('work', 'Review Materials work') : ''}</div>
                    ${progress.householdId === facts.home?.id && !facts.buildingId && !facts.housing.allowed && facts.worker && facts.work?.resource === 'materials' ?
                        button('watch', 'Keep working and save for a home') : ''}`;
                if (step === 3) {
                    const evidence = firstStepsEvidence(state, progress);
                    const witness = evidence?.personaId ? state.personas[evidence.personaId] ?? state.personaArchive?.[evidence.personaId] : undefined;
                    html += `<p>Use Play to let time pass, then pause and inspect what actually changed.</p>`;
                    if (evidence) html += `<p data-first-steps-evidence>${evidence.type === 'BuildingMaintained' ?
                        `${evidence.details!.units} Materials paid for this home’s upkeep.` :
                        `${esc(witness?.name ?? 'A resident')} produced ${evidence.details!.units} ${esc(evidence.details!.resource)}.`}
                        Recorded in year ${evidence.time.winter}.</p>${button('understood', 'I see the result')}`;
                    else html += `<p>Waiting for a real production or upkeep result. The clock is controlled by the existing Play / pause button.</p>`;
                    html += `<div class="first-steps-actions">${progress.watch?.kind === 'home' && facts.home ? button('home', 'Inspect the home') : button('materials', 'Inspect production')}</div>`;
                }
                html += `<div class="first-steps-footer">${button('skip', 'Skip for now')}<span>Help stays in the game menu.</span></div>`;
            } else if (progress.status === 'skipped') {
                html += `<p>Return when you want a hand. Your people and campaign have kept their actual progress.</p>
                    <div class="first-steps-actions">${button('resume', 'Resume first steps')}${button('replay', 'Replay first steps')}</div>`;
            } else {
                if (state.stocks.food === 0) html += `<p>No Food is currently stored. Inspect actual producers and work conditions.</p>${button('food', 'Show me')}`;
                else if (facts.temporaryHome) html += `<p>${esc(housingName(state, 'household', facts.temporaryHome.id))} still lives in a tent. Review its housing options when Materials allow.</p>${button('next-home', 'Show me')}`;
                else if (!facts.person) html += '<p>No new suggestion right now. Your history remains in the Clan Book.</p>';
                else html += `<p>Ready to explore? Open Expedition groups to review real members and provisions. Departure costs Food; journeys and missions carry risks.</p>${button('expeditions', 'Show me')}`;
                html += `<div class="first-steps-footer">${button('replay', 'Replay first steps')}${button('dismiss', 'Close help')}</div>`;
            }
        }
        const announcement = progress.status === 'active' ? `First steps ${step + 1} of 4: ${goals[step]}` :
            progress.status === 'offered' ? 'First steps are ready. The game is paused while you choose.' : headingForStatus(progress.status);
        html += `<span class="first-steps-screen-reader" role="status" data-view-key="first-steps-status">${esc(announcement)}</span>`;
        if (html !== this.html) { updateView(this.root, html); this.html = html; }
        this.root.hidden = !this.visible || this.waitingForStory;
    }
    dispose() {
        this.releaseStory?.();
        this.abort.abort();
        this.root.remove();
    }
}
