import type { SharedSettlement } from '../play/SharedSettlement';
import type { FoundingBookWindow } from '../lore/FoundingBookWindow';
import { updateView } from '../gameplay-lab/updateView';
import { isMobileLayout } from './MobileShell';
import { inspectFirstSteps, newFirstSteps, type FirstStepsInspection, type FirstStepsProgress } from './FirstStepsState';
import { chapterCopy, foundingJourney, FoundingJourneyIndex } from './FoundingJourney';
import type { JourneyGoal } from './FoundingJourney';
import { journeyChapters, journeyObjectives, newJourney, type JourneyChapter, type JourneyObjective } from './JourneyProgress';
import type { WorkDraft } from './WorkPlan';
import { proposeWork, previewWork, workCandidates } from './WorkPlan';
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

    constructor(private owner: SharedSettlement, private hooks: FirstStepsHooks) {
        this.root.id = 'fjord-first-steps-card';
        this.root.hidden = true;
        this.root.setAttribute('aria-label', 'The Founding Journey');
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
    private get obscured() {
        return this.waitingForStory || document.querySelector<HTMLElement>('#clan-book-reader')?.hidden === false;
    }
    private get state() { return this.owner.session.readSnapshot(); }
    private get progress() { return this.owner.fjord.firstSteps ?? newFirstSteps(); }
    private get journey() { return this.progress.journey ?? newJourney(); }

    private save(progress: FirstStepsProgress) {
        if (JSON.stringify(progress) === JSON.stringify(this.owner.fjord.firstSteps)) return false;
        this.owner.fjord.firstSteps = progress;
        this.hooks.persist();
        return true;
    }

    /** Only explicit new/restarted histories receive an automatic invitation. */
    newStart(story?: FoundingBookWindow) {
        this.restore();
        this.hooks.pause();
        this.save({ ...newFirstSteps(), journey: newJourney() });
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
        this.releaseStory?.();
        this.releaseStory = undefined;
        this.held = false;
        this.hooks.clockChanged();
        this.waitingForStory = false;
        this.visible = false;
        this.index = new FoundingJourneyIndex();
        this.revision = -1;
        this.root.hidden = true;
    }

    open() {
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
        const changed = this.save(inspectFirstSteps(this.progress, this.state, kind, id));
        if (changed && this.visible) this.render();
    }

    update(suspended = false) {
        if (this.owner.session.revision !== this.revision) {
            this.revision = this.owner.session.revision;
            if (this.owner.fjord.firstSteps) this.index.update(this.state);
            if (this.visible) this.render();
        }
        this.root.hidden = !this.visible || this.obscured || suspended;
    }

    private collapse() {
        if (this.progress.status === 'offered') { this.choose(false); return; }
        this.save({ ...this.progress, collapsed: true });
        this.render();
        this.root.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
    }

    private choose(guided: boolean) {
        this.held = false;
        this.hooks.clockChanged();
        this.save({ ...this.progress, journey: this.journey,
            status: guided ? 'active' : 'skipped', collapsed: false });
        this.visible = guided;
        // Both choices remain paused. Only the existing Play button can start time.
        this.hooks.pause();
        this.render();
        if (guided) this.focusHeading();
        else document.querySelector<HTMLElement>('#fjord-run')?.focus({ preventScroll: true });
    }

    private projection() {
        this.index.update(this.state);
        return foundingJourney(this.state, this.progress, this.index,
            command => this.owner.availability(command), this.owner.session);
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
            const progress = action === 'replay' ? newFirstSteps() : this.progress;
            this.save({ ...progress, journey: action === 'replay' ? newJourney() : this.journey,
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
        switch (goal.action) {
            case 'resident': {
                const person = goal.id === 'understand-work' ? view.facts.worker : view.person;
                if (person) this.hooks.resident(person.id);
                break;
            }
            case 'household': {
                const home = goal.id === 'meet-people' ? view.familyHome : view.home;
                if (home) this.hooks.household(home.id);
                break;
            }
            case 'livestock': if (view.livestock) this.hooks.livestock?.(view.livestock.id); break;
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
                this.hooks.mission?.(goal.action === 'recon' ? 'Recon' : 'Pillage', view.knownSite?.id);
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
        this.root.dataset.chapter = chapter;
        this.root.dataset.objective = goal.id;
        this.root.classList.toggle('first-steps-collapsed', progress.collapsed);
        let html: string;
        if (progress.status === 'offered') {
            html = `<h2 id="first-steps-title">The Founding Journey</h2>
                <p>Build a home for the next generation. Help an autonomous community, explore the island and choose how to face conflict.</p>
                <p class="first-steps-muted">Three optional chapters. You can visit any chapter, return later or play freely.
                The campaign stays paused until you press Play.</p>
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
                html += `<nav class="first-steps-chapters" aria-label="Journey chapters">${journeyChapters.map((id, i) =>
                    button('chapter', ['Home', 'Discovery', 'Conflict'][i],
                        `data-view-key="chapter:${id}" data-chapter="${id}" aria-pressed="${id === chapter}"`)).join('')}</nav>
                    <p class="first-steps-muted">${esc(copy.title)} · ${done}/${chapterGoals.length} completed</p>
                    <p>${esc(copy.why)}</p>
                    <article aria-label="Recommended objective" data-journey-status="${goal.status}">
                        <h3>${esc(goal.title)}${goal.optional ? ' · Optional' : ''}</h3>
                        <span class="first-steps-status">${goal.status === 'blocked' ? 'Blocked right now' : esc(goal.status)}</span>
                        <p>${esc(goal.why)}</p><p class="first-steps-muted">${esc(goal.detail)}</p>
                        <div class="first-steps-actions">${button('show', 'Show me')}
                        ${goal.id === 'longship-choice' && view.retained && !view.retained.transport?.groupId ?
                            button('keep-ship', 'Keep for now') : ''}</div>
                        <div class="first-steps-actions">${goal.status === 'completed' ? '' :
                            goal.status === 'later' || goal.status === 'skipped' ? button('try-again', 'Consider again') :
                            button('later', 'Return later') + button('skip-objective', 'Skip objective')}</div>
                    </article>
                    <details class="first-steps-objectives" data-view-key="journey-objectives"><summary>Chapter objectives</summary>
                        ${chapterGoals.map(item => button('objective', `${item.title} · ${item.status}`,
                            `data-view-key="objective:${item.id}" data-objective="${item.id}" aria-pressed="${item.id === goal.id}"`)).join('')}
                    </details>
                    <p class="first-steps-muted">Every chapter is open. Longer discoveries, upgrades and conflict never block free play.</p>
                    <div class="first-steps-footer">${button('skip', 'Close journey')}<span>Journey / Help stays in the game menu.</span></div>`;
            }
        }
        const announcement = progress.status === 'active' ?
            `${copy.title}, ${done} of ${chapterGoals.length} completed. ${goal.title}: ${goal.status}.` :
            progress.status === 'offered' ? 'The Founding Journey is ready. Press Play when you want time to pass.' : 'The Founding Journey is set aside.';
        html += `<span class="first-steps-screen-reader" role="status" data-view-key="first-steps-status">${esc(announcement)}</span>`;
        if (html !== this.html) { updateView(this.root, html); this.html = html; }
        this.root.hidden = !this.visible || this.obscured;
    }

    dispose() {
        this.releaseStory?.();
        this.abort.abort();
        this.root.remove();
    }
}
