import './fjord-play.css';
import { Clock, Object3D, PerspectiveCamera, Raycaster, Scene, Vector2 } from 'three';
import { GameplaySession } from '../gameplay-lab/GameplaySession';
import { AssetManager } from '../core/AssetManager';
import { createRenderer } from '../core/Renderer';
import { WorldLighting } from '../core/WorldLighting';
import { createWorld } from '../world/WorldFactory';
import { RTSCameraController } from '../camera/RTSCameraController';
import { FjordCampaign, fjordCampaignKey, sharedCampaignKey } from './FjordCampaign';
import { FjordModels } from './FjordModels';
import { FjordEntities } from './FjordEntities';
import { fjordGroundWeights } from './FjordGround';
const activeKey = 'pillagers.fjord-play.active.v1';
const escape = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));
export class FjordPlay {
    private session = new GameplaySession(Number(new URLSearchParams(location.search).get('seed') ?? 32));
    private campaign = new FjordCampaign(this.session);
    private stopped = false;
    private queued = false;
    async start() {
        document.title = 'Pillagers · Fjord settlement';
        document.body.className = 'fjord-play';
        document.body.innerHTML = `<main id="fjord-play"><header><h1>Pillagers · Fjord settlement</h1>
            <nav><a href="/play">2D Settlement</a> · <a href="/gameplay-lab">Gameplay Lab</a> · <a href="/">Fjord prototype</a></nav>
            <div class="fjord-controls"><strong id="fjord-winter"></strong><span id="fjord-stocks"></span>
            <button id="fjord-run">Start</button><button id="fjord-next">+1 Winter</button>
            <label>Quality<select id="fjord-quality"><option value="low">Low</option><option value="standard">Standard</option></select></label>
            <details><summary>Campaign</summary><div class="fjord-settings">
            <button id="fjord-save">Save locally</button><button id="fjord-load">Load locally</button>
            <button id="fjord-export" disabled>Export Fjord campaign</button><button id="fjord-export-core">Export canonical JSON</button>
            <label>Import campaign<input id="fjord-import" type="file" accept="application/json,.json"></label>
            <button id="fjord-restart">Restart with same founders</button>
            <p>New campaigns start paused. Use Gameplay Lab for construction and assignments, then save and explicitly load here.</p>
            </div></details></div></header><section class="fjord-stage"><canvas id="fjord-canvas" aria-label="Canonical Fjord settlement"></canvas>
            <aside><details><summary>Settlement identities</summary><ul id="fjord-identities"></ul></details>
            <details><summary>Developer diagnostics</summary><pre id="fjord-diagnostics"></pre></details>
            <p id="fjord-selected">Select an entity on the board or in the list.</p></aside></section>
            <footer><p id="fjord-notice" role="status">Loading the Fjord. Simulation controls remain available.</p></footer></main>`;
        const canvas = document.querySelector<HTMLCanvasElement>('#fjord-canvas')!;
        const notice = document.querySelector<HTMLElement>('#fjord-notice')!;
        const say = (message: string) => { notice.textContent = message; };
        let stored: string | null = null;
        try { stored = sessionStorage.getItem(activeKey); }
        catch { say('Session storage unavailable; use explicit campaign export.'); }
        if (stored) {
            try {
                this.campaign.importJSON(stored);
            }
            catch (error) {
                say('Stored Fjord rejected: ' + String(error));
            }
        }
        const persist = () => {
            try {
                sessionStorage.setItem(activeKey, this.campaign.exportJSON());
            }
            catch {
                say('Automatic session storage is unavailable. Export the Fjord campaign to preserve its exact layout.');
            }
        };
        let assets: AssetManager | undefined, models: FjordModels | undefined;
        let layer: FjordEntities | undefined, world: Awaited<ReturnType<typeof createWorld>> | undefined;
        let syncScene: (() => Promise<void>) | undefined;
        let sceneWork: Promise<void> | undefined;
        const refresh = () => {
            const view = this.campaign.project();
            document.querySelector('#fjord-winter')!.textContent = 'Winter ' + view.time.winter + ' · tick ' + view.time.tick;
            document.querySelector('#fjord-stocks')!.textContent = 'Food ' + view.stocks.food + ' · Materials ' + view.stocks.materials;
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
            const selected = this.campaign.selection;
            if (selected)
                document.querySelector('#fjord-selected')!.textContent =
                    view.entities.find(e => e.kind === selected.kind && e.id === selected.id)?.label ?? 'Entity is no longer active.';
        };
        const action = (work: () => void | Promise<void>) => {
            void Promise.resolve().then(work).then(refresh).catch(error => say(String(error)));
        };
        document.querySelector('#fjord-run')!.addEventListener('click', () => action(() => this.session.setRunning(!this.session.running)));
        document.querySelector('#fjord-next')!.addEventListener('click', () => action(() => this.session.command({ type: 'AdvanceWinter' })));
        document.querySelector('#fjord-save')!.addEventListener('click', () => action(() => {
            localStorage.setItem(sharedCampaignKey, this.session.saveJSON());
            localStorage.setItem(fjordCampaignKey, this.campaign.exportJSON());
            say('Campaign and exact Fjord saved locally.');
        }));
        document.querySelector('#fjord-load')!.addEventListener('click', () => action(async () => {
            say('Loading shared campaign…');
            const canonical = localStorage.getItem(sharedCampaignKey);
            if (!canonical)
                throw new Error('No shared campaign save found.');
            const saved = localStorage.getItem(fjordCampaignKey);
            if (saved && JSON.parse(saved).campaign.seed === JSON.parse(canonical).seed) {
                this.campaign.importJSON(JSON.stringify({ ...JSON.parse(saved), campaign: JSON.parse(canonical) }));
            }
            else
                this.campaign.importJSON(canonical);
            if (world)
                await rebuildWorld();
            say('Shared campaign loaded, paused.');
        }));
        const download = (text: string, name: string) => {
            const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
            const link = document.createElement('a');
            link.href = url;
            link.download = name;
            link.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        };
        document.querySelector('#fjord-export')!.addEventListener('click', () => download(this.campaign.exportJSON(), 'pillagers-fjord.json'));
        document.querySelector('#fjord-export-core')!.addEventListener('click', () => download(this.session.saveJSON(), 'pillagers-campaign.json'));
        document.querySelector('#fjord-import')!.addEventListener('change', event => action(async () => {
            say('Importing campaign…');
            const input = event.target as HTMLInputElement, file = input.files?.[0];
            if (!file)
                return;
            this.campaign.importJSON(await file.text());
            input.value = '';
            if (world)
                await rebuildWorld();
            say('Campaign imported, paused.');
        }));
        document.querySelector('#fjord-restart')!.addEventListener('click', () => action(async () => {
            say('Restarting campaign…');
            this.campaign.restart(true);
            if (world)
                await rebuildWorld();
            say('Campaign restarted on the same Fjord, paused.');
        }));
        const select = (kind: string, id: string) => {
            this.campaign.selection = { kind, id };
            const entity = this.campaign.project().entities.find(e => e.kind === kind && e.id === id);
            document.querySelector('#fjord-selected')!.textContent = entity ? entity.label + ' · ' + kind : 'Entity is no longer active.';
            persist();
        };
        document.querySelector('#fjord-identities')!.addEventListener('click', event => {
            const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-kind]');
            if (button)
                select(button.dataset.kind!, button.dataset.id!);
        });
        refresh();
        let previous = performance.now();
        const timer = window.setInterval(() => {
            const now = performance.now(), elapsed = Math.min(now - previous, 1000);
            previous = now;
            if (this.session.running)
                action(() => this.session.elapse(elapsed));
        }, 500);
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                this.session.setRunning(false);
                refresh();
            }
            previous = performance.now();
        });
        const scene = new Scene(), camera = new PerspectiveCamera(45, 1, .1, 400);
        const renderer = createRenderer(canvas);
        renderer.setPixelRatio(1);
        const controller = new RTSCameraController(camera, canvas);
        assets = new AssetManager();
        await assets.loadForSimulation();
        models = new FjordModels(assets);
        layer = new FjordEntities(models);
        scene.add(layer.root);
        let lighting: WorldLighting | undefined;
        const cleared = new Set<string>();
        let groundSignature = "";
        const rebuildWorld = async () => {
            const next = await createWorld(assets!, { mode: 'generated', blueprint: this.campaign.blueprint,
                settlement: 'canonical', quality: document.querySelector<HTMLSelectElement>('#fjord-quality')!.value as 'low' | 'standard',
                anisotropy: renderer.capabilities.getMaxAnisotropy() });
            const anchor = next.attachments.find(item => item.key === 'boat')!;
            this.campaign.setMooring({ x: anchor.x, y: anchor.y, z: anchor.z, rotation: anchor.rotation, scale: 1 });
            world?.dispose();
            world = next;
            scene.add(next.root);
            cleared.clear();
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
        };
        await rebuildWorld();
        syncScene = () => {
            this.queued = true;
            if (sceneWork)
                return sceneWork;
            sceneWork = (async () => {
                do {
                    this.queued = false;
                    const view = this.campaign.project();
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
                    await layer!.sync(view.entities);
                    canvas.dataset.rendered = JSON.stringify(layer!.describe());
                    canvas.dataset.environment = JSON.stringify(world!.describe());
                    document.querySelector('#fjord-diagnostics')!.textContent = [...view.diagnostics,
                        ...assets!.diagnostics, ...models!.diagnostics,
                        'Shared static human body; unique clothing, hair and DNA appearance are outside this slice.',
                        'Geography: ' + view.layout.geographyId].join('\n');
                } while (this.queued && !this.stopped);
            })().finally(() => { sceneWork = undefined; });
            return sceneWork;
        };
        await syncScene();
        refresh();
        canvas.dataset.ready = 'true';
        document.querySelector<HTMLButtonElement>('#fjord-export')!.disabled = false;
        say('Fjord ready. Campaign is paused; drag to pan, scroll or pinch to zoom.');
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
            if (!node)
                return false;
            select(node.userData.canonical.kind, node.userData.canonical.id);
            return true;
        });
        const resize = () => {
            const rect = canvas.getBoundingClientRect();
            renderer.setSize(rect.width, rect.height, false);
            camera.aspect = rect.width / Math.max(1, rect.height);
            camera.updateProjectionMatrix();
        };
        const observer = new ResizeObserver(resize);
        observer.observe(canvas);
        resize();
        const clock = new Clock();
        let time = 0;
        renderer.setAnimationLoop(() => {
            const delta = Math.min(clock.getDelta(), .1);
            time += delta;
            controller.update(delta);
            lighting!.update(time);
            world!.update(time, lighting, camera);
            renderer.render(scene, camera);
        });
        window.addEventListener('pagehide', () => {
            this.stopped = true;
            clearInterval(timer);
            renderer.setAnimationLoop(null);
            observer.disconnect();
            controller.dispose();
            layer!.dispose();
            models!.dispose();
            world!.dispose();
            assets!.dispose();
            lighting?.dispose();
            renderer.dispose();
        }, { once: true });
    }
}
