import { Color } from 'three';
import { installRockSnowStudy } from './fjord-rock-snow-study-browser.mjs';

// An art-directed summit-cap preview, not a change to climate, snow physics or geography.
export async function installSummitSnowStudy(audit, quality) {
    const parent = await installRockSnowStudy(audit, quality);
    parent.select('candidate');
    const { terrain, blueprint } = audit.references.world;
    const peak = blueprint.terrain.heights.reduce((value, height) => Math.max(value, height), -Infinity);
    const water = blueprint.waterLevel;
    const snowLine = water + (peak - water) * .90;
    const minimumUp = .97;
    const iceTone = new Color('#dfedf4');
    const bindings = terrain.material.map(material => ({ material, compile: material.onBeforeCompile,
        cacheKey: material.customProgramCacheKey, key: material.customProgramCacheKey() }));
    let mode = 'current';
    return {
        select(next) {
            if (!['current', 'candidate'].includes(next)) throw Error('Unknown summit snow mode');
            mode = next;
            parent.select('candidate');
            for (const binding of bindings) {
                const { material } = binding;
                material.onBeforeCompile = binding.compile;
                material.customProgramCacheKey = binding.cacheKey;
                if (next === 'candidate') {
                    material.onBeforeCompile = (shader, renderer) => {
                        binding.compile.call(material, shader, renderer);
                        shader.uniforms.summitSnowLineY = { value: snowLine };
                        shader.uniforms.summitMinimumUp = { value: minimumUp };
                        shader.uniforms.summitIceTone = { value: iceTone };
                        const normalAnchor = '#include <defaultnormal_vertex>';
                        const heightAnchor = '#include <project_vertex>';
                        const snowAnchor = 'seasonSnowAmount*seasonMask);';
                        if (![normalAnchor, heightAnchor].every(anchor => shader.vertexShader.includes(anchor)) ||
                            !shader.fragmentShader.includes(snowAnchor)) throw Error('Summit shader anchors changed');
                        shader.vertexShader = 'varying float summitWorldY; varying float summitUp;\n' +
                            shader.vertexShader.replace(normalAnchor, normalAnchor +
                                '\nsummitUp=inverseTransformDirection(transformedNormal,viewMatrix).y;')
                                .replace(heightAnchor, heightAnchor +
                                    '\nsummitWorldY=(modelMatrix*vec4(transformed,1.0)).y;');
                        shader.fragmentShader = 'varying float summitWorldY; varying float summitUp;\n' +
                            'uniform float summitSnowLineY; uniform float summitMinimumUp; uniform vec3 summitIceTone;\n' + shader.fragmentShader.replace(
                                snowAnchor, snowAnchor + '\nfloat summitCap=step(summitSnowLineY,summitWorldY)' +
                                '*step(summitMinimumUp,summitUp);\n' +
                                'diffuseColor.rgb=mix(diffuseColor.rgb,summitIceTone,summitCap);');
                    };
                    material.customProgramCacheKey = () => binding.key + '|permanent-summit-flat-hard-v2';
                }
                material.needsUpdate = true;
            }
        },
        inspect() {
            return { mode, parent: parent.inspect(), summit: { peakY: peak, waterY: water,
                snowLineY: snowLine, relativeLine: .90, minimumNormalY: minimumUp,
                maximumSlopeDegrees: Math.acos(minimumUp) * 180 / Math.PI,
                boundary: 'Binary height and slope steps; no terrain blend band',
                iceColor: iceTone.getHexString(), seasonalDependency: false, newMaps: 0, newPasses: 0,
                limitation: 'Relative game-scale art direction; existing islands are 43–46m high. Not real-world glaciology.' } };
        },
        dispose() {
            this.select('current');
            parent.dispose();
        },
    };
}
