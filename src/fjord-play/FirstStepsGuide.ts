import type { SharedSettlement } from '../play/SharedSettlement';
import type { FoundingBookWindow } from '../lore/FoundingBookWindow';
import { updateView } from '../gameplay-lab/updateView';
import { isMobileLayout } from './MobileShell';
import { acknowledgeOrientation, inspectFirstSteps, newFirstSteps, replayOrientation, type FirstStepsInspection, type FirstStepsProgress } from './FirstStepsState';
import { chapterCopy, foundingJourney, FoundingJourneyIndex } from './FoundingJourney';
import type { JourneyGoal } from './FoundingJourney';
import { journeyChapters, journeyObjectives, orientationObjectives, newJourney, type JourneyChapter, type JourneyObjective, type OrientationObjective } from './JourneyProgress';
import type { WorkDraft } from './WorkPlan';
import { proposeWork, previewWork, workCandidates } from './WorkPlan';
import { FirstStepsTour, type BasicsCallout } from './FirstStepsTour';
import './first-steps.css';

type GuideEntityKind = NonNullable<SharedSettlement['selection']>['kind'];

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
    home?(): void;
    settlement?(): void;
    clock?(): void;
    menu?(): void;
    livestock?(id: string): void;
    ship?(id: string): void;
    improvements?(householdId: string): void;
    smithery?(householdId: string): void;
    wildlife?(eventId?: string): void;
    mission?(type: 'Recon' | 'Pillage', siteId?: string): void;
    report?(eventId: string): boolean;
}

const esc = (text: unknown) => String(text ?? '').replace(/[&<>"']/g,
    char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));
const button = (action: string, label: string, attributes = '') =>
    `<button type="button" data-guide="${action}" ${attributes.includes('data-view-key=') ? '' : `data-view-key="first-steps:${action}"`} ${attributes}>${esc(label)}</button>`;

/** Authored objectives reuse the optional #263 card. Navigation never issues a Core command. */
export class FirstStepsGuide {
    readonly root = document.createElement('section');
    private abort = new AbortController();
    private visible = false;
    private waitingForStory = false;
    private releaseStory?: () => void;
    private held = false;
    private revision = -1;
    private index = new FoundingJourneyIndex();
    private html = '';
    private touring = false;
    private tour: FirstStepsTour;
    private tourPhase: 'entry' | 'card' | 'close' | 'result' = 'entry';
    private tourEntityId?: string;
    private tourEntityKind?: GuideEntityKind;
    private tourSurface?: string;
    private tourFinished = false;
    private tourEpoch = -1;
    private tourGeneration = 0;
    private tourTimers = new Set<number>();
    private tourSuspended = false;

    constructor(private owner: SharedSettlement, private hooks: FirstStepsHooks) {
        this.root.id = 'fjord-first-steps-card';
        this.root.hidden = true;
        this.root.setAttribute('aria-label', 'The Founding Journey');
        this.root.addEventListener('click', this.click, { signal: this.abort.signal });
        this.root.addEventListener('keydown', event => {
            // Native buttons keep their activation and Tab behavior; world shortcuts do not see them.
            event.stopPropagation();
            if (event.key === 'Escape') {
                event.preventDefault();
                this.collapse();
            }
        }, { signal: this.abort.signal });
        for (const type of ['pointerdown', 'pointerup', 'wheel'])
            this.root.addEventListener(type, event => event.stopPropagation(), { signal: this.abort.signal });
        document.querySelector('#fjord-play')!.append(this.root);
        this.tour = new FirstStepsTour(document.querySelector<HTMLElement>('#fjord-play')!, this.tourAction, this.reanchorTour);
        document.addEventListener('click', this.observeTourControl, { capture: true, signal: this.abort.signal });
        document.addEventListener('keydown', this.observeTourControl, { capture: true, signal: this.abort.signal });
        document.querySelector('#fjord-first-steps')!.addEventListener('click', () => this.open(),
            { signal: this.abort.signal });
    }

    get blocksClock() { return this.held; }
    get isPresenting() { return !this.root.hidden || !this.tour.root.hidden; }
    private get obscured() {
        return this.waitingForStory || document.querySelector<HTMLElement>('#clan-book-reader')?.hidden === false;
    }
    private get state() { return this.owner.session.readSnapshot(); }
    private get progress() { return this.owner.fjord.firstSteps ?? newFirstSteps(); }
    private get journey() { return this.progress.journey ?? newJourney(); }

    private save(progress: FirstStepsProgress) {
        if (progress.journey?.chapter === 'orientation') {
            const before = this.owner.fjord.firstSteps?.journey?.orientation ?? [];
            const after = progress.journey.orientation ?? [];
            const selected = progress.journey.selected as OrientationObjective | null;
            const selectedCompleted = !!selected && after.includes(selected) && !before.includes(selected);
            const chapterCompleted = after.length === orientationObjectives.length && before.length < after.length;
            if (selectedCompleted || chapterCompleted)
                progress = { ...progress, journey: { ...progress.journey, selected: null } };
        }
        if (JSON.stringify(progress) === JSON.stringify(this.owner.fjord.firstSteps)) return false;
        this.owner.fjord.firstSteps = progress;
        this.hooks.persist();
        return true;
    }

    /** Only explicit new/restarted histories receive an automatic invitation. */
    newStart(story?: FoundingBookWindow) {
        this.restore();
        this.hooks.pause();
        this.save({ ...newFirstSteps(), journey: newJourney('orientation') });
        this.held = true;
        this.hooks.clockChanged();
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

    /** Continue/import/context recovery preserve saved progress without automatic guidance. */
    restore() {
        this.tourGeneration++;
        for (const timer of this.tourTimers) window.clearTimeout(timer);
        this.tourTimers.clear();
        this.releaseStory?.();
        this.releaseStory = undefined;
        this.held = false;
        this.hooks.clockChanged();
        this.waitingForStory = false;
        this.visible = false;
        this.tourFinished = false;
        this.tourSurface = undefined;
        this.tourPhase = 'entry';
        this.tourEntityId = undefined;
        this.tourEntityKind = undefined;
        this.touring = false;
        this.tour.hide();
        this.index = new FoundingJourneyIndex();
        this.revision = -1;
        this.root.hidden = true;
    }

    open() {
        this.tourGeneration++;
        this.touring = false;
        this.tour.hide();
        const menu = document.querySelector<HTMLDetailsElement>('#fjord-menu');
        if (menu) menu.open = false;
        if (this.waitingForStory) return;
        this.hooks.reveal();
        this.visible = true;
        this.save({ ...this.progress, journey: this.journey, collapsed: false });
        if (this.progress.status === 'offered') {
            this.hooks.pause();
            this.held = true;
            this.hooks.clockChanged();
        }
        this.render();
        if (!this.root.hidden)
            this.root.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
    }

    inspected(kind: FirstStepsInspection, id?: string) {
        if (!this.owner.fjord.firstSteps) return;
        const observed = inspectFirstSteps(this.progress, this.state, kind, id);
        const progress = this.visible && observed.status === 'active' && isMobileLayout() &&
            ['home', 'interface'].includes(kind) ? { ...observed, collapsed: true } : observed;
        const changed = this.save(progress);
        if (changed && this.visible) this.render();
    }

    update(suspended = false) {
        if (this.owner.session.revision !== this.revision) {
            this.revision = this.owner.session.revision;
            if (this.owner.fjord.firstSteps) this.index.update(this.state);
            if (this.visible) this.render();
        }
        this.root.hidden = !this.visible || this.obscured || suspended || this.touring;
        if (suspended !== this.tourSuspended) {
            this.tourSuspended = suspended;
            if (suspended) this.tour.hide();
            else if (this.touring) this.renderTour();
        }
    }

    private collapse() {
        if (this.progress.status === 'offered') { this.choose('dismiss'); return; }
        this.save({ ...this.progress, collapsed: true });
        this.render();
        this.root.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
    }

    private choose(mode: 'guided' | 'explore' | 'dismiss') {
        const guided = mode === 'guided';
        this.held = false;
        this.hooks.clockChanged();
        this.save({ ...this.progress, journey: this.journey,
            status: guided ? 'active' : 'skipped', collapsed: false });
        this.visible = guided;
        this.tourEpoch = this.owner.session.personalHistoryEpoch;
        this.tourGeneration++;
        this.touring = guided && this.journey.chapter === 'orientation';
        if (this.touring) this.save({ ...this.progress, collapsed: true, journey: { ...this.journey,
            tour: { step: 'ui-camera', dismissed: false } } });
        this.hooks.pause();
        this.render();
        if (this.touring) this.tour.focus();
        else if (guided) this.focusHeading();
        else document.querySelector<HTMLElement>('#fjord-run')?.focus({ preventScroll: true });
    }

    private projection() {
        this.index.update(this.state);
        return foundingJourney(this.state, this.progress, this.index,
            command => this.owner.availability(command), this.owner.session,
            typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches ? 'touch' : 'mouse');
    }

    private recommended(goals: JourneyGoal[]) {
        const selected = goals.find(goal => goal.id === this.journey.selected && goal.chapter === this.journey.chapter);
        const chapter = goals.filter(goal => goal.chapter === this.journey.chapter);
        return selected ?? chapter.find(goal => goal.status === 'available') ??
            chapter.find(goal => goal.status === 'blocked') ??
            chapter.find(goal => goal.status !== 'completed') ?? chapter[0];
    }

    private click = (event: MouseEvent) => {
        const target = (event.target as Element).closest<HTMLElement>('[data-guide]');
        const action = target?.dataset.guide;
        if (!action) return;
        if (action === 'guide' || action === 'explore') { this.choose(action === 'guide' ? 'guided' : 'explore'); return; }
        if (action === 'expand') { this.open(); return; }
        if (action === 'collapse') { this.collapse(); return; }
        if (action === 'skip' || action === 'dismiss') {
            if (this.progress.status === 'active') this.save({ ...this.progress, status: 'skipped' });
            this.visible = false;
            this.root.hidden = true;
            document.querySelector<HTMLElement>(isMobileLayout() ? '#fjord-mobile-menu' : '#fjord-first-steps')
                ?.focus({ preventScroll: true });
            return;
        }
        if (action === 'replay-basics' || action === 'resume-tour') {
            if (action === 'replay-basics') this.save(replayOrientation(this.progress));
            this.hooks.reveal();
            this.visible = true;
            this.touring = true;
            this.tourEpoch = this.owner.session.personalHistoryEpoch;
            this.tourGeneration++;
            this.tourPhase = 'entry';
            this.tourEntityId = undefined;
            this.tourEntityKind = undefined;
            this.tourSurface = undefined;
            this.tourFinished = false;
            const step = this.journey.tour?.step ?? orientationObjectives.find(id => !this.journey.orientation?.includes(id)) ?? 'ui-camera';
            this.save({ ...this.progress, status: 'active', collapsed: true, journey: { ...this.journey,
                chapter: 'orientation', tour: { step, dismissed: false } } });
            this.render();
            this.tour.focus();
            return;
        }
        if (action === 'replay' || action === 'resume') {
            this.hooks.pause();
            const progress = action === 'replay' ? newFirstSteps() : this.progress;
            this.save({ ...progress, journey: action === 'replay' ? newJourney('orientation') : this.journey,
                status: 'active', collapsed: false });
            this.render();
            this.focusHeading();
            return;
        }
        if (action === 'chapter' && journeyChapters.includes(target!.dataset.chapter as JourneyChapter)) {
            this.save({ ...this.progress, journey: { ...this.journey,
                chapter: target!.dataset.chapter as JourneyChapter, selected: null } });
            this.render();
            return;
        }
        if (action === 'objective' && journeyObjectives.includes(target!.dataset.objective as JourneyObjective)) {
            this.save({ ...this.progress, journey: { ...this.journey, selected: target!.dataset.objective as JourneyObjective } });
            this.render();
            return;
        }
        const view = this.projection(), goal = this.recommended(view.goals);
        if (action === 'continue-home') {
            const basics = view.goals.filter(item => item.chapter === 'orientation');
            if (this.journey.chapter === 'orientation' && basics.every(item => item.status === 'completed')) {
                this.save({ ...this.progress, journey: { ...this.journey, chapter: 'home', selected: null } });
                this.render();
                this.focusHeading();
            }
            return;
        }
        if (action === 'acknowledge') {
            this.save(acknowledgeOrientation(this.progress, goal.id as OrientationObjective));
            this.render();
            this.focusHeading();
            return;
        }
        if (action === 'later' || action === 'skip-objective' || action === 'try-again') {
            const skipped = this.journey.skipped.filter(id => id !== goal.id);
            const later = this.journey.later.filter(id => id !== goal.id);
            if (action === 'later') later.push(goal.id);
            if (action === 'skip-objective') skipped.push(goal.id);
            this.save({ ...this.progress, journey: { ...this.journey, selected: action === 'try-again' ? goal.id : null,
                skipped, later } });
            this.render();
            return;
        }
        if (action === 'keep-ship' && view.retained) {
            this.save({ ...this.progress, journey: { ...this.journey, keptShipId: view.retained.id } });
            this.render();
            return;
        }
        if (action !== 'show') return;
        if (isMobileLayout()) this.save({ ...this.progress, collapsed: true });
        const nextAction = goal.checklist.find(check => !check.done)?.action ?? goal.action;
        switch (nextAction) {
            case 'resident': {
                const person = goal.id === 'understand-work' ? view.facts.worker : view.person;
                if (person) this.hooks.resident(person.id);
                else if (goal.chapter === 'orientation') this.hooks.settlement?.();
                break;
            }
            case 'household': {
                const home = goal.id === 'meet-people' ? view.familyHome : view.home;
                if (home) this.hooks.household(home.id);
                break;
            }
            case 'livestock': {
                const animal = goal.id === 'ui-connections' ? view.orientationLivestock : view.livestock;
                if (animal) this.hooks.livestock?.(animal.id);
                break;
            }
            case 'settlement':
                if (goal.id === 'ui-camera') this.hooks.home?.();
                else this.hooks.settlement?.();
                break;
            case 'clock': this.hooks.clock?.(); break;
            case 'menu': this.hooks.menu?.(); break;
            case 'materials': this.hooks.stocks('materials'); break;
            case 'work': if (view.facts.workPlan) this.hooks.work(view.facts.workPlan); break;
            case 'improvements': if (view.home) this.hooks.improvements?.(view.home.id); break;
            case 'ship':
                if (view.retained) this.hooks.ship?.(view.retained.id);
                else this.hooks.expeditions();
                break;
            case 'expeditions': this.hooks.expeditions(); break;
            case 'wildlife': this.hooks.wildlife?.(view.species[0]?.[1]); break;
            case 'smithery': this.showSmithery(view.smith?.id); break;
            case 'recon': case 'pillage':
                this.hooks.mission?.(nextAction === 'recon' ? 'Recon' : 'Pillage', view.knownSite?.id);
                break;
            case 'report':
                if (view.result && this.hooks.report) {
                    if (this.hooks.report(view.result.id))
                        this.save({ ...this.progress, journey: { ...this.journey, resultEventId: view.result.id } });
                }
                break;
        }
        this.render();
    };

    private showSmithery(smithId?: string) {
        const state = this.state;
        const home = Object.values(state.households).find(home => home.memberIds.includes(smithId ?? ''));
        if (home) { this.hooks.smithery?.(home.id); return; }
        for (const candidate of Object.values(state.households)) {
            if (!workCandidates(state, candidate.id, 'smith').length) continue;
            const draft = { ...proposeWork(state, candidate.id, 'smith'), buildHouse: false, specialize: false };
            try {
                if (!previewWork(state, draft).commands.length) continue;
                this.hooks.work(draft);
                return;
            } catch { /* Continue to the next currently eligible real household. */ }
        }
        this.hooks.expeditions();
    }

    private focusHeading() {
        this.root.scrollTop = 0;
        const heading = this.root.querySelector<HTMLElement>('h2');
        heading?.setAttribute('tabindex', '-1');
        heading?.focus({ preventScroll: true });
    }

    private render() {
        const progress = this.progress;
        const view = this.projection();
        const chapter = this.journey.chapter, copy = chapterCopy[chapter];
        const goal = this.recommended(view.goals);
        const chapterGoals = view.goals.filter(goal => goal.chapter === chapter);
        const done = chapterGoals.filter(goal => goal.status === 'completed').length;
        const previousObjective = this.root.dataset.objective;
        const orientationComplete = chapter === 'orientation' && done === chapterGoals.length && !this.journey.selected;
        this.root.dataset.chapter = chapter;
        this.root.dataset.objective = goal.id;
        this.root.classList.toggle('first-steps-collapsed', progress.collapsed);
        let html: string;
        if (progress.status === 'offered') {
            html = `<h2 id="first-steps-title">The Founding Journey</h2>
                <p>Build a home for the next generation. Help an autonomous community, explore the island and choose how to face conflict.</p>
                <p class="first-steps-muted">Four optional chapters, starting with the interface basics. You can visit any chapter, return later or play freely.
                Both choices keep the clock paused. Press Play when you are ready.</p>
                <div class="first-steps-actions">${button('guide', 'Guide me')}${button('explore', 'Explore on my own')}</div>`;
        } else if (progress.collapsed) {
            html = button('expand', `Founding Journey · ${done}/${chapterGoals.length} · ${goal.title}`,
                'aria-expanded="false" aria-controls="fjord-first-steps-card"');
        } else {
            html = `<div class="first-steps-heading"><h2 id="first-steps-title">The Founding Journey</h2>
                ${button('collapse', '−', 'aria-label="Collapse Founding Journey" aria-expanded="true"')}</div>`;
            if (progress.status !== 'active') {
                html += `<p>Your campaign and its real discoveries are kept. Resume whenever you want a hand.</p>
                    <div class="first-steps-actions">${button('resume', 'Resume journey')}${button('replay', 'Replay guidance')}</div>`;
            } else {
                html += `<nav class="first-steps-chapters" aria-label="Journey chapters">${journeyChapters.map(id =>
                    button('chapter', ({ orientation: '0 · Basics', home: 'I · Home', discovery: 'II · Discovery', conflict: 'III · Conflict' })[id],
                        `data-view-key="chapter:${id}" data-chapter="${id}" aria-pressed="${id === chapter}"`)).join('')}</nav>
                    <p class="first-steps-muted">${esc(copy.title)} · ${done}/${chapterGoals.length} completed</p>
                    ${chapter === 'orientation' ? `<div class="first-steps-actions">${button('resume-tour', 'Resume tour')}${button('replay-basics', 'Replay basics')}</div>` : `<p>${esc(copy.why)}</p>`}`;
                if (orientationComplete) {
                    html += `<article aria-label="Basics complete" data-journey-status="completed">
                        <h3>Basics complete</h3>
                        <p>You can look around, inspect your people and choose when time passes.</p>
                        <p class="first-steps-muted">Continue when you are ready, or keep exploring. Every chapter stays open.</p>
                        <div class="first-steps-actions">${button('continue-home', 'Continue to Chapter I — A Home for Your People')}</div>
                    </article>`;
                } else {
                    html += `<article aria-label="Recommended objective" data-journey-status="${goal.status}">
                        <h3>${esc(goal.title)}${goal.optional ? ' · Optional' : ''}</h3>
                        <span class="first-steps-status">${goal.status === 'blocked' ? 'Blocked right now' : esc(goal.status)}</span>
                        <p>${esc(goal.why)}</p>
                        ${goal.chapter !== 'orientation' && goal.checklist.length ? `<ul class="first-steps-checklist" aria-label="Objective checklist">
                            ${goal.checklist.map(check => `<li data-view-key="check:${goal.id}:${check.id}" data-journey-check="${check.id}">
                                <span class="first-steps-check" role="checkbox" aria-checked="${check.done}" aria-readonly="true"
                                    aria-labelledby="journey-check-${goal.id}-${check.id}"><span aria-hidden="true">${check.done ? '✓' : ''}</span></span>
                                <span id="journey-check-${goal.id}-${check.id}">${esc(check.label)}</span>
                            </li>`).join('')}
                        </ul>` : ''}
                        ${goal.detail ? `<p class="first-steps-muted">${esc(goal.detail)}</p>` : ''}
                        <div class="first-steps-actions">${button('show', 'Show me')}
                        ${goal.chapter === 'orientation' && ['ui-camera', 'ui-time', 'ui-navigation'].includes(goal.id) &&
                            goal.status !== 'completed' ? button('acknowledge', 'Got it') : ''}
                        ${goal.id === 'longship-choice' && view.retained && !view.retained.transport?.groupId ?
                            button('keep-ship', 'Keep for now') : ''}</div>
                        <div class="first-steps-actions">${goal.status === 'completed' ? '' :
                            goal.status === 'later' || goal.status === 'skipped' ? button('try-again', 'Consider again') :
                            button('later', 'Return later') + button('skip-objective', 'Skip objective')}</div>
                    </article>`;
                }
                html += `<details class="first-steps-objectives" data-view-key="journey-objectives"><summary>Chapter objectives</summary>
                        ${chapter === 'orientation' ? `<p class="first-steps-muted">${esc(copy.why)}</p>` : ''}
                        ${chapterGoals.map(item => button('objective', `${item.title} · ${item.status}`,
                            `data-view-key="objective:${item.id}" data-objective="${item.id}" aria-pressed="${item.id === goal.id}"`)).join('')}
                    </details>
                    <p class="first-steps-muted">Every chapter is open. Longer discoveries, upgrades and conflict never block free play.</p>
                    <div class="first-steps-footer">${button('skip', 'Close journey')}<span>Open Need help? in the navigation menu to return.</span></div>`;
            }
        }
        const announcement = orientationComplete ? 'Basics complete. Continue to Chapter I whenever you choose. Time stays under your control.' :
            progress.status === 'active' ?
            `${copy.title}, ${done} of ${chapterGoals.length} completed. ${goal.title}: ${goal.status}.${goal.checklist.length ?
                ` ${goal.checklist.filter(check => check.done).length} of ${goal.checklist.length} steps completed.` : ''}` :
            progress.status === 'offered' ? 'Choose Guide me or Explore on my own. The clock stays paused until you press Play.' : 'The Founding Journey is set aside.';
        html += `<span class="first-steps-screen-reader" role="status" data-view-key="first-steps-status">${esc(announcement)}</span>`;
        if (html !== this.html) { updateView(this.root, html); this.html = html; }
        if (chapter === 'orientation' && previousObjective !== goal.id) this.root.scrollTop = 0;
        this.root.hidden = !this.visible || this.obscured || this.touring;
        if (this.touring) this.renderTour(view);
        else this.tour.hide();
    }

    /** Observe accepted native controls after their owners and default actions finish. */
    private observeTourControl = (event: Event) => {
        if (!this.touring || this.tourSuspended) return;
        const target = event.target instanceof Element ? event.target : null;
        if (!target || target.closest('[data-basics]')) return;
        const escape = event.type === 'keydown' && (event as KeyboardEvent).key === 'Escape';
        if (event.type === 'keydown' && !escape) return;
        let surface: string | undefined;
        if (target.closest('#fjord-menu > summary, #fjord-menu [data-menu-close]') ||
            escape && target.closest('#fjord-menu')) surface = 'menu';
        else if (target.closest('#fjord-map-toggle, [data-map-close]') ||
            escape && target.closest('#fjord-island-map')) surface = 'map';
        else if (target.closest('#fjord-book, #clan-book-close') ||
            escape && target.closest('#clan-book-reader')) surface = 'book';
        else if (target.closest('#fjord-attention, [data-ui="close-workspace"]') ||
            escape && target.closest('#fjord-workspace')) surface = 'activity';
        if (!surface) return;
        const generation = this.tourGeneration, epoch = this.owner.session.personalHistoryEpoch;
        const timer = window.setTimeout(() => {
            this.tourTimers.delete(timer);
            const canvas = document.querySelector<HTMLElement>('#fjord-canvas');
            if (!this.touring || this.abort.signal.aborted || this.tourSuspended ||
                generation !== this.tourGeneration || epoch !== this.owner.session.personalHistoryEpoch ||
                canvas && canvas.dataset.ready !== 'true') return;
            if (this.surfaceOpen(surface)) {
                if (surface === 'map') this.navigated('home', 'map');
                else this.navigated('interface-open', surface);
            } else this.navigated('surface-closed', surface);
            this.renderTour();
        }, 0);
        this.tourTimers.add(timer);
    };

    /** Accepted user actions; merely rendering a card never performs an exercise. */
    navigated(kind: 'camera' | 'resident' | 'connection' | 'closed' | 'home' | 'time' | 'interface-open' | 'surface-closed', id?: string, entityKind?: GuideEntityKind) {
        if (!this.touring || this.tourSuspended || this.progress.status !== 'active' ||
            this.tourEpoch !== this.owner.session.personalHistoryEpoch) return;
        const step = this.journey.tour?.step ?? 'ui-camera';
        if (kind === 'camera' && step === 'ui-camera') {
            this.save(acknowledgeOrientation(this.progress, 'ui-camera'));
            this.tourStep('ui-resident');
        } else if (kind === 'resident' && ['ui-resident', 'ui-connections'].includes(step) && id &&
            this.owner.selection?.kind === 'persona' && this.owner.selection.id === id &&
            document.querySelector('#entity-panel .fjord-relations')) {
            this.tourEntityId = id;
            this.tourEntityKind = 'persona';
            this.tourPhase = 'card';
            this.render();
        } else if (kind === 'closed' && step === 'ui-resident' && id === this.tourEntityId &&
            entityKind === this.tourEntityKind &&
            this.journey.orientation?.includes('ui-resident')) {
            this.tourStep('ui-connections');
        } else if (kind === 'connection' && step === 'ui-connections' && id &&
            this.owner.selection?.id === id && this.journey.orientation?.includes('ui-connections')) {
            this.tourEntityId = id;
            this.tourEntityKind = this.owner.selection.kind;
            this.tourPhase = 'result';
            this.render();
        } else if (kind === 'closed' && step === 'ui-connections' &&
            this.tourPhase === 'result' && id === this.tourEntityId && entityKind === this.tourEntityKind) {
            this.tourStep('ui-home');
        } else if (kind === 'home' && step === 'ui-home') {
            if (id === 'map' && document.querySelector<HTMLDialogElement>('#fjord-island-map')?.open) {
                this.inspected('home');
                this.tourSurface = 'map';
                this.tourPhase = 'result';
                this.render();
            } else if (id === 'focus') {
                this.inspected('home');
                this.tourStep('ui-time');
            }
        } else if (kind === 'time' && step === 'ui-time') {
            this.inspected('time');
            this.tourStep('ui-navigation');
        } else if (kind === 'interface-open' && step === 'ui-navigation' && id && this.surfaceOpen(id)) {
            this.inspected('interface');
            this.tourSurface = id;
            this.tourPhase = 'result';
            this.render();
        } else if (kind === 'surface-closed' && id === this.tourSurface && !this.surfaceOpen(id)) {
            if (step === 'ui-home' && id === 'map') this.tourStep('ui-time');
            else if (step === 'ui-navigation') { this.tourFinished = true; this.render(); }
        }
    }

    private surfaceOpen(id?: string) {
        if (id === 'map') return !!document.querySelector<HTMLDialogElement>('#fjord-island-map')?.open;
        if (id === 'menu') return !!document.querySelector<HTMLDetailsElement>('#fjord-menu')?.open;
        if (id === 'book') return document.querySelector<HTMLElement>('#clan-book-reader')?.hidden === false;
        const workspace = document.querySelector<HTMLElement>('#fjord-workspace');
        return id === 'activity' && workspace?.hidden === false && workspace.dataset.surface === 'attention';
    }

    private tourStep(step: OrientationObjective) {
        this.tourFinished = false;
        this.tourSurface = undefined;
        this.tourPhase = 'entry';
        this.tourEntityId = undefined;
        this.tourEntityKind = undefined;
        this.save({ ...this.progress, journey: { ...this.journey, tour: { step, dismissed: false } } });
        this.render();
    }

    private reanchorTour = () => {
        if (!this.touring || this.tourSuspended) return;
        if (this.tourEpoch !== this.owner.session.personalHistoryEpoch) {
            this.touring = false;
            this.tour.hide();
            return;
        }
        const management = document.querySelector<HTMLElement>('#fjord-management');
        const selectedPersonLost = this.tourEntityKind === 'persona' && this.tourEntityId &&
            this.projection().person?.id !== this.tourEntityId;
        const cardLost = this.tourEntityId && (this.owner.selection?.id !== this.tourEntityId ||
            this.owner.selection?.kind !== this.tourEntityKind ||
            management?.hidden || selectedPersonLost);
        if (cardLost || this.tourSurface && !this.surfaceOpen(this.tourSurface)) this.tourPhase = 'entry';
        // Keep earned facts and action identity; disappearing UI is not a completed exercise.
        this.renderTour();
    };

    private residentEntry(view = this.projection()) {
        const workspace = document.querySelector<HTMLElement>('#fjord-workspace');
        if (workspace && !workspace.hidden && workspace.dataset.surface === 'settlement') {
            const id = view.person?.id;
            const row = Array.from(workspace.querySelectorAll<HTMLElement>('.fjord-directory-list [data-kind="persona"]'))
                .find(button => button.dataset.id === id);
            return row ?? workspace.querySelector<HTMLElement>('[data-ui="directory"][data-kind="persona"]');
        }
        return document.querySelector<HTMLElement>('[data-stock="settlement"]');
    }

    private livestockEntry(view = this.projection()) {
        const workspace = document.querySelector<HTMLElement>('#fjord-workspace');
        if (workspace && !workspace.hidden && workspace.dataset.surface === 'settlement') {
            const row = Array.from(workspace.querySelectorAll<HTMLElement>('.fjord-directory-list [data-kind="cattle"]'))
                .find(button => button.dataset.id === view.orientationLivestock?.id);
            return row ?? workspace.querySelector<HTMLElement>('[data-ui="directory"][data-kind="cattle"]');
        }
        return document.querySelector<HTMLElement>('[data-stock="livestock"]');
    }

    private renderTour(view = this.projection()) {
        if (!this.touring || this.tourSuspended) return;
        const step = this.journey.tour?.step ?? 'ui-camera';
        const card = this.tourPhase === 'card';
        const close = this.tourPhase === 'close';
        const person = this.tourEntityId ? this.state.personas[this.tourEntityId] : undefined;
        const model: BasicsCallout = {
            step, phase: this.tourPhase, title: 'Select a resident',
            text: 'Open Residents, then choose a real person from the list.',
            done: this.journey.orientation?.length ?? 0, anchor: this.residentEntry(view),
            back: step !== 'ui-camera',
            fallbackAnchor: document.querySelector<HTMLElement>('[data-stock="settlement"]'),
        };
        const select = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector);
        if (step === 'ui-camera') {
            model.title = 'Drag to look around';
            model.text = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches ?
                'Drag to orbit · Pinch to zoom. Looking around does not order your residents.' :
                'Left-drag to pan · Right-drag to rotate · Wheel to zoom.';
            model.anchor = select('#fjord-canvas');
            model.next = 'Got it';
        } else if (step === 'ui-resident' && !view.person) {
            model.title = 'No local resident is available';
            model.text = 'Residents may be away or unavailable. Open Journey to choose another chapter, or return later.';
        } else if (step === 'ui-resident' && (card || close)) {
            model.title = card ? 'This is ' + (person?.name ?? 'a real resident') : 'Close the Character Card';
            model.text = card ? (select('#entity-panel .fjord-card-heading p')?.textContent?.trim() ??
                'The card shows their occupation and current context.') + ' Choose Next to find Close.' :
                'Use this close control to return to the world.';
            model.anchor = close ? select('#entity-panel [data-ui="close-card"]') :
                select('#entity-panel .fjord-card-heading h2');
            if (card) model.next = 'Next';
        } else if (step === 'ui-connections') {
            if (this.tourPhase === 'result') {
                model.title = 'You followed a real connection';
                model.text = 'This view belongs to the same community. Close it to return to the world.';
                model.anchor = select('#entity-panel [data-ui="close-card"]');
            } else if (card && select('#entity-panel .fjord-relations [data-kind="household"]')) {
                model.title = 'Follow the household link';
                model.text = 'A household is the group this person lives with. Choose its link; scroll this card if needed.';
                model.fallbackAnchor = select('#entity-panel .fjord-card-heading h2');
                model.anchor = select('#entity-panel .fjord-relations [data-kind="household"]');
            } else if (!view.person && !view.orientationLivestock) {
                model.title = 'No local connection is available';
                model.text = 'No available resident or living animal can be inspected now. Open Journey to choose another chapter, or return later.';
                model.anchor = select('[data-stock="settlement"]');
            } else if (!view.person) {
                model.title = 'Meet an animal in the settlement';
                model.text = 'Open Livestock and choose a living animal. You can follow real records without a permanent house.';
                model.anchor = this.livestockEntry(view);
            } else {
                model.title = 'Discover a connection';
                model.text = 'Open Residents again, choose a person and follow their Household link.';
            }
        } else if (step === 'ui-home') {
            model.title = 'Find your way home';
            model.text = 'Open Map to see explored ground, or use View settlement. These controls never order an expedition.';
            if (this.tourPhase === 'result') {
                model.title = 'Return from the map';
                model.text = 'Dark ground remains unexplored. Close the map to return to the world.';
                model.anchor = select('#fjord-island-map [data-map-close]');
            } else model.anchor = select('#fjord-map-toggle') ?? select('[data-stock="settlement"]');
        } else if (step === 'ui-time') {
            model.title = 'You control time';
            model.text = 'Play advances the community; Pause stops it. Pacing changes year length. Choose Got it to keep time as it is.';
            model.anchor = select('#fjord-run');
            model.next = 'Got it';
        } else if (step === 'ui-navigation') {
            if (this.tourFinished) {
                model.title = 'Basics complete';
                model.text = 'You can look around, inspect people and control time. Continue when you choose.';
                model.anchor = select('[data-stock="settlement"]');
                model.next = 'Continue to Chapter I';
                model.complete = true;
            } else if (this.tourPhase === 'result') {
                model.title = 'Find help, then return';
                model.text = this.tourSurface === 'menu' ?
                    'The Game menu holds settings and Help. Close it to return; Activity Center and Clan Book stay in navigation.' :
                    'This existing panel keeps its own records and controls. Close it to return to the world.';
                model.anchor = this.tourSurface === 'book' ? select('#clan-book-close') :
                    this.tourSurface === 'activity' ? select('#fjord-workspace [data-ui="close-workspace"]') :
                    select('#fjord-menu [data-menu-close]');
            } else {
                model.title = 'Open the Game menu';
                model.text = 'Find settings and Help here. Activity Center and Clan Book have their own entries; you need not open them all.';
                model.anchor = select('#fjord-menu > summary');
            }
        }
        this.tour.show(model);
    }

    private tourAction = (action: string) => {
        if (action === 'browse') { this.open(); return; }
        if (action === 'show') {
            this.tour.anchorElement?.scrollIntoView?.({ block: 'nearest', inline: 'nearest', behavior: 'auto' });
            if (!this.tour.focusTarget()) this.tour.focus();
            return;
        }
        if (action === 'back') {
            const index = orientationObjectives.indexOf(this.journey.tour?.step ?? 'ui-camera');
            this.tourStep(orientationObjectives[Math.max(0, index - 1)]);
            this.tour.focus();
            return;
        }
        if (action === 'next') {
            if (this.tourFinished && orientationObjectives.every(id => this.journey.orientation?.includes(id))) {
                this.touring = false;
                this.save({ ...this.progress, collapsed: false, journey: { ...this.journey,
                    chapter: 'home', selected: null, tour: { step: 'ui-navigation', dismissed: true } } });
                this.render();
                this.focusHeading();
            } else if (this.journey.tour?.step === 'ui-time') {
                this.save(acknowledgeOrientation(this.progress, 'ui-time'));
                this.tourStep('ui-navigation');
            } else if (this.journey.tour?.step === 'ui-camera') this.navigated('camera');
            else if (this.tourPhase === 'card') { this.tourPhase = 'close'; this.render(); }
            return;
        }
        if (action === 'skip') {
            const restoredFocus = this.tour.focusTarget();
            this.tourGeneration++;
            this.touring = false;
            this.save({ ...this.progress, collapsed: true, journey: { ...this.journey,
                tour: { step: this.journey.tour?.step ?? 'ui-camera', dismissed: true } } });
            this.render();
            if (!restoredFocus) this.root.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
        }
    };

    dispose() {
        for (const timer of this.tourTimers) window.clearTimeout(timer);
        this.tourTimers.clear();
        this.releaseStory?.();
        this.abort.abort();
        this.tour.dispose();
        this.root.remove();
    }
}
