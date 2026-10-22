import { BufferGeometry, Float32BufferAttribute } from 'three';

/** Keep UV-island filtering from making an unrelated neighboring wall emissive. */
export function homeLightGeometry(source: BufferGeometry, triangles: readonly number[]) {
    if (source.hasAttribute('uv1')) throw new Error('Home light binding requires a reviewed unused UV channel.');
    const count = source.index?.count ?? source.getAttribute('position').count;
    if (!source.hasAttribute('uv') || triangles.some(triangle =>
        !Number.isInteger(triangle) || triangle < 0 || triangle * 3 + 2 >= count))
        throw new Error('Home light geometry does not match its surface binding.');
    const geometry = source.index ? source.toNonIndexed() : source.clone();
    const uv = geometry.getAttribute('uv');
    const emissionUv = new Float32Array(uv.count * 2); // Black atlas corner on every other triangle.
    for (const triangle of triangles) {
        for (let corner = 0; corner < 3; corner++) {
            const vertex = triangle * 3 + corner;
            emissionUv[vertex * 2] = uv.getX(vertex);
            emissionUv[vertex * 2 + 1] = uv.getY(vertex);
        }
    }
    geometry.setAttribute('uv1', new Float32BufferAttribute(emissionUv, 2));
    return geometry;
}
