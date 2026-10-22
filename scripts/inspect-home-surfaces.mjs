import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import sharp from 'sharp';

const output = 'output/warm-home-lighting-256/inspection';
await mkdir(output, { recursive: true });
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const manifest = JSON.parse(await readFile('public/game-assets/houses/manifest.json', 'utf8'));
for (const [key, entry] of Object.entries(manifest.assets)) {
    if (key.endsWith('Terrain')) continue;
    const document = await io.read('public/game-assets/houses/' + entry.file);
    const root = document.getRoot();
    const materials = root.listMaterials();
    console.log(key, JSON.stringify(materials.map(material => ({
        name: material.getName(), emissive: material.getEmissiveFactor(),
        emissiveMap: Boolean(material.getEmissiveTexture()),
        texture: material.getBaseColorTexture()?.getName()
    }))));
    for (const [index, material] of materials.entries()) {
        const image = material.getBaseColorTexture()?.getImage();
        if (image) await sharp(image).png().toFile(`${output}/${key}-${index}.png`);
    }
    const meshes = [];
    for (const node of root.listNodes()) {
        for (const primitive of node.getMesh()?.listPrimitives() ?? []) {
            meshes.push({ matrix: node.getWorldMatrix(), material: materials.indexOf(primitive.getMaterial()),
                positions: Array.from({length: primitive.getAttribute('POSITION').getCount()}, (_, index) => primitive.getAttribute('POSITION').getElement(index, [])).flat(),
                uv: primitive.getAttribute('TEXCOORD_0') ? Array.from({ length:
                    primitive.getAttribute('TEXCOORD_0').getCount() }, (_, index) =>
                    primitive.getAttribute('TEXCOORD_0').getElement(index, [])).flat() : [],
                indices: Array.from(primitive.getIndices()?.getArray() ?? []) });
        }
    }
    await writeFile(`${output}/${key}.json`, JSON.stringify(meshes));
}
