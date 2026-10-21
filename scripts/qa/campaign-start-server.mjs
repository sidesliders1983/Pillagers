import { createServer } from 'vite';

// Explicit QA host: counters run before application imports and never enter the production build.
const audit = `(() => {
    const counts = { workers: 0, webgl: 0, modelRequests: 0, gameModule: false };
    const keys = ['pillagers.fjord-play.active.v1', 'fjordside.resume-checkpoint.v1',
        'pillagers.gameplay-lab.v1', 'pillagers.fjord-play.v1'];
    const stores = [sessionStorage, localStorage];
    const before = stores.map(store => keys.map(key => store.getItem(key)));
    const OriginalWorker = window.Worker;
    window.Worker = new Proxy(OriginalWorker, { construct(target, args) {
        counts.workers++; return Reflect.construct(target, args);
    } });
    const context = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function(type, ...args) {
        if (/webgl/.test(type)) counts.webgl++;
        return context.call(this, type, ...args);
    };
    new PerformanceObserver(list => {
        for (const item of list.getEntries()) {
            if (/\\.glb(?:\\?|$)|\\/textures\\//.test(item.name)) counts.modelRequests++;
            if (/\\/FjordPlay\\.ts/.test(item.name)) counts.gameModule = true;
        }
    }).observe({ type: 'resource', buffered: true });
    setInterval(() => {
        document.documentElement.dataset.entryAudit = JSON.stringify({ ...counts,
            savesUnchanged: stores.every((store, i) => keys.every((key, j) => store.getItem(key) === before[i][j])),
            menu: !!document.querySelector('#campaign-start'),
            ready: document.querySelector('#fjord-canvas')?.dataset.ready === 'true',
        });
    }, 250);
})();`;

const server = await createServer({ server: { host: '0.0.0.0', port: 5196, strictPort: true },
    plugins: [{ name: 'campaign-entry-observation',
    configResolved(config) {
        // Research worktrees may themselves live under scratch/. Do not cache stale source there.
        if (config.server.watch) config.server.watch.ignored = ['**/node_modules/**', '**/.git/**', '**/dist/**'];
    }, transformIndexHtml: {
        order: 'pre', handler(_html, context) {
            return context.originalUrl?.includes('auditEntry=1') ?
                [{ tag: 'script', children: audit, injectTo: 'head-prepend' }] : [];
        },
    } }],
});
await server.listen();
server.printUrls();
