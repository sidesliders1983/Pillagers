import { BufferAttribute, Matrix4, Ray, SkinnedMesh, Vector3 } from 'three';
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
/** Conservative real-wall lookup. A missing corner keeps an actual opening open. */
function actualCrownRadius(field: NonNullable<NativeHeadwearFitBinding['crownCavity']>, height: number, angle: number) {
    const rows = field.radii.length / field.angularSamples;
    let row = (height - field.minimumY) / field.stepY;
    if (Math.abs(row - Math.round(row)) < 1e-7) row = Math.round(row);
    if (row < 0 || row > rows - 1) return null;
    const column = ((angle / (2 * Math.PI) % 1) + 1) % 1 * field.angularSamples;
    const values: number[] = [];
    for (const y of new Set([Math.floor(row), Math.ceil(row)]))
        for (const x of new Set([Math.floor(column), Math.ceil(column)])) {
            const radius = field.radii[y * field.angularSamples + x % field.angularSamples];
            if (radius === null) return null;
            values.push(radius);
        }
    return Math.min(...values);
}

/** Exact source-wall rays resolve sub-grid openings at sloping helmet rims, once on equip. */
function actualCrownWall(mesh: SkinnedMesh, capWorld: Matrix4) {
    const inverseCap = capWorld.clone().invert();
    const positions = mesh.geometry.getAttribute('position'), index = mesh.geometry.getIndex();
    const points = Array.from({ length: positions.count }, (_, vertex) =>
        mesh.getVertexPosition(vertex, new Vector3()).applyMatrix4(mesh.matrixWorld).applyMatrix4(inverseCap));
    const triangles: { a: Vector3; b: Vector3; c: Vector3; minimumY: number; maximumY: number }[] = [];
    for (let offset = 0; offset < (index?.count ?? positions.count); offset += 3) {
        const [a, b, c] = [0, 1, 2].map(channel => points[index?.getX(offset + channel) ?? offset + channel]);
        triangles.push({ a, b, c, minimumY: Math.min(a.y, b.y, c.y), maximumY: Math.max(a.y, b.y, c.y) });
    }
    const minimumY = Math.min(...triangles.map(triangle => triangle.minimumY));
    const maximumY = Math.max(...triangles.map(triangle => triangle.maximumY));
    const bucketCount = 128, stepY = (maximumY - minimumY) / bucketCount;
    const buckets = Array.from({ length: bucketCount }, () => [] as typeof triangles);
    const rowAt = (height: number) => Math.max(0, Math.min(bucketCount - 1,
        Math.floor((height - minimumY) / stepY)));
    // Append in source order so indexing changes only the search cost, never the chosen wall.
    for (const triangle of triangles) for (let row = rowAt(triangle.minimumY);
        row <= rowAt(triangle.maximumY); row++) buckets[row].push(triangle);
    const ray = new Ray(), hit = new Vector3();
    const wallCache = new Map<number, Map<number, number | null>>();
    return (height: number, angle: number) => {
        if (height < minimumY || height > maximumY) return null;
        let row = wallCache.get(height);
        const known = row?.get(angle);
        if (known !== undefined) return known;
        if (!row) { row = new Map(); wallCache.set(height, row); }
        ray.origin.set(0, height, 0);
        ray.direction.set(Math.cos(angle), 0, Math.sin(angle));
        let radius = Infinity;
        for (const triangle of buckets[rowAt(height)]) {
            if (height < triangle.minimumY || height > triangle.maximumY) continue;
            if (ray.intersectTriangle(triangle.a, triangle.b, triangle.c, false, hit)) {
                const distance = Math.hypot(hit.x, hit.z);
                if (distance > 1e-6) radius = Math.min(radius, distance);
            }
        }
        const result = radius < .35 ? radius : null;
        row.set(angle, result);
        return result;
    };
}

type CrownWall = ReturnType<typeof actualCrownWall>;
type CrownField = NonNullable<NativeHeadwearFitBinding['crownCavity']>;
const crownRims = new WeakMap<CrownField, Float64Array>();

/** These are measured source-wall samples beside actual openings, not a synthetic face cap. */
function measuredCrownRim(field: CrownField) {
    let known = crownRims.get(field);
    if (known) return known;
    const rows = field.radii.length / field.angularSamples, points: number[] = [];
    const at = (row: number, column: number) => row < 0 || row >= rows ? null :
        field.radii[row * field.angularSamples + (column + field.angularSamples) % field.angularSamples];
    for (let row = 0; row < rows; row++) for (let column = 0; column < field.angularSamples; column++) {
        const radius = at(row, column);
        if (radius === null || [at(row - 1, column), at(row + 1, column),
            at(row, column - 1), at(row, column + 1)].every(value => value !== null)) continue;
        const angle = column / field.angularSamples * 2 * Math.PI;
        const x = radius * Math.cos(angle), z = radius * Math.sin(angle);
        points.push(x, field.minimumY + row * field.stepY, z, Math.hypot(x, z));
    }
    known = new Float64Array(points);
    crownRims.set(field, known);
    return known;
}

/** A small real-rim contact band can fold beneath the edge; distant exposed locks retain their shape. */
function fitCrownRim(point: Vector3, field: CrownField, clearance: number) {
    const reach = field.stepY * 3 + clearance, rim = measuredCrownRim(field);
    const radius = Math.hypot(point.x, point.z);
    let distanceSquared = reach * reach, nearest = -1;
    for (let index = 0; index < rim.length; index += 4) {
        const rimRadius = rim[index + 3];
        if (Math.abs(radius - rimRadius) > .04) continue;
        const tangent = ((point.x - rim[index]) * -rim[index + 2] +
            (point.z - rim[index + 2]) * rim[index]) / rimRadius;
        const distance = tangent * tangent + (point.y - rim[index + 1]) ** 2;
        if (distance < distanceSquared) { distanceSquared = distance; nearest = index; }
    }
    if (nearest < 0) return 0;
    const targetRadius = Math.max(.001, rim[nearest + 3] - clearance);
    if (radius <= targetRadius) return 0;
    const amount = Math.min(1, 2 * (1 - Math.sqrt(distanceSquared) / reach));
    const smooth = amount * amount * (3 - 2 * amount);
    const inset = Math.min(.03, radius - targetRadius) * smooth;
    point.x *= (radius - inset) / radius;
    point.z *= (radius - inset) / radius;
    return inset;
}

/** Add bounded support only where a fully Head-bound hair face spans the real cap rim.
 * Original vertices and UVs remain; cached source geometry and exposed locks are untouched. */
function refineCrownBoundary(mesh: SkinnedMesh, capWorld: Matrix4, binding: NativeHeadwearFitBinding, wall?: CrownWall) {
    const field = binding.crownCavity;
    if (!field) return { addedVertices: 0, addedTriangles: 0 };
    const geometry = mesh.geometry, beforeVertices = geometry.getAttribute('position').count;
    const beforeTriangles = (geometry.getIndex()?.count ?? beforeVertices) / 3;
    for (let pass = 0; pass < 3; pass++) {
        const positions = geometry.getAttribute('position');
        const indices = geometry.getAttribute('skinIndex'), weights = geometry.getAttribute('skinWeight');
        const inverseCap = capWorld.clone().invert();
        const eligible: boolean[] = [], covered: boolean[] = [], capPoints: Vector3[] = [];
        for (let vertex = 0; vertex < positions.count; vertex++) {
            let headWeight = 0;
            for (let channel = 0; channel < 4; channel++)
                if (indices.getComponent(vertex, channel) === binding.headJoint)
                    headWeight += weights.getComponent(vertex, channel);
            eligible.push(headWeight >= .999);
            const point = new Vector3().fromBufferAttribute(positions, vertex)
                .applyMatrix4(vertexWorld(mesh, vertex)).applyMatrix4(inverseCap);
            capPoints.push(point);
            covered.push(point.y >= field.minimumY && (wall ?? ((y, angle) => actualCrownRadius(field, y, angle)))(
                Math.min(point.y, field.ceilingY), Math.atan2(point.z, point.x)) !== null);
        }
        const index = geometry.getIndex();
        const source = index ? Array.from(index.array) : Array.from({ length: positions.count }, (_, i) => i);
        const fittedPoints = capPoints.map(point => {
            const fitted = point.clone();
            if (fitted.y < field.minimumY) return fitted;
            const height = Math.min(fitted.y, field.ceilingY);
            const radius = wall!(height, Math.atan2(fitted.z, fitted.x));
            if (radius === null) fitCrownRim(fitted, field, binding.clearance);
            else {
                const maximum = Math.max(.001, radius - binding.clearance);
                const current = Math.hypot(fitted.x, fitted.z);
                if (current > maximum) { fitted.x *= maximum / current; fitted.z *= maximum / current; }
                fitted.y = height;
            }
            return fitted;
        });
        const needsSupport = (vertices: number[]) => {
            if (!vertices.every(v => eligible[v]) || !vertices.some(v => covered[v])) return false;
            const [a, b, c] = vertices.map(v => fittedPoints[v]);
            if (Math.max(a.distanceTo(b), b.distanceTo(c), c.distanceTo(a)) < .003) return false;
            if (vertices.some(v => !covered[v])) return true;
            const samples = [a.clone().lerp(b, .5), b.clone().lerp(c, .5), c.clone().lerp(a, .5),
                a.clone().add(b).add(c).multiplyScalar(1 / 3)];
            return samples.some(point => {
                const radius = wall!(point.y, Math.atan2(point.z, point.x));
                return radius !== null && Math.hypot(point.x, point.z) > radius - binding.clearance * .5;
            });
        };
        const split = source.reduce((count, _, offset) => offset % 3 ? count :
            count + (needsSupport(source.slice(offset, offset + 3)) ? 1 : 0), 0);
        if (!split) break;
        const values = Object.fromEntries(Object.entries(geometry.attributes).map(([name, attribute]) =>
            [name, Array.from({ length: attribute.count * attribute.itemSize }, (_, i) =>
                attribute.getComponent(Math.floor(i / attribute.itemSize), i % attribute.itemSize))]));
        const edges = new Map<string, number>(), output: number[] = [];
        const groups: { start: number; count: number; materialIndex: number }[] = [];
        let vertexCount = positions.count;
        const midpoint = (a: number, b: number) => {
            const key = Math.min(a, b) + ':' + Math.max(a, b), existing = edges.get(key);
            if (existing !== undefined) return existing;
            const vertex = vertexCount++;
            for (const [name, attribute] of Object.entries(geometry.attributes)) {
                for (let channel = 0; channel < attribute.itemSize; channel++) {
                    values[name].push(name === 'skinIndex' ? channel === 0 ? binding.headJoint : 0 :
                        name === 'skinWeight' ? channel === 0 ? 1 : 0 :
                            (attribute.getComponent(a, channel) + attribute.getComponent(b, channel)) / 2);
                }
            }
            edges.set(key, vertex);
            return vertex;
        };
        for (let offset = 0; offset < source.length; offset += 3) {
            const [a, b, c] = source.slice(offset, offset + 3), start = output.length;
            if (needsSupport([a, b, c])) {
                const ab = midpoint(a, b), bc = midpoint(b, c), ca = midpoint(c, a);
                output.push(a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca);
            } else output.push(a, b, c);
            if (geometry.groups.length) {
                const materialIndex = geometry.groups.find(group => offset >= group.start &&
                    offset < group.start + group.count)?.materialIndex ?? 0;
                const previous = groups[groups.length - 1];
                if (previous?.materialIndex === materialIndex) previous.count += output.length - start;
                else groups.push({ start, count: output.length - start, materialIndex });
            }
        }
        geometry.dispose();
        for (const [name, attribute] of Object.entries(geometry.attributes)) {
            const data = name === 'skinIndex' ? new Uint16Array(values[name]) : new Float32Array(values[name]);
            geometry.setAttribute(name, new BufferAttribute(data, attribute.itemSize));
        }
        geometry.setIndex(output);
        geometry.clearGroups();
        for (const group of groups) geometry.addGroup(group.start, group.count, group.materialIndex);
    }
    return { addedVertices: geometry.getAttribute('position').count - beforeVertices,
        addedTriangles: geometry.getIndex()!.count / 3 - beforeTriangles };
}

/** Only owned crown vertices change; exposed locks, the braid and its strap retain their source shape. */
function tuckCrown(mesh: SkinnedMesh, capWorld: Matrix4, binding: NativeHeadwearFitBinding, actualWall?: CrownWall) {
    const refinement = refineCrownBoundary(mesh, capWorld, binding, actualWall);
    mesh.userData.headwearCrownRefinement = refinement;
    const positions = mesh.geometry.getAttribute('position');
    const joints = mesh.geometry.getAttribute('skinIndex'), weights = mesh.geometry.getAttribute('skinWeight');
    const inverseCap = capWorld.clone().invert();
    let tucked = 0, rimVertices = 0, maximumRimDisplacement = 0;
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
        if (binding.crownCavity) {
            const field = binding.crownCavity;
            if (point.y < field.minimumY) continue;
            const height = Math.min(point.y, field.ceilingY);
            const wall = actualWall!(height, Math.atan2(point.z, point.x));
            if (wall === null) {
                const displacement = fitCrownRim(point, field, binding.clearance);
                if (displacement === 0) continue;
                rimVertices++;
                maximumRimDisplacement = Math.max(maximumRimDisplacement, displacement);
            } else {
                const maximumRadius = Math.max(.001, wall - binding.clearance);
                const radius = Math.hypot(point.x, point.z);
                if (radius <= maximumRadius && height === point.y) continue;
                if (radius > maximumRadius) {
                    point.x *= maximumRadius / radius;
                    point.z *= maximumRadius / radius;
                }
                point.y = height;
            }
        } else {
            if (point.y < binding.profile[0][0]) continue;
            const ceiling = binding.profile[binding.profile.length - 1][0] - .008;
            const height = Math.min(point.y, ceiling);
            const radii = capRadii(binding.profile, height)!;
            const xRadius = Math.max(.001, radii[0] - binding.clearance);
            const zRadius = Math.max(.001, radii[1] - binding.clearance);
            const radius = Math.hypot(point.x / xRadius, point.z / zRadius);
            if (radius <= 1 && height === point.y) continue;
            point.y = height;
            if (radius > 1) {
                point.x /= radius;
                point.z /= radius;
            }
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
    mesh.userData.headwearRimFit = { vertices: rimVertices, maximumDisplacement: maximumRimDisplacement };
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
    const wall = binding.crownCavity ? actualCrownWall(mesh, fittedCap) : undefined;
    const tuckedVertices = hair.reduce((count, item) => count + tuckCrown(item, fittedCap, binding, wall), 0);
    mesh.userData.headwearFit = { ...adjustment, clearance: binding.clearance, tuckedVertices };
    return mesh.userData.headwearFit;
}
