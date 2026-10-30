import { fjordPlayEntry } from './build-info.mjs';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));

export function prepareMainSource(repositoryRoot, config, outputParent) {
    if (config.branch !== 'main') {
        throw new Error('The playtest Site must follow main.');
    }
    const git = args => execFileSync('git', args, {
        cwd: repositoryRoot,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();

    // Fetch the configured repository directly, independently of the active local branch.
    git(['fetch', '--no-tags', config.repository, 'refs/heads/main']);
    const commit = git(['rev-parse', '--verify', 'FETCH_HEAD^{commit}']);
    if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error('Could not resolve main to a commit.');

    mkdirSync(outputParent, { recursive: true });
    const sourceDirectory = mkdtempSync(join(outputParent, 'main-' + commit.slice(0, 12) + '-'));
    const archive = join(sourceDirectory, 'source.tar');
    // Authoring models and historical QA reports are not build inputs. Export the
    // application, validation tools and root configuration without duplicating them.
    const buildDirectories = new Set(['src', 'public', 'scripts', 'tests']);
    const buildPaths = git(['ls-tree', commit]).split('\n').flatMap(line => {
        const [metadata, path] = line.split('\t');
        return metadata.includes(' blob ') || buildDirectories.has(path) ? [path] : [];
    });
    git(['archive', '--format=tar', '--output=' + archive, commit, '--', ...buildPaths]);
    execFileSync('tar', ['-xf', archive, '-C', sourceDirectory], { stdio: 'pipe' });
    unlinkSync(archive);

    const entry = join(sourceDirectory, 'src', 'main.ts');
    const source = readFileSync(entry, 'utf8');
    writeFileSync(entry, fjordPlayEntry(source));

    const provenance = {
        repository: config.repository,
        branch: config.branch,
        commit,
        entry_route: config.entry_route,
        routes: ['/', '/fjord-play'],
    };
    writeFileSync(join(sourceDirectory, '.sites-main.json'),
        JSON.stringify(provenance, null, 2) + '\n');
    return { sourceDirectory, ...provenance };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    if (process.argv.length !== 2) {
        throw new Error('Usage: node scripts/prepare-sites-main.mjs');
    }
    const config = JSON.parse(readFileSync(join(root, '.openai', 'site-source.json'), 'utf8'));
    const manifest = JSON.parse(readFileSync(join(root, '.openai', 'hosting.json'), 'utf8'));
    if (config.project_id !== manifest.project_id) {
        throw new Error('Site source configuration does not match the registered Site.');
    }
    console.log(JSON.stringify(prepareMainSource(root, config,
        join(root, 'scratch', 'sites', 'main-builds')), null, 2));
}
