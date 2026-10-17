import { TextureLoader } from 'three';
import { installIcelandMaterialStudy } from './fjord-iceland-material-study-browser.mjs';

// QA-only material experiment. Keep the production world and seasonal clock untouched.
export async function installRockSnowStudy(audit, quality) {
    const parent = await installIcelandMaterialStudy(audit, quality);
    parent.select('iceland-albedo');
    const terrain = audit.references.world.terrain;
    const manifest = await fetch('/docs/qa/iceland-rock-snow-180/delivery.json').then(response => {
        if (!response.ok) throw Error('Missing rock study delivery manifest');
        return response.json();
    });
    const delivered = manifest.delivery.find(map => map.tier === quality);
    const source = await new TextureLoader().loadAsync('/docs/qa/iceland-rock-snow-180/' + delivered.file);
    const bindings = terrain.material.filter(material => material.name === 'mossy_rock').map(material => {
        const candidate = material.map.clone();
        candidate.source = source.source;
        candidate.needsUpdate = true;
        return { material, candidate, color: material.color.clone(), compile: material.onBeforeCompile,
            cacheKey: material.customProgramCacheKey, key: material.customProgramCacheKey() };
    });
    if (bindings.length !== 3) throw Error('Expected the existing three native rock projections');
    let mode = 'current';
    return {
        select(next) {
            if (!['current', 'candidate'].includes(next)) throw Error('Unknown rock study mode');
            mode = next;
            parent.select('iceland-albedo');
            for (const binding of bindings) {
                const { material } = binding;
                material.color.copy(binding.color);
                material.onBeforeCompile = binding.compile;
                material.customProgramCacheKey = binding.cacheKey;
                if (next === 'candidate') {
                    material.map = binding.candidate;
                    // Rock keeps its mineral identity while the original grass/soil treatment stays active.
                    material.color.set(0xffffff);
                    material.onBeforeCompile = (shader, renderer) => {
                        binding.compile.call(material, shader, renderer);
                        const anchor = '#include <defaultnormal_vertex>';
                        if (!shader.vertexShader.includes(anchor) || !shader.fragmentShader.includes('float seasonMask=1.0;')) {
                            throw Error('Native terrain snow shader anchors changed');
                        }
                        shader.vertexShader = 'varying vec3 rockSnowWorldNormal;\n' + shader.vertexShader.replace(anchor,
                            anchor + '\nrockSnowWorldNormal=inverseTransformDirection(transformedNormal,viewMatrix);');
                        shader.fragmentShader = 'varying vec3 rockSnowWorldNormal;\n' + shader.fragmentShader.replace(
                            'float seasonMask=1.0;',
                            'float seasonMask=smoothstep(0.72,0.96,normalize(rockSnowWorldNormal).y);');
                    };
                    material.customProgramCacheKey = () => binding.key + '|rock-snow-direction-v1';
                }
                material.needsUpdate = true;
            }
        },
        inspect() {
            return { mode, parent: parent.inspect(), addedRockColourSources: 1,
                snow: { from: 'Existing canonical seasonSnowAmount uniform', retentionNormalY: [.72, .96],
                    newMaps: 0, newPasses: 0, textureSnowPainted: false },
                rock: bindings.map(({ material }) => ({ channel: material.map.channel,
                    repeat: material.map.repeat.toArray(), color: material.color.getHexString(),
                    pixels: [material.map.image.width, material.map.image.height] })) };
        },
        dispose() {
            this.select('current');
            parent.dispose();
            for (const binding of bindings) binding.candidate.dispose();
            source.dispose();
        },
    };
}
