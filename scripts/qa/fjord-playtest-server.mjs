import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { resolve, join, relative, extname } from 'node:path';
import { pathToFileURL } from 'node:url';

const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.wasm': 'application/wasm',
    '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.bin': 'application/octet-stream',
    '.hdr': 'application/octet-stream', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.txt': 'text/plain',
    '.woff2': 'font/woff2', '.woff': 'font/woff', '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg' };

/** Serve a frozen path allowlist from a normal build, never a development server or source tree. */
export async function createPlaytestHandler(workspace) {
    const buildRoot = resolve(workspace, 'dist');
    const files = new Map();
    async function add(url, path) {
        const info = await stat(path);
        files.set(url, { path, size: info.size, type: types[extname(path)] });
    }
    async function walk(directory) {
        for (const entry of await readdir(directory, { withFileTypes: true })) {
            if (entry.name.startsWith('.') || entry.isSymbolicLink()) continue;
            const path = join(directory, entry.name);
            if (entry.isDirectory()) await walk(path);
            else if (types[extname(path)]) await add('/' + relative(buildRoot, path).replaceAll('\\', '/'), path);
        }
    }
    await walk(buildRoot);
    const index = files.get('/index.html');
    if (!index) throw Error('Build index missing. Run the normal build first.');
    files.set('/fjord-play', index);
    files.set('/fjord-play/', index);
    if (files.has('/branding/fjordside/favicon-32.png')) files.set('/favicon.ico', files.get('/branding/fjordside/favicon-32.png'));
    const study = join(workspace, 'docs/qa/integrated-playtest-180');
    await add('/playtest/', join(study, 'launcher.html'));
    await add('/playtest', join(study, 'launcher.html'));
    for (const name of ['funded-800', 'developed-810', 'snow-811', 'summer-17', 'exploration-800']) {
        await add('/playtest/' + name + '.json', join(study, name + '.json'));
    }
    return async (request, response) => {
        const pathname = new URL(request.url, 'http://localhost').pathname;
        const file = files.get(pathname);
        if (!file) return false;
        response.setHeader('Cache-Control', 'no-store');
        response.setHeader('X-Content-Type-Options', 'nosniff');
        response.setHeader('X-Robots-Tag', 'noindex, nofollow');
        if (!['GET', 'HEAD'].includes(request.method)) {
            response.writeHead(405, { Allow: 'GET, HEAD' }); response.end('Read-only playtest host.'); return true;
        }
        response.writeHead(200, { 'Content-Type': file.type, 'Content-Length': file.size });
        if (request.method === 'HEAD') response.end();
        else createReadStream(file.path).on('error', () => response.destroy()).pipe(response);
        return true;
    };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    const handle = await createPlaytestHandler(process.cwd());
    createServer(async (request, response) => {
        if (!await handle(request, response)) { response.writeHead(404); response.end('Playtest file not found.'); }
    }).listen(Number(process.env.QA_PORT || 5199), '127.0.0.1', () => console.log('Static Fjord playtest ready.'));
}
