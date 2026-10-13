import { BufferGeometry, Float32BufferAttribute, Group, LineBasicMaterial, LineSegments } from 'three';
import { createBlueprintSurface } from '../world-generation/TerrainQueries';
import type { MacroSiteCandidate, MacroTerrainSeparation } from '../world-generation/MacroIsland';
import type { WorldBlueprint } from '../world-generation/WorldBlueprint';

/** Native line diagnostics follow the same physical surface and water intersection. */
export function createMacroOverlay(world: WorldBlueprint, sites: readonly MacroSiteCandidate[],
    separation: MacroTerrainSeparation | null = null) {
    const group = new Group();
    const surface = createBlueprintSurface(world);
    const add = (points: number[], color: number) => {
        const geometry = new BufferGeometry();
        geometry.setAttribute('position', new Float32BufferAttribute(points, 3));
        const line = new LineSegments(geometry, new LineBasicMaterial({ color, depthTest: false }));
        line.renderOrder = 10;
        group.add(line);
    };
    add(world.coast.flatMap(({ a, b }) => [a.x, world.waterLevel + .08, a.z,
        b.x, world.waterLevel + .08, b.z]), 0xffd78b);
    sites.forEach((site, index) => {
        const points: number[] = [];
        const spacing = world.terrain.spacing, half = spacing / 2;
        const cells = new Set(site.cells.map(p => p.x + ',' + p.z));
        for (const { x, z } of site.cells) {
            const edges = [
                { dx: -spacing, dz: 0, a: [x-half, z-half], b: [x-half, z+half] },
                { dx: spacing, dz: 0, a: [x+half, z-half], b: [x+half, z+half] },
                { dx: 0, dz: -spacing, a: [x-half, z-half], b: [x+half, z-half] },
                { dx: 0, dz: spacing, a: [x-half, z+half], b: [x+half, z+half] }
            ];
            for (const edge of edges) {
                if (cells.has((x+edge.dx) + ',' + (z+edge.dz))) continue;
                for (const [px, pz] of [edge.a, edge.b]) {
                    points.push(px, surface.surfaceHeightAt(px, pz) + .2, pz);
                }
            }
        }
        add(points, index === 0 ? 0xffee74 : 0xf193dc);
    });
    if (separation) {
        const points: number[] = [];
        for (let i = 1; i < separation.connection.length; i++) {
            for (const point of [separation.connection[i - 1], separation.connection[i]]) {
                points.push(point.x, surface.surfaceHeightAt(point.x, point.z) + .3, point.z);
            }
        }
        add(points, 0x73e9ff);
        const { x, z } = separation.crest;
        const y = surface.surfaceHeightAt(x, z) + .4;
        add([x - 3, y, z, x + 3, y, z, x, y, z - 3, x, y, z + 3], 0xff794f);
    }
    return group;
}

export function disposeMacroOverlay(group: Group) {
    for (const child of group.children) if (child instanceof LineSegments) {
        child.geometry.dispose();
        for (const material of Array.isArray(child.material) ? child.material : [child.material]) material.dispose();
    }
    group.clear();
}
