import type { EntryBackdrop } from './EntryBackdropRenderer';
import './entry-motion.css';

const preferenceKey = 'fjordside.entry-motion';

/** Presentation owner for the entry screens only; campaign start always disposes it first. */
export class EntryMotion {
    readonly settings = document.createElement('fieldset');
    private readonly checkbox: HTMLInputElement;
    private readonly status: HTMLElement;
    private readonly events = new AbortController();
    private readonly queries = [
        '(min-width: 1100px)', '(hover: hover) and (pointer: fine)',
        '(prefers-reduced-motion: no-preference)',
    ].map(value => {
        if (typeof window.matchMedia !== 'function') return undefined;
        try {
            const query = window.matchMedia(value);
            return typeof query.addEventListener === 'function' ? query : undefined;
        } catch { return undefined; }
    });
    private renderer?: EntryBackdrop;
    private enabled = true;
    private active = false;
    private disposed = false;
    private failed = false;
    private pageSuspended = false;
    private generation = 0;

    constructor(private readonly storage?: Pick<Storage, 'getItem' | 'setItem'>) {
        try { this.enabled = storage?.getItem(preferenceKey) !== 'off'; } catch { /* Optional preference. */ }
        this.settings.className = 'entry-motion-setting';
        this.settings.innerHTML = '<legend>Start background</legend>' +
            '<label><input type="checkbox" data-entry-motion> Animated background</label>' +
            '<small data-motion-status></small>';
        this.checkbox = this.settings.querySelector('input')!;
        this.status = this.settings.querySelector('small')!;
        const options = { signal: this.events.signal };
        this.checkbox.addEventListener('change', () => {
            this.enabled = this.checkbox.checked;
            this.failed = false;
            try { storage?.setItem(preferenceKey, this.enabled ? 'on' : 'off'); } catch { /* Keep in memory. */ }
            this.sync();
        }, options);
        for (const query of this.queries) query?.addEventListener('change', () => this.sync(), options);
        window.addEventListener('resize', () => this.renderer?.resize(), options);
        document.addEventListener('visibilitychange', () => this.sync(), options);
        window.addEventListener('pagehide', event => {
            if (!event.persisted) this.dispose();
            else { this.pageSuspended = true; this.renderer?.setPaused(true); }
        }, options);
        window.addEventListener('pageshow', () => { this.pageSuspended = false; this.sync(); }, options);
        this.updateStatus();
    }
    mount() {
        if (this.disposed) return;
        this.active = true;
        this.sync();
    }
    suspend() {
        this.active = false;
        this.generation++;
        this.renderer?.dispose();
        this.renderer = undefined;
    }
    dispose() {
        if (this.disposed) return;
        this.disposed = true;
        this.suspend();
        this.events.abort();
    }
    private eligible() { return this.queries.every(query => query?.matches); }
    private updateStatus() {
        this.checkbox.checked = this.enabled;
        this.status.textContent = !this.enabled ? 'Still background selected.' : this.failed ?
            'Animation unavailable. The still background is used.' : !this.eligible() ?
                'Desktop only. Touch screens and reduced motion use the still background.' :
                'Desktop animation enabled.';
    }
    private sync() {
        if (this.disposed) return;
        this.updateStatus();
        const token = ++this.generation;
        if (!this.active || !this.enabled || !this.eligible() || this.failed) {
            this.renderer?.dispose();
            this.renderer = undefined;
            return;
        }
        if (document.hidden || this.pageSuspended) {
            this.renderer?.setPaused(true);
            return;
        }
        if (this.renderer) {
            this.renderer.mount();
            this.renderer.setPaused(false);
            return;
        }
        void import('./EntryBackdropRenderer').then(({ createEntryBackdrop }) => {
            if (this.disposed || token !== this.generation || !this.active || document.hidden || this.pageSuspended) return;
            const candidate = createEntryBackdrop(() => {
                if (this.renderer === candidate) this.unavailable();
            });
            this.renderer = candidate;
            return candidate.ready.catch(() => {
                if (this.renderer === candidate) this.unavailable();
            });
        }).catch(() => {
            if (!this.disposed && token === this.generation) this.unavailable();
        });
    }
    private unavailable() {
        this.failed = true;
        this.renderer?.dispose();
        this.renderer = undefined;
        this.updateStatus();
    }
}
