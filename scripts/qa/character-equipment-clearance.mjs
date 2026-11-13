import { Matrix4, Triangle, Vector3 } from 'three';
import { createRigidPropIntersectionMeasure } from './rigid-prop-intersection.mjs';

/** Visible body and worn clothes; exemptions identify the actual intersection point, not an entire arm. */
export function createEquipmentCharacterIntersectionMeasure(
    human, equipmentId, garmentIds, nativeRegion, { gripBinding } = {},
) {
    const prop = human.fit.modules.get(equipmentId)?.children.find(mesh => mesh.isSkinnedMesh);
    if (!prop) throw new Error('The actual equipment must be installed.');
    const spear = equipmentId === 'equipment/native-wooden-spear';
    const bones = human.fit.nativeSkeleton.bones;
    const hand = bones.find(bone => bone.name === (spear ? 'mixamorigRightHand' : 'mixamorigLeftForeArm'));
    const contactJoints = new Set(bones.flatMap((bone, joint) => {
        for (let parent = bone; parent; parent = parent.parent) if (parent === hand) return [joint];
        return [];
    }));
    const grip = spear ? gripBinding?.rigidEquipment?.parts.find(part => part.mesh === prop.name) : undefined;
    const radius = gripBinding?.rigidEquipment?.gripPose?.fingerRadius;
    if (spear && (!grip || bones[grip.joint] !== hand || !Number.isFinite(radius) || radius <= 0))
        throw new Error('The spear contact probe requires its actual measured right-hand grip binding.');
    let gripFrame;
    const targets = [{ id: 'visible-body', mesh: human.fit.mesh }];
    for (const id of garmentIds) {
        const group = human.fit.modules.get(id);
        if (!group?.visible) continue;
        group.traverse(mesh => { if (mesh.isSkinnedMesh && mesh.visible) targets.push({ id, mesh }); });
    }
    const measures = targets.filter(({ mesh }) => mesh.visible).map(({ id, mesh }) => {
        const positions = mesh.geometry.getAttribute('position');
        const skinIndices = mesh.geometry.getAttribute('skinIndex');
        const skinWeights = mesh.geometry.getAttribute('skinWeight');
        const regions = Array.from({ length: positions.count }, (_, vertex) => nativeRegion(mesh, vertex,
            new Vector3().fromBufferAttribute(positions, vertex).applyMatrix4(human.fit.encoding)));
        const weights = regions.map((region, vertex) => {
            let weight = 0;
            for (let influence = 0; influence < 4; influence++) {
                if (contactJoints.has(skinIndices.getComponent(vertex, influence)))
                    weight += skinWeights.getComponent(vertex, influence);
            }
            return weight;
        });
        const armRegions = new Set(spear ? ['LOWER_ARM_R'] : ['LOWER_ARM_L', 'UPPER_ARM_L']);
        const eligible = vertex => armRegions.has(regions[vertex]);
        const allowedPoint = ({ vertices, weights: barycentric }, point) => {
            // Native HEAD/neck/torso overrides remain protected even when the source has odd arm weights.
            if (!vertices.every(eligible)) return false;
            if (!spear && vertices.every(vertex => regions[vertex] === 'UPPER_ARM_L')) return false;
            const weight = vertices.reduce((sum, vertex, index) => sum + weights[vertex] * barycentric[index], 0);
            // At the wrist seam a triangle can span forearm and palm. Classify the actual hit by
            // interpolated anatomy; a whole-triangle .6 cut falsely kept the distal gripping palm.
            if (weight > .5) return true;
            if (!spear) return false;
            // Artist weights blend across the wrist. Only a point distal to the actual wrist
            // and no farther than the posed hand surface can complete this finite hand domain.
            const distal = point.clone().sub(gripFrame.wrist).dot(gripFrame.distalAxis);
            return distal > 0 && distal <= gripFrame.handExtent;
        };
        const measure = createRigidPropIntersectionMeasure(prop, mesh, {
            rightTriangleFilter: vertices => spear || !vertices.every(vertex =>
                regions[vertex] === 'LOWER_ARM_L' && weights[vertex] > .5),
            allowContact: contact => {
                if (!allowedPoint(contact.right, contact.point)) return false;
                if (!spear) return true;
                // Test the actual point in the measured source-native hand frame. This preserves
                // the authored cavity radius under DNA scale without inflating it in world space.
                const offset = contact.point.clone().applyMatrix4(gripFrame.inverse).sub(gripFrame.centre);
                // fingerRadius measures a curl circle normal to the shaft axis. Its cavity is
                // cylindrical; the finite hand-anatomy domain above limits its axial extent.
                offset.addScaledVector(gripFrame.axis, -offset.dot(gripFrame.axis));
                return offset.length() <= radius;
            },
            stopAtFirst: true,
        });
        return { id, mesh, regions, weights, measure };
    });
    const handSurface = spear ? measures.find(target => target.mesh === human.fit.mesh) : undefined;
    const visibleVertices = new Set(human.fit.mesh.geometry.getIndex().array);
    const handVertices = handSurface ? handSurface.weights.flatMap((weight, vertex) =>
        visibleVertices.has(vertex) && weight > .5 && handSurface.regions[vertex] === 'LOWER_ARM_R' ? [vertex] : []) : [];
    if (spear && !handVertices.length) throw new Error('The actual visible right-hand anatomy is required.');
    return (poseCache = new Map()) => {
        if (spear) {
            human.root.updateMatrixWorld(true);
            const nativeToWorld = prop.matrixWorld.clone().multiply(prop.bindMatrixInverse)
                .multiply(bones[grip.joint].matrixWorld).multiply(prop.skeleton.boneInverses[grip.joint])
                .multiply(prop.bindMatrix).multiply(human.fit.encoding.clone().invert());
            const wrist = bones[grip.joint].getWorldPosition(new Vector3());
            const elbow = bones[grip.joint].parent.getWorldPosition(new Vector3());
            const distalAxis = wrist.clone().sub(elbow).normalize();
            let handExtent = 0;
            const point = new Vector3();
            for (const vertex of handVertices) {
                human.fit.mesh.getVertexPosition(vertex, point).applyMatrix4(human.fit.mesh.matrixWorld);
                handExtent = Math.max(handExtent, point.sub(wrist).dot(distalAxis));
            }
            gripFrame = { inverse: nativeToWorld.invert(), centre: new Vector3(...grip.grip),
                axis: new Vector3(...gripBinding.rigidEquipment.gripPose.axis).normalize(),
                wrist, distalAxis, handExtent };
        }
        return measures.map(({ id, mesh, regions, weights, measure }) => {
            const result = measure(poseCache);
            const hit = result.firstHitDetails;
            let hitRegions, vertices, interpolation;
            if (hit?.direction === 'left-to-right') {
                const indices = mesh.geometry.getIndex();
                vertices = [0, 1, 2].map(offset => indices.getX(hit.triangle * 3 + offset));
                const points = poseCache.get(mesh).points;
                interpolation = Triangle.getBarycoord(new Vector3(...hit.point), ...vertices.map(vertex => points[vertex]), new Vector3()).toArray();
                hitRegions = vertices.map(vertex => regions[vertex]);
            } else if (hit) {
                vertices = hit.edge;
                const points = poseCache.get(mesh).points;
                const fraction = new Vector3(...hit.point).distanceTo(points[vertices[0]]) /
                    points[vertices[0]].distanceTo(points[vertices[1]]);
                interpolation = [1 - fraction, fraction];
                hitRegions = vertices.map(vertex => regions[vertex]);
            }
            let contactClassification;
            if (hit) {
                contactClassification = { anatomicalContactWeight: vertices.reduce((sum, vertex, index) =>
                    sum + weights[vertex] * interpolation[index], 0) };
                if (spear) {
                    const offset = new Vector3(...hit.point).applyMatrix4(gripFrame.inverse).sub(gripFrame.centre);
                    offset.addScaledVector(gripFrame.axis, -offset.dot(gripFrame.axis));
                    contactClassification.radialGripDistance = offset.length();
                    contactClassification.measuredGripRadius = radius;
                    contactClassification.distalWristDistance = new Vector3(...hit.point).sub(gripFrame.wrist).dot(gripFrame.distalAxis);
                    contactClassification.posedHandExtent = gripFrame.handExtent;
                }
            }
            return { surface: id, mesh: mesh.name, ...result, hitRegions, contactClassification };
        });
    };
}
