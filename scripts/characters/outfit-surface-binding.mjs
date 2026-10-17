import {Box3, Ray, Triangle, Vector3} from 'three';

function check(condition, message) {
  if (!condition) throw new Error(message);
}

function anchorPoint(surface, anchor) {
  check(Number.isInteger(anchor.triangle) && anchor.triangle >= 0
    && anchor.triangle < surface.triangles && anchor.barycentric.length === 3
    && Math.abs(anchor.barycentric.reduce((a, b) => a + b, 0) - 1) < 1e-5
    && anchor.barycentric.every(value => Number.isFinite(value) && value >= -.00001)
    && anchor.offset.every(Number.isFinite), 'Invalid body triangle correspondence');
  const point = new Vector3();
  for (let corner = 0; corner < 3; corner++) point.addScaledVector(new Vector3().fromArray(
    surface.positions, surface.indices[anchor.triangle * 3 + corner] * 3), anchor.barycentric[corner]);
  return point;
}

/** Native triangle correspondence with a BVH, matching anchorPoint's exact barycentric contract. */
export function createSurfaceQuery(surface) {
  check(surface.positions.length % 3 === 0 && surface.indices.length % 3 === 0 &&
    surface.indices.length > 0 && surface.positions.every(Number.isFinite), 'Invalid native body surface.');
  const faces = [];
  for (let index = 0; index < surface.indices.length; index += 3) {
    const points = surface.indices.slice(index, index + 3).map(vertex => {
      check(Number.isInteger(vertex) && vertex >= 0 && vertex * 3 < surface.positions.length,
        'Invalid native body triangle index.');
      return new Vector3().fromArray(surface.positions, vertex * 3);
    });
    const triangle = new Triangle(...points);
    if (triangle.getArea() > 1e-16) {
      faces.push({index: index / 3, triangle, box: new Box3().setFromPoints(points)});
    }
  }
  check(faces.length > 0, 'Native body surface has no nondegenerate triangles.');
  function build(entries) {
    const box = new Box3();
    for (const face of entries) box.union(face.box);
    if (entries.length <= 12) return {box, faces: entries};
    const size = box.getSize(new Vector3());
    const axis = size.x >= size.y && size.x >= size.z ? 'x' : size.y >= size.z ? 'y' : 'z';
    entries.sort((a, b) => (a.box.min[axis] + a.box.max[axis]) - (b.box.min[axis] + b.box.max[axis]));
    const half = Math.floor(entries.length / 2);
    return {box, left: build(entries.slice(0, half)), right: build(entries.slice(half))};
  }
  const tree = build(faces);
  function closest(point) {
    let distanceSquared = Infinity;
    let selected;
    const hit = new Vector3();
    const candidate = new Vector3();
    function visit(node) {
      if (node.box.distanceToPoint(point) ** 2 > distanceSquared) return;
      if (node.faces) {
        for (const face of node.faces) {
          face.triangle.closestPointToPoint(point, candidate);
          const distance = candidate.distanceToSquared(point);
          if (distance < distanceSquared) {
            distanceSquared = distance;
            selected = face;
            hit.copy(candidate);
          }
        }
      } else {
        const first = node.left.box.distanceToPoint(point) <= node.right.box.distanceToPoint(point) ? node.left : node.right;
        visit(first);
        visit(first === node.left ? node.right : node.left);
      }
    }
    visit(tree);
    const barycentric = selected.triangle.getBarycoord(hit, new Vector3());
    barycentric.set(Math.max(0, barycentric.x), Math.max(0, barycentric.y), Math.max(0, barycentric.z));
    barycentric.divideScalar(barycentric.x + barycentric.y + barycentric.z);
    const anchor = {triangle: selected.index, barycentric: barycentric.toArray(), offset: point.clone().sub(hit).toArray()};
    check(anchorPoint(surface, anchor).distanceTo(hit) < 1e-6, 'Native triangle anchor reconstruction differs.');
    return {anchor, point: hit, distance: Math.sqrt(distanceSquared), normal: selected.triangle.getNormal(new Vector3())};
  }
  function inside(point) {
    const ray = new Ray(point, new Vector3(0.371, 0.529, 0.763).normalize());
    const hit = new Vector3();
    const distances = [];
    function visit(node) {
      if (!ray.intersectsBox(node.box)) return;
      if (node.faces) {
        for (const {triangle} of node.faces) {
          if (ray.intersectTriangle(triangle.a, triangle.b, triangle.c, false, hit)) {
            const distance = hit.distanceTo(point);
            if (distance > 1e-7) distances.push(distance);
          }
        }
      } else { visit(node.left); visit(node.right); }
    }
    visit(tree);
    distances.sort((a, b) => a - b);
    return distances.filter((distance, index) => index === 0 || distance - distances[index - 1] > 1e-7).length % 2 === 1;
  }
  return {closest, inside};
}

/** Mix the original native influences at a body triangle, then retain the strongest four. */
export function barycentricNativeWeights(surface, joints, weights, anchor) {
  anchorPoint(surface, anchor);
  check(joints.length === weights.length && joints.length === surface.positions.length / 3 * 4,
    'Native body skin attributes must have four influences per vertex.');
  const mixture = new Map();
  for (let corner = 0; corner < 3; corner += 1) {
    const vertex = surface.indices[anchor.triangle * 3 + corner];
    for (let influence = 0; influence < 4; influence += 1) {
      const index = vertex * 4 + influence;
      check(Number.isInteger(joints[index]) && joints[index] >= 0 &&
        Number.isFinite(weights[index]) && weights[index] >= 0, 'Invalid native body skin influence.');
      const value = weights[index] * anchor.barycentric[corner];
      mixture.set(joints[index], (mixture.get(joints[index]) ?? 0) + value);
    }
  }
  const full = [...mixture].filter(([, weight]) => weight > 0).sort((a, b) => b[1] - a[1] || a[0] - b[0]);
  const total = full.reduce((sum, [, weight]) => sum + weight, 0);
  check(total > 0, 'Native body contact has no skin weights.');
  const retained = full.slice(0, 4);
  const retainedTotal = retained.reduce((sum, [, weight]) => sum + weight, 0);
  return {
    joints: [...retained.map(([joint]) => joint), ...Array(4 - retained.length).fill(0)],
    weights: [...retained.map(([, weight]) => weight / retainedTotal), ...Array(4 - retained.length).fill(0)],
    discardedMass: Math.max(0, 1 - retainedTotal / total),
    full: full.map(([joint, weight]) => [joint, weight / total]),
  };
}
