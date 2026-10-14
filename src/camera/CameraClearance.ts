import { worldConfig } from '../config/worldConfig';
import type { TerrainField } from '../world-generation/WorldBlueprint';

export interface CameraPoint { x: number; y: number; z: number }
type TerrainGrid = Pick<TerrainField, 'bounds' | 'spacing'>;
export interface ClearanceRequest {
    focus: CameraPoint;
    eye: CameraPoint;
    heightAt: (x: number, z: number) => number;
    grid?: TerrainGrid;
    maximumHeight: number;
    waterLevel: number;
    nearRadius?: number;
    workspace?: Float64Array;
    previousLift?: number;
    deltaSeconds?: number;
    settings?: Partial<typeof worldConfig.camera.clearance>;
}

const epsilon = 1e-10;

/** Visit endpoints of every linear height segment, including alternating cell diagonals. */
function traceTerrain(focus: CameraPoint, eye: CameraPoint, start: number,
    grid: TerrainGrid | undefined, visit: (t: number) => boolean) {
    const spacing = grid?.spacing ?? 2;
    const originX = grid?.bounds.minX ?? 0, originZ = grid?.bounds.minZ ?? 0;
    const dx = eye.x - focus.x, dz = eye.z - focus.z;
    let t = start;
    if (!visit(t)) return false;
    while (t < 1 - epsilon) {
        // Probe just inside the next cell so a negative-direction grid crossing advances too.
        const probe = Math.min(1, t + epsilon);
        const col = Math.floor((focus.x + dx * probe - originX) / spacing);
        const row = Math.floor((focus.z + dz * probe - originZ) / spacing);
        const tx = dx === 0 ? Infinity :
            (originX + (col + (dx > 0 ? 1 : 0)) * spacing - focus.x) / dx;
        const tz = dz === 0 ? Infinity :
            (originZ + (row + (dz > 0 ? 1 : 0)) * spacing - focus.z) / dz;
        const end = Math.min(1, tx, tz);
        if (end <= t + epsilon) return false;
        const even = (col + row) % 2 === 0;
        const divisor = even ? dx + dz : dx - dz;
        const diagonal = divisor === 0 ? Infinity : even ?
            ((col + row + 1) * spacing - (focus.x - originX + focus.z - originZ)) / divisor :
            ((col - row) * spacing - (focus.x - originX - focus.z + originZ)) / divisor;
        if (diagonal > t + epsilon && diagonal < end - epsilon && !visit(diagonal)) return false;
        if (!visit(end)) return false;
        t = end;
    }
    return true;
}

/** Presentation-only vertical correction; requested focus and orbit are never mutated. */
export function solveCameraClearance(request: ClearanceRequest) {
    const { focus, eye, heightAt, waterLevel } = request;
    const settings = { ...worldConfig.camera.clearance, ...request.settings };
    const coordinates = [focus.x, focus.y, focus.z, eye.x, eye.y, eye.z,
        eye.x - focus.x, eye.y - focus.y, eye.z - focus.z];
    const controls = [request.maximumHeight, waterLevel, request.nearRadius ?? 0,
        request.previousLift ?? 0, request.deltaSeconds ?? 0, ...Object.values(settings)];
    if (!coordinates.every(Number.isFinite) || !controls.every(Number.isFinite) ||
        settings.nearTarget <= 0 || settings.ground < 0 || settings.boom < 0 || settings.recoveryRate < 0 ||
        !Number.isInteger(settings.maxSamples) || settings.maxSamples < 8 || settings.maxSamples > 4096 ||
        (request.nearRadius ?? 0) < 0 || (request.previousLift ?? 0) < 0 || (request.deltaSeconds ?? 0) < 0 ||
        request.grid && (!Number.isFinite(request.grid.spacing) || request.grid.spacing <= 0 ||
            !Object.values(request.grid.bounds).every(Number.isFinite)))
        throw new RangeError('Camera clearance requires finite poses and valid terrain settings.');
    const workspace = request.workspace ?? new Float64Array(settings.maxSamples * 2);
    if (workspace.length < settings.maxSamples * 2) throw new RangeError('Camera clearance workspace is too small.');
    const ceiling = Math.max(waterLevel, request.maximumHeight);
    const radius = request.nearRadius ?? 0;
    let samples = 0, conservative = false, boomCount = 0, invalidSamples = 0;
    const sample = (x: number, z: number) => {
        if (samples >= settings.maxSamples) { conservative = true; return ceiling; }
        samples++;
        let height: number;
        try { height = heightAt(x, z); } catch { height = NaN; }
        if (!Number.isFinite(height)) {
            invalidSamples++;
            conservative = true;
            return ceiling;
        }
        return Math.max(waterLevel, height);
    };
    let eyeGround = sample(eye.x, eye.z);
    if (radius > 0) {
        // The square encloses the near plane's bounding sphere in X/Z. Its extrema lie
        // on the square boundary or on a source heightfield vertex inside it.
        const corners = [
            { x: eye.x - radius, y: 0, z: eye.z - radius },
            { x: eye.x + radius, y: 0, z: eye.z - radius },
            { x: eye.x + radius, y: 0, z: eye.z + radius },
            { x: eye.x - radius, y: 0, z: eye.z + radius },
        ];
        for (let i = 0; i < corners.length; i++) {
            const a = corners[i], b = corners[(i + 1) % corners.length];
            if (!traceTerrain(a, b, 0, request.grid, t => {
                eyeGround = Math.max(eyeGround, sample(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t));
                return !conservative;
            })) conservative = true;
        }
        const spacing = request.grid?.spacing ?? 2;
        const originX = request.grid?.bounds.minX ?? 0, originZ = request.grid?.bounds.minZ ?? 0;
        for (let x = originX + Math.ceil((eye.x - radius - originX) / spacing) * spacing;
            x <= eye.x + radius && !conservative; x += spacing) {
            for (let z = originZ + Math.ceil((eye.z - radius - originZ) / spacing) * spacing;
                z <= eye.z + radius && !conservative; z += spacing) eyeGround = Math.max(eyeGround, sample(x, z));
        }
    }
    const dx = eye.x - focus.x, dz = eye.z - focus.z;
    const distance = Math.hypot(dx, dz);
    const start = distance > 0 ? Math.min(1, settings.nearTarget / distance) : 1;
    let requiredLift = Math.max(0, eyeGround + Math.max(settings.ground, radius) - eye.y);
    const complete = !conservative && traceTerrain(focus, eye, start, request.grid, t => {
        const ground = sample(focus.x + dx * t, focus.z + dz * t);
        if (conservative) return false;
        const baseline = focus.y + (eye.y - focus.y) * t;
        requiredLift = Math.max(requiredLift, (ground + settings.boom - baseline) / t);
        workspace[boomCount * 2] = t;
        workspace[boomCount * 2 + 1] = ground;
        boomCount++;
        return true;
    });
    if (!complete) {
        // A pathological/long boom uses the source terrain ceiling, never unchecked undersampling.
        conservative = true;
        eyeGround = Math.max(eyeGround, ceiling);
        requiredLift = Math.max(requiredLift, ceiling + Math.max(settings.ground, radius) - eye.y,
            (ceiling + settings.boom - focus.y - (eye.y - focus.y) * start) / start,
            ceiling + settings.boom - eye.y);
    }
    const recovery = Math.exp(-Math.max(0, request.deltaSeconds ?? 0) * settings.recoveryRate);
    const lift = Math.max(requiredLift, (request.previousLift ?? 0) * recovery);
    const eyeY = eye.y + lift;
    let minimumBoomClearance = Infinity;
    for (let i = 0; i < boomCount; i++) {
        const t = workspace[i * 2], ground = workspace[i * 2 + 1];
        minimumBoomClearance = Math.min(minimumBoomClearance, focus.y + (eyeY - focus.y) * t - ground);
    }
    if (conservative) minimumBoomClearance = Math.min(minimumBoomClearance,
        focus.y + (eyeY - focus.y) * start - ceiling, eyeY - ceiling);
    if (![eyeY, lift, requiredLift, minimumBoomClearance].every(Number.isFinite))
        throw new RangeError('Camera clearance cannot resolve this pose within finite numeric bounds.');
    return { eyeY, lift, requiredLift, samples, conservative, invalidSamples,
        groundClearance: eyeY - eyeGround, minimumBoomClearance, nearTargetDistance: settings.nearTarget };
}
