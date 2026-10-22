import { Box3, Matrix4, Mesh, Object3D, Vector3 } from 'three';

export type ScaffoldPreset = 'light' | 'heavy';
export type ConstructionMaterial = 'timber' | 'turf' | 'stone';

/** Building-local metres. The footprint includes roof overhangs, but excludes the yard. */
export interface BuildEnvelope {
    footprint: { x: number; z: number }[];
    baseHeight: number;
    eaveHeight: number;
    ridgeHeight: number;
    scaffoldMargin: number;
    scaffoldPreset: ScaffoldPreset;
    materialProfile: ConstructionMaterial;
}

export const housingConstructionProfiles: Record<string, {
    scaffoldPreset: ScaffoldPreset; materialProfile: ConstructionMaterial; eaveRatio: number;
}> = {
    hut: { scaffoldPreset: 'light', materialProfile: 'turf', eaveRatio: .58 },
    farmHut: { scaffoldPreset: 'light', materialProfile: 'turf', eaveRatio: .58 },
    homestead: { scaffoldPreset: 'light', materialProfile: 'timber', eaveRatio: .62 },
    farmHomestead: { scaffoldPreset: 'light', materialProfile: 'timber', eaveRatio: .62 },
    longhouse: { scaffoldPreset: 'heavy', materialProfile: 'timber', eaveRatio: .62 },
    greatHall: { scaffoldPreset: 'heavy', materialProfile: 'timber', eaveRatio: .65 }
};

/** Measure once after asset fitting. Named housing nodes keep farm fences out of the envelope. */
export function measureBuildEnvelope(root: Object3D, asset: string): BuildEnvelope {
    root.updateWorldMatrix(true, true);
    const house = root.getObjectByName(asset) ?? root;
    const inverse = root.matrixWorld.clone().invert(), bounds = new Box3();
    const matrix = new Matrix4();
    house.traverse(node => {
        if (!(node instanceof Mesh)) return;
        if (!node.geometry.boundingBox) node.geometry.computeBoundingBox();
        matrix.multiplyMatrices(inverse, node.matrixWorld);
        bounds.union(node.geometry.boundingBox!.clone().applyMatrix4(matrix));
    });
    if (bounds.isEmpty()) throw new Error('A construction envelope requires building geometry.');
    const profile = housingConstructionProfiles[asset] ?? housingConstructionProfiles.hut;
    return envelopeFromBounds(bounds, profile);
}

function envelopeFromBounds(bounds: Box3, profile: {
    scaffoldPreset: ScaffoldPreset; materialProfile: ConstructionMaterial; eaveRatio: number;
}): BuildEnvelope {
    return {
        footprint: [
            { x: bounds.min.x, z: bounds.min.z }, { x: bounds.max.x, z: bounds.min.z },
            { x: bounds.max.x, z: bounds.max.z }, { x: bounds.min.x, z: bounds.max.z }
        ],
        baseHeight: bounds.min.y,
        eaveHeight: bounds.min.y + (bounds.max.y - bounds.min.y) * profile.eaveRatio,
        ridgeHeight: bounds.max.y,
        scaffoldMargin: .65,
        scaffoldPreset: profile.scaffoldPreset,
        materialProfile: profile.materialProfile
    };
}

/** Contain both upgrade states in target-local space, including changed rotation or placement. */
export function unionBuildEnvelope(target: BuildEnvelope, old: BuildEnvelope,
    oldToTarget: Matrix4): BuildEnvelope {
    const bounds = new Box3();
    for (const point of target.footprint)
        for (const y of [target.baseHeight, target.ridgeHeight])
            bounds.expandByPoint(new Vector3(point.x, y, point.z));
    for (const point of old.footprint)
        for (const y of [old.baseHeight, old.ridgeHeight])
            bounds.expandByPoint(new Vector3(point.x, y, point.z).applyMatrix4(oldToTarget));
    const combined = envelopeFromBounds(bounds, {
        ...target, eaveRatio: (target.eaveHeight - target.baseHeight) /
            Math.max(.01, target.ridgeHeight - target.baseHeight)
    });
    return { ...combined, scaffoldMargin: Math.max(target.scaffoldMargin, old.scaffoldMargin) };
}
