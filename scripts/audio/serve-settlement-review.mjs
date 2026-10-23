import assert from 'node:assert/strict';
import { readFileSync, realpathSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { preview } from 'vite';
import { loadTypeScript } from '../load-typescript.mjs';

const project = process.cwd();
const directory = realpathSync(JSON.parse(readFileSync('scratch/sound-assets-229/latest.json')).output);
assert.ok(directory.startsWith(realpathSync(resolve(project, 'scratch')) + sep));
const { settlementReviewPack } = loadTypeScript(new URL('../../src/audio/SettlementSoundPack.ts', import.meta.url));
const catalogue = JSON.parse(readFileSync(resolve(directory, 'catalogue.json')));
const routes = new Map();
for (const asset of settlementReviewPack.assets) {
    const record = catalogue.entries.find(entry => entry.id === asset.id);
    assert.ok(record && asset.path === 'game-assets/audio/' + record.prepared.file);
    const path = resolve(directory, record.prepared.file), bytes = readFileSync(path);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), record.prepared.sha256);
    routes.set('/' + asset.path, path);
}
const port = 5199;
const server = await preview({ root: project,
    preview: { host: '127.0.0.1', port, strictPort: true, cors: false },
    plugins: [{ name: 'private-settlement-sound-review', configurePreviewServer(server) {
        server.middlewares.use((request, response, next) => {
            if (request.headers.host !== `127.0.0.1:${port}` ||
                !['GET', 'HEAD'].includes(request.method) ||
                !['none', 'same-origin', undefined].includes(request.headers['sec-fetch-site'])) {
                response.writeHead(403).end();
                return;
            }
            const url = new URL(request.url, `http://127.0.0.1:${port}`);
            if (!url.pathname.startsWith('/game-assets/audio/')) return next();
            const path = routes.get(url.pathname);
            if (!path) { response.writeHead(404).end(); return; }
            const bytes = readFileSync(path);
            response.writeHead(200, { 'Content-Type': 'audio/wav', 'Content-Length': bytes.length,
                'Cache-Control': 'no-store', 'Cross-Origin-Resource-Policy': 'same-origin' });
            response.end(request.method === 'HEAD' ? undefined : bytes);
        });
    } }],
});
console.log(JSON.stringify({ url: `http://127.0.0.1:${port}/fjord-play?audioMix=1&debugPerf=1`,
    candidates: routes.size, scope: 'Actual game; private local mixed-scene review, no audio publication.' }));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.httpServer.close());
