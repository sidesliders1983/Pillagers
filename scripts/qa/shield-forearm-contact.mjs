import { Matrix4, Quaternion, Vector3 } from 'three';

/**
 * Measure a sampled mounting seam against the supplied shield's actual surfaces.
 * Positive intrusion places skin inside or beyond the source rear envelope.
 * This does not certify whole-triangle collisions, garments or handle cavities.
 */
export function createShieldForearmContactMeasure(human, shieldId, source, provenance) {
    const group = human.fit.modules.get(shieldId);
    const shield = group?.children.find(mesh => mesh.isSkinnedMesh);
    if (!shield) throw new Error('The real shield must be installed before measuring its contact.');
    const originals = [];
    source.scene.traverse(node => { if (node.isMesh) originals.push(node); });
    if (originals.length !== 1) throw new Error('The reviewed source must contain one actual shield mesh.');
    const original = originals[0];
    const values = provenance?.grip?.transform;
    if (!Array.isArray(values) || values.length !== 16 || !values.every(Number.isFinite))
        throw new Error('The shield needs its recorded finite source-to-native transform.');
    const transform = new Matrix4().fromArray(values);
    if (Math.abs(transform.determinant()) < 1e-12)
        throw new Error('The recorded shield transform must be invertible.');
    const inverse = transform.clone().invert();
    const positions = original.geometry.getAttribute('position');
    const points = Array.from({ length: positions.count }, (_, vertex) =>
        new Vector3().fromBufferAttribute(positions, vertex).applyMatrix4(inverse));
    const indices = original.geometry.getIndex();
    if (!indices || positions.count !== shield.geometry.getAttribute('position').count)
        throw new Error('Source and installed shield vertices must retain their exact correspondence.');
    const triangles = [];
    for (let index = 0; index < indices.count; index += 3) {
        const [a, b, c] = [0, 1, 2].map(offset => points[indices.getX(index + offset)]);
        const divisor = (b.y - c.y) * (a.x - c.x) + (c.x - b.x) * (a.y - c.y);
        // A depth-parallel triangle has no area in this projection.
        if (Math.abs(divisor) < 1e-12) continue;
        triangles.push({ a, b, c, divisor,
            minX: Math.min(a.x, b.x, c.x), maxX: Math.max(a.x, b.x, c.x),
            minY: Math.min(a.y, b.y, c.y), maxY: Math.max(a.y, b.y, c.y) });
    }
    const bones = human.fit.nativeSkeleton.bones;
    const forearm = bones.findIndex(bone => bone.name === 'mixamorigLeftForeArm');
    const hand = bones.findIndex(bone => bone.name === 'mixamorigLeftHand');
    if (forearm < 0 || hand < 0) throw new Error('The native left forearm and hand are required.');
    const handJoints = new Set(bones.flatMap((bone, joint) => {
        for (let parent = bone; parent; parent = parent.parent) {
            if (parent === bones[hand]) return [joint];
        }
        return [];
    }));
    const skinIndices = shield.geometry.getAttribute('skinIndex');
    const skinWeights = shield.geometry.getAttribute('skinWeight');
    for (let vertex = 0; vertex < skinIndices.count; vertex++) {
        if (skinIndices.getX(vertex) !== hand || skinWeights.getX(vertex) !== 1 ||
            skinWeights.getY(vertex) !== 0 || skinWeights.getZ(vertex) !== 0 || skinWeights.getW(vertex) !== 0)
            throw new Error('The reviewed shield must remain rigidly bound to its existing left hand.');
    }
    const body = human.fit.mesh;
    const bodyIndices = body.geometry.getAttribute('skinIndex');
    const bodyWeights = body.geometry.getAttribute('skinWeight');
    const candidates = [];
    for (let vertex = 0; vertex < bodyIndices.count; vertex++) {
        let armWeight = 0, handWeight = 0;
        for (let influence = 0; influence < 4; influence++) {
            const joint = bodyIndices.getComponent(vertex, influence);
            const weight = bodyWeights.getComponent(vertex, influence);
            if (joint === forearm) armWeight += weight;
            if (handJoints.has(joint)) handWeight += weight;
        }
        // Keep the dominant left forearm/hand surface, including finger descendants.
        if (armWeight + handWeight >= .6) candidates.push({ vertex, armWeight, handWeight });
    }

    return () => {
        human.root.updateMatrixWorld(true);
        const sourceToWorld = shield.matrixWorld.clone().multiply(shield.bindMatrixInverse)
            .multiply(bones[hand].matrixWorld).multiply(shield.skeleton.boneInverses[hand])
            .multiply(shield.bindMatrix).multiply(human.fit.encoding.clone().invert())
            .multiply(transform);
        const worldToSource = sourceToWorld.clone().invert();
        const depthScale = new Vector3().setFromMatrixColumn(sourceToWorld, 2).length();
        const frontNormal = new Vector3().setFromMatrixColumn(sourceToWorld, 0)
            .cross(new Vector3().setFromMatrixColumn(sourceToWorld, 1)).normalize();
        const forward = new Vector3(0, 0, 1)
            .applyQuaternion(human.fit.bodyRoot.getWorldQuaternion(new Quaternion()));
        let sampled = 0, ahead = 0, maximumIntrusion = -Infinity;
        let maximumForearmIntrusion = -Infinity, maximumHandIntrusion = -Infinity;
        let maximumTransformError = 0;
        for (let vertex = 0; vertex < positions.count; vertex += 137) {
            const projected = points[vertex].clone().applyMatrix4(sourceToWorld);
            const actual = shield.getVertexPosition(vertex, new Vector3()).applyMatrix4(shield.matrixWorld);
            maximumTransformError = Math.max(maximumTransformError, projected.distanceTo(actual));
        }
        for (const { vertex, armWeight, handWeight } of candidates) {
            const point = body.getVertexPosition(vertex, new Vector3())
                .applyMatrix4(body.matrixWorld).applyMatrix4(worldToSource);
            const panel = shieldDepthAt(triangles, point);
            if (!panel) continue;
            sampled++;
            const intrusion = (point.z - panel.rear) * depthScale;
            if ((point.z - panel.front) * depthScale > .0015) ahead++;
            maximumIntrusion = Math.max(maximumIntrusion, intrusion);
            if (armWeight >= .6) maximumForearmIntrusion = Math.max(maximumForearmIntrusion, intrusion);
            if (handWeight >= .6) maximumHandIntrusion = Math.max(maximumHandIntrusion, intrusion);
        }
        return { sampled, ahead, maximumIntrusion, maximumForearmIntrusion, maximumHandIntrusion,
            maximumTransformError, frontNormalDotForward: frontNormal.dot(forward) };
    };
}

function shieldDepthAt(triangles, point) {
    let rear = Infinity, front = -Infinity;
    for (const triangle of triangles) {
        if (point.x < triangle.minX || point.x > triangle.maxX ||
            point.y < triangle.minY || point.y > triangle.maxY) continue;
        const { a, b, c, divisor } = triangle;
        const u = ((b.y - c.y) * (point.x - c.x) + (c.x - b.x) * (point.y - c.y)) / divisor;
        const v = ((c.y - a.y) * (point.x - c.x) + (a.x - c.x) * (point.y - c.y)) / divisor;
        const w = 1 - u - v;
        if (u < -1e-7 || v < -1e-7 || w < -1e-7) continue;
        const depth = u * a.z + v * b.z + w * c.z;
        rear = Math.min(rear, depth);
        front = Math.max(front, depth);
    }
    return Number.isFinite(rear) ? { rear, front } : undefined;
}
