import { Matrix4, SkinnedMesh, Vector3 } from 'three';
import type { NativeHeadwearFitBinding } from './BodyFitAdapter';
import type { MeshyBodyFitAdapter } from './MeshyBodyFitAdapter';
export function capRadii(profile: readonly number[][], height: number): [
    number,
    number
] | null {
    if (height > profile[profile.length - 1][0])
        return null;
    if (height <= profile[0][0])
        return [profile[0][1], profile[0][2]];
    const upper = profile.findIndex(row => row[0] >= height);
    const a = profile[upper - 1], b = profile[upper], amount = (height - a[0]) / (b[0] - a[0]);
    return [a[1] + (b[1] - a[1]) * amount, a[2] + (b[2] - a[2]) * amount];
}
/** A hat keeps its authored proportions; the covered crown can be tucked underneath. */
export function headwearAdjustment(points: readonly Vector3[], binding: NativeHeadwearFitBinding) {
    if (!points.length)
        return { lift: 0, radialScale: 1, support: 'head' as const, samples: 0 };
    let best: {
        lift: number;
        radialScale: number;
        cost: number;
    } | undefined;
    for (let step = 0; step <= 20; step++) {
        const lift = binding.maximumLift * step / 20;
        let required = 1;
        for (const point of points) {
            const height = point.y - lift;
            if (height < binding.profile[0][0])
                continue;
            const radii = capRadii(binding.profile, height);
            if (!radii) {
                required = Math.max(required, 2);
                continue;
            }
            required = Math.max(required, Math.hypot((Math.abs(point.x) + binding.clearance) / radii[0], (Math.abs(point.z) + binding.clearance) / radii[1]));
        }
        const radialScale = Math.min(required, binding.maximumRadialScale);
        const cost = lift + .10 * (radialScale - 1) + .025 * Math.max(0, required - radialScale);
        if (!best || cost < best.cost)
            best = { lift, radialScale, cost };
    }
    return { lift: best!.lift, radialScale: best!.radialScale, support: 'hair' as const, samples: points.length };
}
/** Effective vertex skin matrix, including mixed native influences and resident transforms. */
function vertexWorld(mesh: SkinnedMesh, vertex: number) {
    const joints = mesh.geometry.getAttribute('skinIndex'), weights = mesh.geometry.getAttribute('skinWeight');
    const skin = new Matrix4();
    skin.elements.fill(0);
    for (let channel = 0; channel < 4; channel++) {
        const weight = weights.getComponent(vertex, channel);
        if (!weight)
            continue;
        const joint = joints.getComponent(vertex, channel);
        const matrix = mesh.skeleton.bones[joint].matrixWorld.clone().multiply(mesh.skeleton.boneInverses[joint]);
        matrix.elements.forEach((value, index) => skin.elements[index] += value * weight);
    }
    return mesh.matrixWorld.clone().multiply(mesh.bindMatrixInverse).multiply(skin).multiply(mesh.bindMatrix);
}
/** Only owned crown vertices change; exposed locks, the braid and its strap retain their source shape. */
function tuckCrown(mesh: SkinnedMesh, capWorld: Matrix4, binding: NativeHeadwearFitBinding) {
    const positions = mesh.geometry.getAttribute('position');
    const joints = mesh.geometry.getAttribute('skinIndex'), weights = mesh.geometry.getAttribute('skinWeight');
    const inverseCap = capWorld.clone().invert();
    let tucked = 0;
    for (let vertex = 0; vertex < positions.count; vertex++) {
        let headWeight = 0;
        for (let channel = 0; channel < 4; channel++) {
            if (joints.getComponent(vertex, channel) === binding.headJoint)
                headWeight += weights.getComponent(vertex, channel);
        }
        if (headWeight < .999)
            continue;
        const world = vertexWorld(mesh, vertex);
        const point = new Vector3().fromBufferAttribute(positions, vertex).applyMatrix4(world).applyMatrix4(inverseCap);
        if (point.y < binding.profile[0][0])
            continue;
        const ceiling = binding.profile[binding.profile.length - 1][0] - .008;
        const height = Math.min(point.y, ceiling);
        const radii = capRadii(binding.profile, height)!;
        const xRadius = Math.max(.001, radii[0] - binding.clearance);
        const zRadius = Math.max(.001, radii[1] - binding.clearance);
        const radius = Math.hypot(point.x / xRadius, point.z / zRadius);
        if (radius <= 1 && height === point.y)
            continue;
        point.y = height;
        if (radius > 1) {
            point.x /= radius;
            point.z /= radius;
        }
        point.applyMatrix4(capWorld).applyMatrix4(world.invert());
        positions.setXYZ(vertex, point.x, point.y, point.z);
        tucked++;
    }
    if (tucked) {
        positions.needsUpdate = true;
        mesh.geometry.computeVertexNormals();
        mesh.geometry.computeBoundingSphere();
    }
    return tucked;
}
/** Refit in neutral only; animation then follows the body's unchanged Head bone. */
export function fitNativeHeadwear(mesh: SkinnedMesh, binding: NativeHeadwearFitBinding, hair: readonly SkinnedMesh[], fit: MeshyBodyFitAdapter) {
    const head = fit.nativeSkeleton.bones[binding.headJoint];
    const skin = mesh.bindMatrixInverse.clone().multiply(head.matrixWorld)
        .multiply(fit.nativeSkeleton.boneInverses[binding.headJoint]).multiply(mesh.bindMatrix);
    const skinWorld = mesh.matrixWorld.clone().multiply(skin);
    const capWorld = skinWorld.clone().multiply(fit.encoding.clone().invert())
        .multiply(new Matrix4().fromArray(binding.frame));
    const worldToCap = capWorld.clone().invert(), points: Vector3[] = [];
    for (const hairMesh of hair) {
        const positions = hairMesh.geometry.getAttribute('position');
        for (let vertex = 0; vertex < positions.count; vertex++) {
            const point = hairMesh.getVertexPosition(vertex, new Vector3())
                .applyMatrix4(hairMesh.matrixWorld).applyMatrix4(worldToCap);
            if (point.y >= 0 && point.y < .30
                && Math.abs(point.x) < .20 && Math.abs(point.z) < .20)
                points.push(point);
        }
    }
    const adjustment = headwearAdjustment(points, binding);
    const correction = new Matrix4().makeScale(adjustment.radialScale, 1, adjustment.radialScale);
    correction.setPosition(0, adjustment.lift, 0);
    const deform = skinWorld.clone().invert().multiply(capWorld).multiply(correction)
        .multiply(worldToCap).multiply(skinWorld);
    mesh.geometry.applyMatrix4(deform);
    mesh.geometry.computeBoundingSphere();
    const fittedCap = capWorld.clone().multiply(correction);
    const tuckedVertices = hair.reduce((count, item) => count + tuckCrown(item, fittedCap, binding), 0);
    mesh.userData.headwearFit = { ...adjustment, clearance: binding.clearance, tuckedVertices };
    return mesh.userData.headwearFit;
}
