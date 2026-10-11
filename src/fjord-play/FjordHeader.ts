import type { FjordCalendar } from './FjordCalendar';

export function fjordHeaderHTML(): string {
    return `<header id="fjord-header" aria-label="Settlement status and controls">
        <div id="fjord-winter" class="fjord-date" aria-label="Calendar"><span id="fjord-season"></span> <strong id="fjord-year"></strong></div>
        <dl id="fjord-stocks" class="fjord-kpis" aria-label="Settlement resources and population">
            <div><dt>Food</dt><dd id="fjord-food"></dd></div>
            <div><dt>Materials</dt><dd id="fjord-materials"></dd></div>
            <div><dt>Residents</dt><dd id="fjord-residents"></dd></div>
            <div><dt>Cattle</dt><dd id="fjord-cattle"></dd></div>
        </dl>
        <div class="fjord-time-controls">
            <button id="fjord-run" type="button">Start</button>
            <span id="fjord-pacing-slot"><label id="fjord-pacing">Year length
                <select id="fjord-cycle"><option value="1">1 min per year</option>
                    <option value="3">3 min per year</option><option value="5">5 min per year</option></select>
            </label></span>
            <details id="fjord-menu"><summary aria-label="Game menu">Menu</summary>
                <div class="fjord-settings">
                    <h1>Pillagers · Fjord settlement</h1>
                    <nav aria-label="Game views"><a href="/play" data-settlement-view="board">2D Settlement</a> ·
                        <a href="/gameplay-lab">Gameplay Lab</a> · <a href="/">Fjord prototype</a></nav>
                    <span id="fjord-menu-pacing-slot"></span>
                    <button id="clan-book-open" type="button">Clan Book</button>
                    <button id="fjord-next" type="button">+1 Year</button>
                    <label>Quality<select id="fjord-quality"><option value="low">Low</option>
                        <option value="standard">Standard</option></select></label>
                    <span id="screen-awake-slot"></span>
                    <details id="fjord-campaign"><summary>Campaign</summary><div class="fjord-campaign-settings">
                        <button id="fjord-save">Save locally</button><button id="fjord-load">Load locally</button>
                        <button id="fjord-export" disabled>Export Fjord campaign</button>
                        <button id="fjord-export-core">Export canonical JSON</button>
                        <label>Import campaign<input id="fjord-import" type="file" accept="application/json,.json"></label>
                        <label>Seed<input id="fjord-seed" type="number" min="0" max="4294967295"></label>
                        <label class="check"><input id="fjord-weather" type="checkbox"> Enable winter weather</label>
                        <label class="check"><input id="fjord-founders" type="checkbox" checked> Use the same founders</label>
                        <button id="fjord-new">New campaign from seed</button>
                        <button id="fjord-restart">Restart with same founders</button>
                        <p>The clock starts when opening or restarting the Fjord. Explicit load/import pauses it.
                            Switching 2D/3D retains your clock setting.</p>
                    </div></details>
                </div>
            </details>
        </div>
    </header>`;
}

/** Stable DOM keeps the open menu, field focus and timing intent across campaign refreshes. */
export class FjordHeader {
    private narrow = matchMedia('(max-width: 600px)');
    constructor(private root: HTMLElement) {
        this.placePacing();
        this.narrow.addEventListener('change', this.placePacing);
        root.addEventListener('keydown', this.keydown);
        document.addEventListener('pointerdown', this.outside);
    }
    update(calendar: FjordCalendar, stocks: { food: number; materials: number }, residents: number, cattle: number) {
        const values = { 'fjord-season': calendar.season, 'fjord-year': calendar.year,
            'fjord-food': stocks.food, 'fjord-materials': stocks.materials,
            'fjord-residents': residents, 'fjord-cattle': cattle };
        for (const [id, value] of Object.entries(values))
            this.root.querySelector('#' + id)!.textContent = String(value);
    }
    private placePacing = (): void => {
        const slot = this.root.querySelector(this.narrow.matches ? '#fjord-menu-pacing-slot' : '#fjord-pacing-slot')!;
        slot.append(this.root.querySelector('#fjord-pacing')!);
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
