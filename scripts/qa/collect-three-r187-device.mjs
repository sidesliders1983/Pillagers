import http from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

const directory = path.resolve('scratch/three-r187-323/device-results');
await mkdir(directory, { recursive: true });
const accepted = [];
const allowedHosts = new Set(['localhost','127.0.0.1','192.168.68.100']);
const expectedFixture = 'fc15f2754b5cea06fcd4c62857756e401c6f527102893622a023298571b92944';
const server = http.createServer(async (request, response) => {
    let origin;
    try { origin = new URL(request.headers.origin); } catch { /* Read-only status may omit Origin. */ }
    const allowed = origin && allowedHosts.has(origin.hostname) && ['5206','5207'].includes(origin.port);
    if (allowed) {
        response.setHeader('Access-Control-Allow-Origin', origin.origin);
        response.setHeader('Access-Control-Allow-Methods','POST, OPTIONS');
        response.setHeader('Access-Control-Allow-Headers','Content-Type');
    }
    response.setHeader('Content-Type','application/json');
    response.setHeader('Cache-Control','no-store');
    if (request.method === 'GET' && request.url === '/status') {
        response.end(JSON.stringify({ accepted })); return;
    }
    if (!allowed || request.url !== '/results' || !['POST','OPTIONS'].includes(request.method)) {
        response.writeHead(403); response.end(JSON.stringify({error:'Unsupported QA request.'})); return;
    }
    if (request.method === 'OPTIONS') { response.writeHead(204); response.end(); return; }
    try {
        const chunks = []; let length = 0;
        for await (const chunk of request) {
            length += chunk.length;
            if (length > 2 * 1024 * 1024) throw new Error('Result exceeds the 2 MiB limit.');
            chunks.push(chunk);
        }
        const raw = Buffer.concat(chunks);
        const data = JSON.parse(raw);
        if (!['A','B'].includes(data.arm) || data.fixtureSHA256 !== expectedFixture ||
            data.engineVersion !== (data.arm === 'A' ? '0.180.0' : '0.187.0') ||
            !Array.isArray(data.frames) || data.frames.length > 30000) throw new Error('Result does not match this protocol.');
        const file = `${Date.now()}-${data.arm}-${randomUUID()}.json`;
        await writeFile(path.join(directory,file), raw, {flag:'wx'});
        const receipt = {file, arm:data.arm, status:data.status, userAgent:data.userAgent,
            elapsedMs:data.elapsedMs, receivedUtc:new Date().toISOString(), protocol:data.protocol};
        accepted.push(receipt);
        if (accepted.length > 128) accepted.shift();
        console.log(JSON.stringify(receipt));
        response.end(JSON.stringify({saved:true,file}));
    } catch (error) {
        response.writeHead(400); response.end(JSON.stringify({error:error.message}));
    }
});
server.listen(5208,'0.0.0.0',() => console.log('Local Three.js device collector listening on 5208.'));
