import { Box3, InstancedMesh, Matrix4, Object3D } from 'three';
import type { AssetManager } from '../core/AssetManager';

/** Space for the first permanent home, distinct from the tent's physical collision box. */
export interface BuildingPlot {
    x: number;
    z: number;
    halfWidth: number;
    halfDepth: number;
    futureAsset: 'hut';
}

export function tentBuildingPlot(assets: AssetManager, x: number, z: number): BuildingPlot {
    const hut = assets.get('hut');
    hut.rotation.y = Math.PI;
    hut.updateMatrixWorld(true);
    const bounds = new Box3().setFromObject(hut);
    // Include authored overhangs and 0.75m working space on every side; at least 6m square.
    return { x,z,futureAsset: 'hut',
        halfWidth: Math.max(3,Math.abs(bounds.min.x)+.75,Math.abs(bounds.max.x)+.75),
        halfDepth: Math.max(3,Math.abs(bounds.min.z)+.75,Math.abs(bounds.max.z)+.75) };
}

export function overlapsBuildingPlot(bounds: Box3, plot: BuildingPlot, padding = 0) {
    return bounds.max.x >= plot.x-plot.halfWidth-padding &&
        bounds.min.x <= plot.x+plot.halfWidth+padding &&
        bounds.max.z >= plot.z-plot.halfDepth-padding &&
        bounds.min.z <= plot.z+plot.halfDepth+padding;
}

/** Clear actual rendered extents, including grass blades rooted outside the plot.
 * All primitives of an authored instance are kept/removed together. No RNG or blueprint edits.
 */
export function clearBuildingPlotNature(root: Object3D, plot: BuildingPlot) {
    root.updateMatrixWorld(true);
    const groups = new Map<string,InstancedMesh[]>();
    root.traverse(node => {
        if (!(node instanceof InstancedMesh)) return;
        const siblings = groups.get(node.name) ?? [];
        siblings.push(node);
        groups.set(node.name,siblings);
    });
    const instance = new Matrix4(), world = new Matrix4(), box = new Box3();
    const intersecting = (meshes: InstancedMesh[], index: number) => meshes.some(mesh => {
        if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
        mesh.getMatrixAt(index,instance);
        world.multiplyMatrices(mesh.matrixWorld,instance);
        box.copy(mesh.geometry.boundingBox!).applyMatrix4(world);
        return overlapsBuildingPlot(box,plot);
    });
    let removed = 0,overlappingNature = 0;
    const removedAssets: Record<string,number> = {};
    for (const [asset,meshes] of groups) {
        const kept: number[] = [];
        for (let i = 0; i < meshes[0].count; i++) {
            if (intersecting(meshes,i)) removed++;
            else kept.push(i);
        }
        if (kept.length < meshes[0].count)
            removedAssets[asset] = meshes[0].count-kept.length;
        for (const mesh of meshes) {
            kept.forEach((source,index) => {
                mesh.getMatrixAt(source,instance);
                mesh.setMatrixAt(index,instance);
            });
            mesh.count = kept.length;
            mesh.instanceMatrix.needsUpdate = true;
            mesh.computeBoundingBox();
            mesh.computeBoundingSphere();
        }
        // Measure the compacted render instances, rather than assuming removal succeeded.
        for (let i = 0; i < meshes[0].count; i++)
            if (intersecting(meshes,i)) overlappingNature++;
    }
    return { removed,removedAssets,overlappingNature };
}
