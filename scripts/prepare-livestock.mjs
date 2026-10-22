import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve, basename } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTTextureWebP } from '@gltf-transform/extensions';
import { dedup, prune, resample, meshopt } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import sharp from 'sharp';
import { authorLivestockClips } from './characters/livestock-clips.mjs';
import { loadTypeScript } from './load-typescript.mjs';

globalThis.self = globalThis;
globalThis.createImageBitmap = async () => ({ width: 512, height: 512, close() {} });
await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
    'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder,
});
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const sourceRoot = resolve(process.argv[2] ?? 'Assets/Characters/Livestock');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const cattleRigs = JSON.parse(await readFile(new URL('cattle-rigs.json', import.meta.url), 'utf8'));
const cattleSourceRevision = '37e8ba72e2b0127806097a886966758df1991998';
const originalCattleFile = file => execFileSync('git', ['show', cattleSourceRevision + ':' + file],
    { maxBuffer: 16 * 1024 * 1024 });
const { livestockPresentation } = loadTypeScript(new URL('../src/characters/LivestockPresentation.ts', import.meta.url));
const definitions = [];
for (const species of ['goat', 'pig', 'sheep']) {
    const directory = resolve(sourceRoot, species[0].toUpperCase() + species.slice(1));
    for (const file of await readdir(directory)) {
        if (!file.toLowerCase().endsWith('.glb')) continue;
        const variant = file.toLowerCase().startsWith('baby') ? 'baby' :
            file.toLowerCase().startsWith('female') ? 'adult-female' : 'adult-male';
        definitions.push({ species, variant, source: resolve(directory, file),
            withers: livestockPresentation(species + '/' + variant).withers });
    }
}
for (const [variant, rig] of Object.entries(cattleRigs)) definitions.push({
    ...rig, species: 'cattle', variant,
    source: 'public/game-assets/cattle/' + variant + '/' +
        JSON.parse(originalCattleFile('public/game-assets/cattle/' + variant + '/manifest.json')).file,
});
for (const definition of definitions) {
    if (process.argv.includes('--species') && definition.species !== process.argv[process.argv.indexOf('--species') + 1]) continue;
    const cattle = definition.species === 'cattle';
    const source = cattle ? originalCattleFile(definition.source) : await readFile(definition.source);
    const doc = await io.readBinary(source);
    const root = doc.getRoot();
    for (const material of root.listMaterials()) material.setEmissiveFactor([0, 0, 0]);
    const prepared = Buffer.from(await io.writeBinary(doc));
    const gltf = await loader.parseAsync(prepared.buffer.slice(prepared.byteOffset, prepared.byteOffset + prepared.byteLength), '');
    const authored = authorLivestockClips(doc, gltf, definition, cattle);
    const before = cattle ? JSON.parse(originalCattleFile('public/game-assets/cattle/' +
        definition.variant + '/manifest.json')) : null;
    const sourceSize = authored.bindBounds.max.map((value, axis) => value - authored.bindBounds.min[axis]);
    // Uniformly scale the unchanged mesh and skin together, using the torso rather than horns/ears.
    const reference = cattle ? 1 : definition.withers / (sourceSize[1] * (definition.species === 'pig' ? .87 : .72));
    if (!cattle) {
        const scene = root.listScenes()[0];
        const wrapper = doc.createNode('LivestockMetres').setScale([reference, reference, reference])
            .setTranslation([-authored.center[0] * reference, -authored.bindBounds.min[1] * reference,
                -authored.center[2] * reference]);
        for (const node of [...scene.listChildren()]) wrapper.addChild(node);
        scene.addChild(wrapper);
    }
    root.listAnimations().forEach(animation => animation.setExtras({
        ...animation.getExtras(), loop: animation.getName() !== 'Death',
    }));
    doc.createExtension(EXTTextureWebP).setRequired(true);
    for (const texture of cattle ? [] : root.listTextures()) {
        const normal = root.listMaterials().some(material => material.getNormalTexture() === texture);
        texture.setImage(await sharp(texture.getImage()).resize({ width: normal ? 512 : 1024,
            height: normal ? 512 : 1024, fit: 'inside', withoutEnlargement: true })
            .webp(normal ? { lossless: true } : { quality: 88 }).toBuffer()).setMimeType('image/webp');
    }
    await doc.transform(dedup(), ...(cattle ? [] : [resample({ tolerance: 1e-6 })]), prune(),
        meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
    const bytes = await io.writeBinary(doc);
    const directory = cattle ? resolve('public/game-assets/cattle', definition.variant) :
        resolve('public/game-assets/livestock', definition.species, definition.variant);
    const file = cattle ? before.file : definition.species + '-' + definition.variant + '.glb';
    const triangles = root.listMeshes().reduce((sum, mesh) => sum + mesh.listPrimitives().reduce((total, primitive) =>
        total + (primitive.getIndices()?.getCount() ?? primitive.getAttribute('POSITION').getCount()) / 3, 0), 0);
    const manifest = { ...before, schemaVersion: 1, species: definition.species, variant: definition.variant,
        file, bytes: bytes.length, sha256: hash(bytes), sourceFile: basename(definition.source),
        sourceSha256: cattle ? before.sourceSha256 : hash(source),
        animationSourceSha256: hash(source), ...(cattle ? { animationSourceRevision: cattleSourceRevision } : {}),
        triangles, joints: root.listSkins()[0].listJoints().length,
        height: cattle ? before.height : sourceSize[1] * reference, withersHeightM: definition.withers,
        walkSpeedMps: cattle ? before.walkSpeedMps : authored.walkSpeedSourceUnits * reference,
        walkCycleSeconds: cattle ? before.walkCycleSeconds : authored.sourceWalkDuration,
        clips: { ...before?.clips, ...authored.clips }, authoring: 'Baked glTF channels on supplied skin',
        posture: cattle ? 'Existing approved cattle activities retained' :
            'Source lift order and cycle duration; upright bind trunk; baked planted-hoof IK; no root travel',
    };
    await mkdir(directory, { recursive: true });
    await writeFile(resolve(directory, file), bytes);
    await writeFile(resolve(directory, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
    console.log(JSON.stringify({ species: definition.species, variant: definition.variant, bytes: bytes.length, triangles }));
}
