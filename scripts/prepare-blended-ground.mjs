import sharp from 'sharp';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { encodeWorldGroundMap, regionalGroundConfig } from './encode-world-ground-map.mjs';
import { loadTypeScript } from './load-typescript.mjs';
const { seededRandom } = loadTypeScript(new URL('../src/config/worldConfig.ts', import.meta.url));

// Offline source sampling only. Geography and its classification never enter this asset recipe.
const sourceRoot = process.argv[2] ?? 'scratch/ground-source';
const output = 'public/ground-materials/blended-v1';
const { groundBlendConfig } = loadTypeScript(new URL('../src/config/GroundBlendConfig.ts', import.meta.url));
const { periodMeters } = groundBlendConfig;
const patchCount = 12, seed = 137;
const original = JSON.parse(await readFile('public/ground-materials/v04/manifest.json', 'utf8'));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const wrap = (value, size) => ((value % size) + size) % size;
const smooth = value => value * value * (3 - 2 * value);
const linear = value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
const srgb = value => value <= .0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - .055;
const rotations = [[1, 0], [0, 1], [-1, 0], [0, -1]];
const delivery = [];
// Owner-directed colour study only. Retain luminance structure; no terrain or height whitening.
const rockColourTreatment = { saturation: .12, linearGain: 1.3, tint: [.96, 1, 1.055] };
function coolRock(pixels) {
    const result = Buffer.alloc(pixels.length);
    for (let i = 0; i < pixels.length; i += 3) {
        const rgb = [0, 1, 2].map(channel => linear(pixels[i + channel] / 255));
        const luminance = .2126 * rgb[0] + .7152 * rgb[1] + .0722 * rgb[2];
        for (let channel = 0; channel < 3; channel++) {
            const value = (luminance + (rgb[channel] - luminance) * rockColourTreatment.saturation) *
                rockColourTreatment.linearGain * rockColourTreatment.tint[channel];
            result[i + channel] = Math.round(Math.min(1, srgb(value)) * 255);
        }
    }
    return result;
}

function sample(data, size, u, v, channel) {
    const x = wrap(u * size, size), y = wrap(v * size, size);
    const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
    const at = (dx, dy) => data[(wrap(iy + dy, size) * size + wrap(ix + dx, size)) * 3 + channel];
    return (at(0, 0) * (1 - fx) + at(1, 0) * fx) * (1 - fy) +
        (at(0, 1) * (1 - fx) + at(1, 1) * fx) * fy;
}

function bake(source, sourceSize, size, role, repeat, patches) {
    const result = Buffer.alloc(size * size * 3);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        const gx = (x + .5) / size * patchCount, gy = (y + .5) / size * patchCount;
        const ix = Math.floor(gx), iy = Math.floor(gy);
        const fx = smooth(gx - ix), fy = smooth(gy - iy);
        const values = [0, 0, 0];
        for (let dy = 0; dy <= 1; dy++) for (let dx = 0; dx <= 1; dx++) {
            const patch = patches[wrap(iy + dy, patchCount) * patchCount + wrap(ix + dx, patchCount)];
            const [cos, sin] = rotations[patch.turn];
            // Unwrapped local coordinates + wrapped patch identity make the full atlas seamless.
            const px = (gx - ix - dx) * periodMeters / patchCount / repeat;
            const py = (gy - iy - dy) * periodMeters / patchCount / repeat;
            const u = cos * px - sin * py + patch.u, v = sin * px + cos * py + patch.v;
            const weight = (dx ? fx : 1 - fx) * (dy ? fy : 1 - fy);
            const rgb = [0, 1, 2].map(channel => sample(source, sourceSize, u, v, channel));
            if (role === 1) {
                const nx = rgb[0] * 2 - 1, ny = rgb[1] * 2 - 1;
                // Inverse UV rotation carries tangent-space normals into the atlas frame.
                rgb[0] = cos * nx + sin * ny;
                rgb[1] = -sin * nx + cos * ny;
                rgb[2] = rgb[2] * 2 - 1;
            }
            for (let channel = 0; channel < 3; channel++) values[channel] += rgb[channel] * weight;
        }
        const magnitude = role === 1 ? Math.hypot(...values) : 1;
        for (let channel = 0; channel < 3; channel++) {
            const value = role === 0 ? srgb(values[channel]) :
                role === 1 ? (values[channel] / magnitude + 1) * .5 : values[channel];
            result[(y * size + x) * 3 + channel] = Math.round(Math.max(0, Math.min(1, value)) * 255);
        }
    }
    return result;
}

for (const [sourceIndex, asset] of original.sourceAssets.entries()) {
    const random = seededRandom(seed + sourceIndex * 1983);
    const patches = Array.from({ length: patchCount ** 2 }, () =>
        ({ turn: Math.floor(random() * 4), u: random(), v: random() }));
    for (const tier of ['standard', 'low']) {
        const size = tier === 'standard' ? groundBlendConfig.standardPixels : groundBlendConfig.lowPixels;
        await mkdir(output + '/' + tier, { recursive: true });
        for (const [role, map] of asset.maps.entries()) {
            if (tier === 'low' && role === 1) continue;
            const bytes = await readFile(sourceRoot + '/' + map.file);
            if (hash(bytes) !== map.sha256) throw Error('Changed approved source: ' + map.file);
            const repeat = regionalGroundConfig.sources[asset.id].repeatMeters;
            const sourceSize = Math.round(size / periodMeters * repeat);
            const filtered = await encodeWorldGroundMap(bytes, asset.id, role, sourceSize);
            const raw = await sharp(filtered).removeAlpha().toColourspace('srgb').raw().toBuffer();
            const values = Float32Array.from(raw, value => role === 0 ? linear(value / 255) : value / 255);
            const pixels = bake(values, sourceSize, size, role, repeat, patches);
            const encoded = await sharp(pixels, { raw: { width: size, height: size, channels: 3 } })
                .webp(role === 1 ? { lossless: true } : { quality: 92 }).toBuffer();
            const name = ['colour', 'normal', 'roughness'][role];
            const file = tier + '/' + asset.id + '-' + name + '.webp';
            await writeFile(output + '/' + file, encoded);
            delivery.push({ file, size, sourceSha256: map.sha256, sha256: hash(encoded), bytes: encoded.length });
            if (asset.id === 'mossy_rock' && role === 0) {
                const grey = await sharp(coolRock(pixels), { raw: { width: size, height: size, channels: 3 } })
                    .webp({ quality: 92 }).toBuffer();
                const greyFile = tier + '/mossy_rock-colour-cool-grey.webp';
                await writeFile(output + '/' + greyFile, grey);
                delivery.push({ file: greyFile, size, sourceSha256: map.sha256, sha256: hash(grey), bytes: grey.length });
            }
        }
    }
    console.log('Prepared ' + asset.id);
}
await writeFile(output + '/manifest.json', JSON.stringify({
    version: 'blended-ground-v1', generatedWith: 'scripts/prepare-blended-ground.mjs; sharp 0.35.5',
    recipe: { seed, periodMeters, patchCount, sampling: 'Periodic overlapping patches; seeded quarter turns and offsets; linear colour blending; rotated normalized GL normals',
        treatment: 'v0.4 source treatment retained for comparison; cool-grey rock colour is an explicit owner-directed Lab candidate. Physical source scale and original hashes retained. No terrain inputs.',
        rockColourTreatment },
    sourceAssets: original.sourceAssets, delivery,
}, null, 2) + '\n');
console.log({ deliveredMaps: delivery.length, bytes: delivery.reduce((sum, entry) => sum + entry.bytes, 0) });
