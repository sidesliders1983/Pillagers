import { seededRandom } from '../config/worldConfig';

/** Stable presentation within the canonical footprint. It never changes a tree target,
 * clearance, saved placement or the simulation RNG, and adds no material/texture variants. */
export function natureVariation(seed: number, key: string) {
    let hash = seed | 0;
    for (const char of key) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
    const random = seededRandom(hash >>> 0);
    const palette = [0xc8d3b8, 0xd9d5b8, 0xb3c6ba, 0xd5d2b1];
    return { width: .8 + random() * .2, height: .85 + random() * .15,
        color: palette[Math.floor(random() * palette.length)] };
}
