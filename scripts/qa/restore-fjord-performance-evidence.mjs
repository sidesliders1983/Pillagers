import { execFileSync } from 'node:child_process';
import { mkdir, unlink } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const source = '933deeaf13aa005a14564eaea4cc3c724981f446';
const roots = [
    'docs/qa/fjord-runtime-performance',
    'docs/qa/fjord-runtime-improvements',
    'docs/qa/fjord-navigation-performance',
];
const repository = fileURLToPath(new URL('../..', import.meta.url));
const artifacts = resolve(repository, 'artifacts');
const destination = resolve(repository, process.argv[2] || 'artifacts/fjord-performance-evidence');
const withinArtifacts = relative(artifacts, destination);
if (!withinArtifacts || withinArtifacts === '..' || withinArtifacts.startsWith('..' + sep) ||
    isAbsolute(withinArtifacts)) {
    throw new Error('Choose a new directory inside this repository\'s artifacts folder.');
}

// Read the original merged Git objects; never overwrite the current reports or source tree.
const commandOptions = { cwd: repository, stdio: 'inherit' };
execFileSync('git', ['cat-file', '-e', source + '^{commit}'], commandOptions);
await mkdir(dirname(destination), { recursive: true });
await mkdir(destination); // An existing destination is an error, so previous captures remain safe.
const archive = join(destination, 'evidence.tar');
execFileSync('git', [
    '-c', 'core.autocrlf=false', '-c', 'core.eol=lf',
    'archive', '--format=tar', '--output=' + archive, source, ...roots,
], commandOptions);
execFileSync('tar', ['-xf', archive, '-C', destination], commandOptions);
await unlink(archive);
console.log('Original performance evidence restored from ' + source + ' to ' + destination);
