import { worldFixture } from './wildlife-world.mjs';

export function marineWorld(seed = 243, level = 0) {
    const world = structuredClone(worldFixture(seed));
    world.waterLevel = level;
    world.terrain.heights = world.terrain.heights.map((height, index) => {
        const x = -400 + index % 201 * 4;
        return level + (x < -100 ? -10 : x < -80 ? (x + 80) * .5 : height);
    });
    return world;
}
