import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { chromium, origin, digest, openStudy, variant, light, fixture, hardware } from './sand-study-browser.mjs';

const output = process.env.QA_OUTPUT || 'docs/qa/generated-sand-resolution';
await mkdir(output, { recursive: true });
const files = ['src/environment-lab/LabWorldGeneration.ts', 'src/environment-lab/EnvironmentLab.ts',
    'src/world/WorldGroundMaterials.ts', 'src/world/BlueprintTerrain.ts', 'src/world/FjordsideWater.ts',
    'src/water/ReferenceWater.ts', 'src/environment-lab/LabLighting.ts'];
const runtimeSources = await Promise.all(files.map(async file => ({ file,
    lfSha256: digest((await readFile(file, 'utf8')).replace(/\r\n/g, '\n')) })));
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1640, height: 1400 }, deviceScaleFactor: 1 });
const runs = [], errors = [];
page.on('pageerror', error => errors.push(error.message));
try {
    await openStudy(page);
    const device = await hardware(page);
    await light(page, 'low-sun');
    await page.locator('#environment-pause').uncheck();
    for (const view of ['sand-shore', 'village']) {
        await page.selectOption('#environment-camera', view);
        for (let repeat = 1; repeat <= 3; repeat++) {
            for (const pixels of [256, 512, 128]) {
                await variant(page, pixels);
                const before = await fixture(page);
                const sample = await page.evaluate(async () => {
                    const framesFor = duration => new Promise(resolve => {
                        const start = performance.now();
                        function frame(time) { if (time - start >= duration) resolve(); else requestAnimationFrame(frame); }
                        requestAnimationFrame(frame);
                    });
                    await framesFor(10000);
                    const intervals = [];
                    await new Promise(resolve => {
                        let previous = 0;
                        const start = performance.now();
                        function frame(time) {
                            if (previous) intervals.push(time - previous);
                            previous = time;
                            if (time - start >= 30000) resolve(); else requestAnimationFrame(frame);
                        }
                        requestAnimationFrame(frame);
                    });
                    const sorted = [...intervals].sort((a,b) => a-b);
                    const quantile = q => sorted[Math.floor((sorted.length - 1) * q)];
                    return { intervals, frames: intervals.length, p50: quantile(.5), p95: quantile(.95),
                        min: sorted[0], max: sorted.at(-1) };
                });
                const after = await fixture(page);
                if (after.water.time <= before.water.time) throw Error('The workload must include active water/wind/residents.');
                runs.push({ view, pixels, repeat, before, after, ...sample });
                await writeFile(output + '/hardware-runs.json', JSON.stringify({ origin,
                    sourceParentCommit: execFileSync('git', ['rev-parse', 'HEAD'], {encoding:'utf8'}).trim(),
                    runtimeSources, hardware: device,
                    protocol: '1536×1024 canvas, DPR1; seed17; accepted ReferenceWater, low-sun20 front, fill1, exposure1.05, HDR/GrassField OFF; 10s warmup +30s rAF samples; three repeats. Ten active residents and water/wind. All individual frame intervals retained. Main + shadow passes in renderer metrics. Host diagnostics, not isolated GPU time or physical mobile/VRAM.',
                    runs, errors,
                }, null, 2) + '\n');
                console.log(JSON.stringify({ run: runs.length, total: 18, view, pixels, repeat,
                    p50: sample.p50, p95: sample.p95, callsAllPasses: after.metrics.calls }));
            }
        }
    }
    if (errors.length) throw Error(errors.join('\n'));
    console.log('PASS: 18 matched active-workload hardware diagnostic runs.');
} finally { await browser.close(); }
