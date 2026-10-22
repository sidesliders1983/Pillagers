import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { loadTypeScript } from './load-typescript.mjs';
const { ShaderChunk } = createRequire(import.meta.url)('three');
const { HomeGroundGlow } = loadTypeScript(new URL('../src/world/HomeGroundGlow.ts', import.meta.url));
const validator = process.env.GLSLANG_VALIDATOR;
if (!validator) throw new Error('Set GLSLANG_VALIDATOR to an installed Khronos glslang executable.');
const directory = 'output/warm-home-lighting-256/glow-shaders';
await mkdir(directory, { recursive: true });
const expand = source => source.replace(/#include <([\w\d_]+)>/g, (_, name) => expand(ShaderChunk[name]));
const glow = new HomeGroundGlow(() => 0), material = glow.mesh.material;
const results = [];
for (const fog of ['none', 'linear', 'exp2']) {
    const paths = [];
    for (const stage of ['vert', 'frag']) {
        const vertex = stage === 'vert';
        const prefix = `#version 300 es
            precision highp float;
            precision highp int;
            #define varying ${vertex ? 'out' : 'in'}
            ${fog !== 'none' ? '#define USE_FOG' : ''}
            ${fog === 'exp2' ? '#define FOG_EXP2' : ''}
            ${vertex ? `in vec3 position; in vec2 uv;
                uniform mat4 modelViewMatrix; uniform mat4 projectionMatrix;` : `
                out vec4 pc_fragColor;
                #define gl_FragColor pc_fragColor
                #define TONE_MAPPING
                ${ShaderChunk.tonemapping_pars_fragment}
                vec3 toneMapping(vec3 color) { return ACESFilmicToneMapping(color); }
                ${ShaderChunk.colorspace_pars_fragment}
                vec4 linearToOutputTexel(vec4 value) { return sRGBTransferOETF(value); }
            `}`;
        const path = `${directory}/glow-${fog}.${stage}`;
        await writeFile(path, prefix + expand(vertex ? material.vertexShader : material.fragmentShader));
        paths.push(path);
    }
    const result = spawnSync(validator, ['-l', ...paths], { encoding: 'utf8', windowsHide: true });
    results.push({ fog, status: result.status, output: result.stdout + result.stderr });
}
glow.dispose();
await writeFile('docs/qa/warm-homes-256/spill-shader-report.json', JSON.stringify({
    method: 'Offline WebGL2 compile/link with native Three r180 chunks; not a GPU render or pixel test', results,
}, null, 2) + '\n');
for (const result of results) console.log(JSON.stringify(result));
if (results.some(result => result.status !== 0)) process.exitCode = 1;
