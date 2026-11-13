import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';

const buildRoot = resolve('dist');
const reviewRoot = resolve('scratch/personal-armor-review-333');
const port = Number(process.argv[2] ?? 5204);
if (!Number.isSafeInteger(port) || port < 1 || port > 65535)
    throw new Error('Choose a valid local review port.');
const types = {
    '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
    '.webmanifest': 'application/manifest+json',
    '.wasm': 'application/wasm', '.svg': 'image/svg+xml', '.png': 'image/png',
    '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.ico': 'image/x-icon', '.glb': 'model/gltf-binary', '.bin': 'application/octet-stream',
};
function contained(root, relative) {
    const file = resolve(root, relative);
    if (file !== root && !file.startsWith(root + sep)) throw new Error('Invalid review path.');
    return file;
}
createServer(async (request, response) => {
    try {
        if (request.method !== 'GET' && request.method !== 'HEAD') {
            response.writeHead(405); response.end(); return;
        }
        const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
        let file;
        if (pathname.startsWith('/qa/')) {
            const relative = pathname.slice('/qa/'.length) || 'review.html';
            file = contained(reviewRoot, relative);
        } else {
            const relative = pathname === '/' || !extname(pathname) ? 'index.html' : pathname.slice(1);
            file = contained(buildRoot, relative);
        }
        const metadata = await stat(file);
        if (!metadata.isFile()) throw new Error('Missing review file.');
        const bytes = await readFile(file);
        response.writeHead(200, {
            'Content-Type': types[extname(file)] ?? 'application/octet-stream',
            'Content-Length': bytes.length,
            'Cache-Control': 'no-store',
        });
        response.end(request.method === 'HEAD' ? undefined : bytes);
    } catch {
        response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        response.end('Review file not found.');
    }
}).listen(port, '0.0.0.0', () => {
    console.log('Personal armor review: http://127.0.0.1:' + port + '/qa/review.html');
});
