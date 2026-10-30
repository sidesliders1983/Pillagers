import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { closeSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, readSync,
    readdirSync, realpathSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { describeGameVersion } from '../src/build/GameVersion.ts';

export const alphaAuthority = 'sidesliders1983/Pillagers/.github/workflows/alpha-package.yml';
const buildDirectories = ['src', 'public', 'scripts'];
const buildFiles = ['game-version.json', 'package.json', 'pnpm-lock.yaml', 'tsconfig.json',
    'vite.config.ts', 'index.html', '.sites-main.json'];

export function publicVersion(root) {
    return describeVersion(JSON.parse(readFileSync(resolve(root, 'game-version.json'), 'utf8')).version);
}

const describeVersion = describeGameVersion;

function gitSource(root) {
    try {
        const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: 'pipe' }).trim();
        if (realpathSync(git(['rev-parse', '--show-toplevel'])) !== realpathSync(root))
            throw new Error('A parent repository is not this source.');
        return { commit: git(['rev-parse', 'HEAD']),
            dirty: !!git(['status', '--porcelain', '--untracked-files=normal']), provenance: 'git' };
    } catch { return { commit: null, dirty: null, provenance: 'unknown' }; }
}

function exportedSource(root) {
    const path = join(root, '.sites-main.json');
    if (!existsSync(path)) return null;
    try {
        const source = JSON.parse(readFileSync(path, 'utf8'));
        if (source.repository !== 'https://github.com/sidesliders1983/Pillagers.git'
            || !/^[a-f0-9]{40}$/.test(source.commit) || typeof source.branch !== 'string')
            throw new Error('Invalid exported source identity.');
        return { commit: source.commit, dirty: null, provenance: 'sites-export', branch: source.branch };
    } catch { return { commit: null, dirty: null, provenance: 'unknown' }; }
}

/** Hash bounded chunks, so large committed model files do not inflate packaging memory. */
export function fileHash(path) {
    const hash = createHash('sha256');
    const descriptor = openSync(path, 'r');
    const buffer = Buffer.allocUnsafe(64 * 1024);
    try {
        for (let count; (count = readSync(descriptor, buffer)) > 0;) hash.update(buffer.subarray(0, count));
    } finally { closeSync(descriptor); }
    return hash.digest('hex');
}

export function inputHash(root) {
    const hash = createHash('sha256');
    const paths = [];
    function walk(relative) {
        for (const entry of readdirSync(join(root, relative), { withFileTypes: true })) {
            const path = relative + '/' + entry.name;
            if (entry.isSymbolicLink()) throw new Error('Build inputs must not contain symbolic links: ' + path);
            if (entry.isDirectory()) walk(path);
            else if (entry.isFile()) paths.push(path);
        }
    }
    for (const directory of buildDirectories) if (existsSync(join(root, directory))) walk(directory);
    for (const path of buildFiles) if (existsSync(join(root, path))) paths.push(path);
    for (const path of paths.sort()) hash.update(path + '\0' + fileHash(join(root, path)) + '\n');
    return hash.digest('hex');
}

function compileConfiguration(environment) {
    try {
        const url = new URL(environment.FJORD_FEEDBACK_URL);
        if (url.protocol === 'https:' && !url.username && !url.password) return { feedbackURL: url.href };
    } catch { /* An absent/invalid destination has the existing no-feedback-link behavior. */ }
    return { feedbackURL: '' };
}

function positive(value) {
    return typeof value === 'string' && /^[1-9][0-9]*$/.test(value) && Number.isSafeInteger(Number(value));
}

function verifyStamp(root, info, source) {
    artifactIdentity(info, { commit: source.commit, version: publicVersion(root).version });
    if (info.source.commit !== source.commit || info.source.branch !== source.branch
        || !info.configuration || info.inputHash !== inputHash(root))
        throw new Error('Numbered build stamp does not match this source: build inputs or identity changed.');
    return info;
}

/** Resolve once per Vite build. Serve mode cannot inherit an official number from edited source. */
export function resolveBuildInfo(root, { now = new Date().toISOString(), mode = 'build', environment = process.env } = {}) {
    const version = publicVersion(root);
    const source = exportedSource(root) ?? gitSource(root);
    const stampPath = join(root, '.fjord-build.json');
    if (existsSync(stampPath) && mode !== 'serve')
        return verifyStamp(root, JSON.parse(readFileSync(stampPath, 'utf8')), source);
    if (existsSync(stampPath)) {
        try { source.dirty = JSON.parse(readFileSync(stampPath, 'utf8')).inputHash !== inputHash(root); }
        catch { source.dirty = true; }
    }
    const configuration = compileConfiguration(environment);
    const identity = createHash('sha256').update(JSON.stringify({ source, now, version, configuration })).digest('hex');
    const legacyBuild = source.commit ? source.commit + (source.dirty ? '-dirty' :
        source.provenance === 'sites-export' && source.branch === 'main' ? '-sites-main' : '') : 'unidentified-source';
    return { schemaVersion: 1, ...version, origin: 'local', buildNumber: null,
        buildId: 'local-' + identity.slice(0, 20), builtAt: now, source, legacyBuild, configuration };
}

/** The same committed entry transform is used by CI and fresh-main Sites validation. */
export function fjordPlayEntry(source) {
    const originalRoute = "if (route === '/fjord-play') {";
    const start = source.indexOf(originalRoute);
    const end = source.indexOf('\n} else if', start);
    if (start < 0 || end < 0 || !source.slice(start, end).includes("import('./fjord-play/FjordEntry')"))
        throw new Error('Review the public Fjord entry before alpha packaging.');
    return source.slice(0, end).replace(originalRoute, "if (route === '' || route === '/fjord-play') {")
        + "\n} else {\n    document.body.textContent = 'Page not found.';\n}\n";
}

/** GitHub allocates the sequence. Local callers cannot request an arbitrary numbered build. */
export function prepareAlphaSource(repositoryRoot, outputParent, env = process.env) {
    const source = gitSource(repositoryRoot);
    if (!source.commit || source.dirty || source.commit !== env.GITHUB_SHA
        || env.GITHUB_ACTIONS !== 'true' || env.GITHUB_REPOSITORY !== 'sidesliders1983/Pillagers'
        || env.GITHUB_WORKFLOW_REF !== alphaAuthority + '@' + env.GITHUB_REF
        || !['push', 'pull_request', 'workflow_dispatch'].includes(env.GITHUB_EVENT_NAME)
        || !positive(env.GITHUB_RUN_NUMBER) || !positive(env.GITHUB_RUN_ID) || !positive(env.GITHUB_RUN_ATTEMPT))
        throw new Error('Numbered alpha packaging requires the designated workflow and its clean checked-out source.');
    mkdirSync(outputParent, { recursive: true });
    const sourceDirectory = mkdtempSync(join(outputParent, 'alpha-' + env.GITHUB_RUN_ID + '-' + env.GITHUB_RUN_ATTEMPT + '-'));
    const git = args => execFileSync('git', args, { cwd: repositoryRoot, encoding: 'utf8', stdio: 'pipe' }).trim();
    const paths = git(['ls-tree', source.commit]).split('\n').flatMap(line => {
        const [metadata, path] = line.split('\t');
        return metadata.includes(' blob ') || [...buildDirectories, 'tests'].includes(path) ? [path] : [];
    });
    const archive = join(sourceDirectory, 'source.tar');
    git(['archive', '--format=tar', '--output=' + archive, source.commit, '--', ...paths]);
    execFileSync('tar', ['-xf', archive, '-C', sourceDirectory], { stdio: 'pipe' });
    unlinkSync(archive);
    const entryPath = join(sourceDirectory, 'src/main.ts');
    const entry = readFileSync(entryPath, 'utf8');
    writeFileSync(entryPath, fjordPlayEntry(entry));
    const branch = env.GITHUB_REF.startsWith('refs/heads/') ? env.GITHUB_REF.slice(11) : env.GITHUB_REF;
    const provenance = { repository: 'https://github.com/sidesliders1983/Pillagers.git', branch,
        commit: source.commit, entry_route: '/fjord-play', routes: ['/', '/fjord-play'] };
    writeFileSync(join(sourceDirectory, '.sites-main.json'), JSON.stringify(provenance, null, 2) + '\n');
    const info = { ...resolveBuildInfo(sourceDirectory, { environment: env }), source: { ...exportedSource(sourceDirectory), dirty: false },
        origin: branch === 'main' && env.GITHUB_EVENT_NAME !== 'pull_request' ? 'distributable' : 'preview',
        buildNumber: Number(env.GITHUB_RUN_NUMBER), buildId: 'alpha-' + env.GITHUB_RUN_ID + '-' + env.GITHUB_RUN_ATTEMPT,
        sequence: { authority: alphaAuthority, runId: env.GITHUB_RUN_ID, attempt: Number(env.GITHUB_RUN_ATTEMPT) },
        inputHash: inputHash(sourceDirectory) };
    info.versionTag = info.version + '+build.' + info.buildNumber + '.attempt.' + info.sequence.attempt;
    writeFileSync(join(sourceDirectory, '.fjord-build.json'), JSON.stringify(info, null, 2) + '\n');
    if (existsSync(join(repositoryRoot, 'node_modules')))
        symlinkSync(resolve(repositoryRoot, 'node_modules'), join(sourceDirectory, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
    return { sourceDirectory, buildInfo: info };
}

function artifactFiles(directory) {
    const files = {};
    function walk(relative = '') {
        for (const entry of readdirSync(join(directory, relative), { withFileTypes: true })) {
            const path = relative ? relative + '/' + entry.name : entry.name;
            if (entry.isSymbolicLink()) throw new Error('Artifact links are not allowed.');
            if (entry.isDirectory()) walk(path);
            else if (entry.isFile() && path !== 'alpha-artifact.json') files[path] = fileHash(join(directory, path));
        }
    }
    walk();
    return Object.fromEntries(Object.entries(files).sort(([left], [right]) => left.localeCompare(right, 'en')));
}

function artifactIdentity(info, expected) {
    const version = describeVersion(info.version);
    if (info.schemaVersion !== 1 || info.displayVersion !== version.displayVersion || info.channel !== version.channel
        || !['distributable', 'preview'].includes(info.origin) || info.source?.dirty !== false
        || info.source?.provenance !== 'sites-export' || !/^[a-f0-9]{40}$/.test(info.source?.commit)
        || (info.origin === 'distributable' && info.source?.branch !== 'main')
        || !Number.isSafeInteger(info.buildNumber) || info.buildNumber < 1
        || info.sequence?.authority !== alphaAuthority || !positive(info.sequence?.runId)
        || !Number.isSafeInteger(info.sequence?.attempt) || info.sequence.attempt < 1
        || info.buildId !== 'alpha-' + info.sequence.runId + '-' + info.sequence.attempt
        || info.versionTag !== info.version + '+build.' + info.buildNumber + '.attempt.' + info.sequence.attempt
        || info.legacyBuild !== info.source.commit + (info.source.branch === 'main' ? '-sites-main' : '')
        || !/^[a-f0-9]{64}$/.test(info.inputHash) || !Number.isFinite(Date.parse(info.builtAt))
        || !info.builtAt.endsWith('Z')
        || (expected.commit && expected.commit !== info.source.commit)
        || (expected.version && expected.version !== info.version)
        || (info.configuration !== undefined && (typeof info.configuration.feedbackURL !== 'string'
            || info.configuration.feedbackURL !== compileConfiguration({ FJORD_FEEDBACK_URL: info.configuration.feedbackURL }).feedbackURL))
        || (expected.distributable && (info.origin !== 'distributable' || !info.configuration)))
        throw new Error('Alpha artifact source/build identity does not match the requested commit or version.');
}

/** Seal the compiled record and every output byte; there is no allocation during promotion. */
export function sealAlphaArtifact(sourceDirectory) {
    const info = resolveBuildInfo(sourceDirectory);
    artifactIdentity(info, {});
    const directory = join(sourceDirectory, 'dist');
    const embedded = JSON.parse(readFileSync(join(directory, 'build-info.json'), 'utf8'));
    if (!isDeepStrictEqual(embedded, info)) throw new Error('Compiled build identity differs from prepared source.');
    const entry = readFileSync(join(directory, 'index.html'));
    mkdirSync(join(directory, 'fjord-play'), { recursive: true });
    writeFileSync(join(directory, 'fjord-play/index.html'), entry);
    const provenance = JSON.parse(readFileSync(join(sourceDirectory, '.sites-main.json'), 'utf8'));
    writeFileSync(join(directory, 'site-version.json'), JSON.stringify({ ...provenance, buildInfo: info }, null, 2) + '\n');
    const files = artifactFiles(directory);
    const contentHash = createHash('sha256').update(JSON.stringify(files)).digest('hex');
    writeFileSync(join(directory, 'alpha-artifact.json'),
        JSON.stringify({ schemaVersion: 1, buildId: info.buildId, contentHash, files }, null, 2) + '\n');
    verifyAlphaArtifact(directory);
    return { directory, buildInfo: info, contentHash };
}

/** Validate the downloaded CI artifact before any hosting filters or source synchronization. */
export function verifyAlphaArtifact(directory, expected = {}) {
    const info = JSON.parse(readFileSync(join(directory, 'build-info.json'), 'utf8'));
    artifactIdentity(info, expected);
    const manifest = JSON.parse(readFileSync(join(directory, 'alpha-artifact.json'), 'utf8'));
    if (manifest.schemaVersion !== 1 || manifest.buildId !== info.buildId || !manifest.files
        || Array.isArray(manifest.files)) throw new Error('Missing alpha artifact manifest.');
    for (const [path, hash] of Object.entries(manifest.files)) {
        if (path.includes('\\') || !resolve(directory, path).startsWith(resolve(directory) + sep)
            || !/^[a-f0-9]{64}$/.test(hash)) throw new Error('Invalid artifact file path or hash.');
    }
    const files = artifactFiles(directory);
    if (!isDeepStrictEqual(files, manifest.files)
        || manifest.contentHash !== createHash('sha256').update(JSON.stringify(files)).digest('hex'))
        throw new Error('Alpha artifact bytes do not match its sealed hashes.');
    const provenance = JSON.parse(readFileSync(join(directory, 'site-version.json'), 'utf8'));
    if (provenance.commit !== info.source.commit || provenance.branch !== info.source.branch
        || !isDeepStrictEqual(provenance.buildInfo, info)) throw new Error('Packaged source/build identity differs.');
    return info;
}
