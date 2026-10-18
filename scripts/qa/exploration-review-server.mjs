import { createServer } from 'node:http';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createPlaytestHandler } from './fjord-playtest-server.mjs';

// Normal production files and an explicit evidence allowlist; never the instrumented Vite server.
const workspace = resolve(process.cwd());
const handle = await createPlaytestHandler(workspace);
const root = resolve(workspace, 'docs/qa/exploration-151');
const files = new Set((await readdir(root)).filter(name => name === 'index.html' ||
    /^[a-zA-Z0-9-]+\.(json|jpg|md)$/.test(name)));
const types = { html: 'text/html; charset=utf-8', json: 'application/json',
    jpg: 'image/jpeg', md: 'text/plain; charset=utf-8' };

createServer(async (request, response) => {
    try {
        const path = new URL(request.url, 'http://localhost').pathname;
        if (path === '/exploration-review') {
            response.writeHead(302, { Location: '/exploration-review/' });
            response.end();
            return;
        }
        if (path.startsWith('/exploration-review/')) {
            const name = path.slice('/exploration-review/'.length) || 'index.html';
            if (!files.has(name)) {
                response.writeHead(404);
                response.end('Review file not found.');
                return;
            }
            if (!['GET', 'HEAD'].includes(request.method)) {
                response.writeHead(405, { Allow: 'GET, HEAD' });
                response.end();
                return;
            }
            const bytes = await readFile(resolve(root, name));
            response.writeHead(200, { 'Content-Type': types[name.split('.').at(-1)],
                'Content-Length': bytes.length, 'Cache-Control': 'no-store',
                'X-Content-Type-Options': 'nosniff', 'X-Robots-Tag': 'noindex, nofollow' });
            response.end(request.method === 'HEAD' ? undefined : bytes);
            return;
        }
        if (await handle(request, response)) return;
        response.writeHead(404);
        response.end('Playtest file not found.');
    } catch {
        response.writeHead(500);
        response.end('Playtest temporarily unavailable.');
    }
}).listen(Number(process.env.QA_PORT || 5198), '127.0.0.1', () => {
    console.log('Normal build: http://127.0.0.1:' + (process.env.QA_PORT || 5198) + '/exploration-review/');
});
