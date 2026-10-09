import sharp from 'sharp';
import { loadTypeScript } from './load-typescript.mjs';
export const { regionalGroundConfig } = loadTypeScript(new URL('../src/config/RegionalGroundConfig.ts', import.meta.url));

const linear = x => x <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4;
const srgb = x => x <= .0031308 ? x * 12.92 : 1.055 * x ** (1 / 2.4) - .055;

/** Shared original world-v01 delivery recipe; resolution is the only study variable. */
export async function encodeWorldGroundMap(bytes, sourceId, role, size) {
    let operation = sharp(bytes).removeAlpha();
    if (role === 0) operation = operation.gamma(2.2);
    const { data, info } = await operation.resize(size, size).toColourspace('srgb').raw()
        .toBuffer({ resolveWithObject: true });
    if (role === 0) {
        const { saturation, tint } = regionalGroundConfig.sources[sourceId];
        for (let index = 0; index < data.length; index += info.channels) {
            const rgb = [0, 1, 2].map(channel => linear(data[index + channel] / 255));
            const luminance = rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
            for (let channel = 0; channel < 3; channel++) {
                data[index + channel] = Math.round(255 * Math.max(0, Math.min(1,
                    srgb((luminance + (rgb[channel] - luminance) * saturation) * tint[channel]))));
            }
        }
    }
    return sharp(data, { raw: { width: size, height: size, channels: info.channels } })
        .webp(role === 1 ? { lossless: true } : { quality: 92 }).toBuffer();
}
