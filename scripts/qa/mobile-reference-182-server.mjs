// Design-only server. The production router never imports this prototype.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

export function createMobileReferenceHandler(workspace) {
    const directory = join(workspace,'docs/qa/mobile-ui-182');
    const names = new Set(['prototype.html','prototype.css','prototype.mjs','fixture.json',
        'world-developed.jpg','world-starting.jpg','native-developed.jpg','native-starting.jpg',
        'desktop-reference.jpg','README.md']);
    const types = { html:'text/html; charset=utf-8',css:'text/css; charset=utf-8',
        mjs:'text/javascript; charset=utf-8',json:'application/json; charset=utf-8',jpg:'image/jpeg',md:'text/plain; charset=utf-8' };
    return async (request,response) => {
        const path = new URL(request.url,'http://localhost').pathname;
        if (!path.startsWith('/mobile-prototype/')) return false;
        const name = path.slice('/mobile-prototype/'.length) || 'prototype.html';
        if (!names.has(name) || !['GET','HEAD'].includes(request.method)) {
            response.writeHead(404); response.end('Reference not found.'); return true;
        }
        const body = await readFile(join(directory,name));
        response.writeHead(200,{ 'Content-Type':types[name.split('.').at(-1)],'Content-Length':body.length,
            'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex,nofollow' });
        response.end(request.method === 'HEAD' ? undefined : body);
        return true;
    };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    const handler = createMobileReferenceHandler(process.cwd());
    createServer(async (request,response) => {
        if (new URL(request.url,'http://localhost').pathname === '/') {
            response.writeHead(302,{Location:'/mobile-prototype/'}); response.end(); return;
        }
        if (!await handler(request,response)) { response.writeHead(404);response.end('Reference not found.'); }
    }).listen(5182,'127.0.0.1',()=>console.log('Mobile design reference: http://127.0.0.1:5182/mobile-prototype/'));
}
