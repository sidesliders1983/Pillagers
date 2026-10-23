import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, mkdirSync, realpathSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { createHash } from 'node:crypto';

const project = fileURLToPath(new URL('../../', import.meta.url));
const positionalArgs = process.argv.slice(2).filter(argument => argument !== '--build-only');
const pointer = resolve(positionalArgs[0] ?? resolve(project, 'scratch/sound-assets-229/latest.json'));
const directory = realpathSync(JSON.parse(readFileSync(pointer)).output);
assert.ok(directory.startsWith(realpathSync(resolve(project, 'scratch')) + sep), 'Only private scratch candidates are served.');
const port = Number(positionalArgs[1] ?? 5198);
assert.ok(Number.isInteger(port) && port >= 1024 && port <= 65535, 'Invalid port');
const manifest = JSON.parse(readFileSync(resolve(directory, 'manifest.json')));
const catalogue = JSON.parse(readFileSync(resolve(directory, 'catalogue.json')));
assert.equal(manifest.assets.length, catalogue.entries.length);
const bundle = resolve(project, 'scratch/sound-assets-229/player/audition.js');
mkdirSync(resolve(project, 'scratch/sound-assets-229'), { recursive: true });
await build({ configFile: false, root: project, publicDir: false,
    build: { target: 'es2022', outDir: resolve(project, 'scratch/sound-assets-229/player'),
        emptyOutDir: false, sourcemap: false,
        lib: { entry: fileURLToPath(new URL('./audition.ts', import.meta.url)),
            formats: ['es'], fileName: () => 'audition.js', cssFileName: 'audition' } } });
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const versionFile = resolve(project, 'scratch/sound-assets-229/player/version.json');
writeFileSync(versionFile, JSON.stringify({
    builtUtc: new Date().toISOString(),
    catalogueSHA256: sha256(readFileSync(resolve(directory, 'catalogue.json'))),
    bundleSHA256: sha256(readFileSync(bundle)),
    sourceHashes: Object.fromEntries(['src/audio/FjordAudio.ts', 'src/audio/Soundscape.ts',
        'src/audio/AudioControls.ts', 'scripts/audio/audition.ts', 'scripts/audio/serve.mjs'].map(path =>
        [path, sha256(readFileSync(resolve(project, path)))])),
}, null, 2) + '\n');
if (process.argv.includes('--build-only')) process.exit(0);
const routes = new Map([
    ['/', { file: fileURLToPath(new URL('./audition.html', import.meta.url)), type: 'text/html; charset=utf-8' }],
    ['/audition.js', { file: bundle, type: 'text/javascript; charset=utf-8' }],
    ['/audition.css', { file: bundle.replace(/\.js$/, '.css'), type: 'text/css; charset=utf-8' }],
    ['/manifest.json', { file: resolve(directory, 'manifest.json'), type: 'application/json' }],
    ['/catalogue.json', { file: resolve(directory, 'catalogue.json'), type: 'application/json' }],
    ['/version.json', { file: versionFile, type: 'application/json' }],
]);
for (const asset of manifest.assets) {
    const entry = catalogue.entries.find(entry => entry.id === asset.id);
    assert.equal(entry.status.distribution, 'quarantined');
    assert.match(entry.prepared.file, /^[a-z0-9-]+\.wav$/);
    assert.equal(asset.path, 'game-assets/audio/' + entry.prepared.file);
    const file = resolve(directory, entry.prepared.file);
    const bytes = readFileSync(file);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), entry.prepared.sha256, 'Prepared file changed');
    routes.set('/' + asset.path, { file, type: 'audio/wav' });
}
const server = createServer((request, response) => {
    // Reject foreign Host headers and cross-site embedding; this is not a LAN,
    // tunnel, public sample catalogue or general-purpose filesystem server.
    const allowedHost = `127.0.0.1:${port}`;
    if (request.headers.host !== allowedHost ||
        !['GET', 'HEAD'].includes(request.method) ||
        !['none', 'same-origin', undefined].includes(request.headers['sec-fetch-site'])) {
        response.writeHead(403).end();
        return;
    }
    const path = new URL(request.url, 'http://' + allowedHost).pathname;
    const route = routes.get(path);
    if (!route) { response.writeHead(404).end(); return; }
    try {
        const bytes = readFileSync(route.file);
        response.writeHead(200, { 'Content-Type': route.type, 'Content-Length': bytes.length,
            'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
            'Cross-Origin-Resource-Policy': 'same-origin',
            'Content-Security-Policy': "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; media-src 'self'; connect-src 'self'; frame-ancestors 'none'" });
        response.end(request.method === 'HEAD' ? undefined : bytes);
    } catch { response.writeHead(500).end(); }
});
server.listen(port, '127.0.0.1', () => console.log(JSON.stringify({
    url: `http://127.0.0.1:${port}/`, candidates: manifest.assets.length, directory,
    scope: 'Private local audition only; no provider calls and no publication.',
})));
for (const event of ['SIGINT', 'SIGTERM']) process.on(event, () => server.close());
