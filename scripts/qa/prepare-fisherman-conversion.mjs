import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import sharp from 'sharp';

const directory = 'output/meshy-outfit-pipeline/pass-009';
const review = directory + '/image-review-002';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const read = relative => readFile(directory + '/' + relative);
const json = async relative => JSON.parse(await read(relative));
const once = async (relative, value) => {
    const bytes = Buffer.from(JSON.stringify(value, null, 2) + '\n');
    try { await writeFile(directory + '/' + relative, bytes, {flag: 'wx', flush: true}); }
    catch (error) {
        if (error.code !== 'EEXIST') throw error;
        assert.ok((await read(relative)).equals(bytes), 'Immutable record already differs: ' + relative);
    }
};
const manifestBytes = await read('image-review-002/review-manifest.json');
const manifest = JSON.parse(manifestBytes);
const verification = await json('image-review-002/verification.json');
assert.equal(verification.status, 'passed');
const reference = await json('references-002/reference-manifest.json');
const records = manifest.records;
assert.equal(records.length, 15);
const views = ['front', 'back', 'left', 'right'];
const inputs = [];
for (const part of ['tunic', 'trousers', 'shoe']) {
    const images = [];
    for (const view of views) {
        const record = records.find(record => record.part === part && record.view === view);
        assert.equal(record.status, 'image-coverage-pass');
        const source = await read('image-review-002/' + part + '/' + view + '-fitted.png');
        assert.equal(hash(source), record.fittedSha256);
        const {data, info} = await sharp(source).ensureAlpha().raw().toBuffer({resolveWithObject: true});
        const minimum = [1024, 1024], maximum = [0, 0];
        for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
            if (data[(y * info.width + x) * 4 + 3] < 16) continue;
            minimum[0] = Math.min(minimum[0], x);
            minimum[1] = Math.min(minimum[1], y);
            maximum[0] = Math.max(maximum[0], x + 1);
            maximum[1] = Math.max(maximum[1], y + 1);
        }
        images.push({view, source, record, minimum, maximum});
    }
    const top = Math.min(...images.map(image => image.minimum[1]));
    const bottom = Math.max(...images.map(image => image.maximum[1]));
    const span = Math.ceil(Math.max(bottom - top,
        ...images.map(image => image.maximum[0] - image.minimum[0])) * 1.12);
    const cropTop = Math.round((top + bottom - span) / 2);
    await mkdir(directory + '/conversion-inputs/' + part, {recursive: true});
    for (const image of images) {
        const {view, source, record, minimum, maximum} = image;
        const centerX = part === 'shoe' ? (minimum[0] + maximum[0]) / 2 : 512;
        const cropLeft = Math.round(centerX - span / 2);
        assert.ok(cropLeft >= 0 && cropTop >= 0 && cropLeft + span <= 1024 && cropTop + span <= 1024);
        const crop = {left: cropLeft, top: cropTop, width: span, height: span};
        const bytes = await sharp(source).extract(crop).resize(1024, 1024).png().toBuffer();
        const filename = 'conversion-inputs/' + part + '/' + view + '.png';
        try { await writeFile(directory + '/' + filename, bytes, {flag: 'wx'}); }
        catch (error) {
            if (error.code !== 'EEXIST') throw error;
            assert.ok((await read(filename)).equals(bytes));
        }
        const camera = reference.views[view].camera;
        const metresPerPixel = camera.scale / 1024;
        inputs.push({part, view, path: filename, sha256: hash(bytes), bytes: bytes.length,
            sourcePath: 'image-review-002/' + part + '/' + view + '-fitted.png',
            sourceSha256: record.fittedSha256, crop, operation: 'Crop transparent margins and resample only',
            frame: {frameMetres: span * metresPerPixel,
                centerY: camera.target[1] + (512 - cropTop - span / 2) * metresPerPixel,
                projectedCenter: (cropLeft + span / 2 - 512) * metresPerPixel,
                cameraTarget: camera.target}, garmentOnly: true});
    }
}
await once('conversion-inputs.json', {kind: 'fisherman-approved-inputs/1',
    reviewManifestSha256: hash(manifestBytes), parts: ['tunic', 'trousers', 'shoe'],
    views, records: inputs, recipeSha256: hash(await read('source/authoring-a20-002.json'))});
let approval;
try { approval = await json('image-approval.json'); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
if (!approval) {
    await once('image-approval.json', {kind: 'fisherman-image-approval/1', decision: 'approved',
        userMessage: 'Dit lijkt goed te passen, ga verder', recordedAt: new Date().toISOString(),
        reviewManifestSha256: hash(manifestBytes),
        inputManifestSha256: hash(await read('conversion-inputs.json')),
        scope: 'Three separate Meshy conversions, one mirrored shoe pair, native Human fitting and Character Lab animation QA',
        qualification: 'Image approval does not certify the eventual 3D result.'});
}
console.log(JSON.stringify({prepared: inputs.length, approvalRecorded: true,
    frames: inputs.filter(record => record.view === 'front').map(({part, frame}) => ({part, frame}))}));
