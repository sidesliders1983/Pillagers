import {
    Bone, Float32BufferAttribute, Mesh, Skeleton, SkinnedMesh,
    Uint16BufferAttribute, Vector3, type Group,
} from 'three';

const forward = new Vector3(0, 0, 1);
const smooth = (value: number) => {
    const t = Math.max(0, Math.min(1, value));
    return t * t * (3 - 2 * t);
};
/** Prepare the pooled flight rig or folded rest target, retaining supplied faces and UVs. */
export function prepareGullWings(scene: Group, grounded = false) {
    if (scene.userData.wildlifeGullWings)
        return;
    const meshes: Mesh[] = [];
    scene.traverse(node => {
        if ((node as Mesh).isMesh && !(node as SkinnedMesh).isSkinnedMesh) {
            meshes.push(node as Mesh);
        }
    });
    for (const mesh of meshes) {
        if (grounded) {
            prepareFoldedWingTarget(mesh);
            prepareGullHeadTargets(mesh);
            continue;
        }
        const positions = mesh.geometry.getAttribute('position');
        const indices = new Uint16Array(positions.count * 4);
        const weights = new Float32Array(positions.count * 4);
        const body = new Bone();
        body.name = 'GullBody';
        const bones = [body];
        for (const side of [-1, 1]) {
            const shoulder = new Bone(), elbow = new Bone(), wrist = new Bone();
            shoulder.name = 'GullShoulder' + side;
            elbow.name = 'GullElbow' + side;
            wrist.name = 'GullWrist' + side;
            shoulder.position.set(side * .13, .02, 0);
            elbow.position.set(side * .31, 0, 0);
            wrist.position.set(side * .28, 0, 0);
            body.add(shoulder);
            shoulder.add(elbow);
            elbow.add(wrist);
            bones.push(shoulder, elbow, wrist);
        }
        for (let vertex = 0; vertex < positions.count; vertex++) {
            const x = positions.getX(vertex), distance = Math.abs(x);
            const first = x < 0 ? 1 : 4;
            const attachment = positions.getY(vertex) < -.13 && distance < .35 ? 0 : smooth((distance - .18) / .11);
            let a = first, b = first, blend = 0;
            if (distance > .39) {
                a = first;
                b = first + 1;
                blend = smooth((distance - .39) / .10);
            }
            if (distance > .67) {
                a = first + 1;
                b = first + 2;
                blend = smooth((distance - .67) / .10);
            }
            indices.set([0, a, b, 0], vertex * 4);
            weights.set([1 - attachment, attachment * (1 - blend), attachment * blend, 0], vertex * 4);
        }
        mesh.geometry.setAttribute('skinIndex', new Uint16BufferAttribute(indices, 4));
        mesh.geometry.setAttribute('skinWeight', new Float32BufferAttribute(weights, 4));
        const rigged = new SkinnedMesh(mesh.geometry, mesh.material);
        rigged.name = mesh.name;
        rigged.position.copy(mesh.position);
        rigged.quaternion.copy(mesh.quaternion);
        rigged.scale.copy(mesh.scale);
        rigged.userData = { ...mesh.userData };
        rigged.add(body);
        mesh.parent!.add(rigged);
        mesh.removeFromParent();
        scene.updateMatrixWorld(true);
        rigged.bind(new Skeleton(bones));
    }
    scene.userData.wildlifeGullWings = true;
}

export interface GullWingRig {
    shoulder: Bone;
    elbow: Bone;
    wrist: Bone;
    side: number;
}

export function gullWingRig(model: Group): GullWingRig[] {
    return [-1, 1].map(side => ({
        side,
        shoulder: model.getObjectByName('GullShoulder' + side) as Bone,
        elbow: model.getObjectByName('GullElbow' + side) as Bone,
        wrist: model.getObjectByName('GullWrist' + side) as Bone,
    }));
}

/** Folded rest with a brief, separately phased wing stretch. Flight effort follows actual ascent. */
export function gullWingMotion(time: number, phase: number, grounded: boolean, effort = 0) {
    if (!grounded)
        return { fold: 0, flap: Math.sin(time * Math.PI * 5.6 + phase) * .45 * effort };
    const period = 29 + phase, cycle = (time + 6 + phase * 3) % period;
    const stretch = cycle < 3.6 ? Math.sin(Math.PI * cycle / 3.6) ** 2 : 0;
    return { fold: 1 - stretch, flap: 0 };
}

function prepareFoldedWingTarget(mesh: Mesh) {
    const positions = mesh.geometry.getAttribute('position');
    const target = new Float32Array(positions.count * 3);
    for (let i = 0; i < positions.count; i++) {
        const point = new Vector3().fromBufferAttribute(positions, i);
        const distance = Math.abs(point.x);
        // Sweep the intact wing rearwards into a narrow volume beside the body.
        // This affine map retains upper/lower surface separation and feather ordering.
        const folded = new Vector3(
            Math.sign(point.x) * (.235 + (point.z + .1) * .1),
            .03 + (point.y - .03) * .75,
            -.04 - (distance - .18) * .68,
        );
        point.lerp(folded, point.y < -.13 && distance < .35 ? 0 : smooth((distance - .16) / .08));
        point.toArray(target, i * 3);
    }
    const closed = mesh.geometry.clone();
    closed.setAttribute('position', new Float32BufferAttribute(target, 3));
    closed.computeVertexNormals();
    mesh.geometry.morphAttributes.position = [closed.getAttribute('position')];
    mesh.geometry.morphAttributes.normal = [closed.getAttribute('normal')];
    mesh.geometry.morphTargetsRelative = false;
    closed.dispose();
    mesh.updateMorphTargets();
    mesh.userData.wildlifeFoldedWing = true;
}

export function gullFoldedWings(model: Group) {
    const meshes: Mesh[] = [];
    model.traverse(node => {
        if (node.userData.wildlifeFoldedWing) meshes.push(node as Mesh);
    });
    return meshes;
}

export function poseGroundedGull(meshes: readonly Mesh[], fold: number, head = 0) {
    for (const mesh of meshes) {
        mesh.morphTargetInfluences![0] = fold;
        mesh.morphTargetInfluences![1] = Math.max(0, head);
        mesh.morphTargetInfluences![2] = Math.max(0, -head);
    }
}

export function poseGullWings(rig: readonly GullWingRig[], flap: number) {
    for (const wing of rig) {
        wing.shoulder.quaternion.setFromAxisAngle(forward, wing.side * flap);
        wing.elbow.quaternion.setFromAxisAngle(forward, -wing.side * flap * .35);
        wing.wrist.quaternion.identity();
    }
}

/** Brief left/right scans, separated by a longer neutral rest and phased per bird. */
export function gullHeadLook(time: number, phase: number) {
    const cycle = (time + phase * 3) % (14 + phase);
    if (cycle < 1) return smooth(cycle);
    if (cycle < 2) return 1;
    if (cycle < 3.5) return 1 - 2 * smooth((cycle - 2) / 1.5);
    if (cycle < 4.5) return -1;
    if (cycle < 5.5) return -1 + smooth(cycle - 4.5);
    return 0;
}

/** Head-only targets combine additively with the existing absolute folded-wing target. */
function prepareGullHeadTargets(mesh: Mesh) {
    const positions = mesh.geometry.getAttribute('position');
    const pivot = new Vector3(0, .11, .24), up = new Vector3(0, 1, 0);
    for (const side of [1, -1]) {
        const target = new Float32Array(positions.count * 3);
        for (let vertex = 0; vertex < positions.count; vertex++) {
            const point = new Vector3().fromBufferAttribute(positions, vertex);
            const weight = smooth((point.z - .20) / .10) * smooth((point.y - .025) / .10)
                * (1 - smooth((Math.abs(point.x) - .09) / .08));
            const turned = point.clone().sub(pivot).applyAxisAngle(up, side * .45).add(pivot);
            point.lerp(turned, weight).toArray(target, vertex * 3);
        }
        const turned = mesh.geometry.clone();
        turned.setAttribute('position', new Float32BufferAttribute(target, 3));
        turned.computeVertexNormals();
        mesh.geometry.morphAttributes.position!.push(turned.getAttribute('position'));
        mesh.geometry.morphAttributes.normal!.push(turned.getAttribute('normal'));
        turned.dispose();
    }
    mesh.updateMorphTargets();
}
