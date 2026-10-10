import { lightingConfig } from '../config/lightingConfig';
import type { WeatherClass } from '../simulation/Weather';

/** Presentation presets only. Weather and every gameplay modifier remain Core-owned. */
export function projectFjordWeather(kind: WeatherClass | null) {
    const changes = {
        Mild: {
            sky: 0xe0e2d3, sun: 0xffdfb0, sunIntensity: 1.8,
            fogNear: 80, fogFar: 180
        },
        Normal: {},
        Harsh: {
            sky: 0xa6b7c5, sun: 0xddeaff, sunIntensity: .9, ambientSky: 0xc4d4e5,
            ambient: 2.1, exposure: .95, fogNear: 35, fogFar: 185
        },
        Severe: {
            sky: 0x7f93a6, sun: 0xc6d7ed, sunIntensity: .55, ambientSky: 0xa9bfd5,
            ambient: 1.75, exposure: .85, fogNear: 10, fogFar: 175
        }
    };
    return {
        class: kind,
        lighting: { ...lightingConfig.day, ...(kind ? changes[kind] : {}) },
        snow: kind === 'Severe' ? 1 : kind === 'Harsh' ? .35 : 0
    };
}
