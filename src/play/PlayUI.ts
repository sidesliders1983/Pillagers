import { SettlementPanel, panelCommand, updateManagementAvailability } from './SettlementPanel';
import { WorldControls } from './WorldControls';
import { openSettlement, persistSettlement, bindViewSwitch } from './SettlementBrowser';
import type { SettlementSelection } from './SharedSettlement';
import { updateView } from '../gameplay-lab/updateView';
import { projectSettlement } from './SettlementView';
import type { EntityKind } from './SettlementView';
import type { SimulationState, SimulationCommand } from '../simulation/SimulationCore';
import { projectChronicle } from '../lore/Chronicle';
import './play.css';
const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const option = (id: string, text: string, chosen: string | null) => `<option value="${esc(id)}" ${id === (chosen ?? '') ? 'selected' : ''}>${esc(text)}</option>`;
const percent = (n: number) => `${(n / 100).toFixed(1)}%`;
const spriteSize = (id: string) => id === 'longship' ? 768 : id.startsWith('house') || id === 'farmyard' ? 512 : id === 'child' ? 128 : ['cow', 'bull', 'young-cattle', 'tent'].includes(id) ? 256 : 192;
export class PlayUI {
    private lastPanelSelection = '';
    private panels = new SettlementPanel();
    private world = new WorldControls();
    private opened = openSettlement('board', Number(new URLSearchParams(location.search).get('seed') ?? 32));
    private shared = this.opened.campaign;
    private session = this.shared.session;
    private root!: HTMLElement;
    private get selection(): SettlementSelection {
        return this.shared.selection;
    }
    private set selection(value: SettlementSelection) {
        this.shared.select(value);
    }
    private notice = 'Select a resident, home or animal to manage the settlement.';
    private last: number | null = null;
    private paint = 0;
    private weatherEnabled = true;
    private sameFounders = false;
    private zoom = 1;
    private pan = { x: 0, y: 0 };
    private drag: {
        x: number;
        y: number;
        px: number;
        py: number;
    } | null = null;
    private dragged = false;
    start() {
        document.title = 'Pillagers · Settlement';
        document.body.className = 'play-body';
        document.body.innerHTML = '<main id="play-root"></main>';
        this.root = document.getElementById('play-root')!;
        this.weatherEnabled = this.session.snapshot().weather?.config.enabled ?? false;
        if (this.opened.warning)
            this.notice = this.opened.warning;
        bindViewSwitch(this.root, this.shared, message => {
            this.notice = message;
            this.render();
        });
        this.root.addEventListener('click', e => this.click(e));
        this.root.addEventListener('input', e => this.world.change(e.target as HTMLInputElement));
        window.addEventListener('keydown', e => {
            if (e.key === 'Escape') {
                this.world.open = false;
                this.world.regionId = null;
                document.getElementById('play-settings')?.removeAttribute('open');
                this.render();
            }
        });
        this.root.addEventListener('change', e => {
            const t = e.target as HTMLInputElement;
            this.world.change(t);
            updateManagementAvailability(document.getElementById('entity-panel')!, this.shared);
            if (t.id === 'weather-enabled')
                this.weatherEnabled = t.checked;
            if (t.id === 'same-founders')
                this.sameFounders = t.checked;
            if (t.id === 'cycle')
                this.session.setMinutesPerWinter(Number(t.value));
            if (t.id === 'import-file' && t.files?.[0])
                void this.importSave(t.files[0]);
            if (t.id === 'entity-picker' && t.value) {
                this.world.open = false;
                this.world.regionId = null;
                const [kind, ...id] = t.value.split(':');
                this.selection = { kind: kind as EntityKind, id: id.join(':') };
                this.render();
            }
        });
        this.root.addEventListener('pointerdown', e => {
            if ((e.target as Element).closest('#settlement-board') && !(e.target as Element).closest('.board-ui')) {
                this.drag = { x: e.clientX, y: e.clientY, px: this.pan.x, py: this.pan.y };
                this.dragged = false;
            }
        });
        window.addEventListener('pointermove', e => {
            if (!this.drag)
                return;
            const dx = e.clientX - this.drag.x, dy = e.clientY - this.drag.y;
            if (Math.hypot(dx, dy) > 6)
                this.dragged = true;
            if (this.dragged) {
                this.pan = { x: this.drag.px + dx, y: this.drag.py + dy };
                this.transform();
            }
        });
        window.addEventListener('pointerup', () => {
            this.drag = null;
        });
        this.root.addEventListener('wheel', e => {
            if ((e.target as Element).closest('#settlement-board') && !(e.target as Element).closest('.board-ui')) {
                e.preventDefault();
                this.zoom = Math.max(.35, Math.min(3, this.zoom * (e.deltaY > 0 ? .9 : 1.1)));
                this.transform();
            }
        }, { passive: false });
        window.addEventListener('resize', () => this.transform());
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                this.session.setRunning(false);
                this.last = null;
                this.render();
            }
        });
        this.render();
        requestAnimationFrame(t => this.frame(t));
    }
    private frame(t: number) {
        try {
            if (!document.hidden && this.last !== null)
                this.session.elapse(Math.min(250, t - this.last));
        }
        catch (e) {
            this.notice = String(e);
            this.session.setRunning(false);
        }
        this.last = t;
        if (this.session.running && t - this.paint > 500) {
            this.render();
            this.paint = t;
        }
        requestAnimationFrame(n => this.frame(n));
    }
    private field(id: string) {
        return (document.getElementById(id) as HTMLInputElement | HTMLSelectElement).value;
    }
    private async importSave(file: File) {
        try {
            this.world.reset();
            this.shared.importJSON(await file.text());
            this.weatherEnabled = this.session.snapshot().weather?.config.enabled ?? false;
            this.notice = 'Campaign loaded, paused.';
        }
        catch (e) {
            this.notice = String(e);
        }
        this.render();
    }
    private click(e: MouseEvent) {
        if (this.dragged && (e.target as Element).closest('#settlement-board')) {
            this.dragged = false;
            return;
        }
        const button = (e.target as Element).closest<HTMLButtonElement>('button');
        try {
            if (button && this.world.handle(button, this.session.snapshot(), c => this.session.command(c))) {
                this.notice = 'World updated.';
            }
            else if (button?.dataset.select) {
                this.world.open = false;
                this.world.regionId = null;
                this.selection = { kind: button.dataset.kind as EntityKind, id: button.dataset.select };
            }
            else if (button && panelCommand(button, this.selection, id => this.field(id))) {
                this.shared.command(panelCommand(button, this.selection, id => this.field(id))!);
                this.notice = 'Action completed.';
            }
            else if (button) {
                const action = button.dataset.action;
                if (action === 'run') {
                    this.session.setRunning(!this.session.running);
                    this.last = null;
                }
                if (action === 'save') {
                    this.shared.saveLocal(localStorage);
                    this.notice = 'Campaign saved locally.';
                }
                if (action === 'load') {
                    this.world.reset();
                    this.shared.loadLocal(localStorage);
                    this.weatherEnabled = this.session.snapshot().weather?.config.enabled ?? false;
                    this.notice = 'Campaign loaded, paused.';
                }
                if (action === 'new') {
                    this.world.reset();
                    this.shared.newCampaign(Number(this.field('seed')), this.weatherEnabled);
                    this.selection = null;
                    this.notice = 'New campaign, paused.';
                }
                if (action === 'restart') {
                    this.world.reset();
                    this.shared.restart(this.sameFounders, this.weatherEnabled);
                    this.selection = null;
                    this.notice = 'Campaign restarted, paused.';
                }
                if (action === 'import') {
                    this.session.setRunning(false);
                    document.getElementById('import-file')!.click();
                }
                if (action === 'export') {
                    const url = URL.createObjectURL(new Blob([this.session.saveJSON()], { type: 'application/json' }));
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `pillagers-winter-${this.session.snapshot().time.winter}.json`;
                    a.click();
                    setTimeout(() => URL.revokeObjectURL(url), 60000);
                }
                if (action === 'clear') {
                    this.selection = null;
                    this.world.regionId = null;
                }
                if (action === 'fit') {
                    this.zoom = 1;
                    this.pan = { x: 0, y: 0 };
                }
                if (action === 'zoom-in')
                    this.zoom = Math.min(3, this.zoom * 1.2);
                if (action === 'zoom-out')
                    this.zoom = Math.max(.35, this.zoom / 1.2);
            }
            else if ((e.target as Element).closest('#settlement-board')) {
                this.selection = null;
                this.world.regionId = null;
            }
        }
        catch (error) {
            this.notice = error instanceof Error ? error.message : String(error);
        }
        this.render();
    }
    private command(state: SimulationState, command: SimulationCommand, text: string) {
        return this.panels.button(state, command, text);
    }
    private render() {
        const state = this.session.snapshot(), view = projectSettlement(state), focused = document.activeElement as HTMLElement | null;
        const selectionKey = this.selection ? this.selection.kind + ':' + this.selection.id : '';
        const sameSelection = selectionKey === this.lastPanelSelection;
        const fields = new Set(Array.from(this.root.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input:not([type=file]),select')).filter(el => (!el.closest('#entity-panel') || sameSelection) && (el === focused || this.session.running)).map(el => el.id));
        const weather = view.weather.class, warning = weather === 'Harsh' || weather === 'Severe';
        const sprites = view.entities.map((e, i) => `<button class="board-entity ${e.kind} ${e.farmyard ? 'farmyard' : ''} ${this.selection?.kind === e.kind && this.selection.id === e.id ? 'selected' : ''}" id="board-${e.kind}-${esc(e.id)}" data-kind="${e.kind}" data-select="${esc(e.id)}" style="left:${e.x}px;top:${e.y}px;z-index:${i + 1}" aria-label="Select ${esc(e.label)}" title="${esc(e.label)}"><img draggable="false" src="/sprites/${e.farmyard ? 'farmyard' : e.sprite}.png" style="width:${spriteSize(e.farmyard ? 'farmyard' : e.sprite)}px" alt=""><span class="entity-caption">${esc(e.label)}</span></button>`).join('');
        const recent = projectChronicle(state.events, state.time.winter).flatMap(w => w.entries.filter(e => !e.routine)).slice(0, 12);
        const factual = state.events.filter(e => ['PersonaDied', 'CattleBorn', 'CattleDied', 'WinterWeatherDetermined'].includes(e.type)).slice(-6).reverse().map(e => {
            const d = e.details ?? {};
            return e.type === 'PersonaDied' ? `${state.personas[e.personaId!]?.name ?? e.personaId} died in Winter ${e.time.winter}.` : e.type === 'CattleBorn' ? `${d.cattleId} was born.` : e.type === 'CattleDied' ? `${d.cattleId} died.` : `Winter ${d.winter}: ${d.weatherClass} weather.`;
        });
        const all = [...Object.values(state.landing?.longships ?? {}).map(s => ({ kind: 'longship', id: s.id, label: 'Longship' + (s.salvagedWinter === null ? '' : ' (salvaged)') })), ...Object.values(state.personas).map(p => ({ kind: 'persona', id: p.id, label: p.name + (p.deathWinter === null ? '' : ' (deceased)') })), ...Object.values(state.households).filter(h => h.memberIds.length).map(h => ({ kind: 'household', id: h.id, label: 'Household ' + h.id })), ...Object.keys(state.buildings).map(id => ({ kind: 'building', id, label: id })), ...Object.values(state.landing?.cattle ?? {}).map(c => ({ kind: 'cattle', id: c.id, label: c.id + (c.deathWinter === null ? '' : ' (dead)') }))];
        updateView(this.root, `<header id="play-hud" class="glass"><div><a href="/gameplay-lab">Gameplay Lab</a> · <a href="/fjord-play" data-settlement-view="fjord">3D Fjord</a><h1>Pillagers <small>${esc(view.clan)}</small></h1></div><div class="hud-stat"><span>Winter</span><strong id="winter-value">${view.time.winter}</strong><small>Tick ${view.time.tick}/${state.ticksPerWinter}</small></div><div class="hud-stat"><span>Weather</span><strong>${esc(weather ?? 'Disabled')}</strong></div><div class="hud-stat"><span>Reserves</span><strong>Food ${view.stocks.food}</strong><strong>Materials ${view.stocks.materials}</strong></div><div class="hud-stat"><span>Settlement</span><strong>${view.population} residents</strong><strong>${view.cattle} cattle</strong></div><div class="time-controls"><button data-action="run">${this.session.running ? 'Pause' : 'Start'}</button>${this.command(state, { type: 'AdvanceWinter' }, '+1 Winter')}<label>Cycle<select id="cycle">${[1, 3, 5].map(m => option(String(m), `${m} min / Winter`, String(this.session.minutesPerWinter))).join('')}</select></label><details id="play-settings"><summary>Settings</summary><div class="settings-panel glass"><button data-action="save">Save locally</button><button data-action="load">Load locally</button><button data-action="export">JSON export</button><button data-action="import">JSON import</button><input id="import-file" type="file" accept="application/json,.json" hidden><details id="campaign-settings"><summary>Campaign settings</summary><label>Seed<input id="seed" type="number" value="${state.seed}" min="0" max="4294967295"></label><label class="check"><input id="weather-enabled" type="checkbox" ${this.weatherEnabled ? 'checked' : ''}> Enable winter weather</label><label class="check"><input id="same-founders" type="checkbox" ${this.sameFounders ? 'checked' : ''}> Use the same founders</label><p class="muted">Settings apply to the next campaign. Saves are shared with Gameplay Lab.</p><button data-action="new">New campaign from seed</button><button data-action="restart">Restart campaign</button></details></div></details></div></header><div class="play-layout"><aside class="glass play-left"><h2>Winter watch</h2>${warning ? `<p class="warning">${weather} Winter: prepare shelter and Food reserves.</p>` : ''}${view.stocks.food < 30 ? '<p class="warning">Food reserves are below the founding reserve of 30.</p>' : ''}<p>${view.exposure.residentIds.length} exposed residents<br>${view.exposure.cattleIds.length} exposed cattle</p>${view.weather.modifiers ? `<p class="muted">Food output ${percent(view.weather.modifiers.foodProductionBps)} · Materials output ${percent(view.weather.modifiers.materialsProductionBps ?? 10000)} · Resident Food consumption ${percent(view.weather.modifiers.residentConsumptionBps ?? 10000)} · Livestock Food consumption ${percent(view.weather.modifiers.cattleConsumptionBps ?? view.weather.modifiers.cattleConsumptionMultiplier * 10000)}</p>` : ''}<h3>Recent events</h3><ul class="recent-events">${factual.map(t => `<li>${esc(t)}</li>`).join('')}${recent.slice(0, 6).map(e => `<li>${esc(e.text)}</li>`).join('')}</ul><details><summary>Clan Chronicle</summary>${recent.map(e => `<p>Winter ${e.winter} · ${esc(e.text)}</p>`).join('')}</details></aside><section id="settlement-board" class="weather-${weather ?? 'Disabled'}" aria-label="Isometric settlement board"><div class="board-title"><span>THE SETTLEMENT</span><p>Homes, households and the living herd</p></div><div id="board-scene"><svg class="settlement-ground" width="3000" height="2400" viewBox="-1200 -400 3000 2400" aria-hidden="true"><path d="${view.ground.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')} Z" fill="#536644" stroke="#71856b" stroke-width="8"/><path d="M -350 500 Q 0 330 350 620 T 1000 900" fill="none" stroke="#9a8b66" stroke-width="46" opacity=".5"/></svg>${sprites}</div>${this.world.arrows(state)}${this.world.menu(state)}<div class="board-weather" aria-hidden="true"></div><div class="board-controls"><button data-action="zoom-out" aria-label="Zoom out">−</button><button data-action="fit">Fit settlement</button><button data-action="zoom-in" aria-label="Zoom in">+</button></div></section><aside id="entity-panel" class="glass play-right">${this.world.regionId ? this.world.panel(state) : this.panels.render(state, this.selection)}<label>Select entity<select id="entity-picker">${option('', 'Choose an entity…', null)}${all.map(e => option(e.kind + ':' + e.id, e.label, this.selection ? this.selection.kind + ':' + this.selection.id : null)).join('')}</select></label>${this.selection ? '<button data-action="clear">Clear selection</button>' : ''}</aside></div><footer class="play-status"><p role="status">${esc(this.notice)}</p></footer>`, fields);
        this.lastPanelSelection = selectionKey;
        updateManagementAvailability(document.getElementById('entity-panel')!, this.shared);
        persistSettlement(this.shared, message => {
            this.notice = message;
        });
        this.transform();
    }
    private transform() {
        const board = document.getElementById('settlement-board'), scene = document.getElementById('board-scene');
        if (!board || !scene)
            return;
        const view = projectSettlement(this.session.snapshot()), entities = [...view.entities, ...view.ground], minX = Math.min(0, ...entities.map(e => e.x)) - 220, maxX = Math.max(500, ...entities.map(e => e.x)) + 220, minY = Math.min(0, ...entities.map(e => e.y)) - 240, maxY = Math.max(500, ...entities.map(e => e.y)) + 170;
        const fit = Math.min(board.clientWidth / (maxX - minX), board.clientHeight / (maxY - minY)) * .92;
        const scale = fit * this.zoom;
        scene.style.transform = `translate(${board.clientWidth / 2 - (minX + maxX) / 2 * scale + this.pan.x}px,${board.clientHeight / 2 - (minY + maxY) / 2 * scale + this.pan.y}px) scale(${scale})`;
    }
}
