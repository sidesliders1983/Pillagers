import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import { mkdir } from 'node:fs/promises';

// Owner-supplied artwork: retain the full composition when making standard icon sizes.
const directory = new URL('../public/branding/fjordside/', import.meta.url);
await mkdir(directory, { recursive: true });
for (const [source, name, size] of [
    ['favicon', 'favicon-16', 16],
    ['favicon', 'favicon-32', 32],
    ['favicon', 'favicon-48', 48],
    ['app', 'apple-touch-icon', 180],
    ['app', 'app-192', 192],
    ['app', 'app-512', 512],
]) {
    await sharp(fileURLToPath(new URL('source/' + source + '.jpg', directory)))
        .resize(size, size)
        .png()
        .toFile(fileURLToPath(new URL(name + '.png', directory)));
}
