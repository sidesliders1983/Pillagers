import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import sharp from 'sharp';
import { loadTypeScript } from '../load-typescript.mjs';

// A separate rock delivery experiment. Do not rewrite the first texture study.
const { seededRandom } = loadTypeScript(new URL('../../src/config/worldConfig.ts', import.meta.url));
const { groundBlendConfig } = loadTypeScript(new URL('../../src/config/GroundBlendConfig.ts', import.meta.url));
const root = 'docs/qa/iceland-rock-snow-180';
const sourceFile = 'docs/qa/iceland-textures-180/sources/weathered-basalt.png';
const source = await readFile(sourceFile);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const period = groundBlendConfig.periodMeters;
const sourceRepeat = 12;
const patchCount = 4;
const seed = 2120;
const wrap = (value, size) => ((value % size) + size) % size;
const smooth = value => value * value * (3 - 2 * value);
const linear = value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
const srgb = value => value <= .0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - .055;
const rotations = [[1, 0], [0, 1], [-1, 0], [0, -1]];
// Reuse the approved cool-grey rock treatment from prepare-blended-ground.mjs.
const colourTreatment = { saturation: .12, linearGain: 1.3, tint: [.96, 1, 1.055] };
const random = seededRandom(seed);
const patches = Array.from({ length: patchCount ** 2 }, () =>
    ({ turn: Math.floor(random() * 4), u: random(), v: random() }));

function sample(data, size, u, v, channel) {
    const x = wrap(u * size, size), y = wrap(v * size, size);
    const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
    const at = (dx, dy) => data[(wrap(iy + dy, size) * size + wrap(ix + dx, size)) * 3 + channel];
    return (at(0, 0) * (1 - fx) + at(1, 0) * fx) * (1 - fy) +
        (at(0, 1) * (1 - fx) + at(1, 1) * fx) * fy;
}

function bake(source, sourceSize, size) {
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
        const luminance = .2126 * values[0] + .7152 * values[1] + .0722 * values[2];
        for (let channel = 0; channel < 3; channel++) {
            const value = (luminance + (values[channel] - luminance) * colourTreatment.saturation) *
                colourTreatment.linearGain * colourTreatment.tint[channel];
            result[(y * size + x) * 3 + channel] = Math.round(Math.max(0, Math.min(1, srgb(value))) * 255);
        }
    }
    return result;
}

const manifest = { version: 'readable-basalt-v1', sourceFile, sourceSha256: hash(source),
    generation: 'Reuses the selected built-in imagegen basalt revision 2; no new painted snow texture.',
    promptManifest: '../iceland-textures-180/generation.json',
    recipe: { seed, patchCount, periodMeters: period, intendedSourceRepeatMeters: sourceRepeat, colourTreatment,
        sourceOriginalIntentMeters: 4,
        note: 'Deliberately enlarges authored joint scale for gameplay readability; not measured physical calibration.',
        toolchain: { node: process.version, sharp: sharp.versions.sharp } }, delivery: [] };
for (const tier of ['standard', 'low']) {
    const size = tier === 'standard' ? groundBlendConfig.standardPixels : groundBlendConfig.lowPixels;
    const sourceSize = Math.round(size / period * sourceRepeat);
    const raw = await sharp(source).resize(sourceSize, sourceSize).removeAlpha().toColourspace('srgb').raw().toBuffer();
    const pixels = bake(Float32Array.from(raw, value => linear(value / 255)), sourceSize, size);
    const encoded = await sharp(pixels, { raw: { width: size, height: size, channels: 3 } })
        .webp({ quality: 92 }).toBuffer();
    const file = `delivery/${tier}/readable-basalt.webp`;
    await mkdir(root + '/delivery/' + tier, { recursive: true });
    await writeFile(root + '/' + file, encoded);
    manifest.delivery.push({ tier, size, file, bytes: encoded.length, sha256: hash(encoded) });
}
await writeFile(root + '/delivery.json', JSON.stringify(manifest, null, 2) + '\n');
console.log('Prepared readable basalt:', manifest.delivery.map(map => `${map.tier} ${map.bytes} bytes`).join(', '));
