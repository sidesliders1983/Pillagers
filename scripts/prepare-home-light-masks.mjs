import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import sharp from 'sharp';

// Pixel bounds refer to the reproducible 500px orthographic source inspections.
// Only dark aperture pixels inside these reviewed regions can emit; frames stay timber.
const surfaces = {
    homestead: [
        { axis: 0, sign: 1, rectangle: [725, 339, 736, 352], panel: [500, 0], depth: 1 },
        { axis: 0, sign: -1, rectangle: [765, 839, 776, 852], panel: [500, 500], depth: 1 },
    ],
    longhouse: [
        { axis: 0, sign: 1, rectangle: [725, 366, 734, 380], panel: [500, 0], depth: 1 },
        { axis: 0, sign: -1, rectangle: [765, 866, 774, 880], panel: [500, 500], depth: 1 },
    ],
    farmHut: [
        { axis: 2, sign: 1, rectangle: [135, 362, 146, 384], panel: [0, 0], depth: .9 },
        { axis: 2, sign: 1, rectangle: [352, 362, 364, 384], panel: [0, 0], depth: .9 },
    ],
};
const output = 'public/game-assets/houses/lights';
const inspection = 'output/warm-home-lighting-256/inspection';
await mkdir(output, { recursive: true });
await mkdir(inspection, { recursive: true });
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const houses = JSON.parse(await readFile('public/game-assets/houses/manifest.json', 'utf8'));
const manifest = { version: 1, assets: {}, unsupported: {
    tent: 'No confirmed authored window or interior surface.',
    hut: 'No confirmed window; the round door detail is not treated as glazing.',
    farmHomestead: 'Closed timber walls and doors; lanterns are not fabricated house windows.',
    greatHall: 'Open apertures without an independent interior surface; emission would light the exterior back wall.',
} };
for (const [key, regions] of Object.entries(surfaces)) {
    const bytes = await readFile('public/game-assets/houses/' + houses.assets[key].file);
    const document = await io.readBinary(bytes);
    const { min, max } = houses.assets[key].bounds;
    const scale = 440 / Math.max(...max.map((value, axis) => value - min[axis]));
    const size = 1024, mask = Buffer.alloc(size * size);
    let written = 0;
    const bindings = [];
    const windowSamples = regions.map(() => ({ position: [0, 0, 0], count: 0 }));
    for (const node of document.getRoot().listNodes()) {
        const matrix = node.getWorldMatrix();
        for (const primitive of node.getMesh()?.listPrimitives() ?? []) {
            const triangles = new Set();
            const positions = primitive.getAttribute('POSITION'), uv = primitive.getAttribute('TEXCOORD_0');
            if (!uv) continue;
            const texture = primitive.getMaterial()?.getBaseColorTexture();
            if (!texture) continue;
            const { data: colors, info } = await sharp(texture.getImage()).removeAlpha().raw().toBuffer({ resolveWithObject: true });
            const indices = primitive.getIndices().getArray();
            for (let triangle = 0; triangle < indices.length; triangle += 3) {
                const vertices = Array.from(indices.slice(triangle, triangle + 3), index => {
                    const [x, y, z] = positions.getElement(index, []);
                    const world = [0, 1, 2].map(axis => matrix[axis] * x + matrix[4 + axis] * y + matrix[8 + axis] * z + matrix[12 + axis]);
                    return { world, uv: uv.getElement(index, []).map(value => value * size) };
                });
                const [a, b, c] = vertices.map(vertex => vertex.uv);
                const denominator = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
                if (Math.abs(denominator) < 1e-8) continue;
                const low = [0, 1].map(axis => Math.max(0, Math.floor(Math.min(a[axis], b[axis], c[axis]))));
                const high = [0, 1].map(axis => Math.min(size - 1, Math.ceil(Math.max(a[axis], b[axis], c[axis]))));
                for (let y = low[1]; y <= high[1]; y++) for (let x = low[0]; x <= high[0]; x++) {
                    const wa = ((b[1] - c[1]) * (x + .5 - c[0]) + (c[0] - b[0]) * (y + .5 - c[1])) / denominator;
                    const wb = ((c[1] - a[1]) * (x + .5 - c[0]) + (a[0] - c[0]) * (y + .5 - c[1])) / denominator;
                    const wc = 1 - wa - wb;
                    if (wa < 0 || wb < 0 || wc < 0) continue;
                    const world = [0, 1, 2].map(axis => wa * vertices[0].world[axis] + wb * vertices[1].world[axis] + wc * vertices[2].world[axis]);
                    const regionIndex = regions.findIndex(region => {
                        const horizontal = region.axis === 2 ? 0 : 2;
                        const px = (world[horizontal] - (min[horizontal] + max[horizontal]) / 2) * scale * region.sign + 250 + region.panel[0];
                        const py = 465 - (world[1] - min[1]) * scale + region.panel[1];
                        const [left, top, right, bottom] = region.rectangle;
                        const depth = region.sign > 0 ? max[region.axis] - world[region.axis] : world[region.axis] - min[region.axis];
                        return depth <= region.depth && px >= left && px <= right && py >= top && py <= bottom &&
                            (!region.round || ((px - (left + right) / 2) / ((right - left) / 2)) ** 2 +
                                ((py - (top + bottom) / 2) / ((bottom - top) / 2)) ** 2 <= 1);
                    });
                    const tx = Math.min(info.width - 1, Math.floor((x + .5) / size * info.width));
                    const ty = Math.min(info.height - 1, Math.floor((y + .5) / size * info.height));
                    const offset = (ty * info.width + tx) * info.channels;
                    // A localized dark-aperture filter preserves the authored bright frame and mullions.
                    if (regionIndex >= 0 && Math.max(...colors.subarray(offset, offset + 3)) < 100) {
                        const sample = windowSamples[regionIndex];
                        world.forEach((value, axis) => sample.position[axis] += value);
                        sample.count++;
                        triangles.add(triangle / 3);
                        if (!mask[y * size + x]) written++;
                        mask[y * size + x] = 255;
                    }
                }
            }
            bindings.push({ node: node.getName(), triangleCount: indices.length / 3, triangles: [...triangles] });
        }
    }
    if (!written || written > size * size * .005) throw new Error(`${key}: unexpected mask area ${written}`);
    const file = `${key}.png`;
    await sharp(mask, { raw: { width: size, height: size, channels: 1 } })
        .resize(512, 512).png().toFile(`${output}/${file}`);
    manifest.assets[key] = { file, glbSha256: createHash('sha256').update(bytes).digest('hex'),
        size: 512, bakeSize: size, emittingBakeTexels: written, regions, bindings,
        windows: windowSamples.map((sample, index) => {
            if (!sample.count) throw new Error(key + ': window has no emitting surface');
            return { position: sample.position.map((value, axis) => value / sample.count -
                (axis === 1 ? min[axis] : (min[axis] + max[axis]) / 2)),
                outward: [0, 1, 2].map(axis => axis === regions[index].axis ? regions[index].sign : 0) };
        }) };
    console.log(key, written, 'emitting texels');
}
await writeFile(`${output}/manifest.json`, JSON.stringify(manifest, null, 2) + '\n');
