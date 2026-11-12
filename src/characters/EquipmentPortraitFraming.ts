import { Box3, Vector3, type Mesh, type SkinnedMesh } from 'three';
import type { MeshyHuman } from './MeshyHuman';
import { characterAsset } from './CharacterAssets';

interface PortraitBasis { target: Vector3; across: Vector3; up: Vector3; forward: Vector3 }

/** The small emblem keeps face/chest and real grip/shield references; QA can request complete props. */
export function equipmentPortraitFrame(human: MeshyHuman, frame: PortraitBasis,
    fieldOfView: number, full = false) {
    const bounds = new Box3(), references: Vector3[] = [];
    const scale = human.root.getWorldScale(new Vector3()).y;
    const include = (point: Vector3) => { bounds.expandByPoint(point); references.push(point); };
    for (const [id, module] of human.fit.modules) {
        if (!id.startsWith('equipment/') || !module.visible) continue;
        if (full) {
            const complete = new Box3().setFromObject(module, true);
            for (const x of [complete.min.x, complete.max.x]) for (const y of [complete.min.y, complete.max.y])
                for (const z of [complete.min.z, complete.max.z]) include(new Vector3(x, y, z));
            continue;
        }
        const asset = characterAsset(id), anchor = asset.metadata?.anchor;
        const joint = anchor === 'socket_hand_R' ? 24 : anchor === 'socket_hand_L' ? 11 : undefined;
        const hand = joint === undefined ? undefined : human.fit.nativeSkeleton.bones[joint].getWorldPosition(new Vector3());
        if (hand) include(hand);
        const shield = asset.tags.some(tag => tag.toLowerCase().endsWith('shield'));
        module.traverse(node => {
            const mesh = node as Mesh;
            if (!mesh.isMesh) return;
            const positions = mesh.geometry.getAttribute('position');
            for (let vertex = 0; vertex < positions.count; vertex++) {
                const point = (mesh as SkinnedMesh).isSkinnedMesh
                    ? (mesh as SkinnedMesh).getVertexPosition(vertex, new Vector3())
                    : new Vector3().fromBufferAttribute(positions, vertex);
                point.applyMatrix4(mesh.matrixWorld);
                const visibleShield = shield && hand && point.distanceTo(hand) <= .32 * scale &&
                    point.clone().sub(frame.target).dot(frame.up) >= -.62 * scale;
                const visibleGrip = !shield && hand && point.distanceTo(hand) <= .16 * scale &&
                    point.clone().sub(hand).dot(frame.up) >= -.02 * scale;
                if (visibleShield || visibleGrip) include(point);
            }
        });
    }
    if (bounds.isEmpty()) return undefined;
    const margin = .18 * scale;
    for (const x of [-margin, margin]) for (const y of [-margin, margin])
        for (const z of [-margin, margin]) include(frame.target.clone().add(new Vector3(x, y, z)));
    const target = bounds.getCenter(new Vector3());
    const direction = frame.forward.clone().multiplyScalar(Math.SQRT1_2)
        .addScaledVector(frame.across, Math.SQRT1_2).addScaledVector(frame.up, .03).normalize();
    const right = frame.up.clone().cross(direction).normalize();
    const up = direction.clone().cross(right).normalize();
    const tangent = Math.tan(fieldOfView * Math.PI / 360), aspect = full ? 1 : 8 / 9;
    let distance = 0;
    for (const reference of references) {
        const delta = reference.clone().sub(target);
        distance = Math.max(distance, delta.dot(direction) + (full ? 1.08 : 1.04) * Math.max(
            Math.abs(delta.dot(right)) / (tangent * aspect), Math.abs(delta.dot(up)) / tangent));
    }
    return { target, distance };
}
