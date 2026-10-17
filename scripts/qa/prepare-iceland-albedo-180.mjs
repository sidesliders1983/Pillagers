import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import sharp from 'sharp';
import { loadTypeScript } from '../load-typescript.mjs';

// QA-only delivery. Keep the approved blended-v1 sources and manifest untouched.
// Colour sampling follows prepare-blended-ground.mjs; no synthetic data maps.
const { seededRandom } = loadTypeScript(new URL('../../src/config/worldConfig.ts', import.meta.url));
const { groundBlendConfig } = loadTypeScript(new URL('../../src/config/GroundBlendConfig.ts', import.meta.url));
const root = 'docs/qa/iceland-textures-180';
const generation = JSON.parse(await readFile(root + '/generation.json', 'utf8'));
const materialIds = ['Ground037', 'mossy_rock', 'grass_path_2', 'Ground054'];
const seed = 137;
const patchCount = 12;
const period = groundBlendConfig.periodMeters;
const sourceRepeat = generation.intendedSourceRepeatMeters;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const wrap = (value, size) => ((value % size) + size) % size;
const smooth = value => value * value * (3 - 2 * value);
const linear = value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
const srgb = value => value <= .0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - .055;
const rotations = [[1, 0], [0, 1], [-1, 0], [0, -1]];

function sample(data, size, u, v, channel) {
    const x = wrap(u * size, size), y = wrap(v * size, size);
    const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
    const at = (dx, dy) => data[(wrap(iy + dy, size) * size + wrap(ix + dx, size)) * 3 + channel];
    return (at(0, 0) * (1 - fx) + at(1, 0) * fx) * (1 - fy) +
        (at(0, 1) * (1 - fx) + at(1, 1) * fx) * fy;
}

function bake(source, sourceSize, size, patches) {
    const result = Buffer.alloc(size * size * 3);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        const gx = (x + .5) / size * patchCount, gy = (y + .5) / size * patchCount;
        const ix = Math.floor(gx), iy = Math.floor(gy);
        const fx = smooth(gx - ix), fy = smooth(gy - iy);
        const values = [0, 0, 0];
        for (let dy = 0; dy <= 1; dy++) for (let dx = 0; dx <= 1; dx++) {
            const patch = patches[wrap(iy + dy, patchCount) * patchCount + wrap(ix + dx, patchCount)];
            const [cos, sin] = rotations[patch.turn];
            const px = (gx - ix - dx) * period / patchCount / sourceRepeat;
            const py = (gy - iy - dy) * period / patchCount / sourceRepeat;
            const u = cos * px - sin * py + patch.u, v = sin * px + cos * py + patch.v;
            const weight = (dx ? fx : 1 - fx) * (dy ? fy : 1 - fy);
            for (let channel = 0; channel < 3; channel++) {
                values[channel] += sample(source, sourceSize, u, v, channel) * weight;
            }
        }
        for (let channel = 0; channel < 3; channel++) {
            result[(y * size + x) * 3 + channel] = Math.round(Math.max(0, Math.min(1, srgb(values[channel]))) * 255);
        }
    }
    return result;
}

async function inspect(bytes) {
    const { data, info } = await sharp(bytes).removeAlpha().toColourspace('srgb').raw().toBuffer({ resolveWithObject: true });
    let horizontal = 0, vertical = 0, interior = 0, count = 0;
    const at = (x, y, channel) => data[(y * info.width + x) * info.channels + channel];
    for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
        for (let channel = 0; channel < 3; channel++) {
            if (x === 0) horizontal += Math.abs(at(0, y, channel) - at(info.width - 1, y, channel));
            if (y === 0) vertical += Math.abs(at(x, 0, channel) - at(x, info.height - 1, channel));
            if (x > 0) { interior += Math.abs(at(x, y, channel) - at(x - 1, y, channel)); count++; }
            if (y > 0) { interior += Math.abs(at(x, y, channel) - at(x, y - 1, channel)); count++; }
        }
    }
    return { width: info.width, height: info.height, channels: info.channels,
        edgeMeanAbsoluteDifference255: { x: horizontal / (info.height * 3), y: vertical / (info.width * 3) },
        interiorAdjacentMeanAbsoluteDifference255: interior / count };
}

const manifest = { version: 'iceland-albedo-delivery-v1', generationManifest: 'generation.json',
    recipe: { seed, patchCount, periodMeters: period, intendedSourceRepeatMeters: sourceRepeat,
        method: 'Existing periodic overlapping-patch colour recipe; quarter turns, offsets and linear-light mixing',
        qualification: '4m is authoring intent, not measured physical calibration. Albedo only; no tint or colour grading.' },
    toolchain: { node: process.version, sharp: sharp.versions.sharp }, sourceAssets: [], delivery: [] };

for (const [index, asset] of generation.assets.entries()) {
    const bytes = await readFile(root + '/' + asset.file);
    manifest.sourceAssets.push({ id: asset.id, materialId: materialIds[index], file: asset.file,
        bytes: bytes.length, sha256: hash(bytes), inspection: await inspect(bytes) });
    const random = seededRandom(seed + index * 1983);
    const patches = Array.from({ length: patchCount ** 2 }, () =>
        ({ turn: Math.floor(random() * 4), u: random(), v: random() }));
    for (const tier of ['standard', 'low']) {
        const size = tier === 'standard' ? groundBlendConfig.standardPixels : groundBlendConfig.lowPixels;
        const sourceSize = Math.round(size / period * sourceRepeat);
        const raw = await sharp(bytes).resize(sourceSize, sourceSize, { kernel: 'lanczos3' })
            .removeAlpha().toColourspace('srgb').raw().toBuffer();
        const pixels = bake(Float32Array.from(raw, value => linear(value / 255)), sourceSize, size, patches);
        const encoded = await sharp(pixels, { raw: { width: size, height: size, channels: 3 } })
            .webp({ quality: 92 }).toBuffer();
        const file = `delivery/${tier}/${asset.id}.webp`;
        await mkdir(root + '/delivery/' + tier, { recursive: true });
        await writeFile(root + '/' + file, encoded);
        manifest.delivery.push({ id: asset.id, materialId: materialIds[index], tier, file, size,
            bytes: encoded.length, sourceSha256: hash(bytes), sha256: hash(encoded), inspection: await inspect(encoded) });
    }
    console.log('Prepared', asset.id);
}
await writeFile(root + '/delivery.json', JSON.stringify(manifest, null, 2) + '\n');
console.log('Delivered', manifest.delivery.length, 'colour maps;', manifest.delivery.reduce((sum, map) => sum + map.bytes, 0), 'bytes.');
