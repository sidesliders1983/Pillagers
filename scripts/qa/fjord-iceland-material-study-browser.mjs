import { TextureLoader } from 'three';

// Imported only by the QA capture runner. Production never loads this module.
export async function installIcelandMaterialStudy(audit, quality) {
    if (!['standard', 'low'].includes(quality)) throw Error('Unknown study quality');
    const terrain = audit.references.world.terrain;
    if (terrain?.name !== 'Generated canonical terrain' || !Array.isArray(terrain.material)) {
        throw Error('The study requires the existing canonical terrain.');
    }
    const manifest = await fetch('/docs/qa/iceland-textures-180/delivery.json').then(response => {
        if (!response.ok) throw Error('Missing study delivery manifest');
        return response.json();
    });
    const loader = new TextureLoader();
    const sources = new Map();
    for (const map of manifest.delivery.filter(map => map.tier === quality)) {
        sources.set(map.materialId, await loader.loadAsync('/docs/qa/iceland-textures-180/' + map.file));
    }
    const bindings = terrain.material.map(material => {
        const source = sources.get(material.name);
        if (!source || !material.map) throw Error('Unexpected terrain material: ' + material.name);
        const candidate = material.map.clone();
        candidate.source = source.source;
        candidate.needsUpdate = true;
        return { material, candidate, map: material.map, normalMap: material.normalMap,
            roughnessMap: material.roughnessMap, roughness: material.roughness };
    });
    let mode = 'native';
    return {
        select(next) {
            if (!['native', 'current-albedo', 'iceland-albedo'].includes(next)) throw Error('Unknown material mode');
            mode = next;
            for (const binding of bindings) {
                const { material } = binding;
                material.map = next === 'iceland-albedo' ? binding.candidate : binding.map;
                material.normalMap = next === 'native' ? binding.normalMap : null;
                material.roughnessMap = next === 'native' ? binding.roughnessMap : null;
                material.roughness = next === 'native' ? binding.roughness : 1;
                material.needsUpdate = true;
            }
        },
        inspect() {
            return { mode, addedColourSources: sources.size, maps: bindings.map(({ material }) => ({
                name: material.name, channel: material.map.channel, repeat: material.map.repeat.toArray(),
                anisotropy: material.map.anisotropy, width: material.map.image.width,
                height: material.map.image.height, normalMap: !!material.normalMap,
                roughnessMap: !!material.roughnessMap, roughness: material.roughness,
            })) };
        },
        dispose() {
            this.select('native');
            for (const binding of bindings) binding.candidate.dispose();
            for (const source of sources.values()) source.dispose();
        },
    };
}
