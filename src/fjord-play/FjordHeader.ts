import type { FjordCalendar } from './FjordCalendar';
import { defaultPresentationPreferences } from '../config/PresentationQuality';
import { icon } from './FjordIcons';
import { isMobileLayout, mobileLayoutQuery } from './MobileShell';

export function fjordHeaderHTML(): string {
    return `<header id="fjord-header" aria-label="Settlement status and controls">
        <div class="fjord-brand"><img src="/branding/fjordside-mark.png" alt=""><div><strong id="fjord-clan-name">FJORDSIDE</strong>
            <div id="fjord-winter" class="fjord-date" aria-label="Calendar"><span id="fjord-season"></span> <strong id="fjord-year"></strong></div></div></div>
        <dl id="fjord-stocks" class="fjord-kpis" aria-label="Settlement resources and population">
            <div><dt>Food</dt><dd><button type="button" data-stock="food" aria-label="Food stocks">${icon('food')}<strong id="fjord-food"></strong></button></dd></div>
            <div><dt>Materials</dt><dd><button type="button" data-stock="materials" aria-label="Materials stocks">${icon('materials')}<strong id="fjord-materials"></strong></button></dd></div>
            <div><dt>Residents</dt><dd><button type="button" data-stock="settlement" aria-label="Settlement residents">${icon('people')}<strong id="fjord-residents"></strong></button></dd></div>
            <div><dt>Livestock</dt><dd><button type="button" data-stock="livestock" aria-label="Settlement livestock">${icon('cattle')}<strong id="fjord-cattle"></strong></button></dd></div>
        </dl>
        <div class="fjord-time-controls">
            <button id="fjord-run" type="button" aria-label="Start simulation">${icon('play')}</button>
            <span id="fjord-pacing-slot"><label id="fjord-pacing">Year length
                <select id="fjord-cycle"><option value="1">1 min per year</option>
                    <option value="3">3 min per year</option><option value="5">5 min per year</option></select>
            </label></span>
            <span id="fjord-next-slot"><button id="fjord-next" type="button">+1 Year</button></span>
            <details id="fjord-menu"><summary aria-label="Game menu">${icon('menu')}</summary>
                <div class="fjord-settings">
                    <h1>FjordSide</h1>
                    <span id="fjord-menu-pacing-slot"></span>
                    <span id="fjord-menu-next-slot"></span>
                    <button id="fjord-first-steps" type="button">First steps / Help</button>
                    <button id="clan-book-open" type="button">Clan Book</button><button id="fjord-expeditions-open" type="button">Expedition groups</button>
                    <label>Quality<select id="fjord-quality"><option value="low"${defaultPresentationPreferences.quality === 'low' ? ' selected' : ''}>Low</option>
                        <option value="standard"${defaultPresentationPreferences.quality === 'standard' ? ' selected' : ''}>Standard</option></select></label>
                    <label>Local effects<select id="fjord-effects"><option value="off"${defaultPresentationPreferences.effects === 'off' ? ' selected' : ''}>Off</option>
                        <option value="low"${defaultPresentationPreferences.effects === 'low' ? ' selected' : ''}>Low</option><option value="normal"${defaultPresentationPreferences.effects === 'normal' ? ' selected' : ''}>Normal</option></select></label>
                    <small>Snow, rain and fire particles. Visual quality only; burning still uses fuel. Reduced motion disables particles.</small>
                    <span id="screen-awake-slot"></span>
                    <span id="fjord-performance-setting"></span>
                    <div id="fjord-audio-setting"></div>
                    <details><summary>Camera views &amp; controls</summary>
                        <button id="fjord-view-home" type="button">View settlement</button><button id="fjord-view-summit" type="button">View highlands</button>
                        <p>Touch: drag to orbit, pinch to zoom, tap open ground to centre the camera. Mouse: left drag to pan, right drag to rotate, wheel to zoom. Select residents, homes and livestock in the world or through Settlement.</p>
                    </details>
                    <details><summary>Loading diagnostics</summary>
                        <button id="fjord-load-copy" type="button">Copy last loading diagnostics</button>
                        <button id="fjord-load-report" type="button">Save last loading diagnostics</button>
                    </details>
                    <details id="fjord-campaign"><summary>Campaign</summary><div class="fjord-campaign-settings">
                        <button id="fjord-save">Save locally</button><button id="fjord-load">Load locally</button>
                        <button id="fjord-export" disabled>Export Fjord campaign</button>
                        <button id="fjord-export-core">Export canonical JSON</button>
                        <label>Import campaign<input id="fjord-import" type="file" accept="application/json,.json"></label>
                        <label>Campaign seed<input id="fjord-seed" type="number" min="0" max="4294967295"></label>
                        <small id="fjord-geography"></small>
                        <small>New campaigns select a validated island from a fixed set. Existing saves keep their geography.</small>
                        <label class="check"><input id="fjord-weather" type="checkbox"> Enable winter weather</label>
                        <label class="check"><input id="fjord-exploration" type="checkbox" checked> Enable exploration &amp; rival clan</label>
                        <small>Enabled by default for new and restarted islands. Loading a saved campaign keeps its exploration rules.</small>
                        <label class="check"><input id="fjord-founders" type="checkbox" checked> Use the same founders</label>
                        <button id="fjord-new">New campaign from seed</button>
                        <button id="fjord-restart">Restart with same founders</button>
                        <p>New and restarted campaigns offer First steps when ready. Explore on my own starts play; guidance starts paused. Returning to the game or loading a save pauses the clock.
                            Your browser keeps the campaign locally.</p>
                    </div></details>
                </div>
            </details>
        </div>
    </header>`;
}

/** Stable DOM keeps the open menu, field focus and timing intent across campaign refreshes. */
export class FjordHeader {
    private narrow = matchMedia(mobileLayoutQuery);
    constructor(private root: HTMLElement) {
        this.placePacing();
        this.narrow.addEventListener('change', this.placePacing);
        root.addEventListener('keydown', this.keydown);
        document.addEventListener('pointerdown', this.outside);
    }
    update(calendar: FjordCalendar, stocks: { food: number; materials: number },
        residents: number, cattle: number, expeditionMode = false) {
        const nextYear = this.root.querySelector<HTMLButtonElement>('#fjord-next')!;
        nextYear.disabled = expeditionMode;
        nextYear.title = expeditionMode ? 'Unavailable during Expedition Mode' : '';
        const values = { 'fjord-season': calendar.season, 'fjord-year': calendar.year,
            'fjord-food': stocks.food, 'fjord-materials': stocks.materials,
            'fjord-residents': residents, 'fjord-cattle': cattle };
        for (const [id, value] of Object.entries(values))
            this.root.querySelector('#' + id)!.textContent = String(value);
    }
    private placePacing = (): void => {
        const slot = this.root.querySelector(this.narrow.matches ? '#fjord-menu-pacing-slot' : '#fjord-pacing-slot')!;
        slot.append(this.root.querySelector('#fjord-pacing')!);
        const nextSlot = this.root.querySelector(isMobileLayout() ? '#fjord-menu-next-slot' : '#fjord-next-slot')!;
        nextSlot.append(this.root.querySelector('#fjord-next')!);
    };
    private keydown = (event: KeyboardEvent): void => {
        // Menu/form keyboard input belongs to the header, not global world navigation.
        event.stopPropagation();
        if (event.key === 'Escape') {
            this.root.querySelector<HTMLDetailsElement>('#fjord-menu')!.open = false;
            this.root.querySelector<HTMLElement>('#fjord-menu > summary')!.focus();
        }
    };
    private outside = (event: PointerEvent): void => {
        const menu = this.root.querySelector<HTMLDetailsElement>('#fjord-menu')!;
        if (event.target instanceof Node && !menu.contains(event.target))
            menu.open = false;
    };
    dispose(): void {
        this.narrow.removeEventListener('change', this.placePacing);
        this.root.removeEventListener('keydown', this.keydown);
        document.removeEventListener('pointerdown', this.outside);
    }
}
