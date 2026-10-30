import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve('.');
const output = 'docs/qa/three-r187-323/source-audit.json';
const hash = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function files(directory) {
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
        const file = path.join(directory, entry.name);
        return entry.isDirectory() ? files(file) : [file.replaceAll('\\', '/')];
    });
}
const patterns = {
    customShader: /onBeforeCompile|(?:Raw)?ShaderMaterial|\.glsl|fragmentShader|vertexShader/,
    instancing: /\bInstancedMesh\b/,
    batchedMesh: /\bBatchedMesh\b/,
    webgpu: /three\/(?:webgpu|tsl)|\bWebGPURenderer\b/,
    renderer: /\b(?:WebGLRenderer|createRenderer)\b/,
    disposal: /\.dispose\(|forceContextLoss/,
    viewport: /\.setViewport\(|\.setScissor\(|\.setRenderTarget\(/,
    explicitMatrix: /matrixAutoUpdate\s*=\s*false|matrixWorldNeedsUpdate/,
    environment: /PMREMGenerator|HDRLoader|RGBELoader|RoomEnvironment/,
    postprocessing: /EffectComposer|SMAAPass|SSRNode|GTAONode|RenderPipeline/,
};
const relevant = files('src').filter(file => /\.(?:ts|frag|vert)$/.test(file)).flatMap(file => {
    const text = fs.readFileSync(file, 'utf8');
    const matches = Object.entries(patterns).filter(([, pattern]) => pattern.test(text)).map(([name]) => name);
    return matches.length ? [{ file, sha256: hash(file), matches }] : [];
});
const data = { recordedUtc: new Date().toISOString(), root,
    baseCommit: execFileSync('git', ['merge-base', 'HEAD', 'origin/main'], { encoding: 'utf8' }).trim(),
    sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    note: 'Lexical inventory includes Labs and diagnostics; the report distinguishes actual live Fjord paths.',
    node: process.version,
    versions: Object.fromEntries(['three', '@types/three', 'three.quarks', 'quarks.core', 'typescript', 'vite']
        .map(name => [name, JSON.parse(fs.readFileSync(`node_modules/${name}/package.json`, 'utf8')).version])),
    sourceHashes: Object.fromEntries(['package.json', 'pnpm-lock.yaml', 'src/core/Renderer.ts',
        'src/fjord-play/FjordScene.ts', 'src/fjord-play/FjordHdrLighting.ts', 'src/characters/ResidentPortraitStudio.ts',
        'src/config/PresentationQuality.ts', 'src/fjord-play/entry-motion/EntryBackdropRenderer.ts',
        'docs/qa/three-r187-323/protocol.json', 'scripts/qa/benchmark-three-r187.mjs', 'scripts/qa/three-r187-probe.mjs']
        .map(file => [file, hash(file)])),
    sourceReferences: Object.fromEntries(files('docs/qa/three-r187-323/sources').map(file => [file, hash(file)])),
    counts: Object.fromEntries(Object.keys(patterns).map(name => [name, relevant.filter(file => file.matches.includes(name)).length])),
    files: relevant };
fs.writeFileSync(output, JSON.stringify(data, null, 2) + '\n');
console.log(JSON.stringify({ output, versions: data.versions, counts: data.counts }));
