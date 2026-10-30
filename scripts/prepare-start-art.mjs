import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';

// The owner supplied this upscale after the earlier #315 bundle specification.
const expectedSource = 'f30358104ab57e32bf870b31282139fca98e64a0b89382a0274316f8991dcdb1';
const input = process.argv[2];
if (!input) throw new Error('Usage: node scripts/prepare-start-art.mjs <owner-upscaled.png> [output-directory]');
const output = resolve(process.argv[3] || 'public/branding/fjordside/start');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const source = await readFile(input);
if (hash(source) !== expectedSource) throw new Error('The source is not the owner-approved #315 upscale.');
await mkdir(output, { recursive: true });
const metadata = await sharp(source).metadata();
const manifest = {
    source: {
        description: 'Owner-selected generated twilight fjord artwork, supplied as an upscale on 2026-10-30. Decorative branding, not a saved-settlement screenshot.',
        filename: 'upscalemedia-transformed (3).png',
        width: metadata.width, height: metadata.height, bytes: source.length, sha256: expectedSource,
        supersedes: 'The earlier 1672px master reference in issue #315; latest explicit owner-supplied source.',
        native4K: false,
    },
    recipe: { format: 'WebP', quality: 84, effort: 6, fit: 'preserve aspect ratio; no enlargement' },
    files: [],
};
for (const width of [1280, 2560]) {
    const filename = `fjordside-twilight-${width}.webp`;
    const info = await sharp(source).resize({ width, withoutEnlargement: true })
        .webp({ quality: 84, effort: 6 }).toFile(join(output, filename));
    const bytes = await readFile(join(output, filename));
    manifest.files.push({ filename, width: info.width, height: info.height, bytes: bytes.length, sha256: hash(bytes) });
}
await writeFile(join(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify(manifest.files));
