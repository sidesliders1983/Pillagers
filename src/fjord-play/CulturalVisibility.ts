import { Vector3, type Camera } from 'three';

/** Camera framing is separate from the clan's actual knowledge and page lifecycle. */
export function culturalVisibility(point: { x: number; y: number; z: number }, camera: Camera,
    policy: { hidden: boolean; known: boolean; directedWedding: boolean }): boolean {
    if (policy.hidden || !policy.known) return false;
    // A narrow directed shot may intentionally frame the couple instead of the fire.
    // Its own camera composition cannot invalidate an already accepted performance.
    if (policy.directedWedding) return true;
    const projected = new Vector3(point.x, point.y, point.z).project(camera);
    return projected.z >= -1 && projected.z <= 1 &&
        Math.abs(projected.x) <= 1.1 && Math.abs(projected.y) <= 1.1;
}
