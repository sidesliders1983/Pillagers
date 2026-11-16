import assert from 'node:assert/strict';
import { createReadStream } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import { parseArgs } from 'node:util';

const { values } = parseArgs({ options: {
    root: { type: 'string' },
    port: { type: 'string', default: '5206' },
    help: { type: 'boolean', default: false },
} });
if (values.help) {
    console.log(`Usage: node scripts/qa/serve-startup-build.mjs --root PATH [--port PORT]
  --root PATH   Immutable built directory containing index.html and assets
  --port PORT   Loopback port (default 5206)
  --help        Print usage without inspecting or serving files

This dependency-free server listens only on 127.0.0.1. GET/HEAD, ETags, byte ranges
and public,max-age=0,must-revalidate match the local startup measurement protocol.
The explicit /fjord-play route uses root index.html only when that built route
is absent. Missing assets return 404; there is no general SPA fallback. Files are
read directly, without compression, TLS, generated assets or source mutation.
Stop the owned server with Ctrl+C when measurements finish.`);
    process.exit(0);
}
assert.ok(values.root, 'Provide the immutable built directory with --root.');
const port = Number(values.port);
assert.ok(Number.isSafeInteger(port) && port > 0 && port <= 65535, 'Use a valid TCP port.');
const root = await realpath(resolve(values.root));
assert.equal((await stat(root)).isDirectory(), true, 'The build root must be a directory.');
const types = {
    '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
    '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp',
    '.avif': 'image/avif', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
    '.glb': 'model/gltf-binary', '.bin': 'application/octet-stream', '.woff2': 'font/woff2',
    '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav',
};

function insideRoot(path) {
    return path === root || path.startsWith(root + sep);
}

async function requestedFile(pathname) {
    let path = resolve(root, '.' + pathname);
    if (!insideRoot(path)) throw new Error('Outside build root.');
    let info;
    try {
        info = await stat(path);
    } catch (error) {
        if (pathname !== '/fjord-play' && pathname !== '/fjord-play/') throw error;
        path = resolve(root, 'index.html');
        info = await stat(path);
    }
    if (info.isDirectory()) {
        path = resolve(path, 'index.html');
        info = await stat(path);
    }
    if (!info.isFile()) throw new Error('Missing built file.');
    path = await realpath(path);
    if (!insideRoot(path)) throw new Error('A build symlink resolves outside the root.');
    return { path, info };
}

const server = createServer(async (request, response) => {
    try {
        if (!['GET', 'HEAD'].includes(request.method)) {
            response.writeHead(405, { Allow: 'GET, HEAD' });
            response.end();
            return;
        }
        const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
        const { path, info } = await requestedFile(pathname);
        const etag = `"${info.size.toString(16)}-${Math.trunc(info.mtimeMs).toString(16)}"`;
        const headers = {
            'Content-Type': types[extname(path)] ?? 'application/octet-stream',
            'Content-Length': info.size,
            'Cache-Control': 'public, max-age=0, must-revalidate',
            ETag: etag,
            'Accept-Ranges': 'bytes',
        };
        if (request.headers['if-none-match'] === etag) {
            response.writeHead(304, { ETag: etag, 'Cache-Control': headers['Cache-Control'] });
            response.end();
            return;
        }
        let start = 0;
        let end = info.size - 1;
        let status = 200;
        if (request.headers.range) {
            const match = /^bytes=(\d+)-(\d*)$/.exec(request.headers.range);
            if (!match) {
                response.writeHead(416, { 'Content-Range': `bytes */${info.size}` });
                response.end();
                return;
            }
            start = Number(match[1]);
            end = match[2] ? Number(match[2]) : end;
            if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end)
                || start > end || end >= info.size) {
                response.writeHead(416, { 'Content-Range': `bytes */${info.size}` });
                response.end();
                return;
            }
            status = 206;
            headers['Content-Range'] = `bytes ${start}-${end}/${info.size}`;
            headers['Content-Length'] = end - start + 1;
        }
        response.writeHead(status, headers);
        if (request.method === 'HEAD' || info.size === 0) {
            response.end();
        } else {
            const stream = createReadStream(path, { start, end });
            stream.on('error', error => response.destroy(error));
            response.on('close', () => stream.destroy());
            stream.pipe(response);
        }
    } catch {
        response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        response.end('Not found');
    }
});
server.on('error', error => {
    console.error(error);
    process.exitCode = 1;
});
server.listen(port, '127.0.0.1', () => {
    console.log(JSON.stringify({ pid: process.pid, root, host: '127.0.0.1', port }));
});
for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => {
        server.close(() => process.exit(0));
        server.closeIdleConnections();
    });
}
