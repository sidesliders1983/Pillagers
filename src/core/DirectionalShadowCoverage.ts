import { Box3, DirectionalLight, Frustum, Matrix4, PerspectiveCamera, Vector3 } from 'three';

export interface ShadowCoverageSettings {
    padding: number;
    minimumSpan: number;
    spanStep: number;
}

/** Crop one native shadow map to visible receivers, retaining the full scene's caster depth. */
export class DirectionalShadowCoverage {
    private readonly bounds = new Box3();
    private readonly casters = new Box3();
    private readonly viewProjection = new Matrix4();
    private readonly inverseViewProjection = new Matrix4();
    private readonly projection = new Matrix4();
    private readonly frustum = new Frustum();
    private readonly viewCorners = Array.from({ length: 8 }, () => new Vector3());
    private readonly boxCorners = Array.from({ length: 8 }, () => new Vector3());
    private readonly clipped = new Box3();
    private readonly depthBounds = new Box3();
    private readonly point = new Vector3();
    private readonly direction = new Vector3();
    private readonly center = new Vector3();
    private readonly cached = new Float64Array(42).fill(NaN);
    private readonly parameters = new Float64Array(10);
    private revision = 0;
    private passes = 0;
    private milliseconds = 0;
    private maximumMs = 0;

    constructor(bounds: Box3, private readonly settings: ShadowCoverageSettings, casters: Box3 = bounds) {
        this.include(bounds, false);
        this.include(casters, true);
    }

    include(bounds: { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } },
        castsShadow = true) {
        const before = this.bounds;
        const min = bounds.min, max = bounds.max;
        if (!Number.isFinite(min.x) || !Number.isFinite(min.y) || !Number.isFinite(min.z) ||
            !Number.isFinite(max.x) || !Number.isFinite(max.y) || !Number.isFinite(max.z) ||
            min.x > max.x || min.y > max.y || min.z > max.z) return;
        if (castsShadow) {
            if (min.x < this.casters.min.x || min.y < this.casters.min.y || min.z < this.casters.min.z ||
                max.x > this.casters.max.x || max.y > this.casters.max.y || max.z > this.casters.max.z) {
                this.casters.min.min(this.point.set(min.x, min.y, min.z));
                this.casters.max.max(this.point.set(max.x, max.y, max.z));
                this.revision++;
            }
        }
        if (min.x >= before.min.x && min.y >= before.min.y && min.z >= before.min.z &&
            max.x <= before.max.x && max.y <= before.max.y && max.z <= before.max.z) return;
        before.min.min(this.point.set(min.x, min.y, min.z));
        before.max.max(this.point.set(max.x, max.y, max.z));
        this.revision++;
    }

    invalidate() { this.cached.fill(NaN); }

    update(light: DirectionalLight, camera: PerspectiveCamera, fogFar = camera.far) {
        if (this.bounds.isEmpty()) return false;
        const start = performance.now();
        camera.updateMatrixWorld();
        this.direction.copy(light.position).sub(light.target.position).normalize();
        // Moving along the same parallel-light ray changes neither its direction nor material lighting.
        // Keep even distant off-screen casters in front of the native shadow camera.
        this.bounds.getCenter(this.center);
        const distance = this.bounds.min.distanceTo(this.bounds.max) / 2 +
            this.center.distanceTo(light.target.position) + this.settings.padding + 1;
        light.position.copy(light.target.position).addScaledVector(this.direction, distance);
        light.updateMatrixWorld();
        light.target.updateMatrixWorld();
        const far = Math.max(camera.near + .01, Math.min(camera.far, fogFar));
        const world = camera.matrixWorld.elements, projection = camera.projectionMatrix.elements;
        let changed = false;
        for (let index = 0; index < 32; index++) {
            const value = index < 16 ? world[index] : projection[index - 16];
            if (this.cached[index] !== value) changed = true;
            this.cached[index] = value;
        }
        const values = this.parameters;
        values[0] = this.direction.x;
        values[1] = this.direction.y;
        values[2] = this.direction.z;
        values[3] = far;
        values[4] = light.shadow.mapSize.x;
        values[5] = light.shadow.mapSize.y;
        values[6] = this.revision;
        values[7] = light.target.position.x;
        values[8] = light.target.position.y;
        values[9] = light.target.position.z;
        for (let index = 0; index < values.length; index++) {
            const previous = this.cached[32 + index];
            const different = index < 3
                ? !Number.isFinite(previous) || Math.abs(previous - values[index]) > 1e-10
                : previous !== values[index];
            if (different) {
                changed = true;
                this.cached[32 + index] = values[index];
            }
        }
        if (!changed) return false;

        // Three's linear fog is based on view depth. Beyond this plane receivers are fully fogged.
        const near = camera.near, top = near * Math.tan(camera.fov * Math.PI / 360) / camera.zoom;
        this.projection.makePerspective(-top * camera.aspect, top * camera.aspect,
            top, -top, near, far, camera.coordinateSystem);
        this.viewProjection.multiplyMatrices(this.projection, camera.matrixWorldInverse);
        this.inverseViewProjection.copy(this.viewProjection).invert();
        this.frustum.setFromProjectionMatrix(this.viewProjection, camera.coordinateSystem);
        light.shadow.updateMatrices(light);
        this.clipped.makeEmpty();
        for (let index = 0; index < 8; index++) {
            this.viewCorners[index].set(index & 1 ? 1 : -1, index & 2 ? 1 : -1,
                index & 4 ? 1 : -1).applyMatrix4(this.inverseViewProjection);
            this.boxCorners[index].set(index & 1 ? this.bounds.max.x : this.bounds.min.x,
                index & 2 ? this.bounds.max.y : this.bounds.min.y,
                index & 4 ? this.bounds.max.z : this.bounds.min.z);
        }
        // Every intersection vertex lies on a clipped box edge or a clipped frustum edge.
        for (let index = 0; index < 8; index++) for (const bit of [1, 2, 4]) {
            if (index & bit) continue;
            this.clipBoxEdge(this.boxCorners[index], this.boxCorners[index | bit], light);
            this.clipViewEdge(this.viewCorners[index], this.viewCorners[index | bit], light);
        }
        if (this.clipped.isEmpty()) return false;
        const pad = this.settings.padding;
        const roundedSpan = (length: number) => Math.max(this.settings.minimumSpan,
            Math.ceil((length + pad * 2) / this.settings.spanStep) * this.settings.spanStep);
        const width = roundedSpan(this.clipped.max.x - this.clipped.min.x);
        const height = roundedSpan(this.clipped.max.y - this.clipped.min.y);
        const texelX = width / light.shadow.mapSize.x, texelY = height / light.shadow.mapSize.y;
        const x = Math.round((this.clipped.min.x + this.clipped.max.x) / 2 / texelX) * texelX;
        const y = Math.round((this.clipped.min.y + this.clipped.max.y) / 2 / texelY) * texelY;
        // Only crop X/Y. The full scene bounds retain upstream tree/roof casters outside the view.
        this.depthBounds.copy(this.casters).applyMatrix4(light.shadow.camera.matrixWorldInverse);
        this.depthBounds.union(this.clipped);
        const shadowCamera = light.shadow.camera;
        Object.assign(shadowCamera, { left: x - width / 2, right: x + width / 2,
            bottom: y - height / 2, top: y + height / 2,
            near: Math.max(.01, -this.depthBounds.max.z - pad), far: -this.depthBounds.min.z + pad });
        shadowCamera.updateProjectionMatrix();
        light.shadow.needsUpdate = true;
        const elapsed = performance.now() - start;
        this.passes++;
        this.milliseconds += elapsed;
        this.maximumMs = Math.max(this.maximumMs, elapsed);
        return true;
    }

    private add(a: Vector3, b: Vector3, t: number, light: DirectionalLight) {
        this.point.copy(a).lerp(b, t).applyMatrix4(light.shadow.camera.matrixWorldInverse);
        this.clipped.expandByPoint(this.point);
    }

    private clipBoxEdge(a: Vector3, b: Vector3, light: DirectionalLight) {
        let low = 0, high = 1;
        for (const plane of this.frustum.planes) {
            const first = plane.distanceToPoint(a), last = plane.distanceToPoint(b);
            if (first < 0 && last < 0) return;
            if (first < 0) low = Math.max(low, first / (first - last));
            else if (last < 0) high = Math.min(high, first / (first - last));
            if (low > high) return;
        }
        this.add(a, b, low, light);
        this.add(a, b, high, light);
    }

    private clipViewEdge(a: Vector3, b: Vector3, light: DirectionalLight) {
        let low = 0, high = 1;
        for (const axis of ['x', 'y', 'z'] as const) {
            const step = b[axis] - a[axis];
            if (Math.abs(step) < 1e-12) {
                if (a[axis] < this.bounds.min[axis] || a[axis] > this.bounds.max[axis]) return;
                continue;
            }
            const first = (this.bounds.min[axis] - a[axis]) / step;
            const last = (this.bounds.max[axis] - a[axis]) / step;
            low = Math.max(low, Math.min(first, last));
            high = Math.min(high, Math.max(first, last));
            if (low > high) return;
        }
        this.add(a, b, low, light);
        this.add(a, b, high, light);
    }

    inspect() {
        return { passes: this.passes, milliseconds: this.milliseconds, maximumMs: this.maximumMs,
            receiverBounds: { min: this.bounds.min.toArray(), max: this.bounds.max.toArray() },
            casterBounds: { min: this.casters.min.toArray(), max: this.casters.max.toArray() },
            technique: 'One native PCF map; visible receiver crop, full caster depth, snapped texels' };
    }
}
