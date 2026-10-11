import { LivingWorldController } from './LivingWorldController';
import { FjordCharacterProfile } from './FjordCharacterProfile';
import type { FjordEntity } from './FjordProjection';
import { SelectionLabels } from './SelectionLabels';
import { ProductionLabels } from './ProductionLabels';
import { FjordProduction } from './FjordProduction';
import type { SelectionLabel } from './SelectionLabels';
import './fjord-play.css';
import { Clock, Object3D, PerspectiveCamera, Raycaster, Scene, Vector2 } from 'three';
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
import { inspectWeatherExposure } from '../simulation/SimulationCore';
import { FjordModels } from './FjordModels';
import { FjordEntities } from './FjordEntities';
import { fjordGroundWeights } from './FjordGround';
const escape = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));
export class FjordPlay {
    private opened = openSettlement('fjord', Number(new URLSearchParams(location.search).get('seed') ?? 32));
    private shared = this.opened.campaign;
    private session = this.shared.session;
    private campaign = this.shared.fjord;
    private panels = new SettlementPanel();
    private stopped = false;
    private queued = false;
    private lastPanelSelection = '';
    private worldRevision = 0;
    async start() {
        document.title = 'Pillagers · Fjord settlement';
        document.body.className = 'fjord-play';
        document.body.innerHTML = `<main id="fjord-play"><header><h1>Pillagers · Fjord settlement</h1>
            <nav><a href="/play" data-settlement-view="board">2D Settlement</a> · <a href="/gameplay-lab">Gameplay Lab</a> · <a href="/">Fjord prototype</a></nav>
            <div class="fjord-controls"><strong id="fjord-winter"></strong><span id="fjord-stocks"></span>
            <button id="fjord-run">Start</button><button id="fjord-next">+1 Winter</button><label>Cycle<select id="fjord-cycle"><option value="1">1 min / Winter</option><option value="3">3 min / Winter</option><option value="5">5 min / Winter</option></select></label>
            <label>Quality<select id="fjord-quality"><option value="low">Low</option><option value="standard">Standard</option></select></label>
            <details><summary>Campaign</summary><div class="fjord-settings">
            <button id="fjord-save">Save locally</button><button id="fjord-load">Load locally</button>
            <button id="fjord-export" disabled>Export Fjord campaign</button><button id="fjord-export-core">Export canonical JSON</button>
            <label>Import campaign<input id="fjord-import" type="file" accept="application/json,.json"></label>
            <label>Seed<input id="fjord-seed" type="number" min="0" max="4294967295"></label>
            <label class="check"><input id="fjord-weather" type="checkbox"> Enable winter weather</label>
            <label class="check"><input id="fjord-founders" type="checkbox" checked> Use the same founders</label>
            <button id="fjord-new">New campaign from seed</button><button id="fjord-restart">Restart with same founders</button>
            <p>The clock starts when opening or restarting the Fjord. Explicit load/import pauses it. Switching 2D/3D retains your clock setting.</p>
            </div></details></div></header><section class="fjord-stage"><canvas id="fjord-canvas" aria-label="Canonical Fjord settlement"></canvas><svg id="fjord-selection-leaders" aria-hidden="true"></svg><div id="fjord-selection-labels" aria-hidden="true"></div><div id="fjord-production-labels" aria-label="Resident production feedback"></div>
            <aside><section id="fjord-weather-information" aria-label="Winter forecast"></section><details><summary>Settlement identities</summary><ul id="fjord-identities"></ul></details>

            <p id="fjord-selected">Select an entity on the board or in the list.</p><section id="entity-panel" aria-label="Settlement management"></section><details><summary>Clan Chronicle</summary><div id="fjord-chronicle"></div></details><details><summary>Developer diagnostics</summary><pre id="fjord-diagnostics"></pre></details></aside></section>
            <footer><p id="fjord-notice" role="status">Loading the Fjord. Simulation controls remain available.</p></footer></main>`;
        const canvas = document.querySelector<HTMLCanvasElement>('#fjord-canvas')!;
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
            seedField.value = String(this.session.snapshot().seed);
            weatherField.checked = this.session.snapshot().weather?.config.enabled ?? false;
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
        bindViewSwitch(document.querySelector('#fjord-play')!, this.shared, say);
        const persist = () => persistSettlement(this.shared, say);
        let clockIntent = 0;
        let previous = performance.now();
        let sceneLoads = 1; // Initial assets and models must finish before active time can advance.
        const ownsClock = () => !document.hidden && !this.stopped && !this.shared.transferring;
        const canAdvance = () => ownsClock() && sceneLoads === 0;
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
        let motion: LivingWorldController | undefined, profile: FjordCharacterProfile | undefined;
        let liveMarkers: ReturnType<typeof this.shared.selectionPresentation> = [];
        let sceneEntities: readonly FjordEntity[] = [];
        let syncScene: (() => Promise<void>) | undefined;
        let sceneWork: Promise<void> | undefined;
        const selectionLabels = new SelectionLabels(document.querySelector<HTMLElement>('#fjord-selection-labels')!,
            document.querySelector<SVGSVGElement>('#fjord-selection-leaders')!);
        const production = new FjordProduction(this.session.snapshot().events);
        const productionLabels = new ProductionLabels(document.querySelector<HTMLElement>('#fjord-production-labels')!);
        const resetProduction = () => {
            production.reset(this.session.snapshot().events);
            productionLabels.reset();
        };
        const highlight = () => {
            liveMarkers = this.shared.selectionPresentation();
            layer?.select(liveMarkers);
            const selected = this.shared.selection;
            profile?.select(sceneEntities.find(e => e.kind === selected?.kind && e.id === selected?.id));
            canvas.dataset.highlight = JSON.stringify(layer?.root.userData.selection ?? null);
            const markers = (layer?.root.userData.markers ?? []) as SelectionLabel[];
            canvas.dataset.markers = JSON.stringify(markers);
            selectionLabels.sync(markers);
        };
        const refresh = () => {
            const view = this.campaign.project();
            document.querySelector('#fjord-winter')!.textContent = 'Winter ' + view.time.winter + ' · tick ' + view.time.tick;
            const state = this.session.snapshot();
            productionLabels.enqueue(production.read(state.events));
            document.querySelector('#fjord-stocks')!.textContent = 'Food ' + view.stocks.food + ' · Materials ' +
                view.stocks.materials + ' · ' + Object.values(state.personas).filter(p => p.deathWinter === null).length +
                ' residents · ' + view.entities.filter(e => e.kind === 'cattle').length + ' cattle · ' +
                (view.weather.class ?? 'Weather disabled');
            document.querySelector('#fjord-chronicle')!.innerHTML = projectChronicle(state.events, state.time.winter)
                .slice(0, 10).map(w => '<h3>Winter ' + w.winter + '</h3>' +
                w.entries.map(e => '<p>' + escape(e.text) + '</p>').join('')).join('');
            const profile = view.weather.enabled ? view.weather.modifiers : null;
            const exposure = inspectWeatherExposure(state);
            const forecast = profile ? '<strong>Winter ' + view.time.winter + ' · ' + view.weather.class + '</strong>' +
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
            const identities = view.entities.map(e => `<li><button data-kind="${e.kind}" data-id="${escape(e.id)}">${escape(e.label)}</button> · ${e.status.level !== undefined ? 'level ' + e.status.level : e.status.stage ?? e.kind}</li>`).join('');
            const list = document.querySelector('#fjord-identities')!;
            if (list.innerHTML !== identities)
                list.innerHTML = identities;
            document.querySelector('#fjord-diagnostics')!.textContent = [...view.diagnostics,
                ...(assets?.diagnostics ?? []), ...(models?.diagnostics ?? []),
                'Shared static human body; unique clothing, hair and DNA appearance are outside this slice.',
                'Geography: ' + view.layout.geographyId].join('\n');
            canvas.dataset.entities = JSON.stringify(view.entities);
            canvas.dataset.layoutIdentity = view.layout.geographyId;
            persist();
            if (layer && syncScene)
                void syncScene().catch(error => say('Presentation update failed: ' + String(error)));
            const panel = document.querySelector<HTMLElement>('#entity-panel')!;
            const selectionKey = this.shared.selection ? this.shared.selection.kind + ':' + this.shared.selection.id : '';
            const sameSelection = selectionKey === this.lastPanelSelection;
            const preserved = new Set(Array.from(panel.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input,select'))
                .filter(field => sameSelection && (this.session.running || field === document.activeElement)).map(field => field.id));
            updateView(panel, this.panels.render(this.session.snapshot(), this.shared.selection) +
                '<button data-action="clear">Clear selection</button>', preserved);
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
        document.querySelector('#fjord-export')!.addEventListener('click', () => download(this.campaign.exportJSON(), 'pillagers-fjord.json'));
        document.querySelector('#fjord-export-core')!.addEventListener('click', () => download(this.session.saveJSON(), 'pillagers-campaign.json'));
        document.querySelector('#fjord-import')!.addEventListener('change', event => {
            const input = event.target as HTMLInputElement, file = input.files?.[0];
            if (!file)
                return;
            setPlayback(false);
            action(async () => {
                say('Importing campaign…');
                this.shared.importJSON(await file.text());
                resetProduction();
                campaignFields();
                input.value = '';
                if (world)
                    await rebuildWorld();
                say('Campaign imported, paused.');
            });
        });
        document.querySelector('#fjord-restart')!.addEventListener('click', () => {
            const completeAutoStart = beginAutoStart();
            action(async () => {
                say('Restarting campaign…');
                this.shared.restart(sameFounders.checked, weatherField.checked);
                resetProduction();
                campaignFields();
                if (world)
                    await rebuildWorld();
                completeAutoStart();
                say('Campaign restarted.');
            });
        });
        document.querySelector('#fjord-new')!.addEventListener('click', () => {
            const completeAutoStart = beginAutoStart();
            action(async () => {
                say('Creating campaign…');
                this.shared.newCampaign(Number(seedField.value), weatherField.checked);
                resetProduction();
                campaignFields();
                if (world)
                    await rebuildWorld();
                completeAutoStart();
                say('New campaign created.');
            });
        });
        const select = (kind: string, id: string) => {
            profile?.reopen();
            this.shared.select({ kind: kind as EntityKind, id });
            const entity = this.campaign.project().entities.find(e => e.kind === kind && e.id === id);
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
            if (document.hidden) {
                setPlayback(false);
                refresh();
            }
            previous = performance.now();
        });
        const scene = new Scene(), camera = new PerspectiveCamera(45, 1, .1, 400);
        const renderer = createRenderer(canvas);
        renderer.setPixelRatio(1);
        const controller = new RTSCameraController(camera, canvas, 'rotate');
        let observer: ResizeObserver | undefined;
        let lighting: WorldLighting | undefined;
        let weatherTint: SeasonTint | undefined;
        let weatherSignature = "";
        window.addEventListener('pagehide', () => {
            this.stopped = true;
            setPlayback(false);
            clearInterval(timer);
            renderer.setAnimationLoop(null);
            observer?.disconnect();
            controller.dispose();
            profile?.dispose();
            layer?.dispose();
            models?.dispose();
            weatherTint?.dispose();
            world?.dispose();
            assets?.dispose();
            lighting?.dispose();
            renderer.dispose();
        }, { once: true });
        assets = new AssetManager();
        await assets.loadForSimulation();
        if (this.stopped) {
            assets.dispose();
            return;
        }
        models = new FjordModels(assets);
        layer = new FjordEntities(models);
        scene.add(layer.root);
        profile = new FjordCharacterProfile(camera, canvas);
        const cleared = new Set<string>();
        let groundSignature = "";
        const rebuildWorld = async (): Promise<void> => {
            sceneLoads++;
            try {
                const blueprint = this.campaign.blueprint;
                const revision = ++this.worldRevision;
                const next = await createWorld(assets!, { mode: 'generated', blueprint,
                    settlement: 'canonical', quality: document.querySelector<HTMLSelectElement>('#fjord-quality')!.value as 'low' | 'standard',
                    anisotropy: renderer.capabilities.getMaxAnisotropy() });
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
                world?.dispose();
                world = next;
                weatherTint = new SeasonTint(next.root, next.terrain);
                weatherSignature = "";
                scene.add(next.root);
                cleared.clear();
                motion = new LivingWorldController(this.campaign.blueprint);
                groundSignature = "";
                lighting?.dispose();
                lighting = new WorldLighting(scene, renderer, assets!, next.hearth, next.center, document.querySelector<HTMLSelectElement>('#fjord-quality')!.value as 'low' | 'standard');
                if (syncScene)
                    await syncScene();
                controller.setNavigationSurface(next.terrain, next.center, this.campaign.blueprint.terrain.bounds, next.movement.heightAt);
                const view = this.campaign.project(), positions = view.entities.map(e => e.transform).filter(p => p !== null);
                if (!positions.length)
                    positions.push({ x: next.center.x, y: next.center.y, z: next.center.z, rotation: 0, scale: 1 });
                const minX = Math.min(...positions.map(p => p.x)), maxX = Math.max(...positions.map(p => p.x));
                const minZ = Math.min(...positions.map(p => p.z)), maxZ = Math.max(...positions.map(p => p.z));
                const x = (minX + maxX) / 2, z = (minZ + maxZ) / 2;
                const span = Math.max(maxX - minX, maxZ - minZ, 40) + 16;
                controller.setView({ position: [x + span * .6, span * .75, z - span * .65], target: [x, 2.6, z] });
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
            sceneWork = (async () => {
                do {
                    this.queued = false;
                    const view = this.campaign.project();
                    const nextWeather = JSON.stringify(view.weatherVisual);
                    if (nextWeather !== weatherSignature) {
                        lighting!.setMode('day', view.weatherVisual.lighting);
                        weatherTint!.setWinter(view.weatherVisual.snow);
                        weatherSignature = nextWeather;
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
                        world!.setGroundWeights(weights);
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
                    await layer!.sync(view.entities);
                    motion!.reconcile(view.entities, view.ground);
                    layer!.configureMotion(motion!);
                    layer!.advance(motion!, 0, false);
                    if (this.stopped || this.shared.transferring)
                        return;
                    highlight();
                    const rendered = layer!.describe();
                    productionLabels.setAnchors(rendered);
                    canvas.dataset.rendered = JSON.stringify(rendered);
                    canvas.dataset.environment = JSON.stringify(world!.describe());
                    document.querySelector('#fjord-diagnostics')!.textContent = [...view.diagnostics,
                        ...assets!.diagnostics, ...models!.diagnostics,
                        'Verified Fjordside DNA body and source Idle/Walk clips; clothing and hair remain unequipped.',
                        'Ambient motion is presentation only. Young children and active caregivers stay indoors.',
                        'Geography: ' + view.layout.geographyId].join('\n');
                } while (this.queued && !this.stopped);
            })().finally(() => {
                sceneWork = undefined;
            });
            return sceneWork;
        };
        await syncScene();
        if (this.stopped || this.shared.transferring)
            return;
        // Start only after assets are ready; scene loading contributes no campaign time.
        sceneLoads--;
        initialAutoStart?.();
        refresh();
        canvas.dataset.ready = 'true';
        previous = performance.now();
        timer = window.setInterval(tickClock, 500);
        document.querySelector<HTMLButtonElement>('#fjord-export')!.disabled = false;
        say('Fjord ready. Select a home, resident or animal to manage it. Click or tap empty ground to navigate. Drag to rotate. Pinch to zoom out; spread to zoom in.');
        document.querySelector('#fjord-quality')!.addEventListener('change', event => {
            const quality = (event.target as HTMLSelectElement).value as 'low' | 'standard';
            world!.setQuality(quality);
            lighting!.setQuality(quality);
            renderer.setPixelRatio(Math.min(devicePixelRatio, quality === 'low' ? 1 : 1.5));
        });
        controller.setSelectionHandler((x, y) => {
            const rect = canvas.getBoundingClientRect(), ray = new Raycaster();
            ray.setFromCamera(new Vector2((x - rect.left) / rect.width * 2 - 1, -(y - rect.top) / rect.height * 2 + 1), camera);
            const hit = ray.intersectObject(layer!.root, true)[0];
            let node: Object3D | null = hit?.object ?? null;
            while (node && !node.userData.canonical)
                node = node.parent;
            if (!node) {
                this.shared.select(null);
                refresh();
                return false;
            }
            select(node.userData.canonical.kind, node.userData.canonical.id);
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
        let time = 0;
        let cameraSignature = '';
        let lastDiagnostics = 0, activeTime = 0;
        // Public camera diagnostics let visual QA locate objects before exercising real pointer picking.
        renderer.setAnimationLoop(() => {
            const elapsed = clock.getDelta(), delta = Math.min(elapsed, .1);
            time += delta;
            controller.update(delta);
            camera.updateMatrixWorld();
            const running = this.session.running && canAdvance();
            const motionDelta = Math.min(elapsed, 1);
            if (running) activeTime += motionDelta;
            motion!.advance(motionDelta, running, !document.hidden);
            layer!.advance(motion!, motionDelta, running);
            layer!.select(liveMarkers);
            selectionLabels.setAnchors(layer!.root.userData.markers ?? []);
            const rendered = layer!.describe();
            productionLabels.setAnchors(rendered);
            profile!.update(this.shared.selection?.kind === 'persona' ? layer!.bounds('persona:' + this.shared.selection.id) : undefined);
            if (performance.now() - lastDiagnostics > 500) {
                canvas.dataset.rendered = JSON.stringify(rendered);
                canvas.dataset.motion = JSON.stringify(motion!.inspect());
                canvas.dataset.motionTime = String(activeTime);
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
            }
            lighting!.update(time);
            world!.update(time, lighting, camera);
            renderer.render(scene, camera);
        });
    }
}
