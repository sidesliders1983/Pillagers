import { createBlueprintSurface } from './TerrainQueries';
import type { Point2, WorldBlueprint } from './WorldBlueprint';

/** Shape screens are diagnostics, not a substitute for the undecorated visual review. */
export function islandShapeQuality(world: WorldBlueprint) {
    const surface = createBlueprintSurface(world);
    const { terrain, waterLevel } = world;
    const samples: Point2[] = [];
    for (let row = 0; row < terrain.rows; row += 2) {
        for (let col = 0; col < terrain.columns; col += 2) {
            if (terrain.heights[row*terrain.columns+col] > waterLevel) samples.push({
                x: terrain.bounds.minX+col*terrain.spacing,
                z: terrain.bounds.minZ+row*terrain.spacing
            });
        }
    }
    const center = samples.reduce((sum,p) => ({ x: sum.x+p.x/samples.length,
        z: sum.z+p.z/samples.length }), { x: 0, z: 0 });
    const rotationalOverlap = [3,4,5,6,8].map(order => {
        const angle = 2*Math.PI/order, c = Math.cos(angle), s = Math.sin(angle);
        let intersection = 0;
        for (const p of samples) {
            const x = p.x-center.x, z = p.z-center.z;
            if (surface.surfaceHeightAt(center.x+x*c-z*s, center.z+x*s+z*c) > waterLevel) intersection++;
        }
        return { order, overlap: intersection / Math.max(1, 2*samples.length-intersection) };
    });
    const coastPoints = world.coast.flatMap(({a,b}) => [a,b]).sort((a,b) => a.x-b.x || a.z-b.z);
    const cross = (a: Point2,b: Point2,c: Point2) => (b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x);
    const halfHull = (points: Point2[]) => {
        const hull: Point2[] = [];
        for (const p of points) {
            while (hull.length > 1 && cross(hull[hull.length-2],hull[hull.length-1],p) <= 0) hull.pop();
            hull.push(p);
        }
        return hull.slice(0,-1);
    };
    const hull = [...halfHull(coastPoints),...halfHull([...coastPoints].reverse())];
    const hullArea = Math.abs(hull.reduce((sum,p,i) => {
        const next = hull[(i+1)%hull.length];
        return sum+p.x*next.z-next.x*p.z;
    },0)) / 2;
    const dryArea = terrain.heights.filter(height => height > waterLevel).length * terrain.spacing ** 2;
    return { rotationalOverlap, maximumRadialOverlap: Math.max(...rotationalOverlap.map(p => p.overlap)),
        coastHullOccupancy: hullArea ? dryArea/hullArea : 1 };
}
