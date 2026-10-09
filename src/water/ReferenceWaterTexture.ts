import {
    DataTexture, LinearFilter, LinearMipmapLinearFilter, RepeatWrapping,
    RGBAFormat, UnsignedByteType,
} from 'three';

export const WATER_TEXTURE_SIZE = 128;

/** Periodic height and slope data; no image download or per-frame texture upload. */
export function createWaterTexture(): DataTexture {
    const size = WATER_TEXTURE_SIZE;
    const heights = new Float32Array(size * size);
    let seed = 71821;
    const random = () => {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        return seed / 4294967296;
    };

    for (const [cells, weight] of [[4, 0.53], [8, 0.27], [16, 0.13], [32, 0.07]]) {
        const grid = Float32Array.from({ length: cells * cells }, random);
        const at = (x: number, y: number) => grid[(y & (cells - 1)) * cells + (x & (cells - 1))];
        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                const gridX = x * cells / size;
                const gridY = y * cells / size;
                const cellX = Math.floor(gridX);
                const cellY = Math.floor(gridY);
                const fractionX = gridX - cellX;
                const fractionY = gridY - cellY;
                const blendX = fractionX * fractionX * (3 - 2 * fractionX);
                const blendY = fractionY * fractionY * (3 - 2 * fractionY);
                const lower = at(cellX, cellY) * (1 - blendX) + at(cellX + 1, cellY) * blendX;
                const upper = at(cellX, cellY + 1) * (1 - blendX) + at(cellX + 1, cellY + 1) * blendX;
                heights[y * size + x] += (lower * (1 - blendY) + upper * blendY) * weight;
            }
        }
    }

    const data = new Uint8Array(size * size * 4);
    const heightAt = (x: number, y: number) => heights[(y & (size - 1)) * size + (x & (size - 1))];
    const encodeSlope = (slope: number) =>
        Math.round((Math.max(-1, Math.min(1, slope)) * 0.5 + 0.5) * 255);
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const index = (y * size + x) * 4;
            data[index] = encodeSlope((heightAt(x + 1, y) - heightAt(x - 1, y)) * 12);
            data[index + 1] = encodeSlope((heightAt(x, y + 1) - heightAt(x, y - 1)) * 12);
            data[index + 2] = Math.round(heightAt(x, y) * 255);
            data[index + 3] = 255;
        }
    }

    const texture = new DataTexture(data, size, size, RGBAFormat, UnsignedByteType);
    texture.name = 'Reference water periodic slope and height';
    texture.wrapS = texture.wrapT = RepeatWrapping;
    texture.magFilter = LinearFilter;
    texture.minFilter = LinearMipmapLinearFilter;
    texture.generateMipmaps = true;
    texture.needsUpdate = true;
    return texture;
}
