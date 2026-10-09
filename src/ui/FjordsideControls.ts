import { generateWorld } from '../world-generation/GenerateWorld';
import type { WorldPreset } from '../world-generation/WorldBlueprint';
import { parseFjordsideSave, WorldSelection } from '../world/WorldFactory';

const activeKey = 'pillagers-fjordside-active-v02';
const savedKey = 'pillagers-fjordside-geography-v02';

/** Explicit development rollout; ordinary Fjordside URLs always retain Reference. */
export class FjordsideControls {
    readonly enabled = new URLSearchParams(location.search).get('worldDev') === '1';
    readonly selection: WorldSelection;
    private status: HTMLElement | undefined;
    private activating = false;
    private validate: ((selection: WorldSelection) => Promise<string>) | undefined;
    constructor() {
        this.selection = { mode: 'reference',quality: 'standard' };
        if (!this.enabled) return;
        const panel = document.createElement('section');
        panel.className = 'fjordside-world-controls';
        panel.setAttribute('aria-label','World integration preview');
        panel.innerHTML = `
            <h3>World integration preview</h3>
            <p>Reference remains the default. Geography saves are separate from campaign saves.</p>
            <label>World seed<input id="fjordside-seed" type="number" min="0" max="4294967295" value="17"></label>
            <label>Landscape<select id="fjordside-preset"><option value="fjord">Fjord</option>
                <option value="coastal-valley">Coastal Valley</option><option value="rocky-inlet">Rocky Inlet</option></select></label>
            <label>Quality<select id="fjordside-quality"><option value="standard">Standard</option><option value="low">Low</option></select></label>
            <button id="fjordside-generate">Generate World</button>
            <button id="fjordside-reference">Reference fallback</button>
            <button id="fjordside-save">Save world locally</button><button id="fjordside-load">Load saved world</button>
            <button id="fjordside-export">Export world</button>
            <label>Import world<input id="fjordside-import" type="file" accept=".json,application/json"></label>
            <label><input id="fjordside-water-motion" type="checkbox" checked>Water motion</label>
            <label><input id="fjordside-wind-motion" type="checkbox" checked>EZ-Tree wind</label>
            <button id="fjordside-pause">Pause world</button>
            <label>Review camera<select id="fjordside-camera"><option value="village">Village</option>
                <option value="shore">Shore</option><option value="overlook">High overlook</option></select></label>
            <p id="fjordside-world-status" role="status"></p>
        `;
        document.querySelector('#debug')!.prepend(panel);
        this.status = panel.querySelector<HTMLElement>('#fjordside-world-status')!;
        panel.querySelector('#fjordside-reference')!.addEventListener('click',() => {
            sessionStorage.removeItem(activeKey);
            location.reload();
        });
        const saved = sessionStorage.getItem(activeKey);
        if (saved) {
            try { this.selection = parseFjordsideSave(saved); }
            catch (error) {
                this.status!.textContent = 'Stored world rejected: ' + String(error) + ' Select Reference fallback.';
                document.querySelector<HTMLElement>('#debug')!.hidden = false;
                throw error;
            }
        }
        const seed = panel.querySelector<HTMLInputElement>('#fjordside-seed')!;
        const preset = panel.querySelector<HTMLSelectElement>('#fjordside-preset')!;
        const quality = panel.querySelector<HTMLSelectElement>('#fjordside-quality')!;
        seed.value = String(this.selection.blueprint?.config.seed ?? 17);
        preset.value = this.selection.blueprint?.config.preset ?? 'fjord';
        quality.value = this.selection.quality;
        panel.querySelector('#fjordside-generate')!.addEventListener('click',() => void this.activate(() => ({
            mode: 'generated',quality: quality.value as 'standard' | 'low',
            blueprint: generateWorld({ seed: Number(seed.value),preset: preset.value as WorldPreset,
                conifers: 'ez-tree' }),
        })));
        panel.querySelector('#fjordside-load')!.addEventListener('click',() => void this.activate(() => {
            const text = localStorage.getItem(savedKey);
            if (!text) throw new Error('No saved geography is available.');
            return parseFjordsideSave(text);
        }));
        panel.querySelector('#fjordside-import')!.addEventListener('change',async event => {
            const input = event.target as HTMLInputElement;
            const file = input.files?.[0];
            if (file) await this.activate(() => file.text().then(parseFjordsideSave));
            input.value = '';
        });
        quality.addEventListener('change',() => void this.activate(() => ({
            ...this.selection,quality: quality.value as 'standard' | 'low',
        })));
    }
    private async activate(proposal: () => WorldSelection | Promise<WorldSelection>) {
        if (!this.validate || this.activating) return;
        this.activating = true;
        try {
            this.status!.textContent = 'Validating geography, source assets and production placement…';
            const value = await this.validate(await proposal());
            sessionStorage.setItem(activeKey,value);
            location.reload();
        } catch (error) {
            this.activating = false;
            this.status!.textContent = 'World was not changed: ' + (error instanceof Error ? error.message : String(error));
        }
    }
    bind(exportSave: () => string,validate: (selection: WorldSelection) => Promise<string>) {
        if (!this.enabled) return;
        this.validate = validate;
        this.status!.textContent = this.selection.mode === 'generated' ?
            'Generated · validated stored blueprint · seed '+this.selection.blueprint!.config.seed :
            'Reference Fjordside · explicit fallback · seed 1983';
        sessionStorage.setItem(activeKey,exportSave());
        document.querySelector('#fjordside-save')!.addEventListener('click',() => {
            localStorage.setItem(savedKey,exportSave());
            this.status!.textContent = 'World geography saved locally.';
        });
        document.querySelector('#fjordside-export')!.addEventListener('click',() => {
            const url = URL.createObjectURL(new Blob([exportSave()],{ type: 'application/json' }));
            const link = document.createElement('a');
            link.href = url;
            link.download = 'fjordside-world.json';
            link.click();
            setTimeout(() => URL.revokeObjectURL(url),1000);
        });
    }
}
