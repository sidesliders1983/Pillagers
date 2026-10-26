import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
    existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, writeFileSync,
} from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { terrainIO } from '../../terrain-io.mjs';
import { buildClips } from './build-clips.mjs';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const manifestFile = fileURLToPath(new URL('./sources.json', import.meta.url));
const retargetFile = fileURLToPath(new URL('./retarget.py', import.meta.url));
const manifest = JSON.parse(readFileSync(manifestFile, 'utf8'));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

function verifyFile(file, expected, label) {
    const metadata = lstatSync(file);
    if (!metadata.isFile() || metadata.isSymbolicLink()) {
        throw new Error(label + ' must be a regular file.');
    }
    if (metadata.size !== expected.bytes) {
        throw new Error(label + ' differs from its frozen byte count.');
    }
    const bytes = readFileSync(file);
    if (bytes.length !== expected.bytes || hash(bytes) !== expected.sha256) {
        throw new Error(label + ' differs from its frozen source identity.');
    }
    return bytes;
}

function descendant(parent, child) {
    const path = relative(parent, child);
    return path !== '' && path !== '..' && !path.startsWith('..' + sep) && !isAbsolute(path);
}

function sourceIsIgnored(sourceDirectory) {
    const repository = execFileSync('git', ['rev-parse', '--show-toplevel'], {
        cwd: sourceDirectory, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
    for (const source of manifest.sources) {
        execFileSync('git', ['check-ignore', '--quiet', '--',
            relative(repository, join(sourceDirectory, source.file))], {
            cwd: repository, stdio: ['ignore', 'pipe', 'pipe'],
        });
    }
}

async function prepareNative(nativeFile, outputDirectory) {
    const io = await terrainIO();
    const decoded = await io.read(nativeFile);
    for (const extension of decoded.getRoot().listExtensionsUsed()) {
        if (extension.extensionName === 'EXT_meshopt_compression') extension.dispose();
    }
    writeFileSync(join(outputDirectory, manifest.intermediateNative.uncompressed.file),
        await io.writeBinary(decoded));

    const textureless = await io.read(nativeFile);
    for (const mesh of textureless.getRoot().listMeshes()) {
        for (const primitive of mesh.listPrimitives()) primitive.setMaterial(null);
    }
    for (const material of textureless.getRoot().listMaterials()) material.dispose();
    for (const texture of textureless.getRoot().listTextures()) texture.dispose();
    for (const extension of textureless.getRoot().listExtensionsUsed()) {
        if (extension.extensionName === 'EXT_meshopt_compression') extension.dispose();
    }
    writeFileSync(join(outputDirectory, manifest.intermediateNative.textureless.file),
        await io.writeBinary(textureless));
    for (const [name, expected] of Object.entries(manifest.intermediateNative)) {
        verifyFile(join(outputDirectory, expected.file), expected, 'Decoded native ' + name);
    }
}

function verifyRestNodes(nativeBytes, outputBytes) {
    const parse = bytes => JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)));
    const native = parse(nativeBytes);
    const output = parse(outputBytes);
    const rest = (document, node) => ({
        translation: node.translation ?? [0, 0, 0],
        rotation: node.rotation ?? [0, 0, 0, 1],
        scale: node.scale ?? [1, 1, 1],
        children: (node.children ?? []).map(index => document.nodes[index].name),
    });
    if (native.nodes.length !== output.nodes.length) throw new Error('Native node count changed.');
    for (const node of native.nodes) {
        const matched = output.nodes.find(candidate => candidate.name === node.name);
        if (!matched || JSON.stringify(rest(native, node)) !== JSON.stringify(rest(output, matched))) {
            throw new Error('Native rest transform or hierarchy changed: ' + node.name);
        }
    }
}

async function main() {
    const { values } = parseArgs({ options: {
        'source-directory': { type: 'string' },
        'output-directory': { type: 'string' },
        blender: { type: 'string' },
    } });
    if (!values['source-directory'] || !values['output-directory'] || !values.blender) {
        throw new Error('Usage: node scripts/characters/cultural-motion/prepare.mjs '
            + '--source-directory PATH --output-directory NEW_PATH --blender EXECUTABLE');
    }
    const sourceDirectory = realpathSync(resolve(values['source-directory']));
    const outputDirectory = resolve(values['output-directory']);
    const blender = realpathSync(resolve(values.blender));
    if (!descendant(sourceDirectory, outputDirectory) || existsSync(outputDirectory)) {
        throw new Error('Use a new output subdirectory inside the ignored authoring source directory.');
    }
    sourceIsIgnored(sourceDirectory);
    const version = execFileSync(blender, ['--version'], {
        encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    }).split(/\r?\n/)[0];
    if (version.split(/\s+/)[0] !== 'Blender' || version.split(/\s+/)[1] !== manifest.blender.version) {
        throw new Error('Use the pinned Blender ' + manifest.blender.version + ' version.');
    }
    for (const source of manifest.sources) {
        verifyFile(join(sourceDirectory, source.file), source, 'Generated ' + source.name);
    }
    for (const native of manifest.nativeLods) {
        const bytes = readFileSync(join(root, native.file));
        if (hash(bytes) !== native.sha256) throw new Error('Native LOD identity changed: ' + native.lod);
    }
    const nativeFile = join(root, manifest.sourceBody);
    const nativeBytes = readFileSync(nativeFile);
    if (hash(nativeBytes) !== manifest.sourceBodySha256) throw new Error('Native body identity changed.');
    mkdirSync(dirname(outputDirectory), { recursive: true });
    mkdirSync(outputDirectory);
    await prepareNative(nativeFile, outputDirectory);

    try {
        const log = execFileSync(blender, ['--background', '--factory-startup', '--python-exit-code', '1',
            '--python', retargetFile, '--', '--manifest', manifestFile,
            '--source-directory', sourceDirectory,
            '--native', join(outputDirectory, manifest.intermediateNative.uncompressed.file),
            '--output-directory', outputDirectory], {
            encoding: 'utf8', maxBuffer: 8 * 1048576, stdio: ['ignore', 'pipe', 'pipe'],
        });
        writeFileSync(join(outputDirectory, 'blender.log'), log);
    } catch (error) {
        writeFileSync(join(outputDirectory, 'blender.log'),
            String(error.stdout ?? '') + String(error.stderr ?? ''));
        throw new Error('Blender preparation failed. Preserve and inspect its output directory.');
    }
    const outputFile = join(outputDirectory, manifest.expectedOutput.file);
    const summary = await buildClips({ manifest, nativeFile,
        texturelessFile: join(outputDirectory, manifest.intermediateNative.textureless.file),
        posesDirectory: outputDirectory, outputFile });
    const output = verifyFile(outputFile, manifest.expectedOutput, 'Prepared animation bundle');
    if (summary.conservativeTrackBytes !== manifest.expectedOutput.conservativeDecodedTrackBytes
        || summary.conservativeTrackBytes > manifest.budget.maximumDecodedTrackBytes
        || output.length > manifest.budget.maximumEncodedBytes
        || summary.meshes !== 0 || summary.images !== 0 || summary.skins !== 0) {
        throw new Error('Prepared bundle differs from the qualified clip-only budget or contents.');
    }
    verifyRestNodes(nativeBytes, output);
    const result = {
        schemaVersion: 1,
        status: 'prepared-unregistered',
        sourceManifestSha256: hash(readFileSync(manifestFile)),
        preparationSources: Object.fromEntries(['prepare.mjs', 'build-clips.mjs', 'retarget.py']
            .map(file => [file, hash(readFileSync(new URL('./' + file, import.meta.url)))])),
        blender: version,
        sourceBodySha256: manifest.sourceBodySha256,
        preparedFile: manifest.expectedOutput.file,
        sha256: hash(output),
        bytes: output.length,
        ...summary,
        originalRestHierarchyPreserved: true,
        interpretation: manifest.interpretation,
    };
    writeFileSync(join(outputDirectory, 'prepared.json'), JSON.stringify(result, null, 2) + '\n');
    console.log(JSON.stringify(result, null, 2));
}

await main();
