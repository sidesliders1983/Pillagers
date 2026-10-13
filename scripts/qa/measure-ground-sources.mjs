import sharp from 'sharp';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { loadTypeScript } from '../load-typescript.mjs';
const { regionalGroundConfig } = loadTypeScript(new URL('../../src/config/RegionalGroundConfig.ts', import.meta.url));
const manifest = JSON.parse(await readFile('public/ground-materials/blended-v1/manifest.json', 'utf8'));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const evidence = { date: new Date().toISOString(), assets: [], method:
    'Pearson luminance autocorrelation at original source repeat in X and Y; exact periodic baseline is 1. Seam error compares atlas wrap-neighbour differences to interior neighbour differences. These are source-space measures, not a visual acceptance substitute.' };
for (const delivery of manifest.delivery) {
    const bytes = await readFile('public/ground-materials/blended-v1/' + delivery.file);
    assert.equal(hash(bytes), delivery.sha256);
    const metadata = await sharp(bytes).metadata();
    assert.equal(metadata.width, delivery.size);
    assert.equal(metadata.height, delivery.size);
}
for (const delivery of manifest.delivery.filter(item => item.file.includes('-colour'))) {
    const file = delivery.file;
    const id = file.split('/')[1].split('-colour')[0];
    const { data, info } = await sharp('public/ground-materials/blended-v1/' + file).greyscale().raw().toBuffer({ resolveWithObject: true });
    const size = info.width, repeat = regionalGroundConfig.sources[id].repeatMeters;
    const shift = Math.round(repeat / manifest.recipe.periodMeters * size);
    const mean = data.reduce((sum, value) => sum + value, 0) / data.length;
    let variance = 0, xCovariance = 0, yCovariance = 0, wrapX = 0, wrapY = 0, innerX = 0, innerY = 0;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        const value = data[y * size + x], centered = value - mean;
        variance += centered * centered;
        xCovariance += centered * (data[y * size + (x + shift) % size] - mean);
        yCovariance += centered * (data[((y + shift) % size) * size + x] - mean);
        if (x === 0) wrapX += Math.abs(value - data[y * size + size - 1]);
        else innerX += Math.abs(value - data[y * size + x - 1]);
        if (y === 0) wrapY += Math.abs(value - data[(size - 1) * size + x]);
        else innerY += Math.abs(value - data[(y - 1) * size + x]);
    }
    evidence.assets.push({ file, oldRepeatMeters: repeat, atlasPeriodMeters: manifest.recipe.periodMeters,
        correlationX: xCovariance / variance, correlationY: yCovariance / variance,
        wrapToInteriorDifferenceX: wrapX * (size - 1) / innerX,
        wrapToInteriorDifferenceY: wrapY * (size - 1) / innerY });
}
await mkdir('scratch/ground-blending', { recursive: true });
await writeFile('scratch/ground-blending/source-metrics.json', JSON.stringify(evidence, null, 2));
console.log(evidence.assets);
