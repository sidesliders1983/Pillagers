import assert from 'node:assert/strict';
import sharp from 'sharp';

function sample(source, x, y, pixels, offset) {
    const left = Math.floor(x), top = Math.floor(y);
    const fx = x - left, fy = y - top;
    let alpha = 0, red = 0, green = 0, blue = 0;
    for (const [px, py, weight] of [
        [left, top, (1 - fx) * (1 - fy)], [left + 1, top, fx * (1 - fy)],
        [left, top + 1, (1 - fx) * fy], [left + 1, top + 1, fx * fy],
    ]) {
        if (px < 0 || py < 0 || px >= source.info.width || py >= source.info.height) continue;
        const at = (py * source.info.width + px) * 4;
        const contribution = source.data[at + 3] > 128 ? source.data[at + 3] * weight : 0;
        alpha += contribution;
        red += contribution * source.data[at];
        green += contribution * source.data[at + 1];
        blue += contribution * source.data[at + 2];
    }
    pixels[offset] = alpha ? red / alpha : 0;
    pixels[offset + 1] = alpha ? green / alpha : 0;
    pixels[offset + 2] = alpha ? blue / alpha : 0;
    pixels[offset + 3] = alpha;
}

export function rasterize(source, grid, resolution = 4096) {
    const pixels = Buffer.alloc(resolution * resolution * 4);
    const scale = resolution / 1024;
    for (const triangle of grid.triangles) {
        const [a, b, c] = triangle.map(index => grid.target[index]);
        const [p, q, r] = triangle.map(index => grid.source[index]);
        const bx = b[0] - a[0], by = b[1] - a[1];
        const cx = c[0] - a[0], cy = c[1] - a[1];
        const determinant = bx * cy - cx * by;
        assert.ok(determinant > 0, 'Folded destination triangle');
        const sourceArea = (q[0] - p[0]) * (r[1] - p[1]) - (r[0] - p[0]) * (q[1] - p[1]);
        assert.ok(sourceArea > 0, 'Folded source triangle');
        const lowX = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0]) * scale));
        const highX = Math.min(resolution - 1, Math.ceil(Math.max(a[0], b[0], c[0]) * scale));
        const lowY = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1]) * scale));
        const highY = Math.min(resolution - 1, Math.ceil(Math.max(a[1], b[1], c[1]) * scale));
        for (let y = lowY; y <= highY; y++) for (let x = lowX; x <= highX; x++) {
            const px = (x + .5) / scale - a[0], py = (y + .5) / scale - a[1];
            const u = (px * cy - cx * py) / determinant;
            const v = (bx * py - px * by) / determinant;
            if (u < -1e-8 || v < -1e-8 || u + v > 1 + 1e-8) continue;
            sample(source, p[0] + u * (q[0] - p[0]) + v * (r[0] - p[0]),
                p[1] + u * (q[1] - p[1]) + v * (r[1] - p[1]),
                pixels, (y * resolution + x) * 4);
        }
    }
    return sharp(pixels, {raw: {width: resolution, height: resolution, channels: 4}})
        .png().toBuffer();
}
