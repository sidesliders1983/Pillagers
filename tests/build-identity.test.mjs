import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { resolveBuildInfo, prepareAlphaSource, sealAlphaArtifact, verifyAlphaArtifact } from '../scripts/build-info.mjs';

mkdirSync('scratch/alpha-320/tests', { recursive: true });
function fixture() {
    const root = mkdtempSync(resolve('scratch/alpha-320/tests/source-'));
    writeFileSync(join(root, 'game-version.json'), JSON.stringify({ version: '0.1.0-alpha' }));
    writeFileSync(join(root, 'package.json'), JSON.stringify({ version: '0.2.0', private: true }));
    mkdirSync(join(root, 'src'));
    writeFileSync(join(root, 'src/main.ts'), "const route = location.pathname;\nif (route === '/fjord-play') {\n import('./fjord-play/FjordEntry');\n} else if (route === '/lab') {}\n");
    const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: 'pipe' }).trim();
    git('init');
    git('symbolic-ref', 'HEAD', 'refs/heads/main');
    git('-c', 'user.name=Build test', '-c', 'user.email=build@example.invalid', 'add', '.');
    git('-c', 'user.name=Build test', '-c', 'user.email=build@example.invalid', 'commit', '-m', 'Test source');
    return { root, git, commit: git('rev-parse', 'HEAD') };
}

test('a normal local build identifies its own source and the deliberate public version', () => {
    const { root, commit } = fixture();
    const info = resolveBuildInfo(root);
    assert.equal(info.version, '0.1.0-alpha');
    assert.equal(info.displayVersion, 'v0.1 alpha');
    assert.equal(info.channel, 'alpha');
    assert.equal(info.origin, 'local');
    assert.equal(info.buildNumber, null);
    assert.equal(info.source.commit, commit);
    assert.equal(info.source.dirty, false);
    assert.equal(info.legacyBuild, commit);
    assert.match(info.buildId, /local/);
});

function workflow(commit, number, attempt = 1, ref = 'refs/heads/main') {
    return { GITHUB_ACTIONS: 'true', GITHUB_REPOSITORY: 'sidesliders1983/Pillagers',
        GITHUB_WORKFLOW_REF: 'sidesliders1983/Pillagers/.github/workflows/alpha-package.yml@' + ref,
        GITHUB_SHA: commit, GITHUB_REF: ref, GITHUB_EVENT_NAME: 'push',
        GITHUB_RUN_NUMBER: String(number), GITHUB_RUN_ID: String(10000 + number), GITHUB_RUN_ATTEMPT: String(attempt) };
}

test('the designated packaging sequence binds a number and attempt to the exported source', () => {
    const { root, commit } = fixture();
    const output = prepareAlphaSource(root, resolve(root, '../numbered'), workflow(commit, 51));
    const info = resolveBuildInfo(output.sourceDirectory);
    assert.equal(info.origin, 'distributable');
    assert.equal(info.buildNumber, 51);
    assert.equal(info.source.commit, commit);
    assert.equal(info.source.provenance, 'sites-export');
    assert.equal(info.sequence.attempt, 1);
    assert.match(info.buildId, /alpha-10051-1/);
    assert.match(info.inputHash, /^[a-f0-9]{64}$/);
    assert.equal(info.legacyBuild, commit + '-sites-main');
    assert.deepEqual(resolveBuildInfo(output.sourceDirectory), info, 'Reusing the prepared artifact preserves its stamp');
    const stampPath = join(output.sourceDirectory, '.fjord-build.json');
    const originalStamp = JSON.parse(readFileSync(stampPath, 'utf8'));
    writeFileSync(stampPath, JSON.stringify({ ...originalStamp, versionTag: '9.9.9+unrelated' }));
    assert.throws(() => resolveBuildInfo(output.sourceDirectory), /identity|stamp/i);
    writeFileSync(stampPath, JSON.stringify(originalStamp));
    writeFileSync(join(output.sourceDirectory, 'src/main.ts'), '// changed bytes');
    assert.throws(() => resolveBuildInfo(output.sourceDirectory), /changed|identity|stamp/i);
});

test('a sealed artifact can be rehosted unchanged and rejects substituted bytes or a different source', () => {
    const { root, commit } = fixture();
    const prepared = prepareAlphaSource(root, resolve(root, '../artifacts'), workflow(commit, 52));
    const directory = join(prepared.sourceDirectory, 'dist');
    mkdirSync(directory);
    writeFileSync(join(directory, 'index.html'), '<!doctype html><script src="/app.js"></script>');
    writeFileSync(join(directory, 'app.js'), '// compiled ' + prepared.buildInfo.buildId);
    writeFileSync(join(directory, 'build-info.json'), JSON.stringify(prepared.buildInfo));
    sealAlphaArtifact(prepared.sourceDirectory);
    const info = verifyAlphaArtifact(directory, { commit, version: '0.1.0-alpha', distributable: true });
    assert.equal(info.buildNumber, 52);
    assert.equal(info.buildId, prepared.buildInfo.buildId);
    assert.deepEqual(verifyAlphaArtifact(directory), info);
    assert.throws(() => verifyAlphaArtifact(directory, { commit: '0'.repeat(40) }), /source|commit/i);
    writeFileSync(join(directory, 'app.js'), '// substituted content');
    assert.throws(() => verifyAlphaArtifact(directory), /bytes|hash|artifact/i);
});

test('the compiled accessor reports its own artifact and ignores a newer server manifest', async () => {
    const { root, commit } = fixture();
    const prepared = prepareAlphaSource(root, resolve(root, '../compiled'), workflow(commit, 53));
    const { build } = await import('vite');
    const bundle = await build({ configFile: false, logLevel: 'silent',
        define: { 'globalThis.__FJORD_BUILD_INFO__': JSON.stringify(prepared.buildInfo),
            'globalThis.__FJORD_BUILD__': JSON.stringify(prepared.buildInfo.legacyBuild) },
        build: { write: false, ssr: resolve('src/build/BuildInfo.ts') } });
    let requests = 0;
    const previous = globalThis.fetch;
    globalThis.fetch = async () => { requests++; return { json: async () => ({ buildNumber: 99999 }) }; };
    try {
        const compiled = await import('data:text/javascript;base64,' + Buffer.from(bundle.output[0].code).toString('base64'));
        assert.equal(compiled.formatBuildLabel(), 'v0.1 alpha · build 53');
        assert.deepEqual(compiled.getBuildInfo(), prepared.buildInfo);
        assert.equal(compiled.getBuildInfo().source.commit, commit);
        assert.equal(requests, 0, 'A loaded build does not request a replacement identity');
        assert.equal(Object.isFrozen(compiled.getBuildInfo().source), true);
    } finally { globalThis.fetch = previous; }
});

test('local, preview, retry and concurrent builds cannot borrow an unrelated official identity', () => {
    const { root, commit } = fixture();
    const first = prepareAlphaSource(root, resolve(root, '../sequence'), workflow(commit, 54));
    const concurrent = prepareAlphaSource(root, resolve(root, '../sequence'), workflow(commit, 55));
    const retry = prepareAlphaSource(root, resolve(root, '../sequence'), workflow(commit, 54, 2));
    assert.equal(new Set([first, concurrent, retry].map(build => build.buildInfo.buildId)).size, 3);
    assert.equal(retry.buildInfo.buildNumber, first.buildInfo.buildNumber);
    assert.equal(retry.buildInfo.sequence.attempt, 2);
    const preview = prepareAlphaSource(root, resolve(root, '../sequence'), workflow(commit, 56, 1, 'refs/heads/review'));
    assert.equal(preview.buildInfo.origin, 'preview');
    const development = resolveBuildInfo(first.sourceDirectory, { mode: 'serve' });
    assert.equal(development.origin, 'local');
    assert.equal(development.buildNumber, null);
    assert.equal(development.source.dirty, false, 'Clean prepared source stays clean in development');
    writeFileSync(join(first.sourceDirectory, 'src/main.ts'), '// changed development source');
    assert.equal(resolveBuildInfo(first.sourceDirectory, { mode: 'serve' }).source.dirty, true);
    const child = join(root, 'export-without-provenance');
    mkdirSync(child);
    writeFileSync(join(child, 'game-version.json'), JSON.stringify({ version: '0.1.0-alpha' }));
    assert.equal(resolveBuildInfo(child).source.commit, null, 'A parent workspace is not the exported game source');
    assert.throws(() => prepareAlphaSource(root, resolve(root, '../invalid'), {}), /designated workflow/);
    writeFileSync(join(root, 'package.json'), '{}');
    const dirty = resolveBuildInfo(root);
    assert.equal(dirty.source.commit, commit);
    assert.equal(dirty.source.dirty, true);
    assert.equal(dirty.buildNumber, null);
    assert.match(dirty.legacyBuild, /-dirty$/);
    assert.throws(() => prepareAlphaSource(root, resolve(root, '../invalid'), workflow(commit, 57)), /clean/);
});

test('an export without usable provenance stays explicitly unknown for local use', () => {
    const { root } = fixture();
    const child = join(root, 'unidentified-export');
    mkdirSync(child);
    writeFileSync(join(child, 'game-version.json'), JSON.stringify({ version: '0.1.0-alpha' }));
    writeFileSync(join(child, '.sites-main.json'), '{invalid');
    const local = resolveBuildInfo(child);
    assert.equal(local.origin, 'local');
    assert.equal(local.buildNumber, null);
    assert.equal(local.source.commit, null);
    assert.equal(local.legacyBuild, 'unidentified-source');
});

test('the prepared artifact freezes public feedback configuration before Vite compilation', async () => {
    const { root, commit } = fixture();
    const env = { ...workflow(commit, 58), FJORD_FEEDBACK_URL: 'https://feedback.example.test/alpha' };
    const prepared = prepareAlphaSource(root, resolve(root, '../configuration'), env);
    assert.equal(prepared.buildInfo.configuration.feedbackURL, 'https://feedback.example.test/alpha');
    const { loadConfigFromFile } = await import('vite');
    const configPath = resolve('vite.config.ts');
    const before = process.cwd();
    const oldURL = process.env.FJORD_FEEDBACK_URL;
    try {
        process.chdir(prepared.sourceDirectory);
        process.env.FJORD_FEEDBACK_URL = 'https://other.example.test/changed-later';
        const loaded = await loadConfigFromFile({ command: 'build', mode: 'production' }, configPath);
        assert.equal(JSON.parse(loaded.config.define['globalThis.__FJORD_FEEDBACK_URL__']), 'https://feedback.example.test/alpha');
        assert.equal(JSON.parse(loaded.config.define['globalThis.__FJORD_BUILD_INFO__']).buildId, prepared.buildInfo.buildId);
    } finally {
        process.chdir(before);
        if (oldURL === undefined) delete process.env.FJORD_FEEDBACK_URL;
        else process.env.FJORD_FEEDBACK_URL = oldURL;
    }
});
