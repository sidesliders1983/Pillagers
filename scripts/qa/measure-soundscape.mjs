import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { loadTypeScript } from '../load-typescript.mjs';

const { Soundscape } = loadTypeScript(new URL('../../src/audio/Soundscape.ts', import.meta.url));
const { FjordAudio } = loadTypeScript(new URL('../../src/audio/FjordAudio.ts', import.meta.url));
const cues = ['a', 'b', 'c'].map(id => ({ id, bus: 'world', gain: .2, variants: ['x', 'y'],
    loop: true, cooldown: [3, 4], range: 50, priority: 1, limit: 4, pitch: [1, 1] }));
const sources = Array.from({ length: 128 }, (_, index) => ({
    id: String(index), cue: cues[index % 3].id, permitted: index % 4 !== 0,
    position: { x: index % 12 * 3, y: index % 3, z: Math.floor(index / 12) * 3 },
}));
const rows = [];
for (const mode of ['off', 'near', 'overview', 'overview', 'near', 'off']) {
    const policy = new Soundscape(cues, () => .5);
    const audio = new FjordAudio({ createContext: () => { throw new Error('Off must not create audio'); } });
    const world = audio.world({ cues, assets: [] });
    const values = [];
    let highSelected = 0;
    for (let sample = 0; sample < 1300; sample++) {
        const camera = { focus: { x: sample % 10, y: 0, z: 10 },
            forward: { x: 0, z: -1 }, distance: mode === 'overview' ? 300 : 30 };
        const started = performance.now();
        if (mode === 'off') {
            if (world.due) throw new Error('Off unexpectedly requested a frame');
        } else {
            const plan = policy.update(sample / 5, camera, sources, false);
            highSelected = Math.max(highSelected, plan.voices.length);
        }
        if (sample >= 100) values.push(performance.now() - started);
    }
    values.sort((a, b) => a - b);
    rows.push({ mode, count: values.length, p50Ms: values[Math.floor(values.length * .5)],
        p95Ms: values[Math.ceil(values.length * .95) - 1], worstMs: values.at(-1), highSelected });
    await audio.dispose();
}
const paths = ['src/audio/Soundscape.ts', 'src/audio/FjordAudio.ts', 'src/audio/AudioControls.ts',
    'src/audio/SoundPack.ts', 'src/fjord-play/FjordEntry.ts', 'src/fjord-play/FjordScene.ts',
    'src/fjord-play/FjordPlay.ts', 'scripts/qa/measure-soundscape.mjs'];
const result = { version: 1, recordedUtc: new Date().toISOString(), node: process.version,
    base: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    scope: 'Node logical-policy microbenchmark; no browser, Web Audio rendering, real frame rate or listening claim',
    syntheticSources: 128, cadenceHz: 5, warmupSamples: 100,
    actualBrowserFrameDeltaMs: null, physicalDevice: null, listened: false,
    sourceHashes: Object.fromEntries(paths.map(path => [path,
        createHash('sha256').update(readFileSync(path)).digest('hex')])), rows };
const output = resolve(process.argv[2] ?? 'scratch/audio-228/policy.json');
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ output, rows }));
