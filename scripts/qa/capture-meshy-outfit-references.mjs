import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdir, readFile, readdir, writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';

// Capture the exact GLB in its authored neutral state; the harness never plays its clips.
const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));
const options = {};
for (let index = 2; index < process.argv.length; index += 2) {
  const option = process.argv[index];
  assert.ok(['--body', '--output', '--origin'].includes(option), 'Unknown option: ' + option);
  assert.ok(process.argv[index + 1], 'Missing value for ' + option);
  options[option.slice(2)] = process.argv[index + 1];
}
const output = path.resolve(repositoryRoot, options.output ?? process.env.OUTFIT_REFERENCE_OUTPUT ??
  'output/meshy-outfit-pipeline/pass-002/references');
const sourceFile = path.resolve(repositoryRoot, options.body ?? process.env.OUTFIT_REFERENCE_BODY ??
  'Assets/Characters/Human/Human-textured.glb');
const sourcePath = path.relative(repositoryRoot, sourceFile).replaceAll('\\', '/');
assert.ok(!sourcePath.startsWith('../') && !path.isAbsolute(sourcePath),
  'The reference body must be inside the repository so its provenance remains portable.');
const baseURL = options.origin ?? process.env.PROTOTYPE_URL ?? 'http://127.0.0.1:5194';
const sourceURL = '/@fs/' + sourceFile.replaceAll('\\', '/');
const captureRoute = '/scripts/qa/meshy-neutral-reference.html';
const {chromium} = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const views = ['front', 'left', 'right', 'back', 'front-left'];
const dimensions = {width: 1024, height: 1024};
const sourceFiles = [
  'scripts/qa/capture-meshy-outfit-references.mjs',
  'scripts/qa/meshy-neutral-reference.html',
  'scripts/qa/meshy-neutral-reference.js',
];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const localHash = async filename => hash(await readFile(path.resolve(repositoryRoot, filename)));
const jsonBytes = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
const pose = {mode: 'source-rest', animation: null, mixer: false, dnaAdjustments: false};

async function saveFile(filename, bytes) {
  const destination = path.join(output, filename);
  await writeFile(destination, bytes, {flag: 'wx', flush: true});
  const reread = await readFile(destination);
  assert.equal(hash(reread), hash(bytes), 'Saved artifact changed: ' + filename);
  return {path: filename, sha256: hash(reread), bytes: reread.length};
}

function verifyEvidence(evidence, view, body) {
  assert.equal(evidence.view, view);
  assert.deepEqual(evidence.pose, pose);
  assert.equal(evidence.source.sha256, body.sha256);
  assert.equal(evidence.source.bytes, body.bytes);
  assert.deepEqual(evidence.before, evidence.after,
    'Source geometry, materials or transforms changed while rendering.');
  for (const value of Object.values(evidence.validations)) assert.equal(value, true);
  const isPerspective = view === 'front-left';
  assert.equal(evidence.camera.type, isPerspective ? 'perspective' : 'orthographic');
  assert.equal(evidence.camera.scale, isPerspective ? null : evidence.framing.orthographicVerticalSpan);
  assert.equal(evidence.framing.orthographicVerticalSpan, evidence.framing.perspectiveTargetVerticalSpan);
  assert.deepEqual(evidence.camera.target, evidence.framing.target);
  const direction = evidence.camera.position.map((value, axis) => value - evidence.camera.target[axis]);
  const horizontal = Math.hypot(direction[0], direction[2]);
  assert.ok(horizontal > 0 && Math.abs(direction[1]) < 1e-10, 'Camera must be level with its target.');
  const expected = {
    front: [0, 1], left: [1, 0], right: [-1, 0], back: [0, -1],
    'front-left': [Math.SQRT1_2, Math.SQRT1_2],
  }[view];
  assert.ok(Math.abs(direction[0] / horizontal - expected[0]) < 1e-10);
  assert.ok(Math.abs(direction[2] / horizontal - expected[1]) < 1e-10);
  for (const value of [...evidence.projectedBounds.x, ...evidence.projectedBounds.y,
    ...evidence.projectedBounds.z]) assert.ok(Math.abs(value) < 1, 'Source bounds are clipped.');
}

await mkdir(output, {recursive: true});
assert.equal((await readdir(output)).length, 0,
  'Capture output must be empty. Preserve prior captures and select a new directory deliberately.');
const sourceBytes = await readFile(sourceFile);
assert.equal(sourceBytes.toString('ascii', 0, 4), 'glTF', 'Reference body must be a real GLB.');
const body = {
  id: 'body/meshy-human', path: sourcePath, url: sourceURL,
  sha256: hash(sourceBytes), bytes: sourceBytes.length,
};
const sourceHashes = Object.fromEntries(await Promise.all(
  sourceFiles.map(async filename => [filename, await localHash(filename)]),
));
const manifest = {
  schemaVersion: 1, kind: 'meshy-outfit-references', capturedAt: new Date().toISOString(),
  body, pose,
  source: {
    renderer: 'scripts/qa/meshy-neutral-reference.js', route: captureRoute, baseURL,
    gitCommit: execFileSync('git', ['rev-parse', 'HEAD'], {cwd: repositoryRoot, encoding: 'utf8'}).trim(),
    files: sourceHashes,
  },
  coordinateFrame: {
    front: '+Z', up: '+Y', left: '+X', right: '-X',
    sideNames: 'Anatomical sides of the character, not the viewer.',
  },
  authority: 'Exact source GLB parsed directly with GLTFLoader and MeshoptDecoder. No animation ' +
    'player, DNA, factory, fitting, recentering, scaling or authored-material replacement is applied. ' +
    'Camera framing follows the complete source bounds. Source underwear remains part of the body.',
  views: {}, loadedBodies: [],
  validations: {bodyOnly: false, sourceHashVerified: false, nativeNeutralPose: false,
    exactViewCount: 0, errors: []},
};
const errors = manifest.validations.errors;
let browser;

try {
  browser = await chromium.launch({
    headless: true, channel: process.env.BROWSER_CHANNEL ?? 'msedge',
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage({viewport: dimensions, deviceScaleFactor: 1});
  page.setDefaultTimeout(120000);
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => {
    if (response.status() >= 400) errors.push(response.status() + ' ' + response.url());
  });
  const pageURL = new URL(captureRoute, baseURL);
  pageURL.searchParams.set('source', sourceURL);
  await page.goto(pageURL.href, {waitUntil: 'domcontentloaded', timeout: 120000});
  await page.waitForFunction(() => window.neutralReference || window.neutralReferenceError);
  const harnessError = await page.evaluate(() => window.neutralReferenceError);
  assert.equal(harnessError, undefined, harnessError);
  await page.waitForFunction(() => document.querySelector('#reference').dataset.ready === 'true');
  const state = await page.evaluate(() => ({
    source: window.neutralReference.source, baseline: window.neutralReference.baseline,
    framing: window.neutralReference.framing, pose: window.neutralReference.pose,
  }));
  assert.equal(state.source.sha256, body.sha256, 'Browser did not parse the selected source bytes.');
  assert.deepEqual(state.pose, pose);
  manifest.framing = state.framing;
  manifest.loadedBodies = [state.source];
  manifest.sourceState = state.baseline;

  for (const view of views) {
    const evidence = await page.evaluate(name => window.neutralReference.capture(name), view);
    verifyEvidence(evidence, view, body);
    assert.deepEqual(evidence.before, state.baseline, 'Source state changed between views.');
    const png = await page.locator('#reference').screenshot({type: 'png', timeout: 120000});
    const pixels = await sharp(png).metadata();
    assert.equal(pixels.width, dimensions.width);
    assert.equal(pixels.height, dimensions.height);
    assert.equal(pixels.format, 'png');
    assert.ok((await sharp(png).stats()).entropy > 0.5, 'Blank reference canvas: ' + view);
    const imageRecord = await saveFile(view + '.png', png);
    const snapshot = await saveFile(view + '.snapshot.json', jsonBytes(evidence));
    manifest.views[view] = {
      ...imageRecord, ...dimensions, camera: evidence.camera, snapshot,
      checks: {...evidence.validations, decodedPNG: true},
    };
    console.log('Captured native neutral source:', view, imageRecord.sha256, path.join(output, view + '.png'));
  }
  assert.equal(await localHash(sourcePath), body.sha256, 'Source GLB changed during capture.');
  for (const [filename, digest] of Object.entries(sourceHashes)) {
    assert.equal(await localHash(filename), digest, 'Capture source changed: ' + filename);
  }
  assert.deepEqual(errors, [], 'Browser errors invalidate the source reference capture.');
  manifest.validations = {bodyOnly: true, sourceHashVerified: true, nativeNeutralPose: true,
    sourceGeometryUnchanged: true, sourceTransformsUnchanged: true, sourceMaterialsUnchanged: true,
    exactViewCount: 5, errors: []};
  await saveFile('reference-manifest.json', jsonBytes(manifest));
  console.log('Verified five native neutral source references:', output);
} catch (error) {
  errors.push(error.stack ?? error.message);
  await saveFile('capture-failure.json', jsonBytes(manifest));
  throw error;
} finally {
  if (browser) await browser.close();
}
