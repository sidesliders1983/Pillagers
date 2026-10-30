// THROWAWAY: compare living source pixels, rendered curtains, and the static reference on the real entry layout.
// No campaign or preference persistence; a production implementation requires a separate owner-approved rewrite.
import { organizeCampaignEntry } from '../../CampaignEntryMenu';
import { formatBuildLabel } from '../../../build/BuildInfo';
import '../../campaign-start.css';
import '../../start-screen-theme.css';
import './prototype.css';
import type { createBackdrop } from './Backdrop.prototype';

type Owner = ReturnType<typeof createBackdrop>;
const variants = [
    { key: 'layered', label: 'A · Living artwork', explanation: 'The supplied sky and water move gently inside the cutout mask.' },
    { key: 'rendered', label: 'B · Rendered curtains', explanation: 'Procedural aurora curtains and clouds, with matching rippled light on the water.' },
    { key: 'static', label: 'C · Static reference', explanation: 'The approved still image. No decorative renderer or motion.' },
];

export function runEntryMotionPrototype() {
    document.title = 'FjordSide · Motion prototype';
    document.body.className = 'fjord-entry entry-motion-prototype';
    document.body.innerHTML = '<main id="campaign-start"><header><img src="/branding/fjordside/app-192.png" width="88" height="88" alt="">' +
        '<div><p class="entry-eyebrow">A new shore. A shared history.</p><h1>FjordSide</h1><p class="entry-build" data-game-version></p></div></header>' +
        '<section class="entry-content" aria-label="Campaign start"></section></main>';
    document.querySelector('[data-game-version]')!.textContent = formatBuildLabel();
    const content = document.querySelector<HTMLElement>('.entry-content')!;
    content.innerHTML = '<p data-context>Visual prototype · no active campaign</p><p data-storage></p>' +
        '<button data-entry="continue" disabled>Continue campaign</button><button data-entry="new">New arrival</button>' +
        '<button data-entry="restart" disabled>Replay original founding</button><p data-restart-reason></p>' +
        '<p class="entry-rules">Prototype only. No campaign is created or saved.</p>' +
        '<button data-recover disabled>Load game</button><button data-diagnostics disabled>Run loading diagnostics</button>';
    const settings = document.createElement('div');
    settings.innerHTML = '<fieldset><legend>Desktop background motion</legend><label><input data-motion type="checkbox" checked> Enable animated background</label>' +
        '<small>Prototype preference stays in memory. Reduced motion always uses the still image.</small></fieldset>';
    const diagnostics = document.createElement('p');
    diagnostics.textContent = 'Visual prototype. No simulation or player save is connected.';
    organizeCampaignEntry(content, settings, diagnostics);
    const bar = document.createElement('aside');
    bar.className = 'motion-prototype-bar';
    bar.setAttribute('aria-label', 'Visual prototype variants');
    bar.innerHTML = '<div class="motion-prototype-controls"><strong>PROTOTYPE</strong><button data-previous aria-label="Previous visual variant">←</button>' +
        '<span data-variant></span><button data-next aria-label="Next visual variant">→</button><button data-art>Artwork only</button>' +
        '<button data-transition>Preview entry exit</button><a href="/fjord-play">Exit prototype</a></div>' +
        '<p data-motion-state role="status"></p><details><summary>Prototype info</summary><p data-description></p>' +
        '<button data-refresh>Refresh counters</button><pre data-info></pre></details>';
    document.body.append(bar);
    const parameters = new URLSearchParams(location.search);
    let variant = parameters.get('variant') ?? 'layered';
    if (!variants.some(value => value.key === variant)) variant = 'layered';
    let owner: Owner | undefined, disposed = false, enabled = true, exiting = false, generation = 0;
    let status = 'Static image ready';
    const lifetime = new AbortController();
    const screen = matchMedia('(min-width: 1100px)'), pointer = matchMedia('(hover: hover) and (pointer: fine)');
    const motion = matchMedia('(prefers-reduced-motion: no-preference)');
    const eligible = () => screen.matches && pointer.matches && motion.matches;
    const updateInfo = () => {
        const selected = variants.find(value => value.key === variant)!;
        bar.querySelector('[data-variant]')!.textContent = selected.label;
        bar.querySelector('[data-description]')!.textContent = selected.explanation;
        bar.querySelector('[data-motion-state]')!.textContent = status;
        const state = { variant, eligible: eligible(), desktop: screen.matches, finePointer: pointer.matches,
            motionAllowed: motion.matches, enabled, hidden: document.hidden, exiting,
            canvases: document.querySelectorAll('.entry-motion-layer canvas').length, ...owner?.stats() };
        bar.querySelector('[data-info]')!.textContent = JSON.stringify(state, null, 2);
        document.documentElement.dataset.motionPrototype = JSON.stringify(state);
    };
    async function reconcile() {
        const token = ++generation;
        owner?.dispose(); owner = undefined;
        if (disposed) return;
        status = !motion.matches ? 'Static · reduced motion' : !screen.matches || !pointer.matches ? 'Static · desktop fine-pointer only' :
            !enabled || variant === 'static' || exiting ? 'Static · motion off' : document.hidden ? 'Paused · hidden tab' : 'Static ready · preparing decorative layer';
        updateInfo();
        if (!eligible() || !enabled || variant === 'static' || exiting || document.hidden) return;
        try {
            const { createBackdrop } = await import('./Backdrop.prototype');
            if (disposed || token !== generation) return;
            const candidate = createBackdrop(document.body, variant, () => {
                if (owner === candidate) { owner = undefined; status = 'Static · graphics or decorative asset unavailable'; updateInfo(); }
            });
            owner = candidate;
            updateInfo();
            await candidate.loaded;
            if (disposed || token !== generation || owner !== candidate) return;
            status = 'Running · one masked canvas · at most 30 updates/s · scenery and controls stay still';
            updateInfo();
        } catch { status = 'Static · graphics unavailable'; updateInfo(); }
    }
    const choose = (direction: number) => {
        const index = variants.findIndex(value => value.key === variant);
        variant = variants[(index + direction + variants.length) % variants.length].key;
        const query = new URLSearchParams(location.search); query.set('variant', variant);
        history.replaceState(null, '', location.pathname + '?' + query);
        void reconcile();
    };
    bar.querySelector('[data-previous]')!.addEventListener('click', () => choose(-1));
    bar.querySelector('[data-next]')!.addEventListener('click', () => choose(1));
    bar.querySelector('[data-refresh]')!.addEventListener('click', updateInfo);
    bar.querySelector('[data-art]')!.addEventListener('click', event => {
        const main = document.querySelector<HTMLElement>('#campaign-start')!;
        main.hidden = !main.hidden;
        (event.target as HTMLElement).textContent = main.hidden ? 'Show menu' : 'Artwork only';
        updateInfo();
    });
    const transition = () => {
        exiting = !exiting;
        content.hidden = exiting;
        bar.querySelector('[data-transition]')!.textContent = exiting ? 'Return to entry' : 'Preview entry exit';
        void reconcile();
    };
    bar.querySelector('[data-transition]')!.addEventListener('click', transition);
    content.addEventListener('click', event => {
        const button = (event.target as Element).closest('[data-entry]');
        if (button) { event.preventDefault(); event.stopImmediatePropagation(); transition(); }
    }, { capture: true, signal: lifetime.signal });
    settings.querySelector<HTMLInputElement>('[data-motion]')!.addEventListener('change', event => {
        enabled = (event.target as HTMLInputElement).checked; void reconcile();
    });
    window.addEventListener('keydown', event => {
        if ((event.target as Element).closest('input, textarea, select, [contenteditable="true"]')) return;
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); choose(event.key === 'ArrowLeft' ? -1 : 1); }
    }, { signal: lifetime.signal });
    for (const query of [screen, pointer, motion]) query.addEventListener('change', () => void reconcile(), { signal: lifetime.signal });
    window.addEventListener('resize', () => { owner?.resize(); updateInfo(); }, { signal: lifetime.signal });
    document.addEventListener('visibilitychange', () => {
        if (owner) { owner.setPaused(document.hidden); status = document.hidden ? 'Paused · hidden tab' : 'Running · decorative layer'; updateInfo(); }
        else if (!document.hidden) void reconcile();
    }, { signal: lifetime.signal });
    function dispose() {
        disposed = true; generation++;
        lifetime.abort(); owner?.dispose(); owner = undefined;
    }
    window.addEventListener('pagehide', dispose, { once: true, signal: lifetime.signal });
    import.meta.hot?.dispose(dispose);
    void reconcile();
}
