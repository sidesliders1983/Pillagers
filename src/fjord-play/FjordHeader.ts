import { playerFeedbackLinkHTML } from './PlayerFeedback';
import './player-menu.css';
import type { FjordCalendar } from './FjordCalendar';
import { defaultPresentationPreferences } from '../config/PresentationQuality';
import { icon } from './FjordIcons';
import { isMobileLayout, mobileLayoutQuery } from './MobileShell';

export function fjordHeaderHTML(feedbackURL?: string): string {
    return `<header id="fjord-header" aria-label="Settlement status and controls">
        <div class="fjord-brand"><img src="/branding/fjordside-mark.png" alt=""><div>
            <div id="fjord-winter" class="fjord-date" aria-label="Calendar"><span id="fjord-season"></span> <strong id="fjord-year"></strong></div></div></div>
        <dl id="fjord-stocks" class="fjord-kpis" aria-label="Settlement resources and population">
            <div><dt>Food</dt><dd><button type="button" data-stock="food" aria-label="Food stocks">${icon('food')}<strong id="fjord-food"></strong></button></dd></div>
            <div><dt>Materials</dt><dd><button type="button" data-stock="materials" aria-label="Materials stocks">${icon('materials')}<strong id="fjord-materials"></strong></button></dd></div>
            <div><dt>Residents</dt><dd><button type="button" data-stock="settlement" aria-label="Settlement residents">${icon('people')}<strong id="fjord-residents"></strong></button></dd></div>
            <div><dt>Livestock</dt><dd><button type="button" data-stock="livestock" aria-label="Settlement livestock">${icon('cattle')}<strong id="fjord-cattle"></strong></button></dd></div>
        </dl>
        <div class="fjord-time-controls">
            <button id="fjord-run" type="button" aria-label="Start simulation">${icon('play')}</button>
            <span id="fjord-pacing-slot"><label id="fjord-pacing" title="Year length">${icon('fastForward')}
                <span id="fjord-cycle-label" aria-hidden="true">1 min per year</span>
                <select id="fjord-cycle" aria-label="Year length"><option value="1">1 min per year</option>
                    <option value="3">3 min per year</option><option value="5">5 min per year</option></select>
            </label></span>
            <span id="fjord-next-slot"><button id="fjord-next" type="button">+1 Year</button></span>
            <details id="fjord-menu"><summary aria-label="Game menu">${icon('menu')}</summary>
                <div class="fjord-settings">
                    <div class="player-menu-heading"><h2>Game menu</h2>
                        <button type="button" data-menu-close aria-label="Close game menu">×</button></div>
                    <details data-menu-section><summary>Save game</summary><div class="player-menu-actions">
                        <button id="fjord-save" type="button">Save on this device</button>
                        <button id="fjord-export" type="button" disabled>Download campaign file</button>
                        <p>Device saves stay in this browser. Download a campaign file to keep a separate copy.</p>
                        <button type="button" data-menu-back>Back</button>
                    </div></details>
                    <details data-menu-section><summary>Load game</summary><div class="player-menu-actions">
                        <button id="fjord-load" type="button">Load device save</button>
                        <label>Load campaign file<input id="fjord-import" type="file" accept="application/json,.json"></label>
                        <p>Loading pauses the game. An invalid file leaves your current campaign intact.</p>
                        <button type="button" data-menu-back>Back</button>
                    </div></details>
                    <details data-menu-section><summary>Settings</summary>
                        <h3>Graphics</h3>
                        <label>Quality<select id="fjord-quality"><option value="low"${defaultPresentationPreferences.quality === 'low' ? ' selected' : ''}>Low</option>
                            <option value="standard"${defaultPresentationPreferences.quality === 'standard' ? ' selected' : ''}>Standard</option></select></label>
                        <label class="check"><input id="fjord-hdr" type="checkbox" aria-describedby="fjord-hdr-description fjord-hdr-status"> HDR lighting</label>
                        <small id="fjord-hdr-description">Adds daylight sky lighting to materials.</small>
                        <small id="fjord-hdr-status" role="status">HDR lighting off.</small>
                        <label>Local effects<select id="fjord-effects"><option value="off"${defaultPresentationPreferences.effects === 'off' ? ' selected' : ''}>Off</option>
                            <option value="low"${defaultPresentationPreferences.effects === 'low' ? ' selected' : ''}>Low</option><option value="normal"${defaultPresentationPreferences.effects === 'normal' ? ' selected' : ''}>Normal</option></select></label>
                        <small>Snow, rain and fire particles. Visual quality only; burning still uses fuel. Reduced motion disables particles.</small>
                        <h3>Sound</h3><div id="fjord-audio-setting"></div>
                        <h3>Display</h3><span id="screen-awake-slot"></span>
                        <button type="button" data-menu-back>Back</button>
                    </details>
                    <details data-menu-section><summary>Help &amp; support</summary>
                        <button type="button" data-menu-guide>How to play</button>
                        <h3>Camera views &amp; controls</h3>
                        <button id="fjord-view-home" type="button">View settlement</button><button id="fjord-view-summit" type="button">View highlands</button>
                        <p>Touch: drag to orbit, pinch to zoom, tap open ground to centre the camera. Mouse: left drag to pan, right drag to rotate, wheel to zoom. Select residents, homes and livestock in the world or through Settlement.</p>
                        <p>Use Save game to protect progress before replacing a campaign or clearing browser data.</p>
                        <details><summary>About / Credits</summary>
                            <p>FjordSide · A new shore. A shared history.</p>
                            <a class="fjord-asset-credits" href="/game-assets/wetlands/ATTRIBUTION.txt" target="_blank" rel="noopener">Nature asset credits</a>
                        </details>
                        <details id="fjord-support"><summary>Diagnostics</summary>
                            <p>Optional troubleshooting tools. Reports stay on this device until you share them.</p>
                            <span id="fjord-performance-setting"></span>
                            <small>The overlay preference is saved in this browser. Choose Off to stop it.</small>
                            <details><summary>Loading diagnostics</summary>
                                <button id="fjord-load-copy" type="button">Copy last loading diagnostics</button>
                                <button id="fjord-load-report" type="button">Save last loading diagnostics</button>
                            </details>
                            <details id="fjord-developer-data"><summary>Developer data</summary>
                                <p>Core JSON contains simulation data only. Use Save game for a player campaign file.</p>
                                <button id="fjord-export-core" type="button">Export Core JSON</button>
                            </details>
                        </details>
                        <button type="button" data-menu-back>Back</button>
                    </details>
                    ${playerFeedbackLinkHTML(feedbackURL)}
                    <span id="fjord-menu-next-slot"></span>
                    <section class="player-menu-replacement" aria-label="New campaign">
                        <p>New campaign</p>
                        <details id="fjord-campaign" data-menu-section><summary>New game / Replay</summary>
                            <div class="fjord-campaign-settings player-menu-actions">
                                <p>These choices replace the current campaign only after confirmation.</p>
                                <button id="fjord-new-arrival" type="button">New arrival</button>
                                <small>A new seed, new people and a new history. The island can repeat.</small>
                                <button id="fjord-restart" type="button">Replay original founding</button>
                                <details><summary>Seed &amp; scenario options</summary>
                                    <label class="check"><input id="fjord-founders" type="checkbox" checked> Use the original founders for replay</label>
                                    <label>Campaign seed<input id="fjord-seed" type="number" min="0" max="4294967295"></label>
                                    <small id="fjord-geography"></small>
                                    <small>New seeds select from a validated island pool; the island can repeat. Existing saves keep their geography.</small>
                                    <label class="check"><input id="fjord-weather" type="checkbox"> Enable winter weather</label>
                                    <label class="check"><input id="fjord-exploration" type="checkbox" checked> Enable exploration &amp; rival clan</label>
                                    <small>Scenario options apply only to the new campaign. Original-founding replay retains its saved founding rules.</small>
                                    <button id="fjord-new" type="button">Start from this seed</button>
                                </details>
                                <p>New campaigns offer the optional Founding Journey. Explore on my own starts time; Guide me stays paused. Loading a save pauses the clock.</p>
                                <button type="button" data-menu-back>Back</button>
                            </div>
                        </details>
                    </section>
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
        this.refreshPacing();
        root.querySelector('#fjord-cycle')!.addEventListener('change', this.refreshPacing);
        this.narrow.addEventListener('change', this.placePacing);
        root.addEventListener('keydown', this.keydown);
        root.addEventListener('click', this.menuAction);
        document.addEventListener('pointerdown', this.outside);
    }
    update(calendar: FjordCalendar, stocks: { food: number; materials: number },
        residents: number, cattle: number, expeditionMode = false) {
        this.refreshPacing();
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
        const nextSlot = this.root.querySelector(isMobileLayout() ? '#fjord-menu-next-slot' : '#fjord-next-slot')!;
        nextSlot.append(this.root.querySelector('#fjord-next')!);
    };
    private refreshPacing = (): void => {
        const field = this.root.querySelector<HTMLSelectElement>('#fjord-cycle')!;
        const text = field.value === '10' ? 'Expedition · 10 min' :
            field.selectedOptions[0]?.textContent ?? 'Year length';
        const label = this.root.querySelector('#fjord-cycle-label')!;
        if (label.textContent !== text) label.textContent = text;
        const pacing = this.root.querySelector<HTMLElement>('#fjord-pacing')!;
        if (pacing.dataset.disabled !== String(field.disabled)) pacing.dataset.disabled = String(field.disabled);
    };
    private keydown = (event: KeyboardEvent): void => {
        // Menu/form keyboard input belongs to the header, not global world navigation.
        event.stopPropagation();
        if (event.key === 'Escape') {
            this.root.querySelector<HTMLDetailsElement>('#fjord-menu')!.open = false;
            this.root.querySelector<HTMLElement>('#fjord-menu > summary')!.focus();
        }
    };
    private menuAction = (event: MouseEvent): void => {
        const button = (event.target as Element).closest<HTMLButtonElement>('button');
        if (button?.hasAttribute('data-menu-close')) {
            this.root.querySelector<HTMLDetailsElement>('#fjord-menu')!.open = false;
            this.root.querySelector<HTMLElement>('#fjord-menu > summary')!.focus();
        } else if (button?.hasAttribute('data-menu-back')) {
            const section = button.closest('details')!;
            section.open = false;
            section.querySelector<HTMLElement>('summary')!.focus();
        }
    };
    private outside = (event: PointerEvent): void => {
        const menu = this.root.querySelector<HTMLDetailsElement>('#fjord-menu')!;
        if (event.target instanceof Node && !menu.contains(event.target))
            menu.open = false;
    };
    dispose(): void {
        this.narrow.removeEventListener('change', this.placePacing);
        this.root.querySelector('#fjord-cycle')!.removeEventListener('change', this.refreshPacing);
        this.root.removeEventListener('keydown', this.keydown);
        this.root.removeEventListener('click', this.menuAction);
        document.removeEventListener('pointerdown', this.outside);
    }
}
