import { AttentionToast } from '../lore/AttentionToast';
import { AttentionView } from '../lore/AttentionView';
import { createFjordScene, type FjordScene } from './FjordScene';
import { ExpeditionPanel } from './ExpeditionPanel';
import { IslandMissionPanel } from './IslandMissionPanel';
import { IslandMissionMarkers } from './IslandMissionMarkers';
import { LifecycleTrace } from './LifecycleTrace';
import type { CampaignStartAttempt } from './FjordEntry';
import { newFjordScenario } from './FjordScenario';
import { fjordLivestockRules } from '../config/FjordLivestock';
import { resumeCheckpointKey } from '../play/SettlementRecovery';
import { birthdayCalendarMode } from '../simulation/BirthdayCalendar';
import { FoundingBookWindow } from '../lore/FoundingBookWindow';
import { IslandLoading, yieldForInput } from './IslandLoading';
import { GameplaySession } from '../gameplay-lab/GameplaySession';
import { SharedSettlement, activeSettlementKey } from '../play/SharedSettlement';
import { campaignIslandPlan, currentIslandVersion } from './CampaignIsland';
import { type EffectQuality } from '../effects/CampfireEffect';
import { PersonalHistoryView } from '../lore/PersonalHistoryView';
import { ClanBookReader } from '../lore/ClanBookReader';
import type { FjordCalendar } from './FjordCalendar';
import { FjordHeader, fjordHeaderHTML } from './FjordHeader';
import { MobileShell } from './MobileShell';
import { ScreenAwakeControl } from '../ui/ScreenAwakeControl';
import { SelectionLabels } from './SelectionLabels';
import { ProductionLabels } from './ProductionLabels';
import { FjordProduction } from './FjordProduction';
import './fjord-play.css';
import './desktop-foundations.css';
import { FjordInterface } from './FjordInterface';
import { icon } from './FjordIcons';
import { SettlementPanel, panelCommand, updateManagementAvailability } from '../play/SettlementPanel';
import { openSettlement, persistSettlement, bindViewSwitch } from '../play/SettlementBrowser';
import type { EntityKind } from '../play/SettlementView';
import { inspectWeatherExposure, personaAway, landingSummary } from '../simulation/SimulationCore';

const campaignClockIntervalMs = 500;
const escape = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));
export class FjordPlay {
    private opened!: ReturnType<typeof openSettlement>;
    private shared!: ReturnType<typeof openSettlement>['campaign'];
    private session!: ReturnType<typeof openSettlement>['campaign']['session'];
    private campaign!: ReturnType<typeof openSettlement>['campaign']['fjord'];
    private panels = new SettlementPanel();
    private stopped = false;
    private lastPanelSelection = '';
    private loading?: IslandLoading;
    private foundingBook?: FoundingBookWindow;
    private trace?: LifecycleTrace;
    private disposeScene = () => {};
    private persistenceReady = false;
    private startupCleanup: (() => void)[] = [];
    private ownStartup<T extends { dispose(): void }>(resource: T): T {
        this.startupCleanup.push(() => resource.dispose());
        return resource;
    }
    async start(entry: CampaignStartAttempt) {
        try { await this.initialize(entry); }
        catch (error) {
            this.trace?.record('restore-error');
            this.trace?.dispose();
            this.disposeScene();
            for (const cleanup of this.startupCleanup.reverse()) cleanup();
            this.startupCleanup = [];
            this.stopped = true;
            this.foundingBook?.dispose();
            this.loading?.finish();
            this.loading = undefined;
            throw error;
        }
    }
    private async initialize(entry: CampaignStartAttempt) {
        document.title = 'FjordSide';
        document.body.className = 'fjord-play';
        document.body.innerHTML = '<main class="fjord-bootstrap"><h1>Opening FjordSide…</h1><p role="status">Reading your campaign.</p></main>';
        await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
        const query = new URLSearchParams(location.search);
        let tracedBook: GameplaySession['book'] | undefined, tracedBookId: string | undefined;
        const trace = this.trace = new LifecycleTrace(query.has('debugLifecycle'), () => {
            if (!this.session) return {};
            if (tracedBook !== this.session.book) {
                tracedBook = this.session.book;
                tracedBookId = tracedBook.snapshot().id;
            }
            const state = this.session.readSnapshot();
            return { campaignId: tracedBookId, seed: state.seed, time: { ...state.time }, running: this.session.running };
        });
        // New scenarios arrive in Summer; continuation and founder replays retain their saved phase.
        const foundingPhase = 'summer-800-v1';
        // Owner review gate: existing saves remain authoritative; only explicit new games opt in.
        const calendarMode = query.get('birthdays') === 'individual-v1' ? 'individual-v1' : undefined;
        let enableStartDiscovery = entry.kind === 'new';
        entry.signal.throwIfAborted();
        if (entry.kind === 'continue' || entry.kind === 'restart') {
            const proposal = entry.restart;
            const campaign = await SharedSettlement.restoreAsync(entry.source!.text, 'fjord', async metadata => {
                if (proposal) {
                    const state = proposal.readSnapshot();
                    this.foundingBook = new FoundingBookWindow(proposal.book.snapshot().chapters[0]);
                    proposal.book.notifyPending();
                    this.loading = new IslandLoading(true, this.foundingBook, undefined, {
                        backLabel: 'Back to start menu', recipe: metadata.island,
                        founding: { seed: state.seed, time: state.time, ticksPerWinter: state.ticksPerWinter },
                    });
                } else {
                    trace.record('cold-restore', { seed: metadata.seed, time: metadata.time, campaignId: metadata.book?.id });
                    this.loading = new IslandLoading(true, undefined, metadata, { backLabel: 'Back to start menu' });
                }
                await yieldForInput();
                if (metadata.island) await this.loading.prepare(metadata.seed);
                entry.signal.throwIfAborted();
                this.loading.check();
            });
            const resumePlayback = !!entry.resumePlayback && campaign.session.running;
            campaign.session.setRunning(false);
            if (entry.kind === 'restart') {
                enableStartDiscovery = !!campaign.session.readSnapshot().discovery;
                campaign.restart(true, undefined, undefined, proposal);
            }
            this.opened = { campaign, warning: '', autoStart: entry.kind === 'restart' || resumePlayback };
        } else {
            const proposal = newFjordScenario(entry.seed);
            this.foundingBook = new FoundingBookWindow(proposal.book.snapshot().chapters[0]);
            proposal.book.notifyPending();
            this.loading = new IslandLoading(true, this.foundingBook, undefined, { backLabel: 'Back to start menu' });
            await this.loading.prepare(entry.seed);
            entry.signal.throwIfAborted();
            this.opened = { campaign: new SharedSettlement(proposal, undefined, true, currentIslandVersion),
                warning: '', autoStart: true };
            const preferences = entry.source && JSON.parse(entry.source.text).presentation;
            if (preferences) this.opened.campaign.setPresentation(preferences);
        }
        this.shared = this.opened.campaign;
        this.session = this.shared.session;
        this.campaign = this.shared.fjord;
        // New islands include physical exploration; restored campaigns retain their saved rules.
        if (entry.kind !== 'continue' && campaignIslandPlan(this.campaign.blueprint) &&
            enableStartDiscovery) this.campaign.enableDiscovery();
        document.title = 'FjordSide';
        const readingPosition = this.foundingBook?.scrollTop ?? 0;
        document.body.className = 'fjord-play';
        document.body.innerHTML = `<main id="fjord-play">${fjordHeaderHTML()}<section class="fjord-stage"><canvas id="fjord-canvas" aria-label="Canonical Fjord settlement"></canvas><svg id="fjord-selection-leaders" aria-hidden="true"></svg><div id="fjord-selection-labels" aria-hidden="true"></div><div id="fjord-production-labels" aria-label="Resident production feedback"></div>
            <button id="fjord-management-toggle" type="button" aria-label="Toggle management" aria-expanded="false" aria-controls="fjord-management" hidden>▲</button>
            <aside id="fjord-management" aria-label="Selection and tasks" hidden><p id="fjord-selected" hidden></p><section id="entity-panel" aria-label="Settlement management"></section></aside>
            <section id="fjord-workspace" tabindex="-1" aria-label="Settlement workspace" hidden>
                <div class="fjord-workspace-heading"><h2 id="fjord-workspace-title">Settlement</h2><button type="button" data-ui="close-workspace" aria-label="Close workspace">×</button></div>
                <div id="fjord-directory"></div><section id="expedition-panel" data-workspace-area="expeditions" aria-label="Expedition groups" hidden></section>
                <div data-workspace-area="attention" hidden><section id="fjord-attention-feed" aria-label="Activity Center"></section>
                <details class="attention-weather"><summary>Weather &amp; exposure</summary><section id="fjord-weather-information" aria-label="Annual weather forecast"></section></details>
                <details ${query.has('debugLifecycle') ? '' : 'hidden'}><summary>Developer diagnostics</summary><pre id="fjord-diagnostics"></pre></details></div><ul id="fjord-identities" hidden></ul>
            </section></section>
            <nav id="fjord-navigation" aria-label="Settlement navigation">
                <button type="button" id="fjord-mobile-menu" aria-label="Settlement navigation" aria-expanded="false" aria-controls="fjord-navigation-drawer">${icon('menu')}</button>
                <div id="fjord-navigation-drawer">
                    <button type="button" data-surface="settlement">${icon('home')}Settlement</button>
                    <button type="button" id="fjord-book">${icon('book')}Clan Book</button>
                </div>
                <button type="button" data-surface="expeditions">${icon('route')}Expeditions</button>
            </nav><button id="fjord-attention" type="button" data-surface="attention">${icon('alert')}<span class="fjord-attention-label">Attention</span> <span id="fjord-attention-count">0</span></button>
            <button type="button" id="fjord-attention-toast" aria-label="Open Activity Center" hidden></button><footer><p id="fjord-notice" role="status">Loading the Fjord. Simulation controls remain available.</p></footer></main>`;
        const savedPresentation = this.shared.presentation;
        let restoredCamera = entry.kind !== 'continue' ? undefined : savedPresentation?.camera;
        if (savedPresentation) {
            document.querySelector<HTMLSelectElement>('#fjord-quality')!.value = savedPresentation.quality;
            document.querySelector<HTMLSelectElement>('#fjord-effects')!.value = savedPresentation.effects;
        }
        this.loading?.mount();
        this.foundingBook?.restoreScroll(readingPosition);
        const mobileShell = this.ownStartup(new MobileShell(document.querySelector('#fjord-play')!));
        const header = this.ownStartup(new FjordHeader(document.querySelector('#fjord-header')!));
        const screenAwake = this.ownStartup(new ScreenAwakeControl(document.querySelector('#fjord-play')!));
        document.querySelector('#screen-awake-slot')!.outerHTML = screenAwake.html();
        const canvas = document.querySelector<HTMLCanvasElement>('#fjord-canvas')!;
        const management = document.querySelector<HTMLElement>('#fjord-management')!;
        const managementToggle = document.querySelector<HTMLButtonElement>('#fjord-management-toggle')!;
        const showManagement = (visible: boolean) => {
            management.hidden = !visible;
            managementToggle.textContent = visible ? '▲' : '▼';
            managementToggle.setAttribute('aria-expanded', String(visible));
            managementToggle.setAttribute('aria-label',
                visible ? 'Collapse management panel' : 'Expand management panel');
        };
        managementToggle.addEventListener('click', () => showManagement(management.hidden));
        const notice = document.querySelector<HTMLElement>('#fjord-notice')!;
        let feedbackTimer: number | undefined;
        const say = (message: string) => {
            notice.textContent = message;
            notice.classList.add('fjord-feedback');
            if (message.startsWith('Fjord ready.')) notice.classList.remove('fjord-feedback');
            clearTimeout(feedbackTimer);
            feedbackTimer = window.setTimeout(() => notice.classList.remove('fjord-feedback'), 8000);
        };
        if (this.opened.warning)
            say(this.opened.warning);
        document.querySelector('#fjord-attention')!.addEventListener('click', () => desktopUI?.open('attention'));
        const seedField = document.querySelector<HTMLInputElement>('#fjord-seed')!;
        const weatherField = document.querySelector<HTMLInputElement>('#fjord-weather')!;
        const explorationField = document.querySelector<HTMLInputElement>('#fjord-exploration')!;
        const sameFounders = document.querySelector<HTMLInputElement>('#fjord-founders')!;
        const cycleField = document.querySelector<HTMLSelectElement>('#fjord-cycle')!;
        const campaignFields = () => {
            seedField.value = String(this.session.readSnapshot().seed);
            const island = campaignIslandPlan(this.campaign.blueprint);
            document.querySelector('#fjord-geography')!.textContent = island ?
                'Island ' + island.recipe.seed + ' · validated set v1 · ' + island.plots.length + ' home plots' :
                'Original saved geography';
            weatherField.checked = this.session.readSnapshot().weather?.config.enabled ?? false;
            cycleField.value = String(this.session.minutesPerWinter);
        };
        campaignFields();
        if (query.has('discovery')) explorationField.checked = query.get('discovery') !== '0';
        sameFounders.addEventListener('change', () => {
            document.querySelector('#fjord-restart')!.textContent = sameFounders.checked ?
                'Restart with same founders' : 'Restart with new founders';
        });
        cycleField.addEventListener('change', () => {
            this.session.setMinutesPerWinter(Number(cycleField.value));
            persist();
        });
        const disposeViewSwitch = bindViewSwitch(document.querySelector('#fjord-play')!, this.shared, say, () => {
            // An outgoing transferred owner is stale; an ordinary cached page still owns its scene.
            if (this.shared.transferring) {
                trace.record('stale-owner');
                const url = new URL(location.href);
                url.searchParams.set('entry', 'recovery');
                location.replace(url);
            }
        });
        this.startupCleanup.push(disposeViewSwitch);
        let capturePresentation = () => {};
        const persist = () => {
            if (this.loading || !this.persistenceReady) return;
            capturePresentation();
            persistSettlement(this.shared, say);
        };
        const checkpointForResume = () => {
            if (this.loading || !this.persistenceReady || this.shared.transferring) return;
            persist();
            try { localStorage.setItem(resumeCheckpointKey, this.shared.persist()); }
            catch { say('Resume checkpoint unavailable. Save or export before leaving this view.'); }
        };
        // An explicit Attention deep link takes precedence over automatic story opening; it does not mark story content read.
        if (query.has('attention') || query.has('notifications')) this.session.book.notifyPending();
        const bookReader = this.ownStartup(new ClanBookReader(this.shared, persist, {
            witness: id => select('persona', id), group: id => expeditions?.openGroup(id),
        }, () => refresh()));
        const attentionView = this.ownStartup(new AttentionView(document.querySelector<HTMLElement>('#fjord-attention-feed')!, this.shared,
            () => { persist(); refresh(); }, {
                family: id => { bookReader.openFamily(id); },
                target: target => {
                    if (target.kind === 'expedition') expeditions?.openGroup(target.id);
                    else if (target.kind === 'site') islandMissions?.selectSite(target.id);
                    else if (target.kind === 'surface') desktopUI?.open(target.id, true);
                    else if (target.kind === 'wildlife') bookReader.openWildlife(target.id);
                    else select(target.kind === 'livestock' ? 'cattle' : target.kind, target.id);
                },
            }));
        const attentionToast = this.ownStartup(new AttentionToast(document.querySelector<HTMLElement>('#fjord-attention-toast')!, this.shared,
            () => { desktopUI?.open('attention', true); attentionView.openInbox(); }));
        const personalHistory = this.ownStartup(new PersonalHistoryView(document.querySelector<HTMLElement>('#fjord-play')!, this.shared));
        let clockIntent = 0;
        let previous = performance.now();
        let pageSuspended = false;
        let contextLost = false;
        let contextEpoch = 0;
        let resetFrameTime = () => { previous = performance.now(); };
        const lifecycleEvents = new AbortController();
        this.startupCleanup.push(() => lifecycleEvents.abort());
        let sceneLoads = 1; // Initial assets and models must finish before active time can advance.
        const ownsClock = () => !document.hidden && !this.stopped && !this.shared.transferring && !pageSuspended && !contextLost;
        const canAdvance = () => ownsClock() && sceneLoads === 0 && !this.loading;
        const setPlayback = (running: boolean) => {
            clockIntent++;
            previous = performance.now();
            this.session.setRunning(running && ownsClock());
            const runButton = document.querySelector<HTMLButtonElement>('#fjord-run')!;
            runButton.innerHTML = icon(this.session.running ? 'pause' : 'play') + '<span>' + (this.session.running ? 'Running' : 'Paused') + '</span>';
            runButton.setAttribute('aria-label', this.session.running ? 'Pause simulation' : 'Start simulation');
            runButton.title = this.session.running ? 'Pause simulation' : 'Start simulation';
            persist();
        };
        const beginAutoStart = () => {
            setPlayback(false);
            const intent = clockIntent;
            return () => {
                if (intent === clockIntent && ownsClock())
                    setPlayback(true);
            };
        };
        const initialAutoStart = this.opened.autoStart ? beginAutoStart() : undefined;
        let presentation: FjordScene | undefined;
        let syncScene: (() => Promise<void>) | undefined;
        const selectionLabels = new SelectionLabels(document.querySelector<HTMLElement>('#fjord-selection-labels')!,
            document.querySelector<SVGSVGElement>('#fjord-selection-leaders')!);
        const production = new FjordProduction(this.session.readSnapshot().events);
        const productionLabels = new ProductionLabels(document.querySelector<HTMLElement>('#fjord-production-labels')!);
        const resetProduction = () => {
            production.reset(this.session.readSnapshot().events);
            productionLabels.reset();
        };
        const highlight = () => presentation?.highlight();
        let calendar: FjordCalendar;
        let canonicalTime = '';
        let expeditions: ExpeditionPanel | undefined;
        let islandMissions: IslandMissionPanel | undefined;
        const islandMarkers = new IslandMissionMarkers();
        this.startupCleanup.push(() => islandMarkers.dispose());
        let desktopUI: FjordInterface | undefined;
        let renderedWildlifeAttention = '';
        const refresh = () => {
            let expeditionPace = cycleField.querySelector<HTMLOptionElement>('option[value="10"]');
            if (!expeditionPace) {
                expeditionPace = document.createElement('option'); expeditionPace.value = '10';
                expeditionPace.textContent = 'Expedition · 10 min / 1,000 ticks'; cycleField.add(expeditionPace);
            }
            expeditionPace.hidden = !this.session.expeditionMode;
            cycleField.disabled = this.session.expeditionMode;
            cycleField.value = String(this.session.expeditionMode ? 10 : this.session.minutesPerWinter);

            expeditions?.refresh();
            islandMissions?.refresh();
            islandMarkers.sync(this.session.readSnapshot(), this.campaign.blueprint);
            if (!this.loading) bookReader.update();
            const view = this.campaign.readProjection();
            const state = this.session.readSnapshot();
            calendar = view.calendar;
            canonicalTime = 'Canonical time: Winter ' + view.time.winter + ' · tick ' + view.time.tick + '/' + state.ticksPerWinter;
            productionLabels.enqueue(production.read(state.events));
            productionLabels.suppress(Object.keys(state.personas).filter(id => personaAway(state, id))
                .map(id => ({ kind: 'persona', id })));
            header.update(view.calendar, view.stocks,
                Object.values(state.personas).filter(p => p.deathWinter === null).length,
                state.landing ? landingSummary(state).cattle : 0, this.session.expeditionMode);
            canvas.dataset.time = JSON.stringify({ ...view.time, ticksPerWinter: state.ticksPerWinter });
            canvas.dataset.calendar = JSON.stringify(view.calendar);
            const workspace = document.querySelector<HTMLElement>('#fjord-workspace')!;
            attentionToast.update(Boolean(this.loading) || document.hidden || this.shared.transferring || !workspace.hidden ||
                !document.querySelector<HTMLElement>('#clan-book-reader')!.hidden);
            if (!workspace.hidden && workspace.dataset.surface === 'attention') {
                attentionView.render();
                const profile = view.weather.enabled ? view.weather.modifiers : null;
                const exposure = inspectWeatherExposure(state);
                const forecast = profile ? '<strong>Year ' + view.time.winter + ' · ' + view.weather.class + ' annual weather</strong>' +
                    '<p>Food output ' + profile.foodProductionBps / 100 + '% · Materials output ' +
                    (profile.materialsProductionBps ?? 10000) / 100 + '%<br>Resident Food ×' +
                    (profile.residentConsumptionBps ?? 10000) / 10000 + ' · Adult cattle Food ×' +
                    (profile.cattleConsumptionBps ?? profile.cattleConsumptionMultiplier * 10000) / 10000 + '</p>' +
                    '<p>' + exposure.residentIds.length + ' exposed residents · ' + exposure.cattleIds.length + ' exposed livestock</p>' +
                    (profile.tentMortalityBps || profile.exposedCattleMortalityBps ?
                        '<p class="weather-warning">Shelter exposed residents and cattle before the Winter reckoning.</p>' : '') :
                    '<strong>Winter weather disabled</strong>';
                const weatherInfo = document.querySelector('#fjord-weather-information')!;
                if (weatherInfo.innerHTML !== forecast) weatherInfo.innerHTML = forecast;
                }
            canvas.dataset.selected = this.shared.selection ? this.shared.selection.kind + ':' + this.shared.selection.id : '';
            const runButton = document.querySelector<HTMLButtonElement>('#fjord-run')!;
            runButton.innerHTML = icon(this.session.running ? 'pause' : 'play') + '<span>' + (this.session.running ? 'Running' : 'Paused') + '</span>';
            runButton.setAttribute('aria-label', this.session.running ? 'Pause simulation' : 'Start simulation');
            runButton.title = this.session.running ? 'Pause simulation' : 'Start simulation';
            document.querySelector('#fjord-diagnostics')!.textContent = [...view.diagnostics,
                ...(presentation?.diagnostics ?? []),
                'Residents reuse FjordSide DNA height, build and age; movement remains presentation only.',
                canonicalTime,
                'Geography: ' + view.layout.geographyId].join('\n');
            canvas.dataset.entities = JSON.stringify(view.entities);
            canvas.dataset.layoutIdentity = view.layout.geographyId;
            persist();
            if (presentation?.hasWorld && syncScene)
                void syncScene().catch(error => say('Presentation update failed: ' + String(error)));
            const panel = document.querySelector<HTMLElement>('#entity-panel')!;
            desktopUI?.refresh(state, this.shared.selection, personalHistory.render(),
                () => this.panels.render(state, this.shared.selection, '', { homeImprovements: false }));
            updateManagementAvailability(panel, this.shared);
            document.querySelector('#fjord-clan-name')!.textContent = state.clan.name;
            highlight();
            const selected = this.campaign.selection;
            document.querySelector('#fjord-selected')!.textContent = selected ?
                view.entities.find(e => e.kind === selected.kind && e.id === selected.id)?.label ?? 'Historical or inactive identity.' :
                'Select a home, resident or animal.';
        };
        let actionWork = Promise.resolve();
        const action = (work: () => void | Promise<void>) => {
            actionWork = actionWork.then(async () => {
                if (this.stopped || this.shared.transferring)
                    return;
                await work();
                if (!this.stopped && !this.shared.transferring)
                    refresh();
            }).catch(error => say(String(error)));
        };
        document.querySelector('#fjord-run')!.addEventListener('click', () => {
            // Record intent immediately, even while a queued command is awaiting scene assets.
            setPlayback(!this.session.running);
            action(() => {});
        });
        document.querySelector('#fjord-next')!.addEventListener('click', () => action(() => {
            if (!this.session.expeditionMode) this.session.command({ type: 'AdvanceWinter' });
        }));
        document.querySelector('#fjord-save')!.addEventListener('click', () => action(() => {
            this.shared.saveLocal(localStorage);
            say('Campaign and exact Fjord saved locally.');
        }));
        document.querySelector('#fjord-load')!.addEventListener('click', () => {
            setPlayback(false);
            action(async () => {
                say('Loading shared campaign…');
                this.shared.loadLocal(localStorage);
                this.foundingBook?.dispose();
                resetProduction();
                campaignFields();
                if (presentation?.hasWorld)
                    await presentation!.replace();
                say('Shared campaign loaded, paused.');
            });
        });
        const download = (text: string, name: string) => {
            const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
            const link = document.createElement('a');
            link.href = url;
            link.download = name;
            link.click();
            setTimeout(() => URL.revokeObjectURL(url), 60000);
        };
        if (query.has('debugLifecycle')) {
            const button = document.createElement('button');
            button.type = 'button';
            button.textContent = 'Download recovery diagnostics';
            button.addEventListener('click', () => download(JSON.stringify(trace.snapshot(), null, 2), 'fjordside-recovery-diagnostics.json'));
            document.querySelector('#fjord-menu .fjord-settings')!.append(button);
        }
        document.querySelector('#fjord-export')!.addEventListener('click', () => download(this.campaign.exportJSON(), 'fjordside-campaign.json'));
        document.querySelector('#fjord-export-core')!.addEventListener('click', () => download(this.session.saveJSON(), 'fjordside-core.json'));
        document.querySelector('#fjord-import')!.addEventListener('change', event => {
            const input = event.target as HTMLInputElement, file = input.files?.[0];
            if (!file)
                return;
            setPlayback(false);
            action(async () => {
                say('Importing campaign…');
                this.shared.importJSON(await file.text());
                this.foundingBook?.dispose();
                resetProduction();
                campaignFields();
                input.value = '';
                if (presentation?.hasWorld)
                    await presentation!.replace();
                say('Campaign imported, paused.');
            });
        });
        let campaignChangePending = false;
        const startNewCampaign = (restart: boolean) => {
            if (campaignChangePending || !window.confirm('Replace the active campaign? Manually saved checkpoints are kept.')) return;
            campaignChangePending = true;
            const discoveryEnabled = explorationField.checked;
            const previousPace = this.session.pacing();
            const wasRunning = previousPace.running;
            this.foundingBook?.dispose();
            const completeAutoStart = beginAutoStart();
            action(async () => {
                // Legacy saves keep their existing restart and geography policy.
                // Only current island campaigns use the new generation introduction.
                if (restart && !campaignIslandPlan(this.campaign.blueprint)) {
                    say('Restarting campaign…');
                    try {
                        this.shared.restart(sameFounders.checked, weatherField.checked);
                        resetProduction();
                        campaignFields();
                        if (presentation?.hasWorld) await presentation!.replace();
                        completeAutoStart();
                        say('Campaign restarted.');
                    } finally { campaignChangePending = false; }
                    return;
                }
                const backup = this.campaign.exportJSON();
                let loading: IslandLoading | undefined;
                controller.enabled = false;
                drawingReady = false;
                sceneLoads++;
                try {
                    const replayFounders = restart && sameFounders.checked;
                    const proposal = replayFounders ? this.session.restartProposal() : new GameplaySession();
                    if (!replayFounders && restart) {
                        proposal.loadJSON(this.session.saveJSON());
                        proposal.restartCampaign(sameFounders.checked, undefined, weatherField.checked, undefined, foundingPhase);
                    } else if (!replayFounders) proposal.newCampaign(Number(seedField.value), weatherField.checked, true, foundingPhase,
                        calendarMode ?? birthdayCalendarMode(this.session.readSnapshot()), { player: fjordLivestockRules });
                    this.foundingBook = new FoundingBookWindow(proposal.book.snapshot().chapters[0]);
                    proposal.book.notifyPending();
                    const recipe = replayFounders ? campaignIslandPlan(this.campaign.blueprint)?.recipe : undefined;
                    const state = proposal.readSnapshot();
                    loading = this.loading = new IslandLoading(true, this.foundingBook, undefined, {
                        recipe, founding: { seed: state.seed, time: state.time, ticksPerWinter: state.ticksPerWinter },
                    });
                    await loading.prepare(proposal.snapshot().seed);
                    loading.check();
                    if (replayFounders) this.campaign.restart(true, undefined, undefined, proposal);
                    else this.campaign.startCampaign(proposal, currentIslandVersion);
                    if (discoveryEnabled) this.campaign.enableDiscovery();
                    resetProduction();
                    campaignFields();
                    await presentation!.replace();
                    await finishArrival(loading);
                    this.foundingBook.release();
                    loading?.finish();
                    this.loading = undefined;
                    completeAutoStart();
                    say(restart ? 'Campaign restarted.' : 'New campaign created.');
                } catch (error) {
                    this.foundingBook?.dispose();
                    const committed = this.campaign.exportJSON() !== backup;
                    this.shared.importJSON(backup);
                    campaignFields();
                    resetProduction();
                    // Restoration itself is not part of the cancelled operation.
                    this.loading = undefined;
                    if (committed && !this.stopped) await presentation!.replace();
                    say(error instanceof DOMException && error.name === 'AbortError' ?
                        'Loading cancelled. Your campaign is unchanged.' : 'Could not open the new island. Your campaign is retained. ' + String(error));
                    loading?.finish();
                    this.session.restorePacing({ ...previousPace, running: false });
                    setPlayback(wasRunning);
                } finally {
                    loading?.finish();
                    this.loading = undefined;
                    sceneLoads--;
                    controller.enabled = true;
                    drawingReady = true;
                    previous = performance.now();
                    campaignChangePending = false;
                }
            });
        };
        document.querySelector('#fjord-restart')!.addEventListener('click', () => startNewCampaign(true));
        document.querySelector('#fjord-new')!.addEventListener('click', () => startNewCampaign(false));
        const select = (kind: string, id: string) => {
            const picked = this.campaign.readProjection().entities.find(e => e.kind === kind && e.id === id);
            const ship = picked?.status.aboardShip ? this.campaign.readProjection().entities.find(e =>
                e.kind === 'longship' && e.id === picked.status.aboardShip) : picked;
            if (ship?.kind === 'longship' && ship.status.transportGroup) {
                expeditions?.openGroup(ship.status.transportGroup);
                return;
            }
            showManagement(true);
            this.shared.select(kind ? { kind: kind as EntityKind, id } : null);
            const entity = this.campaign.readProjection().entities.find(e => e.kind === kind && e.id === id);
            document.querySelector('#fjord-selected')!.textContent = entity ? entity.label + ' · ' + kind : 'Entity is no longer active.';
            refresh();
        };
        desktopUI = new FjordInterface(this.shared, { select, refresh, notify: say,
            home: () => controller.home(),
            commit: (commands, done) => action(async () => {
                this.session.commandBatch(typeof commands === 'function' ? commands() : commands);
                done();
                if (syncScene) await syncScene();
            }) });
        this.startupCleanup.push(() => desktopUI?.dispose());
        document.querySelector('#fjord-book')!.addEventListener('click', () =>
            document.querySelector<HTMLButtonElement>('#clan-book-open')!.click());
        const panelRoot = document.querySelector<HTMLElement>('#entity-panel')!;
        panelRoot.addEventListener('change', () => updateManagementAvailability(panelRoot, this.shared));
        panelRoot.addEventListener('click', event => {
            const button = (event.target as Element).closest<HTMLButtonElement>('button');
            if (!button || button.disabled)
                return;
            try { if (desktopUI?.handle(button)) return; }
            catch (error) { say(error instanceof Error ? error.message : String(error)); return; }
            if (button.dataset.select) {
                select(button.dataset.kind!, button.dataset.select);
                return;
            }
            if (button.dataset.action === 'clear') {
                this.shared.select(null);
                refresh();
                return;
            }
            const field = (id: string) => panelRoot.querySelector<HTMLInputElement | HTMLSelectElement>('#' + id)?.value ?? '';
            const command = panelCommand(button, this.shared.selection, field);
            if (command) void desktopUI!.approve(command).then(approved => {
                if (approved) action(async () => {
                    this.shared.command(command);
                    if (syncScene) await syncScene();
                    say('Action completed.');
                });
            }).catch(error => say(error instanceof Error ? error.message : String(error)));
        });
        document.querySelector('#fjord-identities')!.addEventListener('click', event => {
            const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-kind]');
            if (button)
                select(button.dataset.kind!, button.dataset.id!);
        });
        refresh();
        let timer: number | undefined;
        const tickClock = () => {
            const now = performance.now(), elapsed = Math.min(now - previous, 1000);
            previous = now;
            if (!this.session.running || !canAdvance())
                return;
            const intent = clockIntent;
            action(() => {
                // Recheck at execution: this work may have waited behind an asynchronous command.
                if (intent === clockIntent && this.session.running && canAdvance())
                    this.session.elapse(elapsed);
            });
        };
        document.addEventListener('visibilitychange', () => {
            trace.record(document.hidden ? 'hidden' : 'visible');
            if (document.hidden) {
                setPlayback(false);
                refresh();
                checkpointForResume();
            }
            resetFrameTime();
        }, { signal: lifecycleEvents.signal });
        const owner = this;
        presentation = createFjordScene({ shared: this.shared, canvas,
            labels: { selection: selectionLabels, production: productionLabels }, restoredCamera,
            host: {
                tickIntervalSeconds: campaignClockIntervalMs / 1000,
                get loading() { return owner.loading; },
                get stopped() { return owner.stopped; },
                work(delta) { sceneLoads += delta; if (delta < 0) previous = performance.now(); },
                built: () => trace.record('scene-build'),
            } });
        this.startupCleanup.push(() => presentation?.dispose());
        const { camera, renderer, controller } = presentation;
        syncScene = () => presentation!.sync();
        presentation.root.add(islandMarkers.root);
        expeditions = new ExpeditionPanel(document.querySelector<HTMLElement>('#expedition-panel')!,
            this.session, command => action(() => {
                this.session.command(command);
                expeditions!.committed(command);
                islandMissions?.committed(command);
            }), (point, valid) => presentation!.setTarget(point, valid),
            memberIds => presentation!.origins(memberIds), {
                showMap: () => {
                    desktopUI?.showExplorationMap();
                    showManagement(false);
                },
                showGroups: () => desktopUI?.open('expeditions', true),
                focus: point => controller.focusAt(point),
                toggleClock: () => document.querySelector<HTMLButtonElement>('#fjord-run')!.click(),
            });
        this.startupCleanup.push(() => expeditions?.dispose());
        islandMissions = new IslandMissionPanel(document.querySelector<HTMLElement>('#expedition-panel')!,
            this.session, command => action(() => {
                this.session.command(command);
                expeditions!.committed(command);
                islandMissions?.committed(command);
            }), memberIds => presentation!.origins(memberIds),
            () => desktopUI?.showExplorationMap(), () => desktopUI?.open('expeditions', true),
            point => controller.focusAt(point), id => select('cattle', id));
        this.startupCleanup.push(() => islandMissions?.dispose());
        document.querySelector('#fjord-expeditions-open')!.addEventListener('click', () => {
            document.querySelector<HTMLDetailsElement>('#fjord-menu')!.open = false;
            showManagement(true);
            this.shared.select(null);
            refresh();
            expeditions!.refresh();
            desktopUI?.open('expeditions');
        });
        capturePresentation = () => this.shared.setPresentation({
            quality: document.querySelector<HTMLSelectElement>('#fjord-quality')!.value as 'low' | 'standard',
            effects: document.querySelector<HTMLSelectElement>('#fjord-effects')!.value as EffectQuality,
            camera: { position: camera.position.toArray(), target: controller.focus.toArray() },
        });
        controller.enabled = !this.loading;
        let drawingReady = false;
        let contextPanel: HTMLElement | undefined;
        let contextFocus: HTMLElement | null = null;
        let restoreSceneGpu = async (check: () => void) => {
            check();
            await renderer.compileAsync(presentation!.root, camera);
            check();
        };
        this.disposeScene = () => {
            if (this.stopped) return;
            this.loading?.cancel();
            this.loading?.finish();
            this.stopped = true;
            desktopUI?.dispose();
            expeditions?.dispose();
            islandMissions?.dispose();
            islandMarkers.dispose();
            clearTimeout(feedbackTimer);
            trace.record('scene-disposed');
            trace.dispose();
            lifecycleEvents.abort();
            disposeViewSwitch();
            contextEpoch++;
            contextPanel?.remove();
            screenAwake.dispose();
            header.dispose();
            mobileShell.dispose();
            bookReader.dispose();
            attentionView.dispose();
            attentionToast.dispose();
            this.foundingBook?.dispose();
            personalHistory.dispose();
            setPlayback(false);
            clearInterval(timer);
            presentation?.dispose();
        };
        this.startupCleanup = [];
        window.addEventListener('pagehide', event => {
            trace.record('pagehide', { persisted: event.persisted });
            pageSuspended = true;
            setPlayback(false);
            checkpointForResume();
            resetFrameTime();
            if (!event.persisted) this.disposeScene();
        }, { signal: lifecycleEvents.signal });
        window.addEventListener('pageshow', event => {
            trace.record('pageshow', { persisted: event.persisted });
            if (!event.persisted || this.stopped || this.shared.transferring) return;
            pageSuspended = false;
            resetFrameTime();
            setPlayback(false);
            refresh();
            trace.record('warm-resume', { kind: 'cached-page' });
            say('Welcome back. Your campaign is paused; select Start to continue.');
        }, { signal: lifecycleEvents.signal });
        canvas.addEventListener('webglcontextlost', event => {
            trace.record('webglcontextlost');
            event.preventDefault();
            contextEpoch++;
            contextLost = true;
            setPlayback(false);
            checkpointForResume();
            resetFrameTime();
            controller.enabled = false;
            if (this.loading) {
                this.loading.fail(new Error('Graphics were interrupted while preparing the island. Please retry.'));
                return;
            }
            if (!contextPanel) {
                contextFocus = document.activeElement as HTMLElement | null;
                contextPanel = document.createElement('section');
                contextPanel.id = 'fjord-context-recovery';
                contextPanel.setAttribute('role', 'dialog');
                contextPanel.setAttribute('aria-modal', 'true');
                contextPanel.setAttribute('aria-label', 'Graphics recovery');
                contextPanel.innerHTML = '<div><h2>Graphics interrupted</h2><p role="status">Waiting for the browser to restore the scene. Your campaign is paused.</p><button data-reload>Reload saved settlement</button><button data-export>Export recovery file</button></div>';
                contextPanel.querySelector('[data-reload]')!.addEventListener('click', () => {
                    try {
                        sessionStorage.setItem(activeSettlementKey, this.shared.persist());
                        const url = new URL(location.href);
                        url.searchParams.set('entry', 'recovery');
                        location.replace(url);
                    } catch {
                        contextPanel!.querySelector('[role="status"]')!.textContent =
                            'Could not save the current session. Export a recovery file before reloading.';
                    }
                });
                contextPanel.querySelector('[data-export]')!.addEventListener('click', () =>
                    download(this.shared.persist(), 'fjordside-recovery.json'));
                contextPanel.addEventListener('keydown', event => {
                    if (event.key !== 'Tab') return;
                    event.preventDefault();
                    const buttons = Array.from(contextPanel!.querySelectorAll('button'));
                    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
                    buttons[(index + (event.shiftKey ? buttons.length - 1 : 1)) % buttons.length].focus();
                });
                document.body.append(contextPanel);
            }
            if (!document.hidden) contextPanel.querySelector('button')!.focus();
        }, { signal: lifecycleEvents.signal });
        canvas.addEventListener('webglcontextrestored', () => {
            trace.record('webglcontextrestored');
            if (!contextLost || this.stopped) return;
            const epoch = contextEpoch;
            const check = () => {
                if (this.stopped || epoch !== contextEpoch || renderer.getContext().isContextLost())
                    throw new DOMException('Graphics restoration superseded.', 'AbortError');
            };
            void restoreSceneGpu(check).then(() => {
                check();
                contextLost = false;
                resetFrameTime();
                controller.enabled = !this.loading;
                contextPanel?.remove();
                contextPanel = undefined;
                if (!document.hidden && contextFocus?.isConnected) contextFocus.focus();
                refresh();
                trace.record('graphics-ready');
                say('Scene restored. Your campaign is paused; select Start to continue.');
            }).catch(error => {
                if (this.stopped || epoch !== contextEpoch || !contextPanel) return;
                contextPanel.querySelector('[role="status"]')!.textContent =
                    'Could not restore graphics. Your saved campaign is retained. ' + String(error);
            });
        }, { signal: lifecycleEvents.signal });
        await presentation.initialize();
        if (this.stopped || this.shared.transferring) return;
        controller.setSelectionHandler((x, y, pointerType) => {
            if (expeditions?.targeting || islandMissions?.targeting) {
                const picked = expeditions?.targeting && !expeditions.sailing
                    ? presentation!.pick(x, y, pointerType, 'longship') : null;
                if (expeditions && picked?.kind === 'longship')
                    return expeditions.chooseShip(picked.id);
                const point = presentation!.groundPoint(x, y, true, expeditions?.sailing);
                if (point) {
                    if (islandMissions?.targeting) islandMissions.chooseTarget({ x: point.x, z: point.z });
                    else expeditions!.chooseTarget({ x: point.x, z: point.z });
                }
                return true;
            }
            const selected = presentation!.pick(x, y, pointerType);
            if (!selected) {
                const siteId = islandMarkers.pick(camera, x, y, canvas.getBoundingClientRect());
                if (siteId) { islandMissions?.selectSite(siteId); return true; }
                if (this.shared.selection) {
                    this.shared.select(null);
                    refresh();
                }
                // A desktop left click is exclusively selection/deselection.
                // Preserve the existing touch tap-on-empty-ground navigation.
                return pointerType === 'mouse';
            }
            select(selected.kind, selected.id);
            return true;
        });
        let destinationPointer: { x: number; y: number } | undefined;
        let lastDestinationPreview = 0, destinationPreviewKey = '';
        const clearDestinationPreview = () => {
            destinationPointer = undefined;
            destinationPreviewKey = '';
            expeditions?.previewTarget();
        };
        canvas.addEventListener('pointermove', event => {
            if (event.pointerType !== 'mouse' || event.buttons) { clearDestinationPreview(); return; }
            destinationPointer = { x: event.clientX, y: event.clientY };
        }, { signal: lifecycleEvents.signal });
        canvas.addEventListener('pointerleave', clearDestinationPreview, { signal: lifecycleEvents.signal });
        canvas.addEventListener('pointerdown', clearDestinationPreview, { signal: lifecycleEvents.signal });
        window.addEventListener('blur', clearDestinationPreview, { signal: lifecycleEvents.signal });
        const previewDestination = () => {
            if (!expeditions?.targeting) { destinationPreviewKey = ''; return; }
            if (!controller.enabled || !destinationPointer || performance.now() - lastDestinationPreview < 120) return;
            lastDestinationPreview = performance.now();
            const { x, y } = destinationPointer;
            const key = [x, y, expeditions.targetingGroup, this.session.revision, ...camera.matrixWorld.elements].join(',');
            if (key === destinationPreviewKey) return;
            destinationPreviewKey = key;
            const picked = !expeditions.sailing ? presentation!.pick(x, y, 'mouse', 'longship') : null;
            if (picked?.kind === 'longship') {
                const ship = this.campaign.readProjection().entities.find(e => e.kind === 'longship' && e.id === picked.id);
                if (ship?.transform) { expeditions.previewShip(picked.id, ship.transform); return; }
            }
            const point = presentation!.groundPoint(x, y, true, expeditions.sailing);
            expeditions.previewTarget(point ? { x: point.x, z: point.z } : undefined);
        };
        resetFrameTime = () => { previous = performance.now(); presentation!.resetFrameTime(); };
        // Public camera diagnostics let visual QA locate objects before exercising real pointer picking.
        renderer.setAnimationLoop(() => {
            if (!drawingReady || pageSuspended || contextLost || document.hidden) return;
            presentation!.frame(calendar, this.session.running && canAdvance());
            previewDestination();
        });
        const prepareGpu = (loading: Pick<IslandLoading, 'stage' | 'measure' | 'check'>) =>
            presentation!.prepareGpu(loading);
        restoreSceneGpu = check => prepareGpu({
            stage: label => { if (contextPanel) contextPanel.querySelector('[role="status"]')!.textContent = label + '…'; },
            check,
            async measure<T>(_stage: string, operation: () => T | Promise<T>): Promise<T> {
                check();
                await yieldForInput();
                const result = await operation();
                check();
                return result;
            },
        });
        const finishArrival = async (loading: IslandLoading) => {
            await prepareGpu(loading);
            loading.check();
            drawingReady = true;
            await presentation!.arrive(loading);
        };
        if (this.loading) {
            await finishArrival(this.loading);
            entry.signal.throwIfAborted();
            entry.activate(this.shared.persist());
            this.persistenceReady = true;
            this.foundingBook?.release();
            this.loading.finish();
            this.loading = undefined;
        }
        this.persistenceReady = true;
        controller.enabled = true;
        drawingReady = true;
        // Start only after assets are ready; scene loading contributes no campaign time.
        sceneLoads--;
        initialAutoStart?.();
        refresh();
        if (query.has('attention')) {
            desktopUI?.open('attention', true);
            const source = query.get('attention');
            if (source?.startsWith('event-')) attentionView.openEvent(source);
        }
        canvas.dataset.ready = 'true';
        trace.record('scene-ready');
        previous = performance.now();
        timer = window.setInterval(tickClock, campaignClockIntervalMs);
        document.querySelector<HTMLButtonElement>('#fjord-export')!.disabled = false;
        say('Fjord ready. Desktop: left-click to select (empty ground clears selection), left-drag to pan, right-drag to rotate, wheel to zoom. Touch: tap empty ground to navigate, drag to rotate, pinch to zoom.');
    }
}
