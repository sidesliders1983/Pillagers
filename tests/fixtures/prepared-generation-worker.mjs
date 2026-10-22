import { parentPort } from 'node:worker_threads';
import { readFile } from 'node:fs/promises';
import { loadTypeScript } from '../../scripts/load-typescript.mjs';

globalThis.fetch = async url => new Response(await readFile(new URL('../../public' +
    url.split('?')[0], import.meta.url)));
globalThis.self = { postMessage: (message, transfer) => parentPort.postMessage(message, transfer) };
loadTypeScript(new URL('../../src/world-generation/GenerationWorker.ts', import.meta.url));
parentPort.on('message', data => self.onmessage({ data }));
