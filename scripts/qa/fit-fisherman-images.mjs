import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
const root = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(root + '/package.json');
const sharp = require('sharp');
const {NodeIO} = require('@gltf-transform/core');
const {OrthographicCamera, PerspectiveCamera, Vector3} = require('three');
const {checkFishermanUpperGrid} = await import('../characters/fisherman-upper-grid.mjs');
const {rasterize} = await import('../characters/outfit-grid-raster.mjs');
const base = root + '/output/meshy-outfit-pipeline/pass-009';
const reviewId = process.argv[2] ?? 'image-review-002';
assert.match(reviewId, /^image-review-\d{3}$/);
const tunicSource = process.argv[3] ?? 'imagegen/tunic/original.png';
assert.match(tunicSource, /^imagegen\/[a-z0-9-]+\/original\.png$/);
const destination = base + '/' + reviewId;
const existingManifest = await readFile(destination + '/review-manifest.json').catch(error => {
    if (error.code !== 'ENOENT') throw error;
    return null;
});
assert.equal(existingManifest, null, 'Choose a new review ID; existing image evidence is immutable.');
await mkdir(destination, {recursive: true});
const references = JSON.parse(await readFile(base + '/references-002/reference-manifest.json'));
const document = await new NodeIO().readBinary(await readFile(base + '/source/authoring-a20-002.glb'));
const primitive = document.getRoot().listMeshes()[0].listPrimitives()[0];
const positions = primitive.getAttribute('POSITION');
const points = Array.from({length: positions.getCount()}, (_, index) =>
    new Vector3().fromArray(positions.getElement(index, [])));
const indices = primitive.getIndices().getArray();
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const views = ['front', 'left', 'right', 'back', 'front-left'];
const triangles = [];
for (let row = 0; row < 4; row++) for (let column = 0; column < 4; column++) {
    const start = row * 5 + column;
    triangles.push([start, start + 1, start + 6], [start, start + 6, start + 5]);
}
function clipHeight(polygon, plane, above) {
    const result = [];
    for (let i = 0; i < polygon.length; i++) {
        const a = polygon[i], b = polygon[(i + 1) % polygon.length];
        const inside = above ? a.y >= plane : a.y <= plane;
        const nextInside = above ? b.y >= plane : b.y <= plane;
        if (inside) result.push(a);
        if (inside !== nextInside) result.push(a.clone().lerp(b, (plane - a.y) / (b.y - a.y)));
    }
    return result;
}
function cameraFor(view) {
    const record = references.views[view].camera;
    const span = record.scale ?? references.framing.orthographicVerticalSpan;
    const camera = view === 'front-left' ? new PerspectiveCamera(38, 1, .01, 100)
        : new OrthographicCamera(-span / 2, span / 2, span / 2, -span / 2, .01, 100);
    camera.position.fromArray(record.position);
    camera.lookAt(new Vector3(...record.target));
    camera.updateMatrixWorld(true);
    return camera;
}
const project = (point, camera) => {
    const p = point.clone().project(camera);
    return [(p.x + 1) * 512, (1 - p.y) * 512];
};
function maskFor(part, camera, coverage = false) {
    const mask = Buffer.alloc(1024 * 1024);
    for (let face = 0; face < indices.length; face += 3) {
        let polygon = Array.from(indices.subarray(face, face + 3), index => points[index]);
        const centerX = polygon.reduce((sum, point) => sum + point.x / 3, 0);
        let low, high;
        if (part === 'neck') {
            if (Math.abs(centerX) > .095) continue;
            low = 1.42; high = 1.48;
        } else if (part === 'tunic') {
            low = Math.abs(centerX) > .19 ? .89 : .80;
            high = coverage && Math.abs(centerX) < .095 ? 1.395 : 1.47;
        } else if (part === 'trousers') {
            if (Math.abs(centerX) > .225) continue;
            low = .165; high = .98;
        } else {
            if (centerX < .025) continue;
            low = -.02; high = coverage ? .19 : .20;
        }
        polygon = clipHeight(clipHeight(polygon, low, true), high, false);
        for (let corner = 1; corner < polygon.length - 1; corner++) {
            const [a, b, c] = [polygon[0], polygon[corner], polygon[corner + 1]].map(p => project(p, camera));
            const area = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
            if (Math.abs(area) < 1e-8) continue;
            for (let y = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1])));
                y <= Math.min(1023, Math.ceil(Math.max(a[1], b[1], c[1]))); y++) {
                for (let x = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0])));
                    x <= Math.min(1023, Math.ceil(Math.max(a[0], b[0], c[0]))); x++) {
                    const u = ((x + .5 - a[0]) * (c[1] - a[1]) - (y + .5 - a[1]) * (c[0] - a[0])) / area;
                    const v = ((b[0] - a[0]) * (y + .5 - a[1]) - (b[1] - a[1]) * (x + .5 - a[0])) / area;
                    if (u >= 0 && v >= 0 && u + v <= 1) mask[y * 1024 + x] = 255;
                }
            }
        }
    }
    return mask;
}
function extent(mask, width, height, y, minX = 0, maxX = width - 1, radius = 3) {
    let lo = Infinity, hi = -Infinity;
    for (let row = Math.max(0, Math.round(y) - radius); row <= Math.min(height - 1, Math.round(y) + radius); row++) {
        for (let x = Math.max(0, Math.floor(minX)); x <= Math.min(width - 1, Math.ceil(maxX)); x++) {
            if (mask[row * width + x] > 128) {lo = Math.min(lo, x); hi = Math.max(hi, x);}
        }
    }
    return Number.isFinite(lo) && hi > lo ? [lo, hi] : null;
}
const records = [];
for (const part of ['tunic', 'trousers', 'shoe']) {
    await mkdir(destination + '/' + part, {recursive: true});
    const originalRelativePath = part === 'tunic' ? tunicSource : 'imagegen/' + part + '/original.png';
    const originalPath = base + '/' + originalRelativePath;
    const originalBytes = await readFile(originalPath);
    const original = await sharp(originalBytes).ensureAlpha().raw().toBuffer({resolveWithObject: true});
    const {width, height} = original.info;
    const colored = offset => original.data[offset + 3] > 200
        && original.data[offset] + original.data[offset + 1] + original.data[offset + 2] > 120;
    const histogram = Array.from({length: width}, (_, x) => {
        let count = 0;
        for (let y = 120; y < height; y++) if (colored((y * width + x) * 4)) count++;
        return count;
    });
    const groups = [];
    for (let x = 0; x < width;) {
        if (histogram[x] < 8) {x++; continue;}
        const start = x;
        while (x < width && histogram[x] >= 8) x++;
        groups.push([start, x - 1]);
    }
    assert.equal(groups.length, 5, 'Five separate garment silhouettes are required: ' + part);
    for (const [panel, view] of views.entries()) {
        const minX = Math.max(0, groups[panel][0] - 5), maxX = Math.min(width - 1, groups[panel][1] + 5);
        let minY = height, maxY = 0;
        for (let y = 90; y < height; y++) for (let x = minX; x <= maxX; x++) {
            if (colored((y * width + x) * 4)) {minY = Math.min(minY, y); maxY = Math.max(maxY, y);}
        }
        minY = Math.max(0, minY - 3); maxY = Math.min(height - 1, maxY + 3);
        const crop = {left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1};
        const component = await sharp(originalBytes).extract(crop).png().toBuffer();
        await writeFile(destination + '/' + part + '/' + view + '-component.png', component);
        const raw = await sharp(component).ensureAlpha().raw().toBuffer({resolveWithObject: true});
        const sourceMask = Buffer.from(Array.from({length: raw.info.width * raw.info.height}, (_, pixel) =>
            raw.data[pixel * 4 + 3] > 200 ? 255 : 0));
        const camera = cameraFor(view);
        const bodyMask = maskFor(part, camera);
        const neckMask = part === 'tunic' ? maskFor('neck', camera) : null;
        const coverage = maskFor(part, camera, true);
        const span = references.framing.orthographicVerticalSpan;
        const targetY = y => 512 + (references.views[view].camera.target[1] - y) * 1024 / span;
        const [top, bottom] = part === 'tunic' ? [1.47, .80] : part === 'trousers' ? [.98, .165] : [.19, -.006];
        const source = [], target = [];
        for (let row = 0; row < 5; row++) {
            const fraction = row / 4;
            const sy = 3 + fraction * (raw.info.height - 7);
            const ty = targetY(top + (bottom - top) * fraction);
            const sourceBounds = extent(sourceMask, raw.info.width, raw.info.height, sy, 0, raw.info.width - 1, row === 0 || row === 4 ? 8 : 3);
            assert.ok(sourceBounds, part + '/' + view + ': source contour missing');
            const sourceColumns = Array.from({length: 5}, (_, col) => (raw.info.width - 1) * col / 4);
            // The neckline must follow the neck contour. A whole-body band at this height
            // includes shoulders/chest and incorrectly expands the opening.
            const targetMask = part === 'tunic' && row === 0 ? neckMask : bodyMask;
            let targetBounds = extent(targetMask, 1024, 1024, ty, 0, 1023,
                part === 'tunic' && row === 0 ? 3 : row === 0 || row === 4 ? 9 : 12);
            assert.ok(targetBounds, part + '/' + view + ': body contour missing at ' + ty);
            const paired = part === 'trousers' && ['front', 'back'].includes(view) && row >= 2;
            const pad = (part === 'tunic' ? .0075 : part === 'trousers' ? .009 : .005) * 1024 / span;
            targetBounds = [targetBounds[0] - pad, targetBounds[1] + pad];
            let mapped;
            if (paired) {
                const middle = raw.info.width / 2;
                const left = extent(sourceMask, raw.info.width, raw.info.height, sy, 0, middle - 2, 8);
                const right = extent(sourceMask, raw.info.width, raw.info.height, sy, middle + 2, raw.info.width - 1, 8);
                const bodyLeft = extent(bodyMask, 1024, 1024, ty, 0, 510, 7);
                const bodyRight = extent(bodyMask, 1024, 1024, ty, 514, 1023, 7);
                assert.ok(left && right && bodyLeft && bodyRight);
                sourceColumns.splice(0, 5, left[0], left[1], middle, right[0], right[1]);
                mapped = [bodyLeft[0] - pad, bodyLeft[1] + pad, 512, bodyRight[0] - pad, bodyRight[1] + pad];
            } else {
                mapped = sourceColumns.map(x => targetBounds[0] + (x - sourceBounds[0])
                    * (targetBounds[1] - targetBounds[0]) / (sourceBounds[1] - sourceBounds[0]));
            }
            if (part === 'tunic' && ['front', 'back'].includes(view) && (row === 2 || row === 3)) {
                const inward = [-2, 6, 0, -6, 2];
                mapped = mapped.map((x, column) => x + inward[column]);
            }
            if (paired) { mapped[0] -= 3; mapped[4] += 3; }
            for (let col = 0; col < 5; col++) {
                source.push([sourceColumns[col], sy]); target.push([mapped[col], ty]);
            }
        }
        // A partial silhouette at the top of a garment is not a scale anchor: the
        // visible peak can be the back shoulder in side views. Continue the
        // upper-torso registration to the first row instead of extrapolating
        // a tiny peak across the whole panel. The neck cut remains in source pixels.
        if (part === 'tunic') {
            for (let column = 0; column < 5; column++) target[column][0] = target[5 + column][0];
        }
        const grid = {source, target, triangles};
        const upperGrid = part === 'tunic' && view !== 'front-left' ? checkFishermanUpperGrid(grid) : null;
        const fitted = await rasterize(raw, grid, 1024);
        await writeFile(destination + '/' + part + '/' + view + '-fitted.png', fitted);
        const pixels = await sharp(fitted).ensureAlpha().raw().toBuffer();
        let covered = 0, missed = 0;
        for (let pixel = 0; pixel < coverage.length; pixel++) if (coverage[pixel]) {
            covered++; if (pixels[pixel * 4 + 3] < 128) missed++;
        }
        const body = await readFile(base + '/references-002/' + view + '.png');
        const translucent = await sharp(fitted).ensureAlpha().linear([1, 1, 1, .65], [0, 0, 0, 0]).png().toBuffer();
        await sharp(body).composite([{input: translucent}]).png()
            .toFile(destination + '/' + part + '/' + view + '-overlay.png');
        await sharp(body).composite([{input: fitted}]).png()
            .toFile(destination + '/' + part + '/' + view + '-composite.png');
        const record = {part, view, originalPath: originalRelativePath, qualityView: view !== 'front-left', originalSha256: hash(originalBytes),
            crop, componentSha256: hash(component), fittedSha256: hash(fitted),
            bodySha256: references.views[view].sha256, grid,
            upperGrid,
            coverage: {pixels: covered, missed, missedFraction: missed / covered},
            status: view === 'front-left' ? 'reference-only' : missed / covered < .015 ? 'image-coverage-pass' : 'needs-review'};
        await writeFile(destination + '/' + part + '/' + view + '-grid.json', JSON.stringify(record, null, 2));
        records.push(record);
        console.log(JSON.stringify({part, view, ...record.coverage, status: record.status}));
    }
}
await writeFile(destination + '/review-manifest.json', JSON.stringify({
    version: 1, status: 'pending-image-QA-and-human-review',
    nativeSource: JSON.parse(await readFile(base + '/source/authoring-a20-002.json')),
    perspective: 'reference-only; no quality score', records,
    qualification: 'Projected image coverage only; does not certify 3D fit, opening contacts, rigging or animation.',
    meshy: {submitted: false, gate: 'Explicit approval of the exact image set is required before conversion.'},
}, null, 2));
