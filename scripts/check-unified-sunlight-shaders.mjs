import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { loadTypeScript } from './load-typescript.mjs';

const { ShaderChunk, ShaderLib, Group, Mesh, BoxGeometry, MeshStandardMaterial, Vector3 } = createRequire(import.meta.url)('three');
const load = path => loadTypeScript(new URL(path, import.meta.url));
const { DirectionalAtmosphere } = load('../src/world/DirectionalAtmosphere.ts');
const { FjordsideWater } = load('../src/world/FjordsideWater.ts');
const validator = process.env.GLSLANG_VALIDATOR;
if (!validator) throw new Error('Set GLSLANG_VALIDATOR to an installed Khronos glslang executable.');
const output = new URL('../output/unified-sunlight-237/shaders/', import.meta.url);
await mkdir(output, { recursive: true });

function expand(source) {
    source = source.replace(/#include <([\w\d_]+)>/g, (_, name) => {
        if (!ShaderChunk[name]) throw new Error('Unknown Three shader chunk: ' + name);
        return expand(ShaderChunk[name]);
    });
    const counts = { NUM_DIR_LIGHTS: 1, NUM_DIR_LIGHT_SHADOWS: 1, NUM_POINT_LIGHTS: 1,
        NUM_POINT_LIGHT_SHADOWS: 0, NUM_SPOT_LIGHTS: 0, NUM_SPOT_LIGHT_SHADOWS: 0,
        NUM_SPOT_LIGHT_MAPS: 0, NUM_SPOT_LIGHT_COORDS: 0, NUM_SPOT_LIGHT_SHADOWS_WITH_MAPS: 0,
        NUM_RECT_AREA_LIGHTS: 0, NUM_HEMI_LIGHTS: 1, NUM_CLIPPING_PLANES: 0, UNION_CLIPPING_PLANES: 0 };
    for (const [name, value] of Object.entries(counts).sort((a, b) => b[0].length - a[0].length))
        source = source.replaceAll(name, String(value));
    // Same static sampler-loop expansion as WebGLProgram, before the GLSL compiler sees the source.
    return source.replace(/#pragma unroll_loop_start\s+for\s*\(\s*int i\s*=\s*(\d+)\s*;\s*i\s*<\s*(\d+)\s*;\s*i\s*\+\+\s*\)\s*{([\s\S]+?)}\s*#pragma unroll_loop_end/g,
        (_, start, end, body) => Array.from({ length: Number(end) - Number(start) }, (_, index) =>
            body.replace(/\[\s*i\s*\]/g, `[ ${Number(start) + index} ]`)
                .replace(/UNROLLED_LOOP_INDEX/g, String(Number(start) + index))).join(''));
}

function prefix(vertex, defines) {
    return `#version 300 es
        precision highp float;
        precision highp int;
        #define HIGH_PRECISION
        #define USE_FOG
        #define USE_SHADOWMAP
        #define SHADOWMAP_TYPE_PCF
        #define STANDARD
        // glslang 16.6 reserves a native name used by unmodified Three r180 common.glsl.
        // This compile-harness alias leaves its function body/calls and product shaders unchanged.
        #define average threeAverage
        ${Object.entries(defines).map(([key, value]) => `#define ${key} ${value}`).join('\n')}
        #define attribute in
        #define varying ${vertex ? 'out' : 'in'}
        #define texture2D texture
        #define textureCube texture
        #define texture2DProj textureProj
        uniform mat4 viewMatrix;
        uniform vec3 cameraPosition;
        uniform bool isOrthographic;
        ${vertex ? `
            uniform mat4 modelMatrix;
            uniform mat4 modelViewMatrix;
            uniform mat4 projectionMatrix;
            uniform mat3 normalMatrix;
            in vec3 position;
            in vec3 normal;
            in vec2 uv;
            #ifdef USE_SKINNING
                in vec4 skinIndex;
                in vec4 skinWeight;
            #endif
            #ifdef USE_INSTANCING
                in mat4 instanceMatrix;
            #endif
        ` : `
            out vec4 pc_fragColor;
            #define gl_FragColor pc_fragColor
            #define TONE_MAPPING
            ${ShaderChunk.tonemapping_pars_fragment}
            vec3 toneMapping(vec3 color) { return ACESFilmicToneMapping(color); }
            ${ShaderChunk.colorspace_pars_fragment}
            vec4 linearToOutputTexel(vec4 value) { return sRGBTransferOETF(value); }
        `}
    `;
}

const atmosphere = new DirectionalAtmosphere();
const geometry = new BoxGeometry(), material = new MeshStandardMaterial(), root = new Group();
root.add(new Mesh(geometry, material)); atmosphere.bind(root);
const standard = { uniforms: {}, vertexShader: ShaderLib.standard.vertexShader,
    fragmentShader: ShaderLib.standard.fragmentShader };
material.onBeforeCompile(standard);
const cases = [];
for (const quality of ['low', 'standard']) {
    const water = new FjordsideWater(0, new Vector3(), quality, atmosphere);
    cases.push({ name: 'water-' + quality, vertexShader: water.mesh.material.vertexShader,
        fragmentShader: water.mesh.material.fragmentShader, defines: water.mesh.material.defines });
    water.dispose();
}
for (const defines of [{}, { USE_INSTANCING: '' }, { USE_SKINNING: '' }])
    cases.push({ name: 'native-' + (Object.keys(defines)[0] ?? 'static').toLowerCase(), ...standard, defines });
const results = [];
for (const item of cases) {
    const paths = [];
    for (const [stage, source] of [['vert', item.vertexShader], ['frag', item.fragmentShader]]) {
        const path = new URL(item.name + '.' + stage, output);
        await writeFile(path, prefix(stage === 'vert', item.defines) + expand(source));
        paths.push(decodeURIComponent(path.pathname.replace(/^\/([A-Za-z]:)/, '$1')));
    }
    const result = spawnSync(validator, ['-l', ...paths], { encoding: 'utf8', windowsHide: true });
    results.push({ name: item.name, status: result.status, output: result.stdout + result.stderr });
}
atmosphere.dispose(); material.dispose(); geometry.dispose();
await writeFile(new URL('compile-report.json', output), JSON.stringify({ compiler:
    spawnSync(validator, ['--version'], { encoding: 'utf8', windowsHide: true }).stdout,
    method: 'Installed Three r180 chunks expanded for WebGL2; native average-name alias for glslang 16.6 compatibility; real modified water/static/instancing/skinning shader sources; offline compile/link, no rendered pixels',
    results }, null, 2));
for (const result of results) console.log(result.name + ': ' + result.status + '\n' + result.output);
if (results.some(result => result.status !== 0)) process.exitCode = 1;
