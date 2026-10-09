import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { encodeWorldGroundMap, regionalGroundConfig } from './encode-world-ground-map.mjs';

const size = Number(process.argv[2] || 512);
if (size !== 512) throw new Error('This bounded study only prepares 512px; 1024px needs a documented 512px limitation.');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const original = JSON.parse(await readFile('public/ground-materials/world-v01/manifest.json', 'utf8'));
const source = original.sourceAssets.find(entry => entry.id === 'Ground054');
const root = 'public/ground-materials/world-v01/sand-standard-512';
await mkdir(root, { recursive: true });
const delivery = [];
for (const [role, map] of source.maps.entries()) {
    const bytes = await readFile('scratch/ground-source/' + map.file);
    if (hash(bytes) !== map.sha256) throw new Error('Changed locked source: ' + map.file);
    const name = ['colour', 'normal', 'roughness'][role];
    const baseline = original.delivery.find(entry => entry.file === 'standard/Ground054-' + name + '.webp');
    if (hash(await encodeWorldGroundMap(bytes, source.id, role, 256)) !== baseline.sha256) {
        throw new Error('The shared recipe must reproduce the exact approved 256px baseline: ' + name);
    }
    const encoded = await encodeWorldGroundMap(bytes, source.id, role, size);
    const file = 'Ground054-' + name + '.webp';
    await writeFile(root + '/' + file, encoded);
    const metadata = await sharp(encoded).metadata();
    delivery.push({ file, width: metadata.width, height: metadata.height,
        sourceSha256: map.sha256, sha256: hash(encoded), bytes: encoded.length,
        colourSpace: role === 0 ? 'sRGB' : 'NoColorSpace',
        orientation: role === 1 ? 'OpenGL +Y; source orientation unchanged' : null });
}
await writeFile(root + '/manifest.json', JSON.stringify({
    version: 'generated-sand-resolution-v0.1', source,
    generatedWith: 'sharp ' + sharp.versions.sharp + '; scripts/prepare-world-sand.mjs',
    recipe: { size, kernel: 'lanczos3', gamma: { colour: 2.2, data: false },
        treatment: regionalGroundConfig.sources.Ground054,
        normalScale: regionalGroundConfig.normalScale, encoding: { colour: 'WebP quality 92',
            normal: 'WebP lossless', roughness: 'WebP quality 92' } },
    runtime: { mipmaps: true, minFilter: 'LinearMipmapLinearFilter', magFilter: 'LinearFilter',
        wrap: 'RepeatWrapping', anisotropyCap: 4 },
    delivery,
}, null, 2) + '\n');
console.log('Prepared only Ground054 Standard 512px; exact 256px recipe replay verified.');
