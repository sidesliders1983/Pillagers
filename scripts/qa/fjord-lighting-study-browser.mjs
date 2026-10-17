// Disposable study, loaded explicitly through the golden-scene QA server only.
import { Color, Vector3 } from 'three';

export const variants = {
    current: { label: 'Current lighting · #186', ambientGain: 1, directGain: 1 },
    form: { label: 'Form and shade', ambientGain: .5, directGain: 1.35 },
    north: { label: 'Northern sun · 25°', ambientGain: .5, directGain: 1.35,
        elevation: 25, azimuth: 135 },
};

export function installLightingStudy(audit) {
    const { lighting, scene, renderer } = audit.references;
    const update = lighting.update.bind(lighting);
    const originalPosition = lighting.directional.position.clone();
    const distance = lighting.directional.position.distanceTo(lighting.directional.target.position);
    const coolSky = new Color(0xbfd4ee), groundFill = new Color(0x817970);
    const warmSun = new Color(0xffecd6), direction = new Vector3();
    let choice = 'current';

    lighting.update = (time, progress) => {
        update(time, progress);
        const preset = variants[choice];
        lighting.ambient.intensity *= preset.ambientGain;
        lighting.directional.intensity *= preset.directGain;
        if (choice !== 'current') {
            // Blend with the live seasonal/weather colours; retain their differences.
            lighting.ambient.color.lerp(coolSky, .4);
            lighting.ambient.groundColor.lerp(groundFill, .35);
            lighting.directional.color.lerp(warmSun, .2);
        }
        lighting.directional.position.copy(originalPosition);
        if (preset.elevation !== undefined) {
            const altitude = preset.elevation * Math.PI / 180;
            const azimuth = preset.azimuth * Math.PI / 180;
            direction.set(Math.sin(azimuth) * Math.cos(altitude), Math.sin(altitude),
                Math.cos(azimuth) * Math.cos(altitude));
            lighting.directional.position.copy(lighting.directional.target.position)
                .addScaledVector(direction, distance);
        }
    };

    return {
        select(value) {
            if (!Object.hasOwn(variants, value)) throw Error('Unknown study variant.');
            choice = value;
            renderer.shadowMap.needsUpdate = true;
        },
        inspect() {
            const light = lighting.directional, shadow = light.shadow, camera = shadow.camera;
            const sunDirection = light.position.clone().sub(light.target.position).normalize();
            const materials = new Set();
            scene.traverse(node => {
                if (node.isMesh) for (const material of [node.material].flat()) materials.add(material);
            });
            return {
                choice, preset: variants[choice],
                elevation: Math.asin(sunDirection.y) * 180 / Math.PI,
                azimuth: Math.atan2(sunDirection.x, sunDirection.z) * 180 / Math.PI,
                sun: { colour: light.color.getHexString(), intensity: light.intensity },
                fill: { sky: lighting.ambient.color.getHexString(),
                    ground: lighting.ambient.groundColor.getHexString(), intensity: lighting.ambient.intensity },
                exposure: renderer.toneMappingExposure,
                shadow: { mapSize: shadow.mapSize.toArray(), radius: shadow.radius,
                    bias: shadow.bias, normalBias: shadow.normalBias,
                    bounds: { left: camera.left, right: camera.right, top: camera.top,
                        bottom: camera.bottom, near: camera.near, far: camera.far } },
                shadowSources: scene.children.filter(node => node.isLight && node.castShadow).length,
                materials: [...materials].map(material => ({ name: material.name,
                    type: material.type, roughness: material.roughness, metalness: material.metalness,
                    map: !!material.map, normalMap: !!material.normalMap, roughnessMap: !!material.roughnessMap,
                    vertexColors: material.vertexColors, flatShading: material.flatShading })),
            };
        },
    };
}
