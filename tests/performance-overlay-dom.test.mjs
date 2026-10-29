import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { loadDOMSource } from './load-dom-source.mjs';

test('the touch diagnostic view is opt-in, bounded, freezeable and offers selectable export on HTTP', async () => {
    const dom = new JSDOM('<main></main>', { url: 'http://lan.invalid/fjord-play', pretendToBeVisual: true });
    const names = ['window', 'document', 'navigator', 'HTMLElement', 'Element', 'Node', 'AbortController'];
    const saved = Object.fromEntries(names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
    for (const name of names) Object.defineProperty(globalThis, name,
        { configurable: true, value: name === 'window' ? dom.window : dom.window[name] });
    let overlay;
    try {
        const { PlaytestPerformance } = loadDOMSource('../src/fjord-play/PlaytestPerformance.ts');
        let now = 0, callback, timers = 0;
        overlay = new PlaytestPerformance({ now: () => now, schedule: work => {
            timers++; callback = work; return () => { timers--; };
        } });
        const settings = overlay.settings();
        document.querySelector('main').append(settings);
        assert.equal(document.querySelector('#performance-overlay'), null);
        assert.equal(timers, 0);
        settings.querySelector('select').value = 'compact';
        settings.querySelector('select').dispatchEvent(new dom.window.Event('change'));
        dom.window.dispatchEvent(new dom.window.PageTransitionEvent('pageshow', { persisted: false }));
        assert.equal(JSON.parse(overlay.exportJSON()).sample.mode, 'Start menu',
            'An ordinary initial pageshow is not a BFCache return or a paused campaign');
        const info = { autoReset: true, memory: { geometries: 9, textures: 7 }, programs: [],
            render: { calls: 0, triangles: 0 }, reset() { this.render.calls = this.render.triangles = 0; } };
        let identityReads = 0;
        const gl = { VERSION: 1, VENDOR: 2, RENDERER: 3, isContextLost: () => false,
            drawingBufferWidth: 390, drawingBufferHeight: 600,
            canvas: { width: 390, height: 600, getBoundingClientRect: () => ({ width: 390, height: 600 }) },
            getContextAttributes: () => null,
            getParameter: key => key === 1 ? 'WebGL 2.0' : 'Test backend',
            getExtension(name) {
                if (name !== 'WEBGL_debug_renderer_info') return null;
                identityReads++;
                return { UNMASKED_VENDOR_WEBGL: 4, UNMASKED_RENDERER_WEBGL: 5 };
            } };
        const renderer = { info, getContext: () => gl, getPixelRatio: () => 1,
            domElement: { width: 390, height: 600 } };
        overlay.draw(renderer, 'main', () => { info.render.calls = 5; info.render.triangles = 200; });
        overlay.draw(renderer, 'portrait', () => { info.render.calls = 2; info.render.triangles = 20; });
        assert.equal(info.autoReset, true, 'Diagnostic scopes restore renderer counter ownership');
        overlay.setMode('Paused');
        overlay.context({ seed: 32, winter: 800, tick: 500, pace: 3, quality: 'low', effects: 'low' });
        for (let index = 0; index < 20; index++) { now += 20; overlay.frame(now, 3); }
        callback();
        assert.match(document.querySelector('[data-perf-statistics]').textContent, /50.0 fps/);
        assert.match(document.querySelector('[data-perf-statistics]').textContent, /unsupported/);
        const before = document.querySelector('[data-perf-statistics]').textContent;
        document.querySelector('[data-perf-freeze]').click();
        now += 500;
        overlay.frame(now, 40);
        callback();
        assert.equal(document.querySelector('[data-perf-statistics]').textContent, before);
        assert.match(document.querySelector('[data-perf-freeze]').textContent, /Unfreeze/);
        assert.equal(identityReads, 0, 'Frames and periodic display updates never inspect driver identity');
        document.querySelector('[data-perf-copy]').click();
        await new Promise(resolve => setImmediate(resolve));
        const fallback = document.querySelector('textarea');
        assert.equal(fallback.hidden, false);
        const report = JSON.parse(fallback.value);
        assert.equal(report.context.seed, 32);
        assert.equal(report.context.tick, 500);
        assert.equal(report.capabilities.gpuTimer, false);
        assert.equal(report.graphics.identity.status, 'available', 'Driver identity is independent of GPU timer support');
        assert.equal(report.graphics.identity.renderer, 'Test backend');
        assert.deepEqual(report.graphics.drawingBuffer, [390, 600]);
        assert.equal(identityReads, 1, 'Identity is read only when the user exports diagnostics');
        assert.equal(report.build, 'local/unknown');
        assert.equal(report.workload.main.calls, 5);
        assert.equal(report.workload.portrait.calls, 2, 'Portrait draws never overwrite the main scope');
        overlay.context({ hiddenRival: { identity: 'Do not export' }, recipe: 'a'.repeat(100_000) });
        const bounded = overlay.exportJSON();
        assert.equal(bounded.includes('hiddenRival'), false, 'Only explicit public reproduction fields are accepted');
        assert.ok(bounded.length < 128 * 1024);
        assert.ok(JSON.parse(bounded).context.recipe.length <= 80);
        const { GameplaySession } = loadDOMSource('../src/gameplay-lab/GameplaySession.ts');
        const control = new GameplaySession(32), observed = new GameplaySession(1);
        observed.loadJSON(control.saveJSON());
        const ticks = () => {
            const state = observed.readSnapshot();
            return state.time.winter * state.ticksPerWinter + state.time.tick;
        };
        for (const count of [3, 997, 13]) {
            control.command({ type: 'AdvanceTicks', ticks: count });
            overlay.core(ticks, () => observed.command({ type: 'AdvanceTicks', ticks: count }));
        }
        assert.equal(observed.saveJSON(), control.saveJSON(), 'Core/RNG/history remain byte-identical');
        const restored = new GameplaySession(2);
        restored.loadJSON(observed.saveJSON());
        assert.equal(restored.saveJSON(), control.saveJSON());
        assert.equal(JSON.parse(overlay.exportJSON()).sample.ticks.total, 1013);
        let complete;
        const pending = overlay.operation('scene', () => new Promise(resolve => { complete = resolve; }));
        overlay.configure('off');
        overlay.configure('details');
        now += 500;
        complete();
        await pending;
        assert.equal(JSON.parse(overlay.exportJSON()).sample.spans.sceneWall.count, 0,
            'A late operation cannot repopulate a disabled/replaced collector');
        assert.equal(timers, 1);
        assert.equal(JSON.parse(overlay.exportJSON()).graphics.status, 'unavailable',
            'Off releases the context; a new collector cannot export the previous scene identity');
        assert.ok(fallback.value.length < 128 * 1024);
        const { IslandLoadStatus } = loadDOMSource('../src/fjord-play/IslandLoadStatus.ts');
        const loading = new IslandLoadStatus('new', 32, () => now);
        loading.enter('compile', 'shader-compilation');
        loading.begin('shader-compilation');
        loading.maxObservationGapMs = 1234;
        loading.snapshot();
        assert.equal(JSON.parse(overlay.exportJSON()).loading.attempt, loading.attempt);
        assert.equal(JSON.parse(overlay.exportJSON()).loading.maxObservationGapMs, 1234,
            'Loading scheduling gaps come from the shared #259 observer, without another timer');
        for (let index = 0; index < 8; index++) { overlay.configure('off'); overlay.configure('compact'); }
        dom.window.dispatchEvent(new dom.window.ErrorEvent('error', { message: 'One failure' }));
        assert.equal(JSON.parse(overlay.exportJSON()).sample.events.filter(event => event.kind === 'exception').length, 1,
            'Repeated toggling does not stack global observers');
        const createURL = URL.createObjectURL;
        try {
            URL.createObjectURL = () => { throw new Error('Download denied'); };
            document.querySelector('[data-perf-export]').click();
            assert.equal(document.querySelector('textarea').hidden, false);
            assert.equal(JSON.parse(document.querySelector('textarea').value).loading.attempt, loading.attempt);
        } finally { URL.createObjectURL = createURL; }
        let denyCopy;
        Object.defineProperty(dom.window.navigator, 'clipboard', { configurable: true,
            value: { writeText: () => new Promise((resolve, reject) => { denyCopy = reject; }) } });
        document.querySelector('[data-perf-copy]').click();
        overlay.configure('off');
        overlay.configure('compact');
        denyCopy(new Error('Late clipboard denial'));
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(document.querySelector('textarea').hidden, true,
            'An obsolete copy request cannot repopulate a new/disabled view');
        overlay.configure('off');
        assert.equal(timers, 0);
        assert.equal(document.querySelector('#performance-overlay'), null);
        assert.equal(dom.window.localStorage.getItem('fjordside-performance-view'), 'off');
        assert.equal(dom.window.localStorage.length, 1, 'No campaign data is persisted');
    } finally {
        overlay?.dispose();
        dom.window.close();
        for (const name of names) {
            if (saved[name]) Object.defineProperty(globalThis, name, saved[name]);
            else delete globalThis[name];
        }
    }
});

test('the real campaign entry offers performance settings before opening a campaign', async () => {
    const dom = new JSDOM('<main></main>', { url: 'http://lan.invalid/fjord-play', pretendToBeVisual: true });
    const names = ['window', 'document', 'HTMLElement', 'Element', 'Node', 'AbortController', 'DOMException'];
    const saved = Object.fromEntries(names.map(name => [name, globalThis[name]]));
    for (const name of names) globalThis[name] = name === 'window' ? dom.window : dom.window[name];
    let active;
    try {
        const { runFjordEntry } = loadDOMSource('../src/fjord-play/FjordEntry.ts');
        const running = runFjordEntry({ session: { getItem: () => null, setItem() { throw new Error('No activation'); } },
            local: { getItem: () => null }, drawSeed: () => 32,
            open: async attempt => { active = attempt.performance; } });
        await new Promise(resolve => setTimeout(resolve, 40));
        const select = document.querySelector('select[aria-label="Performance overlay"]');
        assert.ok(select, 'Normal start menu exposes the preference before any world is loaded');
        assert.ok(document.querySelector('.audio-settings button'), 'Sound activation is available before loading');
        select.value = 'compact';
        select.dispatchEvent(new dom.window.Event('change'));
        document.querySelector('[data-entry="new"]').click();
        await running;
        assert.ok(active?.enabled, 'The same opt-in owner accompanies the loading attempt');
        assert.equal(document.querySelectorAll('#performance-overlay').length, 1);
    } finally {
        active?.dispose();
        dom.window.close(); Object.assign(globalThis, saved);
    }
});
