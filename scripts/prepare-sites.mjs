import { verifyAlphaArtifact, publicVersion, inputHash } from './build-info.mjs';
import {
    cpSync,
    existsSync,
    lstatSync,
    mkdirSync,
    readFileSync,
    readdirSync,
    realpathSync,
    rmSync,
    statSync,
    writeFileSync,
} from 'node:fs';
import { basename, dirname, join, resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { preparedBindingExclusions } from './sites-prepared-bindings.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const { values } = parseArgs({ options: {
    'source-directory': { type: 'string' },
    'alpha-artifact': { type: 'string' },
    'site-directory': { type: 'string' },
} });
const requestedSource = values['source-directory'];
const sourceDirectory = requestedSource ? resolve(requestedSource) : root;
const buildDirectory = values['alpha-artifact'] ? resolve(values['alpha-artifact']) : join(sourceDirectory, 'dist');
const sourceConfig = JSON.parse(readFileSync(join(root, '.openai', 'site-source.json'), 'utf8'));
const provenancePath = join(sourceDirectory, '.sites-main.json');
if (!existsSync(provenancePath)) {
    throw new Error('Prepare the source with scripts/prepare-sites-main.mjs before packaging.');
}
const provenance = JSON.parse(readFileSync(provenancePath, 'utf8'));
if (sourceConfig.branch !== 'main' || provenance.repository !== sourceConfig.repository
    || provenance.branch !== 'main'
    || JSON.stringify(provenance.routes) !== JSON.stringify(['/', '/fjord-play'])
    || !/^[a-f0-9]{40}$/.test(provenance.commit)) {
    throw new Error('Prepare the source with scripts/prepare-sites-main.mjs before packaging.');
}
const remoteHead = execFileSync('git', ['ls-remote', sourceConfig.repository, 'refs/heads/main'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim().split(/\s+/)[0];
if (remoteHead !== provenance.commit) {
    throw new Error('Main changed after source preparation. Prepare and build the latest main.');
}
if (!values['alpha-artifact']) throw new Error('Download the exact main Alpha package artifact; public alpha builds must not be renumbered or rebuilt during hosting.');
const buildInfo = verifyAlphaArtifact(buildDirectory, { commit: provenance.commit,
    version: publicVersion(sourceDirectory).version, distributable: true });
if (buildInfo.inputHash !== inputHash(sourceDirectory))
    throw new Error('The alpha artifact was packaged from different source inputs.');
const sourceArtifact = JSON.parse(readFileSync(join(buildDirectory, 'alpha-artifact.json'), 'utf8'));
const siteDirectory = values['site-directory']
    ? resolve(values['site-directory']) : join(root, 'scratch', 'sites', 'pillagers-test');
const outputDirectory = join(siteDirectory, 'dist');
const manifest = JSON.parse(readFileSync(join(root, '.openai', 'hosting.json'), 'utf8'));
const maximumFileBytes = 25 * 1024 * 1024;
const excludedSource = /(?:^|[_-])source\.(?:glb|gltf|fbx|obj)$/i;
// Historical Golden body revisions remain in Git/local authoring. The Lab supports r3 only;
// saved snapshots with an older style already fail the normal current-registry validation.
const retiredPreviews = new Set([
    'character-lab/candidates/golden-v04/body.glb',
    'character-lab/candidates/golden-v04/body-r1.glb',
    'character-lab/candidates/golden-v04/body-r2.glb',
]);
const publicationPath = file => relative(buildDirectory, file).split(sep).join('/');
const previewDirectories = ['model-preview'];
const excludePublication = file => excludedSource.test(basename(file))
    || retiredPreviews.has(publicationPath(file))
    || preparedBindings.has(publicationPath(file))
    || previewDirectories.some(directory => publicationPath(file) === directory
        || publicationPath(file).startsWith(directory + '/'));
// The service accepts 256 MiB expanded. Reserve 1 MiB for normalized hosting metadata.
const maximumPublicationBytes = 255 * 1024 * 1024;
const routes = ['fjord-play'];

if (!manifest.project_id || manifest.static?.directory !== 'dist') {
    throw new Error('Sites requires a registered project and static.directory set to dist.');
}
if (sourceConfig.project_id !== manifest.project_id) {
    throw new Error('The configured main source belongs to another Site.');
}
if (!existsSync(join(buildDirectory, 'index.html'))) {
    throw new Error('Production build missing. Run the project build before preparing Sites.');
}
if (existsSync(outputDirectory) && realpathSync(buildDirectory) === realpathSync(outputDirectory)) {
    throw new Error('The main build and Sites output must be separate directories.');
}
const targetManifest = join(siteDirectory, '.openai', 'hosting.json');
if (existsSync(targetManifest)
    && JSON.parse(readFileSync(targetManifest, 'utf8')).project_id !== manifest.project_id) {
    throw new Error('The destination checkout belongs to another Site.');
}

const preparedBindings = await preparedBindingExclusions(sourceDirectory, buildDirectory);

// Validate before replacing the previous publication snapshot.
let fileCount = 0;
let totalBytes = 0;
const excludedFiles = [];
for (const entry of readdirSync(buildDirectory, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const file = join(entry.parentPath, entry.name);
    if (excludePublication(file)) {
        excludedFiles.push(publicationPath(file));
        continue;
    }
    if (entry.name.endsWith('.js')) {
        const code = readFileSync(file, 'utf8');
        for (const directory of previewDirectories) {
            if (code.includes('/' + directory + '/')) {
                throw new Error('Runtime references an excluded preview directory: ' + directory);
            }
        }
        for (const preview of retiredPreviews) {
            if (code.includes(preview)) {
                throw new Error('Runtime references a retired preview; review publication filtering: ' + preview);
            }
        }
    }
    const bytes = statSync(file).size;
    if (bytes > maximumFileBytes) {
        throw new Error(`Static file exceeds 25 MiB: ${file}`);
    }
    fileCount++;
    totalBytes += bytes;
}
const routeIndexBytes = statSync(join(buildDirectory, 'index.html')).size * routes.length;
if (totalBytes + routeIndexBytes > maximumPublicationBytes) {
    throw new Error('Static publication exceeds the 255 MiB Sites packaging budget. Review unused assets before publishing.');
}

mkdirSync(siteDirectory, { recursive: true });
// The only replaced directory is this fixed, ignored publication snapshot.
if (existsSync(outputDirectory)) {
    if (lstatSync(outputDirectory).isSymbolicLink()
        || realpathSync(outputDirectory) !== join(realpathSync(siteDirectory), 'dist')) {
        throw new Error('Refusing to replace a publication directory outside the Sites checkout.');
    }
    rmSync(outputDirectory, { recursive: true });
}
cpSync(buildDirectory, outputDirectory, {
    recursive: true,
    filter: file => !excludePublication(file),
});
writeFileSync(join(outputDirectory, 'site-version.json'),
    JSON.stringify({ ...provenance, buildInfo, sourceArtifact: { contentHash: sourceArtifact.contentHash, excludedFiles } }, null, 2) + '\n');

// The hosted game has one direct entry alongside the root index.
for (const route of routes) {
    const directory = join(outputDirectory, route);
    mkdirSync(directory, { recursive: true });
    cpSync(join(outputDirectory, 'index.html'), join(directory, 'index.html'));
}

mkdirSync(join(siteDirectory, '.openai'), { recursive: true });
writeFileSync(join(siteDirectory, '.openai', 'hosting.json'),
    JSON.stringify(manifest, null, 2) + '\n');
writeFileSync(join(siteDirectory, '.openai', 'site-source.json'),
    JSON.stringify(sourceConfig, null, 2) + '\n');
// Keep the updater with the Site, so a fresh cloud run does not need this workstation.
for (const relative of [
    'scripts/prepare-sites-main.mjs',
    'scripts/build-info.mjs',
    'scripts/prepare-alpha-build.mjs',
    'src/build/GameVersion.ts',
    'game-version.json',
    'docs/VERSIONING.md',
    'scripts/prepare-sites.mjs',
    'scripts/sites-prepared-bindings.mjs',
    'scripts/sites-prepared-bindings.test.mjs',
    'docs/SITES-PUBLISHING.md',
]) {
    const source = join(root, relative);
    const destination = join(siteDirectory, relative);
    mkdirSync(dirname(destination), { recursive: true });
    if (resolve(source) !== resolve(destination)) cpSync(source, destination);
}
cpSync(join(root, 'docs', 'SITES-PUBLISHING.md'), join(siteDirectory, 'PUBLISHING.md'));
const ignoreFile = join(siteDirectory, '.gitignore');
let ignored = existsSync(ignoreFile) ? readFileSync(ignoreFile, 'utf8') : '';
for (const pattern of ['node_modules/', 'scratch/', '.sites-runtime/', '*.tar.gz']) {
    if (!ignored.split(/\r?\n/).includes(pattern)) ignored += '\n' + pattern + '\n';
}
writeFileSync(ignoreFile, ignored);
writeFileSync(join(siteDirectory, 'README.md'),
    '# Pillagers test publication\n\n'
    + 'Generated static snapshot of GitHub main at ' + provenance.commit + '.\n'
    + 'Source: ' + provenance.repository + '\n'
    + 'Prepare updates with `node scripts/prepare-sites-main.mjs`, then build and package.\n'
    + 'Original source models and local credentials are excluded.\n');

console.log(JSON.stringify({
    checkout: siteDirectory,
    sourceCommit: provenance.commit,
    files: fileCount,
    mebibytes: Number((totalBytes / 1024 / 1024).toFixed(2)),
    excludedFiles,
    routes,
}, null, 2));
