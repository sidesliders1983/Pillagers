import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {mkdir, readFile, writeFile, copyFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const root = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(root + '/package.json');
const sharp = require('sharp');
const pass = root + '/output/meshy-outfit-pipeline/pass-009';
const reviewId = process.argv[2];
assert.match(reviewId ?? '', /^image-review-\d{3}$/);
assert.notEqual(reviewId, 'image-review-002', 'Approved review evidence is immutable.');
const directory = pass + '/' + reviewId;
await mkdir(directory + '/references', {recursive: true});
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const manifest = JSON.parse(await readFile(directory + '/review-manifest.json'));
const source = JSON.parse(await readFile(pass + '/source/authoring-a20-002.json'));
if (!manifest.records.filter(record => record.qualityView).every(record => record.status === 'image-coverage-pass')) {
    throw new Error('Cardinal image coverage still needs review; do not label this candidate ready.');
}
const contacts = [
    ['neck', 'Neck', 512, 259], ['right-wrist', 'Right wrist', 350, 495],
    ['left-wrist', 'Left wrist', 674, 495], ['right-ankle', 'Right ankle', 411, 815],
    ['left-ankle', 'Left ankle', 613, 815],
];
for (const view of ['front', 'left', 'right', 'back']) {
    await copyFile(pass + '/references-002/' + view + '.png', directory + '/references/' + view + '.png');
    const tunic = await readFile(directory + '/tunic/' + view + '-fitted.png');
    const trousers = await readFile(directory + '/trousers/' + view + '-fitted.png');
    const shoe = await readFile(directory + '/shoe/' + view + '-fitted.png');
    const layers = [{input: trousers}, {input: shoe}];
    if (view === 'front' || view === 'back') layers.push({input: await sharp(shoe).flop().png().toBuffer()});
    layers.push({input: tunic});
    const garment = await sharp({create: {width: 1024, height: 1024, channels: 4, background: '#00000000'}})
        .composite(layers).png().toBuffer();
    await writeFile(directory + '/' + view + '-garments.png', garment);
    const combined = await sharp(directory + '/references/' + view + '.png')
        .composite([{input: garment}]).png().toBuffer();
    await writeFile(directory + '/' + view + '-set.png', combined);
    if (view === 'front' || view === 'back') for (const [id, , x, y] of contacts) {
        await sharp(combined).extract({left: x - 70, top: y - 70, width: 140, height: 140})
            .resize(280, 280).png().toFile(directory + '/' + view + '-' + id + '.png');
    }
}
const audit = {
    kind: 'fisherman-outfit-image-review/1', status: 'awaiting-tunic-image-approval',
    imageCoverage: '12 cardinal component checks pass the 1.5% projected-area screening threshold.',
    qualification: 'Coverage is a screen-space proxy, not a certificate of 3D fit or five opening contacts.',
    changedComponents: ['tunic'], retainedComponents: ['trousers', 'shoe'],
    rejected3DSource: '../neck-shoulders-001/before/',
    openingReview: contacts.map(([id, label]) => ({id, label, status: 'pending-human-image-review'})),
    source: {sha256: source.source.sha256, nativeBoneCount: source.nativeBoneCount,
        rigSignature: source.nativeRigSignature, sourceGeometryChanged: false,
        authoringPose: source.pose, roundTripMetres: source.maximumRoundTripMetres},
    generation: 'Built-in ImageGen; three separate components; one canonical left shoe.',
    shoePair: 'Front/back 2D pair is a reference reflection only; reflect geometry and remap native bones after Meshy.',
    perspective: 'Reference only. Never included in coverage thresholds or conversion quality scoring.',
    meshy: {submitted: false, approval: null, gate: 'Explicit approval of the displayed final inputs is required.'},
    futureChecks: ['3D opening contacts and body coverage', 'Shared native rig and bounded deformation',
        'Walking and one Idle clip', 'Existing Human clothing options in Character Lab'],
    records: manifest.records.filter(record => record.qualityView).map(record => ({
        part: record.part, view: record.view, originalSha256: record.originalSha256,
        componentSha256: record.componentSha256, fittedSha256: record.fittedSha256,
        coverage: record.coverage, status: record.status,
    })),
};
await writeFile(directory + '/qa-summary.json', JSON.stringify(audit, null, 2));
const metrics = audit.records.map(record => '<tr><td>' + record.part + '</td><td>' + record.view
    + '</td><td>' + (100 * (1 - record.coverage.missedFraction)).toFixed(2) + '%</td></tr>').join('');
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Fisherman outfit · Image review</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#f5f3eb;color:#273c35;font:16px/1.5 system-ui,sans-serif}
main{max-width:1200px;margin:auto;padding:24px}h1{font-size:30px;margin:0 0 8px}h2{font-size:20px}
p{max-width:850px}.status{background:#fff0cd;border:1px solid #d6ae53;padding:14px;border-radius:10px}
.controls{display:flex;gap:18px;flex-wrap:wrap;align-items:center;margin:20px 0}select,input{font:inherit}
select{padding:8px;border:1px solid #9da99c;border-radius:6px}canvas{display:block;width:min(100%,760px);height:auto;margin:auto;border-radius:14px;background:#dbe1d7}
.contacts{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px}figure{margin:0}figure img{width:100%;border-radius:10px}figcaption{font-size:14px}
.source{width:100%;background:#e5e8df;margin:10px 0;border-radius:8px}table{border-collapse:collapse}td,th{padding:6px 16px;border-bottom:1px solid #ccd1c7;text-align:left}a{color:#315e4c}
</style></head><body><main><h1>Fisherman tunic · revised neck and shoulders</h1><p>Charcoal tunic · light linen trousers · single leather shoe, mirrored for the pair.</p>
<p class="status"><strong>Image review only — Meshy has not been submitted.</strong><br>Only the tunic is revised. The previous 3D tunic is rejected for its hollow neckline and padded shoulders; trousers and shoes are retained. This page shows new 2D images, not a repaired 3D model. This is a 2D overlay on the existing Meshy Human. The four cardinal views are fit evidence; the oblique view is design reference only.</p>
<div class="controls"><label>View <select id="view"><option>front</option><option>left</option><option>right</option><option>back</option></select></label>
<label>Layer <select id="layer"><option value="all">Complete set</option><option value="tunic">Tunic</option><option value="trousers">Trousers</option><option value="shoe">One shoe</option></select></label>
<label>Clothing opacity <input id="opacity" type="range" min="0" max="1" step="0.05" value="1"></label>
<label><input id="body" type="checkbox" checked> Show reference body</label></div>
<canvas id="preview" width="1024" height="1024" aria-label="Fisherman clothing overlay"></canvas>
<h2>Neck and shoulder comparison</h2><p>The old garment failed in 3D. These new images must still prove their real collar contact and natural shoulders after conversion, in neutral pose, Walking and Idle 02, including a top view. The native 44-bone rig remains the same.</p><div class="contacts"><figure><img src="old-neck.png" alt="Previous oversized neckline overlay"><figcaption>Previous 2D neckline</figcaption></figure><figure><img src="front-neck.png" alt="Proposed close neckline"><figcaption>Proposed 2D neckline</figcaption></figure><figure><img src="rejected-3d-top.png" alt="Rejected hollow neckline from above"><figcaption>Rejected 3D result</figcaption></figure></div><h2>Five opening checkpoints</h2><p>Inspect the neck, both wrists and both ankles. These images support review; actual contact distances and animation still need the 3D model.</p>
<div class="contacts">${contacts.map(([id, label]) => '<figure><img id="contact-' + id + '" src="front-' + id + '.png" alt="' + label + ' close-up"><figcaption>' + label + '</figcaption></figure>').join('')}</div>
<details><summary>Original generated designs and the oblique reference</summary>
<p>The tunic neckline and shoulder cut were revised after the 3D result failed. The 5×5 grid now prevents partial top-contour expansion. Only these final garment pixels are proposed for conversion.</p>
${['tunic', 'trousers', 'shoe'].map(part => '<h2>' + part + '</h2><img class="source" src="../' + manifest.records.find(record => record.part === part).originalPath + '" alt="Original generated ' + part + ' five-view sheet">').join('')}</details>
<details><summary>Projected coverage screening</summary><p>The screen checks whether intended covered body pixels lie beneath clothing. It does not establish 3D clearance, correct bone weights or animation quality.</p>
<table><thead><tr><th>Component</th><th>View</th><th>Body pixels covered</th></tr></thead><tbody>${metrics}</tbody></table>
<p><a href="qa-summary.json">QA summary</a> · <a href="review-manifest.json">Exact inputs and 5×5 deformation records</a> · <a href="../imagegen/tunic-neck-003/prompt.txt">Final tunic prompt</a></p></details>
<h2>Next gate</h2><p>Approve the exact image set before Meshy conversion. After conversion: inspect the real 3D model, five openings, body masks, Walking and an Idle clip on the existing Human in Character Lab.</p>
</main><script type="module">
const canvas = document.querySelector('#preview');
const context = canvas.getContext('2d');
let revision = 0;

async function load(path) {
    const image = new Image();
    image.src = path;
    await image.decode();
    return image;
}

async function draw() {
    const current = ++revision;
    const view = document.querySelector('#view').value;
    const part = document.querySelector('#layer').value;
    const [body, clothes] = await Promise.all([
        load('references/' + view + '.png'),
        load(part === 'all' ? view + '-garments.png' : part + '/' + view + '-fitted.png'),
    ]);
    if (current !== revision) return;
    context.clearRect(0, 0, 1024, 1024);
    context.fillStyle = '#dbe1d7';
    context.fillRect(0, 0, 1024, 1024);
    if (document.querySelector('#body').checked) context.drawImage(body, 0, 0);
    context.globalAlpha = Number(document.querySelector('#opacity').value);
    context.drawImage(clothes, 0, 0);
    context.globalAlpha = 1;
    const contactView = view === 'back' ? 'back' : 'front';
    for (const image of document.querySelectorAll('.contacts img[id^="contact-"]')) {
        image.src = contactView + '-' + image.id.replace('contact-', '') + '.png';
    }
    canvas.dataset.ready = 'true';
}

for (const input of document.querySelectorAll('.controls input, .controls select')) {
    input.addEventListener('input', () => draw().catch(error => {
        document.body.dataset.error = error.message;
    }));
}
await draw();
</script></body></html>`;
await writeFile(directory + '/index.html', html);
console.log(JSON.stringify({directory, coverageChecks: audit.records.length, status: audit.status,
    sourceSha256: audit.source.sha256, meshJobs: 0}));
