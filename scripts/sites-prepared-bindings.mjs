import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');

/** Only omit a binding when the current game loader reads its exact prepared replacement. */
export async function verifyPreparedBinding(entry, read, decode) {
    assert.match(entry.originalPath, /^\/character-lab\/(?:modules|candidates)\/[A-Za-z0-9_./-]+\.binding\.json$/);
    assert.ok(!entry.originalPath.split('/').includes('..'), 'Binding path escapes public assets.');
    assert.match(entry.path, /^\/game-assets\/character-sources\/[a-f0-9]{20}\.bin$/);
    const original = read(entry.originalPath);
    assert.equal(original.byteLength, entry.originalBytes, 'Original binding size changed.');
    assert.equal(digest(original), entry.originalSha256, 'Original binding identity changed.');
    const prepared = read(entry.path);
    assert.equal(prepared.byteLength, entry.bytes, 'Prepared binding size changed.');
    assert.equal(digest(prepared), entry.sha256, 'Prepared binding identity changed.');
    const decoded = await decode(async requested => {
        assert.equal(String(requested).split('?')[0], entry.path,
            'The game tried to read an omitted binding instead of its prepared replacement.');
        return new Response(prepared);
    });
    assert.equal(Buffer.compare(Buffer.from(decoded), original), 0,
        'The current game loader must reproduce the original binding bytes exactly.');
    return entry.originalPath.slice(1);
}

export async function preparedBindingExclusions(sourceDirectory, buildDirectory) {
    const loaderURL = pathToFileURL(join(sourceDirectory, 'scripts', 'load-typescript.mjs'));
    const { loadTypeScript } = await import(loaderURL.href);
    const catalogURL = pathToFileURL(join(sourceDirectory, 'src/characters/PreparedCharacterCatalog.ts'));
    const runtimeURL = pathToFileURL(join(sourceDirectory, 'src/characters/PreparedCharacterBytes.ts'));
    const { preparedCharacterCatalog } = loadTypeScript(catalogURL);
    const { verifiedCharacterBytes } = loadTypeScript(runtimeURL);
    assert.equal(preparedCharacterCatalog.version, 1, 'Review the prepared binding publication contract.');
    const read = path => readFileSync(join(buildDirectory, path.slice(1)));
    const omitted = new Set();
    for (const entry of preparedCharacterCatalog.entries.filter(value => value.originalPath.endsWith('.binding.json'))) {
        const path = await verifyPreparedBinding(entry, read, fetch =>
            verifiedCharacterBytes(entry.originalPath, entry.originalSha256, undefined, 'binding', fetch));
        omitted.add(path);
    }
    return omitted;
}
