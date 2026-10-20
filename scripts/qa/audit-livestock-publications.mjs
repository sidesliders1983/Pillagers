import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';

await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const revision = '37e8ba72e2b0127806097a886966758df1991998';
const publications = [];
const preservation = [];
function compareClip(before, after, name) {
    const channels = animation => new Map(animation.listChannels().map(channel =>
        [channel.getTargetNode().getName() + ':' + channel.getTargetPath(), channel.getSampler()]));
    const original = channels(before), current = channels(after);
    assert.deepEqual([...current.keys()].sort(), [...original.keys()].sort(), name + ' channel identities');
    let maximumDifference = 0;
    for (const [key, sampler] of original) for (const attribute of ['getInput', 'getOutput']) {
        const a = sampler[attribute]().getArray(), b = current.get(key)[attribute]().getArray();
        assert.equal(a.length, b.length, name + '/' + key + ' sample count');
        for (let index = 0; index < a.length; index++)
            maximumDifference = Math.max(maximumDifference, Math.abs(a[index] - b[index]));
    }
    assert.ok(maximumDifference <= 1e-6, name + ' original motion changed');
    return maximumDifference;
}
for (const species of ['goat', 'pig', 'sheep', 'cattle']) {
    const variants = species === 'cattle' ? ['baby', 'young-adult', 'adult-female', 'adult-male'] :
        ['baby', 'adult-female', 'adult-male'];
    for (const variant of variants) {
        const directory = 'public/game-assets/' + (species === 'cattle' ? 'cattle/' : 'livestock/' + species + '/') + variant;
        const manifest = JSON.parse(await readFile(directory + '/manifest.json', 'utf8'));
        const bytes = await readFile(directory + '/' + manifest.file);
        assert.equal(hash(bytes), manifest.sha256);
        const document = await io.readBinary(bytes);
        if (species === 'cattle') {
            const originalBytes = execFileSync('git', ['show', revision + ':' + directory + '/' + manifest.file],
                { maxBuffer: 4 * 1024 * 1024 });
            const original = await io.readBinary(originalBytes);
            for (const name of ['Idle', 'Walk', 'Graze', 'HumanInteraction']) preservation.push({
                variant, name, maximumDifference: compareClip(
                    original.getRoot().listAnimations().find(animation => animation.getName() === name),
                    document.getRoot().listAnimations().find(animation => animation.getName() === name), name),
            });
        }
        publications.push({ species, variant, directory, ...manifest });
    }
}
let sourceAudit = JSON.parse(await readFile('docs/qa/livestock-models/source-audit.json', 'utf8')).sources;
const sourceArgument = process.argv.indexOf('--source-audit');
if (sourceArgument !== -1) {
    const additions = JSON.parse(await readFile(process.argv[sourceArgument + 1], 'utf8'));
    const fileName = record => record.source.replaceAll('\\', '/').split('/').at(-1).toLowerCase();
    const updatedFiles = new Set(additions.map(fileName));
    sourceAudit = [...sourceAudit.filter(record => !updatedFiles.has(fileName(record))), ...additions];
}
for (const source of sourceAudit) {
    const publication = publications.find(record => record.species !== 'cattle' &&
        source.source.toLowerCase().endsWith(record.sourceFile.toLowerCase()));
    assert.ok(publication, 'An audited source must have a real publication');
    assert.equal(publication.sourceSha256, source.sha256, 'Source audit is stale; repeat the Blender inspection');
}
for (const publication of publications.filter(record => record.species !== 'cattle')) {
    assert.ok(sourceAudit.some(source => source.sha256 === publication.sourceSha256),
        'Every supplied publication must have a matching source inspection');
}
const report = { status: 'PASS', sourceRevision: revision,
    excluded: ['Chicken: assets deferred', 'Goose: assets deferred'],
    sources: sourceAudit, publications,
    cattlePreservation: preservation };
await writeFile('docs/qa/livestock-models/source-audit.json', JSON.stringify(report, null, 2) + '\n');
console.log('Verified ' + publications.length + ' publications and all 16 existing cattle activity clips against the frozen source.');
