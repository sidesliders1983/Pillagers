import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { NodeIO, getBounds } from '@gltf-transform/core';
import sharp from 'sharp';
import { loadTypeScript } from './load-typescript.mjs';

const { regionalGroundConfig } = loadTypeScript(new URL('../src/config/RegionalGroundConfig.ts', import.meta.url));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const natureManifest = JSON.parse(await readFile('public/nature/kaykit-v1/manifest.json', 'utf8'));
const io = new NodeIO();
const footprints = {};
for (const [id, entry] of Object.entries(natureManifest.assets)) {
    const file = 'public/nature/kaykit-v1/' + entry.file;
    const bytes = await readFile(file);
    if (hash(bytes) !== entry.sha256) throw Error('Changed locked nature source: ' + id);
    const doc = await io.read(file);
    const { min, max } = getBounds(doc.getRoot().listScenes()[0]);
    footprints[id] = { radius: Math.hypot(Math.max(Math.abs(min[0]), Math.abs(max[0])),
        Math.max(Math.abs(min[2]), Math.abs(max[2]))),
        height: max[1]-min[1], sourceSha256: entry.sha256 };
}
await writeFile('src/world-generation/NatureFootprints.ts',
    '// Generated from locked KayKit FREE world bounds by scripts/prepare-world-sources.mjs.\n' +
    'export const natureFootprints = ' + JSON.stringify(footprints, null, 4) + ' as const;\n');

const original = JSON.parse(await readFile('public/ground-materials/v04/manifest.json', 'utf8'));
const delivery = [];
const linear = x => x <= .04045 ? x/12.92 : ((x+.055)/1.055)**2.4;
const srgb = x => x <= .0031308 ? x*12.92 : 1.055*x**(1/2.4)-.055;
for (const tier of ['standard', 'low']) {
    const size = tier === 'standard' ? 256 : 128;
    await mkdir('public/ground-materials/world-v01/' + tier, { recursive: true });
    for (const source of original.sourceAssets) {
        for (const [role, map] of source.maps.entries()) {
            if (tier === 'low' && role === 1) continue;
            const bytes = await readFile('scratch/ground-source/' + map.file);
            if (hash(bytes) !== map.sha256) throw Error('Changed approved ground source: ' + map.file);
            let operation = sharp(bytes).removeAlpha();
            if (role === 0) operation = operation.gamma(2.2);
            const { data, info } = await operation.resize(size, size).toColourspace('srgb').raw()
                .toBuffer({ resolveWithObject: true });
            if (role === 0) {
                const { saturation, tint } = regionalGroundConfig.sources[source.id];
                for (let i = 0; i < data.length; i += info.channels) {
                    const rgb = [0,1,2].map(c => linear(data[i+c]/255));
                    const luminance = rgb[0]*.2126 + rgb[1]*.7152 + rgb[2]*.0722;
                    for (let c = 0; c < 3; c++) data[i+c] = Math.round(255*Math.max(0, Math.min(1,
                        srgb((luminance+(rgb[c]-luminance)*saturation)*tint[c]))));
                }
            }
            const name = ['colour','normal','roughness'][role];
            const file = tier + '/' + source.id + '-' + name + '.webp';
            const encoded = await sharp(data, { raw: { width: size, height: size, channels: info.channels } })
                .webp(role === 1 ? { lossless: true } : { quality: 92 }).toBuffer();
            await writeFile('public/ground-materials/world-v01/' + file, encoded);
            delivery.push({ file, size, sourceSha256: map.sha256, sha256: hash(encoded), bytes: encoded.length });
        }
    }
}
await writeFile('public/ground-materials/world-v01/manifest.json', JSON.stringify({
    version: 'world-ground-v0.1', generatedWith: 'sharp 0.35.5; scripts/prepare-world-sources.mjs',
    treatment: 'Same approved v0.4 source saturation/tints and physical repeat metres; native materials only',
    sourceAssets: original.sourceAssets, delivery,
}, null, 2) + '\n');
console.log({ natureRoles: Object.keys(footprints).length, deliveredMaps: delivery.length });
