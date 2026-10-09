import {createRequire} from 'node:module';
import {mkdirSync, writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';

const {chromium} = createRequire(import.meta.url)(
    process.env.PLAYWRIGHT_MODULE ?? 'playwright',
);
const output = process.env.RUNNING_QA_OUTPUT ?? 'artifacts/meshy-running-pose';
const origin = process.env.PROTOTYPE_URL ?? 'http://127.0.0.1:5182';
mkdirSync(output, {recursive: true});

function saveImage(name, base64) {
    writeFileSync(output + '/' + name, Buffer.from(base64, 'base64'));
}

function saveJSON(name, value) {
    writeFileSync(output + '/' + name, JSON.stringify(value, null, 2) + '\n');
}

async function observeLab(page) {
    await page.goto(origin + '/character-lab');
    await page.waitForSelector('#lab-preview[data-ready="true"]', {timeout: 60000});
    await page.locator('[data-action="view-front"]').click();
    await page.locator('#lab-animation').focus();
    await page.locator('#lab-animation').selectOption('Running');
    return page.evaluate(async () => {
        const canvas = document.querySelector('#lab-preview');
        const frames = [];
        const held = [];
        const start = performance.now();
        await new Promise(resolve => {
            const observe = () => {
                const wallSeconds = (performance.now() - start) / 1000;
                const clipSeconds = Number(document.querySelector('#lab-pose-time').value);
                frames.push({wallSeconds, clipSeconds});
                if (clipSeconds >= .635 && clipSeconds <= .667 && held.length < 3) {
                    held.push({
                        wallSeconds, clipSeconds,
                        png: canvas.toDataURL('image/png').split(',')[1],
                    });
                }
                if (wallSeconds >= 6) resolve();
                else requestAnimationFrame(observe);
            };
            requestAnimationFrame(observe);
        });
        return {width: canvas.width, height: canvas.height, frames, held};
    });
}

async function replayFactory(page) {
    // Keep the historical module in ignored scratch. Production code/assets are untouched.
    mkdirSync('scratch/running-seam', {recursive: true});
    const historical = execFileSync(process.env.GIT_BIN ?? 'git', [
        'show', '3663f4e:src/characters/MeshyHuman.ts',
    ], {encoding: 'utf8'});
    const fixtureSource = historical.replace(/from\s*(['"])(\.{1,2}\/[^'"]+)\1/g,
        (_, quote, path) => 'from ' + quote + (path.startsWith('../')
            ? '/src/' + path.slice(3) : '/src/characters/' + path.slice(2)) + quote);
    writeFileSync('scratch/running-seam/before-MeshyHuman.ts', fixtureSource);
    writeFileSync('scratch/running-seam/fixture.html',
        '<!doctype html><html><body style="margin:0"></body></html>');
    await page.goto(origin + '/scratch/running-seam/fixture.html');
    return page.evaluate(async () => {
        const source = await fetch('/src/characters/MeshyHuman.ts')
            .then(response => response.text());
        // Reuse the same Vite Three module as the public factory.
        const dependency = source.match(/from ["']([^"']*\/three\.js[^"']*)["']/)?.[1];
        if (!dependency) throw new Error('Could not resolve the factory Three module.');
        const T = await import(dependency);
        const {defaultDNA} = await import('/src/characters/CharacterDNA.ts');
        const modules = {
            before: await import('/scratch/running-seam/before-MeshyHuman.ts'),
            after: await import('/src/characters/MeshyHuman.ts'),
        };
        const canvas = document.createElement('canvas');
        document.body.append(canvas);
        const renderer = new T.WebGLRenderer({
            canvas, antialias: true, preserveDrawingBuffer: true,
        });
        renderer.setSize(500, 600);
        renderer.toneMapping = T.ACESFilmicToneMapping;
        const camera = new T.OrthographicCamera(-1, 1, 1.2, -1.2, .05, 60);
        camera.position.set(0, 1.15, 4);
        camera.lookAt(0, .8, 0);
        const frames = [];
        for (const [version, module] of Object.entries(modules)) {
            const scene = new T.Scene();
            scene.background = new T.Color('#dbe1d7');
            scene.add(new T.HemisphereLight(0xfff3e3, 0x9caa9a, 2.2));
            const light = new T.DirectionalLight(0xffead5, 1.7);
            light.position.set(-3, 6, 5);
            scene.add(light);
            const model = await module.meshyHumanFactory.create(defaultDNA(), 2);
            try {
                scene.add(model.root);
                model.setPlaybackRate(1);
                model.sampleAnimation('Running', .6);
                // Advance continuously across the seam: no per-frame freeze/resample.
                for (let frame = 1; frame <= 6; frame++) {
                    model.update(1 / 60);
                    renderer.render(scene, camera);
                    frames.push({
                        version, frame, clipSeconds: model.animationState.time,
                        png: canvas.toDataURL('image/png').split(',')[1],
                    });
                }
            } finally {
                model.dispose();
            }
        }
        renderer.dispose();

        const sheet = document.createElement('canvas');
        sheet.width = 1200;
        sheet.height = 564;
        const context = sheet.getContext('2d');
        context.fillStyle = '#fff';
        context.fillRect(0, 0, sheet.width, sheet.height);
        for (const [index, frame] of frames.entries()) {
            const picture = new Image();
            picture.src = 'data:image/png;base64,' + frame.png;
            await picture.decode();
            const x = index % 6 * 200;
            const y = Math.floor(index / 6) * 282;
            context.fillStyle = '#222';
            context.font = '14px sans-serif';
            context.fillText(frame.version + ' / ' + frame.clipSeconds.toFixed(3) + ' s',
                x + 6, y + 20);
            context.drawImage(picture, x, y + 30, 200, 240);
        }
        return {frames, sheet: sheet.toDataURL('image/png').split(',')[1]};
    });
}

const browser = await chromium.launch({
    channel: process.env.BROWSER_CHANNEL,
    headless: true,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const errors = [];
try {
    const page = await browser.newPage({viewport: {width: 440, height: 956}});
    page.on('pageerror', error => errors.push(error.message));
    const observation = await observeLab(page);
    for (const [index, frame] of observation.held.entries()) {
        saveImage('held-frame-' + index + '.png', frame.png);
    }
    saveJSON('live-evidence.json', {
        ...observation,
        held: observation.held.map(({png, ...frame}, index) => ({
            ...frame, image: 'held-frame-' + index + '.png',
        })),
        errors,
    });
    await page.screenshot({path: output + '/character-lab-running.png', fullPage: true});
    await page.close();

    const fixture = await browser.newPage({viewport: {width: 500, height: 600}});
    fixture.on('pageerror', error => errors.push(error.message));
    const replay = await replayFactory(fixture);
    for (const frame of replay.frames) {
        saveImage(frame.version + '-frame-' + frame.frame + '.png', frame.png);
    }
    saveImage('seam-before-after.png', replay.sheet);
    saveJSON('replay-evidence.json', replay.frames.map(({png, ...frame}) => frame));
    await fixture.close();
    if (errors.length) throw new Error(errors.join('\n'));
    console.log(JSON.stringify({
        liveFrames: observation.frames.length, replayFrames: replay.frames.length, errors,
    }));
} finally {
    await browser.close();
}
