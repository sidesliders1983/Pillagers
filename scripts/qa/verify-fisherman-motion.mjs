import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
import { mkdir, writeFile } from 'node:fs/promises';
import sharp from 'sharp';
const reviewId = process.argv[2] ?? 'qa-final';
assert.match(reviewId, /^qa-[a-z0-9-]+$/);
const directory = 'output/meshy-outfit-pipeline/pass-009/' + reviewId;
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
    const page = await browser.newPage({ viewport: { width: 1024, height: 1024 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => {
        if (message.type() === 'error')
            errors.push(message.text());
    });
    await page.goto('http://127.0.0.1:5195/scripts/qa/fisherman-fit-review.html');
    await page.waitForFunction(() => window.fisherReady, null, { timeout: 60000 });
    const results = await page.evaluate(() => {
        const qa = window.fisherQA, records = [];
        for (const clip of ['Walking', 'Idle_02']) {
            const duration = qa.model.clips.find(candidate => candidate.name === clip).duration;
            for (let sample = 0; sample < 24; sample++) {
                const time = duration * sample / 24;
                qa.pose(clip, time);
                records.push({ clip, time, meshes: qa.audit(), contacts: qa.upperContactAudit() });
            }
        }
        return records;
    });
    const failures = results.filter(record => record.meshes.some(mesh => mesh.stretchedEdges));
    const collarFailures = results.filter(record => record.contacts.collar.vertices === 0
        || record.contacts.collar.maximumMetres > .025
        || record.contacts.collar.insideBeyond3mm > 0);
    for (const clip of ['NativeNeutral', 'Walking', 'Idle_02']) {
        await page.evaluate(clip => window.fisherQA.pose(clip, clip === 'NativeNeutral' ? 0 : .65), clip);
        for (const view of ['front', 'left', 'back', 'right']) {
            await page.evaluate(view => window.fisherQA.draw(view), view);
            const bytes = await page.screenshot({ path: directory + '/' + clip + '-' + view + '.png' });
            for (const contact of await page.evaluate(() => window.fisherQA.contactPixels())) {
                const left = Math.max(0, Math.min(864, Math.round(contact.x - 80)));
                const top = Math.max(0, Math.min(864, Math.round(contact.y - 80)));
                await sharp(bytes).extract({ left, top, width: 160, height: 160 }).png()
                    .toFile(directory + '/' + clip + '-' + view + '-' + contact.id + '.png');
            }
        }
    }
    const report = { kind: 'fisherman-native-motion-screen/1', status: failures.length || collarFailures.length || errors.length ? 'needs-review' : 'passed',
        clips: ['Walking', 'Idle_02'], samplesPerClip: 24, threshold: { ratio: 4, edgeMetres: .05, collarGapMetres: .025, collarPenetrationMetres: .003 },
        qualification: 'Finite sampled edge-stretch screening. Visual openings and occlusion require separate review; this is not exhaustive collision simulation.',
        collarFailures, browserErrors: errors, meshes: await page.evaluate(() => window.fisherQA.meshInfo()), results, failures };
    await writeFile(directory + '/motion.json', JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify({ status: report.status, samples: results.length,
        maximumCollarGapMetres: Math.max(...results.map(record => record.contacts.collar.maximumMetres)),
        collarFailures: collarFailures.map(({ clip, time, contacts }) => ({ clip, time, collar: contacts.collar })), failures: failures.map(record => ({ clip: record.clip, time: record.time, meshes: record.meshes.filter(mesh => mesh.stretchedEdges) })), errors }));
    assert.equal(errors.length, 0);
    assert.equal(failures.length, 0, 'Sampled motion contains stretched clothing edges');
    assert.equal(collarFailures.length, 0, 'The moving collar fails its actual body-contact check');
}
finally {
    await browser.close();
}
