export const worldConfig = {
    seed: 1983, villagers: 10, camera: { minZoom: 15, maxZoom: 110, initialZoom: 62, speed: 16, bounds: 46, touch: { tapThreshold: 10, rotationSensitivity: .006, elevationSensitivity: .0045, minElevation: .45, maxElevation: 1.25 } },
    palette: { ground: '#c4bca5', moss: '#9da88e', earth: '#ad9b84', sand: '#d1c8b5', foliage: '#98a78d', roof: '#a4ad91', rock: '#a0a7ac', timber: '#b19d8a', water: '#839ca9', ripple: '#a6bac0', cream: '#d5cabb' },
    materials: { desaturation: .24, foliageBlend: .56, roofBlend: .58, rockBlend: .48, timberBlend: .16 },
    lighting: { sky: 0xd4dedf, sun: 0xffead5, sunIntensity: 1.55, ambientSky: 0xf3eee3, ambientGround: 0xb7b1a0, ambient: 2.45, sunPosition: [-28, 48, 18] as const, shadowMapSize: 2048, shadowRadius: 4, shadowBlurSamples: 8, shadowNormalBias: .045, exposure: 1.05, fogNear: 65, fogFar: 155 },
};
export function seededRandom(seed: number) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
