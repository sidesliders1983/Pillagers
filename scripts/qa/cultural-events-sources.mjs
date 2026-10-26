import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
    existsSync,
    lstatSync,
    mkdirSync,
    readFileSync,
    readdirSync,
    statSync,
    writeFileSync,
} from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync, gzipSync } from 'node:zlib';

const root = fileURLToPath(new URL('../../', import.meta.url));
const directory = join(root, 'docs/qa/cultural-events/calibration-cultural-events-275-276-v1');
const archivePath = join(directory, 'sources.json.gz');
const metadataPath = join(directory, 'sources-metadata.json');
const manifest = JSON.parse(readFileSync(join(directory, 'manifest.json'), 'utf8'));
const expectedSources = Object.entries(manifest.fingerprint.sources);
const maximumArchiveBytes = 4 * 1024 * 1024;
const maximumExpandedBytes = 8 * 1024 * 1024;
const maximumSourceBytes = 4 * 1024 * 1024;
const maximumFileBytes = 2 * 1024 * 1024;
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

function validatePath(path) {
    assert.equal(typeof path, 'string', 'Source path must be a string');
    assert.ok(path.length <= 240 && /^[a-zA-Z0-9][a-zA-Z0-9._/-]*$/.test(path),
        'Only bounded relative source paths are permitted');
    assert.ok(!isAbsolute(path));
    for (const part of path.split('/')) {
        assert.ok(part && part !== '.' && part !== '..' && !part.endsWith('.'),
            'Empty, dot and traversal path components are forbidden');
        assert.ok(!/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part),
            'Windows device paths are forbidden');
    }
    return path;
}

function boundedRead(path, maximum) {
    assert.ok(statSync(path).size <= maximum, 'Artifact exceeds its bounded size: ' + path);
    return readFileSync(path);
}

function createArchive() {
    assert.ok(!existsSync(archivePath) && !existsSync(metadataPath),
        'Source archive already exists; preserve historical evidence');
    let sourceBytes = 0;
    const files = expectedSources.map(([path, expectedHash]) => {
        validatePath(path);
        const bytes = boundedRead(join(root, path), maximumFileBytes);
        assert.equal(sha256(bytes), expectedHash, 'Measured source changed: ' + path);
        sourceBytes += bytes.length;
        return { path, bytes: bytes.length, sha256: expectedHash, base64: bytes.toString('base64') };
    });
    assert.ok(sourceBytes <= maximumSourceBytes);
    const expanded = Buffer.from(JSON.stringify({
        schemaVersion: 1,
        fingerprint: manifest.fingerprint.id,
        files,
    }) + '\n');
    assert.ok(expanded.length <= maximumExpandedBytes);
    const archive = gzipSync(expanded, { level: 9 });
    assert.ok(archive.length <= maximumArchiveBytes);
    const metadata = {
        schemaVersion: 1,
        description: 'Exact frozen measurement bytes, including original mixed line endings.',
        fingerprint: manifest.fingerprint.id,
        measurementHead: manifest.head,
        fileCount: files.length,
        sourceBytes,
        expandedBytes: expanded.length,
        expandedSHA256: sha256(expanded),
        archiveBytes: archive.length,
        archiveSHA256: sha256(archive),
        generatorSHA256: sha256(readFileSync(fileURLToPath(import.meta.url))),
        files: files.map(({ path, bytes, sha256 }) => ({ path, bytes, sha256 })),
    };
    writeFileSync(archivePath, archive, { flag: 'wx' });
    writeFileSync(metadataPath, JSON.stringify(metadata, null, 2) + '\n', { flag: 'wx' });
}

function verifiedSources() {
    const metadata = JSON.parse(boundedRead(metadataPath, 64 * 1024).toString('utf8'));
    const compressed = boundedRead(archivePath, maximumArchiveBytes);
    assert.equal(metadata.schemaVersion, 1);
    assert.equal(metadata.fingerprint, manifest.fingerprint.id);
    assert.equal(metadata.archiveBytes, compressed.length);
    assert.equal(metadata.archiveSHA256, sha256(compressed));
    const expanded = gunzipSync(compressed, { maxOutputLength: maximumExpandedBytes });
    assert.equal(metadata.expandedBytes, expanded.length);
    assert.equal(metadata.expandedSHA256, sha256(expanded));
    const archive = JSON.parse(expanded.toString('utf8'));
    assert.equal(archive.schemaVersion, 1);
    assert.equal(archive.fingerprint, manifest.fingerprint.id);
    assert.equal(sha256(JSON.stringify(manifest.fingerprint.sources)), manifest.fingerprint.id);
    assert.equal(expectedSources.length, 64, 'This snapshot describes exactly 64 measured files');
    assert.ok(Array.isArray(archive.files));
    assert.equal(archive.files.length, expectedSources.length);
    assert.equal(metadata.fileCount, expectedSources.length);
    const expected = new Map(expectedSources);
    const found = new Set();
    let sourceBytes = 0;
    const files = archive.files.map(entry => {
        const path = validatePath(entry.path);
        assert.ok(expected.has(path) && !found.has(path), 'Unknown or duplicate source path');
        found.add(path);
        assert.equal(entry.sha256, expected.get(path), 'Manifest source identity');
        assert.ok(Number.isSafeInteger(entry.bytes) && entry.bytes >= 0 &&
            entry.bytes <= maximumFileBytes);
        assert.equal(typeof entry.base64, 'string');
        assert.ok(entry.base64.length <= 4 * Math.ceil(maximumFileBytes / 3));
        const bytes = Buffer.from(entry.base64, 'base64');
        assert.equal(bytes.toString('base64'), entry.base64, 'Canonical base64 encoding required');
        assert.equal(bytes.length, entry.bytes);
        assert.equal(sha256(bytes), expected.get(path), 'Exact frozen source bytes: ' + path);
        sourceBytes += bytes.length;
        return { path, bytes, sha256: entry.sha256 };
    });
    assert.ok(sourceBytes <= maximumSourceBytes);
    assert.equal(metadata.sourceBytes, sourceBytes);
    assert.deepEqual(metadata.files,
        files.map(file => ({ path: file.path, bytes: file.bytes.length, sha256: file.sha256 })));
    return { files, metadata };
}

function assertDirectoryAncestors(path) {
    for (let current = path; ; current = dirname(current)) {
        if (existsSync(current)) {
            const entry = lstatSync(current);
            assert.ok(entry.isDirectory() && !entry.isSymbolicLink(),
                'Extraction ancestors must be ordinary directories: ' + current);
        }
        if (dirname(current) === current) break;
    }
}

function extractSources(files, argument) {
    assert.ok(argument && isAbsolute(argument), 'Supply an absolute new or empty target directory');
    const target = resolve(argument);
    assertDirectoryAncestors(target);
    if (existsSync(target)) {
        assert.equal(readdirSync(target).length, 0, 'Extraction target must be empty');
    }
    // Validate every destination before creating any directory or writing any bytes.
    const destinations = files.map(file => {
        const destination = resolve(target, ...validatePath(file.path).split('/'));
        const within = relative(target, destination);
        assert.ok(within && !isAbsolute(within) && within !== '..' &&
            !within.startsWith('..' + sep), 'Extraction path escapes the target');
        return { ...file, destination };
    });
    mkdirSync(target, { recursive: true });
    for (const file of destinations) {
        mkdirSync(dirname(file.destination), { recursive: true });
        assertDirectoryAncestors(dirname(file.destination));
        writeFileSync(file.destination, file.bytes, { flag: 'wx' });
        assert.equal(sha256(readFileSync(file.destination)), file.sha256);
    }
    console.log('Extracted and hash-verified ' + files.length + ' exact source files into ' + target);
}

const [mode, target, ...extra] = process.argv.slice(2);
assert.equal(extra.length, 0, 'Unexpected arguments');
assert.ok(mode === undefined || mode === '--create' || mode === '--extract',
    'Usage: node scripts/qa/cultural-events-sources.mjs [--extract NEW_EMPTY_DIR | --create]');
assert.ok(mode === '--extract' || target === undefined, 'Unexpected target argument');
if (mode === '--create') createArchive();
const { files, metadata } = verifiedSources();
if (mode === '--extract') extractSources(files, target);
console.log('Verified exact measurement source snapshot: ' + metadata.fileCount + ' files, ' +
    metadata.sourceBytes + ' source bytes, ' + metadata.archiveBytes + ' compressed bytes.');