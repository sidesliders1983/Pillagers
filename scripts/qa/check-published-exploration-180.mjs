import assert from 'node:assert/strict';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const origin = process.env.QA_PUBLIC_ORIGIN || 'https://acer-railway-fact-smaller.trycloudflare.com';
const assets = await readdir('dist/assets');
const javascript = assets.find(name => /^FjordPlay-.*\.js$/.test(name));
const stylesheet = assets.find(name => /^FjordPlay-.*\.css$/.test(name));
assert.ok(javascript && stylesheet, 'Build the normal application first.');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const files = [
    ['/playtest/', 'docs/qa/integrated-playtest-180/launcher.html'],
    ['/playtest/exploration-800.json', 'docs/qa/integrated-playtest-180/exploration-800.json'],
    ['/assets/' + javascript, 'dist/assets/' + javascript],
    ['/assets/' + stylesheet, 'dist/assets/' + stylesheet],
];
const delivered = await Promise.all(files.map(async ([url, path]) => {
    const response = await fetch(origin + url, { signal: AbortSignal.timeout(30000) });
    assert.equal(response.status, 200, url);
    const remote = Buffer.from(await response.arrayBuffer());
    assert.equal(hash(remote), hash(await readFile(path)), url + ' must match the verified local file');
    return { url, sha256: hash(remote), bytes: remote.length };
}));
const result = { status: 'PASS', origin, checkedAt: new Date().toISOString(), files: delivered,
    checks: ['public launcher, exploration save, production JavaScript and CSS match local build bytes'] };
await writeFile('docs/qa/expedition-interface-180/public-check.json', JSON.stringify(result, null, 2) + '\n');
console.log('PASS: Public exploration launcher, scenario, JavaScript and CSS match the local build.');
