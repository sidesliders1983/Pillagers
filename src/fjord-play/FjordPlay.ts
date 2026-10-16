import { LifecycleTrace } from './LifecycleTrace';
import { readRecoverySources, resumeCheckpointKey } from '../play/SettlementRecovery';
import { chooseSettlementRecovery } from './CampaignRecovery';
import { birthdayCalendarMode } from '../simulation/BirthdayCalendar';
import { FoundingBookWindow } from '../lore/FoundingBookWindow';
import { IslandLoading, yieldForInput } from './IslandLoading';
import { GameplaySession } from '../gameplay-lab/GameplaySession';
import { SharedSettlement, activeSettlementKey } from '../play/SharedSettlement';
import { campaignIslandPlan } from './CampaignIsland';
import { PrecipitationEffect } from '../effects/PrecipitationEffect';
import { CampfireEffect, type EffectQuality } from '../effects/CampfireEffect';
import { PersonalHistoryView } from '../lore/PersonalHistoryView';
import { ClanBookReader } from '../lore/ClanBookReader';
import type { FjordCalendar } from './FjordCalendar';
import { FjordHeader, fjordHeaderHTML } from './FjordHeader';
import { ScreenAwakeControl } from '../ui/ScreenAwakeControl';
import { LivingWorldController } from './LivingWorldController';
import { renderCharacterProfile } from '../ui/CharacterProfileContent';
import type { FjordEntity } from './FjordProjection';
import { SelectionLabels } from './SelectionLabels';
import { ProductionLabels } from './ProductionLabels';
import { FjordProduction } from './FjordProduction';
import type { SelectionLabel } from './SelectionLabels';
import './fjord-play.css';
import { Vector3, Clock, PerspectiveCamera, Scene, Mesh, Texture } from 'three';
import { SettlementPanel, panelCommand, updateManagementAvailability } from '../play/SettlementPanel';
import { openSettlement, persistSettlement, bindViewSwitch } from '../play/SettlementBrowser';
import { updateView } from '../gameplay-lab/updateView';
import type { EntityKind } from '../play/SettlementView';
import { AssetManager } from '../core/AssetManager';
import { createRenderer } from '../core/Renderer';
import { WorldLighting } from '../core/WorldLighting';
import { SeasonTint } from '../world/SeasonTint';
import { createWorld } from '../world/WorldFactory';
import { RTSCameraController } from '../camera/RTSCameraController';
import { projectChronicle } from '../lore/Chronicle';
import { inspectCampfire, inspectWeatherExposure } from '../simulation/SimulationCore';
import { FjordModels } from './FjordModels';
import { FjordEntities } from './FjordEntities';
import { fjordGroundWeights } from './FjordGround';
const escape = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));
export class FjordPlay {
    private opened!: ReturnType<typeof openSettlement>;
    private shared!: ReturnType<typeof openSettlement>['campaign'];
    private session!: ReturnType<typeof openSettlement>['campaign']['session'];
    private campaign!: ReturnType<typeof openSettlement>['campaign']['fjord'];
    private panels = new SettlementPanel();
    private stopped = false;
    private queued = false;
    private lastPanelSelection = '';
    private worldRevision = 0;
    private loading?: IslandLoading;
    private foundingBook?: FoundingBookWindow;
    private trace?: LifecycleTrace;
    private disposeScene = () => {};
    async start() {
        try { await this.initialize(); }
        catch (error) {
            this.trace?.record('restore-error');
            this.trace?.dispose();
            this.disposeScene();
            this.foundingBook?.dispose();
            this.loading?.finish();
            this.loading = undefined;
            document.body.innerHTML = '<main class="fjord-load-error"><h1>Island not opened</h1><p role="status"></p><button type="button">Try again</button></main>';
            document.querySelector('[role="status"]')!.textContent = error instanceof DOMException && error.name === 'AbortError' ?
                'Loading cancelled. Your saved campaign has not changed.' : 'Could not open the island. ' + String(error);
            document.querySelector('button')!.addEventListener('click', () => location.reload());
        }
    }
    private async initialize() {
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
        // New and restarted Fjord campaigns arrive in Summer; stored campaigns remain authoritative.
        const foundingPhase = 'summer-800-v1';
        // Owner review gate: existing saves remain authoritative; only explicit new games opt in.
        const calendarMode = query.get('birthdays') === 'individual-v1' ? 'individual-v1' : undefined;
        const recovery = readRecoverySources(key => sessionStorage.getItem(key), key => localStorage.getItem(key));
        let stored = recovery.active;
        if (recovery.requiresChoice) stored = await chooseSettlementRecovery(recovery);
        while (stored) {
            try {
                const campaign = await SharedSettlement.restoreAsync(stored, 'fjord', async metadata => {
                    trace.record('cold-restore', { seed: metadata.seed, time: metadata.time, campaignId: metadata.book?.id });
                    this.loading = new IslandLoading(false, undefined, metadata);
                    await yieldForInput();
                    if (metadata.island) {
                        trace.record('generation-start', { reason: 'saved-island' });
                        await this.loading.prepare(metadata.seed);
                        trace.record('generation-ready');
                    }
                    this.loading.check();
                });
                this.opened = { campaign, warning: '', autoStart: false };
                break;
            } catch (error) {
                const aborted = this.loading?.signal.aborted;
                this.loading?.finish();
                this.loading = undefined;
                if (aborted) throw error;
                const alternatives = readRecoverySources(() => null, key => localStorage.getItem(key));
                if (!alternatives.damaged.some(candidate => candidate.text === stored))
                    alternatives.damaged.push({ source: 'Unrestored campaign', text: stored });
                stored = await chooseSettlementRecovery(alternatives, 'Could not restore the saved campaign. ' + String(error));
            }
        }
        if (!stored) {
            const proposal = new GameplaySession(Number(query.get('seed') ?? 32), undefined, true, foundingPhase, calendarMode);
            this.foundingBook = new FoundingBookWindow(proposal.book.snapshot().chapters[0]);
            proposal.book.notifyPending();
            this.loading = new IslandLoading(false, this.foundingBook);
            trace.record('new-campaign', { seed: proposal.snapshot().seed });
            await this.loading.prepare(proposal.snapshot().seed);
            this.opened = { campaign: new SharedSettlement(proposal, undefined, true, 'island-pool-v1'),
                warning: '', autoStart: true };
        }
        this.shared = this.opened.campaign;
        this.session = this.shared.session;
        this.campaign = this.shared.fjord;
        document.title = 'FjordSide';
        const readingPosition = this.foundingBook?.scrollTop ?? 0;
        document.body.className = 'fjord-play';
        document.body.innerHTML = `<main id="fjord-play">${fjordHeaderHTML()}<section class="fjord-stage"><canvas id="fjord-canvas" aria-label="Canonical Fjord settlement"></canvas><svg id="fjord-selection-leaders" aria-hidden="true"></svg><div id="fjord-selection-labels" aria-hidden="true"></div><div id="fjord-production-labels" aria-label="Resident production feedback"></div>
            <button id="fjord-management-toggle" type="button" aria-label="Collapse management panel" aria-expanded="true" aria-controls="fjord-management">▲</button>
            <aside id="fjord-management"><section id="fjord-weather-information" aria-label="Annual weather forecast"></section><details><summary>Settlement identities</summary><ul id="fjord-identities"></ul></details>

            <p id="fjord-selected">Select an entity on the board or in the list.</p><section id="entity-panel" aria-label="Settlement management"></section><details><summary>Clan Chronicle</summary><div id="fjord-chronicle"></div></details><details><summary>Developer diagnostics</summary><pre id="fjord-diagnostics"></pre></details></aside></section>
            <footer><p id="fjord-notice" role="status">Loading the Fjord. Simulation controls remain available.</p></footer></main>`;
        const savedPresentation = this.shared.presentation;
        let restoredCamera = savedPresentation?.camera;
        if (savedPresentation) {
            document.querySelector<HTMLSelectElement>('#fjord-quality')!.value = savedPresentation.quality;
            document.querySelector<HTMLSelectElement>('#fjord-effects')!.value = savedPresentation.effects;
        }
        this.loading?.mount();
        this.foundingBook?.restoreScroll(readingPosition);
        const header = new FjordHeader(document.querySelector('#fjord-header')!);
        const screenAwake = new ScreenAwakeControl(document.querySelector('#fjord-play')!);
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
        const say = (message: string) => {
            notice.textContent = message;
        };
        if (this.opened.warning)
            say(this.opened.warning);
        const seedField = document.querySelector<HTMLInputElement>('#fjord-seed')!;
        const weatherField = document.querySelector<HTMLInputElement>('#fjord-weather')!;
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
        sameFounders.addEventListener('change', () => {
            document.querySelector('#fjord-restart')!.textContent = sameFounders.checked ?
                'Restart with same founders' : 'Restart with new founders';
        });
        cycleField.addEventListener('change', () => {
            this.session.setMinutesPerWinter(Number(cycleField.value));
            persist();
        });
        bindViewSwitch(document.querySelector('#fjord-play')!, this.shared, say, () => {
            // An outgoing transferred owner is stale; an ordinary cached page still owns its scene.
            if (this.shared.transferring) { trace.record('stale-owner'); location.reload(); }
        });
        let capturePresentation = () => {};
        const persist = () => {
            if (this.loading) return;
            capturePresentation();
            persistSettlement(this.shared, say);
        };
        const checkpointForResume = () => {
            if (this.loading || this.shared.transferring) return;
            persist();
            try { localStorage.setItem(resumeCheckpointKey, this.shared.persist()); }
            catch { say('Resume checkpoint unavailable. Save or export before leaving this view.'); }
        };
        const bookReader = new ClanBookReader(this.shared, persist);
        const personalHistory = new PersonalHistoryView(document.querySelector<HTMLElement>('#fjord-play')!, this.shared);
        let clockIntent = 0;
        let previous = performance.now();
        let pageSuspended = false;
        let contextLost = false;
        let contextEpoch = 0;
        let resetFrameTime = () => { previous = performance.now(); };
        const lifecycleEvents = new AbortController();
        let sceneLoads = 1; // Initial assets and models must finish before active time can advance.
        const ownsClock = () => !document.hidden && !this.stopped && !this.shared.transferring && !pageSuspended && !contextLost;
        const canAdvance = () => ownsClock() && sceneLoads === 0 && !this.loading;
        const setPlayback = (running: boolean) => {
            clockIntent++;
            previous = performance.now();
            this.session.setRunning(running && ownsClock());
            document.querySelector('#fjord-run')!.textContent = this.session.running ? 'Pause' : 'Start';
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
        let assets: AssetManager | undefined, models: FjordModels | undefined;
        let layer: FjordEntities | undefined, world: Awaited<ReturnType<typeof createWorld>> | undefined;
        let motion: LivingWorldController | undefined;
        let liveMarkers: ReturnType<typeof this.shared.selectionPresentation> = [];
        let sceneEntities: readonly FjordEntity[] = [];
        let syncScene: (() => Promise<void>) | undefined;
        let sceneWork: Promise<void> | undefined;
        const selectionLabels = new SelectionLabels(document.querySelector<HTMLElement>('#fjord-selection-labels')!,
            document.querySelector<SVGSVGElement>('#fjord-selection-leaders')!);
        const production = new FjordProduction(this.session.readSnapshot().events);
        const productionLabels = new ProductionLabels(document.querySelector<HTMLElement>('#fjord-production-labels')!);
        const resetProduction = () => {
            production.reset(this.session.readSnapshot().events);
            productionLabels.reset();
        };
        const highlight = (state = this.session.readSnapshot(), view = this.campaign.readProjection()) => {
            liveMarkers = this.shared.selectionPresentation(state, view.entities);
            layer?.select(liveMarkers);
            canvas.dataset.highlight = JSON.stringify(layer?.root.userData.selection ?? null);
            const markers = (layer?.root.userData.markers ?? []) as SelectionLabel[];
            canvas.dataset.markers = JSON.stringify(markers);
            selectionLabels.sync(markers);
        };
        let calendar: FjordCalendar;
        let canonicalTime = '';
        const refresh = () => {
            if (!this.loading) bookReader.update();
            const view = this.campaign.readProjection();
            const state = this.session.readSnapshot();
            calendar = view.calendar;
            canonicalTime = 'Canonical time: Winter ' + view.time.winter + ' · tick ' + view.time.tick + '/' + state.ticksPerWinter;
            productionLabels.enqueue(production.read(state.events));
            header.update(view.calendar, view.stocks,
                Object.values(state.personas).filter(p => p.deathWinter === null).length,
                view.entities.filter(e => e.kind === 'cattle').length);
            canvas.dataset.time = JSON.stringify({ ...view.time, ticksPerWinter: state.ticksPerWinter });
            canvas.dataset.calendar = JSON.stringify(view.calendar);
            document.querySelector('#fjord-chronicle')!.innerHTML = projectChronicle(state.events, state.time.winter)
                .slice(0, 10).map(w => '<h3>Winter ' + w.winter + '</h3>' +
                w.entries.map(e => '<p>' + escape(e.text) + '</p>').join('')).join('');
            const profile = view.weather.enabled ? view.weather.modifiers : null;
            const exposure = inspectWeatherExposure(state);
            const forecast = profile ? '<strong>Year ' + view.time.winter + ' · ' + view.weather.class + ' annual weather</strong>' +
                '<p>Food output ' + profile.foodProductionBps / 100 + '% · Materials output ' +
                (profile.materialsProductionBps ?? 10000) / 100 + '%<br>Resident Food ×' +
                (profile.residentConsumptionBps ?? 10000) / 10000 + ' · Adult cattle Food ×' +
                (profile.cattleConsumptionBps ?? profile.cattleConsumptionMultiplier * 10000) / 10000 + '</p>' +
                '<p>' + exposure.residentIds.length + ' exposed residents · ' + exposure.cattleIds.length + ' exposed cattle</p>' +
                (profile.tentMortalityBps || profile.exposedCattleMortalityBps ?
                    '<p class="weather-warning">Shelter exposed residents and cattle before the Winter reckoning.</p>' : '') :
                '<strong>Winter weather disabled</strong>';
            const weatherInfo = document.querySelector('#fjord-weather-information')!;
            if (weatherInfo.innerHTML !== forecast) weatherInfo.innerHTML = forecast;
            canvas.dataset.selected = this.shared.selection ? this.shared.selection.kind + ':' + this.shared.selection.id : '';
            document.querySelector('#fjord-run')!.textContent = this.session.running ? 'Pause' : 'Start';
            const historicalPeople = Object.values({...state.personaArchive, ...state.personas})
                .filter(person => !view.entities.some(entity => entity.kind === 'persona' && entity.id === person.id))
                .map(person => ({kind:'persona', id:person.id, label:person.name,
                    status:{level:undefined, stage:!state.personas[person.id]?'archived':person.deathWinter!==null?'deceased':'resident record'}}));
            const identities = [...view.entities, ...historicalPeople].map(e => `<li><button data-kind="${e.kind}" data-id="${escape(e.id)}">${escape(e.label)}</button> · ${e.status.level !== undefined ? 'level ' + e.status.level : e.status.stage ?? e.kind}</li>`).join('');
            const list = document.querySelector('#fjord-identities')!;
            if (list.innerHTML !== identities)
                list.innerHTML = identities;
            document.querySelector('#fjord-diagnostics')!.textContent = [...view.diagnostics,
                ...(assets?.diagnostics ?? []), ...(models?.diagnostics ?? []),
                'Residents reuse FjordSide DNA height, build and age; movement remains presentation only.',
                canonicalTime,
                'Geography: ' + view.layout.geographyId].join('\n');
            canvas.dataset.entities = JSON.stringify(view.entities);
            canvas.dataset.layoutIdentity = view.layout.geographyId;
            persist();
            if (layer && syncScene)
                void syncScene().catch(error => say('Presentation update failed: ' + String(error)));
            const panel = document.querySelector<HTMLElement>('#entity-panel')!;
            const selectionKey = this.shared.selection ? this.shared.selection.kind + ':' + this.shared.selection.id : '';
            const sameSelection = selectionKey === this.lastPanelSelection;
            // Ticks retain the user's panel preference; a new selection brings its actions back.
            if (selectionKey && !sameSelection)
                showManagement(true);
            const preserved = new Set(Array.from(panel.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input,select'))
                .filter(field => sameSelection && (this.session.running || field === document.activeElement)).map(field => field.id));
            const resident = this.shared.selection?.kind === 'persona' ?
                view.entities.find(entity => entity.kind === 'persona' && entity.id === this.shared.selection!.id) : undefined;
            let residentProfile = '';
            if (resident?.dna) {
                const content = document.createElement('section');
                content.id = 'fjord-resident-profile';
                renderCharacterProfile(content, resident.dna, resident.label, resident.id);
                content.querySelector('.profile-close')?.remove();
                content.querySelector('.profile-eyebrow')?.remove();
                residentProfile = '<details data-view-key="resident-profile"><summary>Character traits &amp; heritage</summary>' +
                    content.outerHTML + '</details>';
            }
            updateView(panel, this.panels.render(this.session.readSnapshot(), this.shared.selection, personalHistory.render()) +
                residentProfile + '<button data-action="clear">Clear selection</button>', preserved);
            this.lastPanelSelection = selectionKey;
            updateManagementAvailability(panel, this.shared);
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
        document.querySelector('#fjord-next')!.addEventListener('click', () => action(() => this.session.command({ type: 'AdvanceWinter' })));
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
                if (world)
                    await rebuildWorld();
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
                if (world)
                    await rebuildWorld();
                say('Campaign imported, paused.');
            });
        });
        const startNewCampaign = (restart: boolean) => {
            const previousPace = this.session.pacing();
            const wasRunning = previousPace.running;
            this.foundingBook?.dispose();
            const completeAutoStart = beginAutoStart();
            action(async () => {
                // Legacy saves keep their existing restart and geography policy.
                // Only current island campaigns use the new generation introduction.
                if (restart && !campaignIslandPlan(this.campaign.blueprint)) {
                    say('Restarting campaign…');
                    this.shared.restart(sameFounders.checked, weatherField.checked, foundingPhase);
                    resetProduction();
                    campaignFields();
                    if (world) await rebuildWorld();
                    completeAutoStart();
                    say('Campaign restarted.');
                    return;
                }
                const backup = this.campaign.exportJSON();
                let loading: IslandLoading | undefined;
                controller.enabled = false;
                drawingReady = false;
                sceneLoads++;
                try {
                    const proposal = new GameplaySession();
                    if (restart) {
                        proposal.loadJSON(this.session.saveJSON());
                        proposal.restartCampaign(sameFounders.checked, undefined, weatherField.checked, undefined, foundingPhase);
                    } else proposal.newCampaign(Number(seedField.value), weatherField.checked, true, foundingPhase, calendarMode ?? (birthdayCalendarMode(this.session.readSnapshot())));
                    this.foundingBook = new FoundingBookWindow(proposal.book.snapshot().chapters[0]);
                    proposal.book.notifyPending();
                    loading = this.loading = new IslandLoading(true, this.foundingBook);
                    await loading.prepare(proposal.snapshot().seed);
                    loading.check();
                    this.campaign.startCampaign(proposal, 'island-pool-v1');
                    resetProduction();
                    campaignFields();
                    await rebuildWorld();
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
                    if (committed && !this.stopped) await rebuildWorld();
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
                }
            });
        };
        document.querySelector('#fjord-restart')!.addEventListener('click', () => startNewCampaign(true));
        document.querySelector('#fjord-new')!.addEventListener('click', () => startNewCampaign(false));
        const select = (kind: string, id: string) => {
            showManagement(true);
            this.shared.select({ kind: kind as EntityKind, id });
            const entity = this.campaign.readProjection().entities.find(e => e.kind === kind && e.id === id);
            document.querySelector('#fjord-selected')!.textContent = entity ? entity.label + ' · ' + kind : 'Entity is no longer active.';
            refresh();
        };
        const panelRoot = document.querySelector<HTMLElement>('#entity-panel')!;
        panelRoot.addEventListener('change', () => updateManagementAvailability(panelRoot, this.shared));
        panelRoot.addEventListener('click', event => {
            const button = (event.target as Element).closest<HTMLButtonElement>('button');
            if (!button || button.disabled)
                return;
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
            if (command)
                action(async () => {
                    this.shared.command(command);
                    if (syncScene)
                        await syncScene();
                    say('Action completed.');
                });
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
        const scene = new Scene(), camera = new PerspectiveCamera(45, 1, .1, 2400);
        const renderer = createRenderer(canvas);
        renderer.setPixelRatio(1);
        const controller = new RTSCameraController(camera, canvas, 'pan');
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
            await renderer.compileAsync(scene, camera);
            check();
        };
        let observer: ResizeObserver | undefined;
        let lighting: WorldLighting | undefined;
        let weatherTint: SeasonTint | undefined;
        let campfireEffect: CampfireEffect | undefined;
        let precipitationEffect: PrecipitationEffect | undefined;
        const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
        const configureEffects = () => {
            const quality = document.querySelector<HTMLSelectElement>('#fjord-effects')!.value as EffectQuality;
            campfireEffect?.configure(quality, reducedMotion.matches);
            precipitationEffect?.configure(quality, reducedMotion.matches);
        };
        reducedMotion.addEventListener('change', configureEffects);
        document.querySelector('#fjord-effects')!.addEventListener('change', configureEffects);
        let weatherSignature = "";
        this.disposeScene = () => {
            this.loading?.cancel();
            this.loading?.finish();
            this.stopped = true;
            trace.record('scene-disposed');
            trace.dispose();
            lifecycleEvents.abort();
            contextEpoch++;
            contextPanel?.remove();
            screenAwake.dispose();
            header.dispose();
            bookReader.dispose();
            this.foundingBook?.dispose();
            personalHistory.dispose();
            setPlayback(false);
            clearInterval(timer);
            renderer.setAnimationLoop(null);
            observer?.disconnect();
            controller.dispose();
            reducedMotion.removeEventListener('change', configureEffects);
            layer?.dispose();
            models?.dispose();
            weatherTint?.dispose();
            campfireEffect?.dispose();
            precipitationEffect?.dispose();
            world?.dispose();
            assets?.dispose();
            lighting?.dispose();
            renderer.dispose();
        };
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
                        location.reload();
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
        assets = new AssetManager();
        if (this.loading) await this.loading.measure('assets-fetch-decode', () => assets!.loadForSimulation());
        else await assets.loadForSimulation();
        this.loading?.check();
        if (this.stopped) {
            assets.dispose();
            return;
        }
        models = new FjordModels(assets);
        layer = new FjordEntities(models);
        scene.add(layer.root);
        const cleared = new Set<string>();
        let groundSignature = "";
        let arrivalPose: { position: number[]; target: number[] };
        const rebuildWorld = async (): Promise<void> => {
            sceneLoads++;
            try {
                const blueprint = this.campaign.blueprint;
                const revision = ++this.worldRevision;
                trace.record('scene-build');
                const next = await createWorld(assets!, { mode: 'generated', blueprint,
                    settlement: 'canonical', quality: document.querySelector<HTMLSelectElement>('#fjord-quality')!.value as 'low' | 'standard',
                    anisotropy: renderer.capabilities.getMaxAnisotropy(),
                    preparation: async (stage, operation) => {
                        if (this.loading) return this.loading.measure(stage, operation);
                        await yieldForInput();
                        return operation();
                    } });
                if (this.loading?.signal.aborted) { next.dispose(); this.loading.check(); }
                if (this.stopped || this.shared.transferring || revision !== this.worldRevision) {
                    next.dispose();
                    return;
                }
                if (blueprint !== this.campaign.blueprint) {
                    next.dispose();
                    return rebuildWorld();
                }
                const anchor = next.attachments.find(item => item.key === 'boat')!;
                this.campaign.setMooring({ x: anchor.x, y: anchor.y, z: anchor.z, rotation: anchor.rotation, scale: 1 });
                weatherTint?.dispose();
                campfireEffect?.dispose();
                precipitationEffect?.dispose();
                world?.dispose();
                world = next;
                const fire = this.campaign.readProjection().campfire;
                const firePosition = new Vector3(fire.transform.x, fire.transform.y, fire.transform.z);
                next.clearPlot({ ...fire.transform, halfWidth: fire.clearingRadius,
                    halfDepth: fire.clearingRadius, futureAsset: 'hut' });
                const fireState = inspectCampfire(this.session.readSnapshot());
                campfireEffect = new CampfireEffect(fire.id, firePosition.clone().add(new Vector3(0, .9, 0)),
                    this.session.readSnapshot().seed, fireState.lit);
                precipitationEffect = new PrecipitationEffect(this.session.readSnapshot().seed,
                    (x, z) => Math.max(blueprint.waterLevel, next.movement.heightAt(x, z)));
                scene.add(precipitationEffect.root);
                configureEffects();
                scene.add(campfireEffect.root);
                layer!.setCampfireHeat(campfireEffect.inspect().heat);
                weatherTint = new SeasonTint(next.root, next.terrain);
                weatherSignature = "";
                scene.add(next.root);
                cleared.clear();
                motion = new LivingWorldController(this.campaign.blueprint);
                groundSignature = "";
                lighting?.dispose();
                lighting = new WorldLighting(scene, renderer, assets!, firePosition, next.center, document.querySelector<HTMLSelectElement>('#fjord-quality')!.value as 'low' | 'standard');
                if (syncScene)
                    await syncScene();
                controller.setNavigationSurface(next.terrain, next.center, blueprint.terrain.bounds, next.movement.heightAt,
                    { terrain: blueprint.terrain, waterLevel: blueprint.waterLevel });
                // Arrive at the settlement nucleus, not at a fit-all bounding box.
                arrivalPose = {
                    position: [firePosition.x + 28, firePosition.y + 31, firePosition.z - 32],
                    target: [firePosition.x, firePosition.y + 1, firePosition.z],
                };
                controller.setView(restoredCamera ?? arrivalPose);
                restoredCamera = undefined;
            } finally {
                sceneLoads--;
                previous = performance.now();
            }
        };
        await rebuildWorld();
        if (this.stopped || this.shared.transferring)
            return;
        syncScene = () => {
            if (this.stopped || this.shared.transferring)
                return Promise.resolve();
            this.queued = true;
            if (sceneWork)
                return sceneWork;
            sceneLoads++;
            sceneWork = (async () => {
                do {
                    this.queued = false;
                    // Keep one immutable revision through asynchronous model work. A queued revision
                    // acquires a new pair on the next pass instead of mixing new facts into this scene.
                    const state = this.session.readSnapshot();
                    const view = this.campaign.readProjection();
                    const sceneCanonicalTime = 'Canonical time: Winter ' + view.time.winter +
                        ' · tick ' + view.time.tick + '/' + state.ticksPerWinter;
                    precipitationEffect!.setWeather(view.precipitation);
                    canvas.dataset.precipitation = JSON.stringify(precipitationEffect!.inspect());
                    const nextWeather = JSON.stringify([view.calendar.visualProgress, view.weatherVisual]);
                    if (nextWeather !== weatherSignature) {
                        lighting!.setSeason(view.calendar.visualProgress, view.weatherVisual.lighting);
                        weatherTint!.update(view.calendar.visualProgress);
                        layer!.setSeason(view.calendar.visualProgress);
                        weatherSignature = nextWeather;
                        canvas.dataset.seasonMaterials = JSON.stringify(weatherTint!.inspect());
                        canvas.dataset.weather = JSON.stringify({ ...view.weatherVisual, observed: {
                            sky: lighting!.skyColor.getHex(), fogNear: lighting!.fog.near, fogFar: lighting!.fog.far,
                            sunIntensity: lighting!.directional.intensity, ambient: lighting!.ambient.intensity,
                            exposure: renderer.toneMappingExposure
                        } });
                    }
                    const grassPlots = view.entities.filter(e => e.kind === 'household' && e.plot).map(e => e.plot!);
                    const signature = JSON.stringify([view.ground, grassPlots]);
                    if (signature !== groundSignature) {
                        const weights = fjordGroundWeights(this.campaign.blueprint, view.ground, grassPlots);
                        if (this.loading) {
                            await this.loading.measure('initial-ground-wear',
                                () => world!.prepareGroundWeights(weights));
                        } else world!.setGroundWeights(weights);
                        canvas.dataset.ground = JSON.stringify({ plots: view.ground.plots.map(p => p.id),
                            paths: view.ground.paths, soilSamples: weights.filter(w => w > 0).length });
                        for (const path of view.ground.paths)
                            for (const p of path.points)
                                world!.clearPlot({ ...p, halfWidth: 1.5, halfDepth: 1.5, futureAsset: 'hut' });
                        groundSignature = signature;
                    }
                    for (const [id, plot] of Object.entries(view.layout.plots))
                        if (!cleared.has(id)) {
                            world!.clearPlot({ ...plot, futureAsset: 'hut' });
                            cleared.add(id);
                        }
                    for (const entity of view.entities)
                        if (entity.transform &&
                            (entity.kind === 'persona' || entity.kind === 'cattle')) {
                            const pointKey = entity.selectionKey + '@' + entity.transform.x + ',' + entity.transform.z;
                            if (!cleared.has(pointKey)) {
                                world!.clearPlot({ ...entity.transform, halfWidth: 1, halfDepth: 1, futureAsset: 'hut' });
                                cleared.add(pointKey);
                            }
                        }
                    sceneEntities = view.entities;
                    await layer!.sync(view.entities, this.loading ? yieldForInput : undefined);
                    campfireEffect!.setLit(inspectCampfire(state).lit);
                    layer!.setCampfireHeat(campfireEffect!.inspect().heat);
                    const fireBounds = layer!.bounds('campfire:settlement-campfire')!;
                    canvas.dataset.campfire = JSON.stringify({ ...view.campfire,
                        placeholder: layer!.describe().find(e => e.kind === 'campfire')!.placeholder,
                        width: fireBounds.max.x - fireBounds.min.x, bounds: fireBounds });
                    canvas.dataset.structureSnow = JSON.stringify(layer!.inspectSeason());
                    canvas.dataset.campfireEffect = JSON.stringify(campfireEffect!.inspect());
                    motion!.reconcile(view.entities, view.ground);
                    const trees = this.loading
                        ? await this.loading.measure('standing-tree-targets', () => world!.standingTrees())
                        : world!.standingTrees();
                    motion!.setStandingTrees(trees);
                    layer!.configureMotion(motion!);
                    layer!.advance(motion!, 0, false);
                    if (this.stopped || this.shared.transferring)
                        return;
                    highlight(state, view);
                    const rendered = layer!.describe();
                    productionLabels.setAnchors(rendered);
                    canvas.dataset.rendered = JSON.stringify(rendered);
                    canvas.dataset.environment = JSON.stringify(world!.describe());
                    document.querySelector('#fjord-diagnostics')!.textContent = [...view.diagnostics,
                        ...assets!.diagnostics, ...models!.diagnostics, ...motion!.diagnostics,
                        sceneCanonicalTime,
                        'Reused FjordSide DNA, Talk/Listen and authored cattle activities; missing clip capabilities remain disabled.',
                        'Ambient motion is presentation only. Young children and active caregivers stay indoors.',
                        'Geography: ' + view.layout.geographyId].join('\n');
                } while (this.queued && !this.stopped);
            })().finally(() => {
                sceneLoads--;
                previous = performance.now();
                sceneWork = undefined;
            });
            return sceneWork;
        };
        if (this.loading) await this.loading.measure('initial-character-scene-sync', syncScene);
        else await syncScene();
        if (this.stopped || this.shared.transferring)
            return;
        document.querySelector('#fjord-quality')!.addEventListener('change', event => {
            const quality = (event.target as HTMLSelectElement).value as 'low' | 'standard';
            world!.setQuality(quality);
            lighting!.setQuality(quality);
            renderer.setPixelRatio(Math.min(devicePixelRatio, quality === 'low' ? 1 : 1.5));
        });
        controller.setSelectionHandler((x, y, pointerType) => {
            const selected = layer!.pick(camera, x, y, canvas.getBoundingClientRect(), pointerType);
            if (!selected) {
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
        const resize = () => {
            const rect = canvas.getBoundingClientRect();
            renderer.setSize(rect.width, rect.height, false);
            camera.aspect = rect.width / Math.max(1, rect.height);
            camera.updateProjectionMatrix();
        };
        observer = new ResizeObserver(resize);
        observer.observe(canvas);
        resize();
        const clock = new Clock();
        resetFrameTime = () => { previous = performance.now(); clock.start(); };
        let time = 0;
        let cameraSignature = '';
        let lastDiagnostics = 0, activeTime = 0, lastFrameMs = 0;
        // Public camera diagnostics let visual QA locate objects before exercising real pointer picking.
        renderer.setAnimationLoop(() => {
            if (!drawingReady || pageSuspended || contextLost || document.hidden) return;
            const frameStarted = performance.now();
            const elapsed = clock.getDelta(), delta = Math.min(elapsed, .1);
            time += delta;
            controller.update(delta);
            camera.updateMatrixWorld();
            const running = this.session.running && canAdvance();
            const motionDelta = Math.min(elapsed, 1);
            if (running) activeTime += motionDelta;
            motion!.advance(motionDelta, running, !document.hidden);
            layer!.advance(motion!, motionDelta, running);
            campfireEffect!.update(delta, running && !document.hidden);
            precipitationEffect!.update(delta, running && !document.hidden, controller.focus, camera.position);
            const fireVisual = campfireEffect!.inspect();
            layer!.setCampfireHeat(fireVisual.heat);
            lighting!.setCampfire(fireVisual.lit && fireVisual.quality !== 'off', fireVisual.time, fireVisual.reducedMotion);
            layer!.select(liveMarkers);
            selectionLabels.setAnchors(layer!.root.userData.markers ?? []);
            productionLabels.setAnchors(layer!.productionAnchors());
            if (performance.now() - lastDiagnostics > 500) {
                canvas.dataset.rendered = JSON.stringify(layer!.describe());
                canvas.dataset.stability = JSON.stringify({
                    ...motion!.inspectMetrics(), ...models!.inspectResources(),
                    lastFrameMs, drawCalls: renderer.info.render.calls,
                    triangles: renderer.info.render.triangles,
                    geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures
                });
                canvas.dataset.motion = JSON.stringify(motion!.inspect());
                canvas.dataset.campfireEffect = JSON.stringify(fireVisual);
                canvas.dataset.precipitation = JSON.stringify(precipitationEffect!.inspect());
                canvas.dataset.structureSnow = JSON.stringify(layer!.inspectSeason());
                canvas.dataset.motionTime = String(activeTime);
                canvas.dataset.cameraClearance = JSON.stringify(controller.inspectClearance());
                canvas.dataset.markers = JSON.stringify(layer!.root.userData.markers ?? []);
                lastDiagnostics = performance.now();
            }
            selectionLabels.update(camera, canvas.clientWidth, canvas.clientHeight);
            productionLabels.update(camera, canvas.clientWidth, canvas.clientHeight);
            const signature = JSON.stringify({ world: camera.matrixWorld.toArray(),
                projection: camera.projectionMatrix.toArray() });
            if (signature !== cameraSignature) {
                cameraSignature = signature;
                canvas.dataset.camera = signature;
                canvas.dataset.cameraClearance = JSON.stringify(controller.inspectClearance());
            }
            lighting!.update(time, calendar.visualProgress);
            if (campaignIslandPlan(this.campaign.blueprint)) {
                // A wider village needs a higher camera. Keep atmospheric distance
                // relative to its focus, so zooming out cannot whiten the entire settlement.
                const offset = Math.max(0, camera.position.distanceTo(controller.focus) - 60);
                lighting!.fog.near += offset;
                lighting!.fog.far += offset;
            }
            world!.update(time, lighting, camera);
            renderer.render(scene, camera);
            lastFrameMs = performance.now() - frameStarted;
        });
        const prepareGpu = async (loading: Pick<IslandLoading, 'stage' | 'measure' | 'check'>) => {
            loading.stage('Preparing FjordSide');
            const textures = new Set<Texture>();
            scene.traverse(node => {
                if (!(node instanceof Mesh)) return;
                for (const material of Array.isArray(node.material) ? node.material : [node.material])
                    for (const value of Object.values(material)) if (value instanceof Texture) textures.add(value);
            });
            await loading.measure('texture-upload', async () => {
                for (const texture of textures) {
                    loading.check();
                    renderer.initTexture(texture);
                    await yieldForInput();
                }
            });
            await loading.measure('shader-compilation', () => renderer.compileAsync(scene, camera));
            await loading.measure('initial-gpu-upload-and-draws', async () => {
                const meshes: Mesh[] = [];
                scene.traverseVisible(node => { if (node instanceof Mesh) meshes.push(node); });
                for (const mesh of meshes) mesh.visible = false;
                try {
                    // Upload native geometry and first-use shadow programs in separate input turns.
                    // The opaque preview covers these preparation draws; final scene quality is unchanged.
                    for (const mesh of meshes) {
                        loading.check();
                        mesh.visible = true;
                        renderer.render(scene, camera);
                        mesh.visible = false;
                        await yieldForInput();
                    }
                } finally { for (const mesh of meshes) mesh.visible = true; }
                renderer.render(scene, camera);
            });
            loading.check();
        };
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
            await loading.arrive(controller, this.campaign.blueprint, arrivalPose, world!.movement.heightAt);
            canvas.dataset.loading = JSON.stringify(loading.evidence);
        };
        if (this.loading) {
            await finishArrival(this.loading);
            this.foundingBook?.release();
            this.loading.finish();
            this.loading = undefined;
        }
        controller.enabled = true;
        drawingReady = true;
        // Start only after assets are ready; scene loading contributes no campaign time.
        sceneLoads--;
        initialAutoStart?.();
        refresh();
        canvas.dataset.ready = 'true';
        trace.record('scene-ready');
        previous = performance.now();
        timer = window.setInterval(tickClock, 500);
        document.querySelector<HTMLButtonElement>('#fjord-export')!.disabled = false;
        say('Fjord ready. Desktop: left-click to select (empty ground clears selection), left-drag to pan, right-drag to rotate, wheel to zoom. Touch: tap empty ground to navigate, drag to rotate, pinch to zoom.');
    }
}
