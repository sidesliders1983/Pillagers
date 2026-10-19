import { groundBlendConfig } from './GroundBlendConfig';
import { PCFShadowMap } from 'three';

export type PresentationQuality = 'low' | 'standard';
export type EffectQuality = 'off' | 'low' | 'normal';
export type QualityApplication = 'initial' | 'live';

export const defaultPresentationPreferences: Readonly<{
    quality: PresentationQuality; effects: EffectQuality;
}> = { quality: 'low', effects: 'low' };

/** Existing renderer creation defaults. Fjord overrides its initial ratio explicitly. */
export const rendererQuality = {
    antialias: true,
    maximumPixelRatio: 2,
    fjordInitialPixelRatio: 1,
    shadowsEnabled: true,
    shadowType: PCFShadowMap,
} as const;

/** Both world qualities retain the same verified native body and fitted modules. */
export const worldResidentDetail = { lod: 2 } as const;

export const presentationProfiles = {
    low: {
        maximumPixelRatio: 1,
        maximumShadowMapSize: 1024,
        waterQuality: 'low',
        ground: { baselinePixels: 128, zonedPixels: groundBlendConfig.lowPixels,
            roles: ['colour', 'roughness'] },
        dressing: { props: 40, cover: 160, castPropShadows: false },
    },
    standard: {
        maximumPixelRatio: 1.5,
        maximumShadowMapSize: null,
        waterQuality: 'medium',
        ground: { baselinePixels: 256, zonedPixels: groundBlendConfig.standardPixels,
            roles: ['colour', 'normal', 'roughness'] },
        dressing: { props: 64, cover: 320, castPropShadows: true },
    },
} as const;

export const effectProfiles = {
    off: { enabled: false, fireCapScale: 0, fireRateScale: 0,
        snow: { cap: 0, rate: 0 }, rain: { cap: 0, rate: 0 } },
    low: { enabled: true, fireCapScale: .5, fireRateScale: .45,
        snow: { cap: 300, rate: 70 }, rain: { cap: 250, rate: 180 } },
    normal: { enabled: true, fireCapScale: 1, fireRateScale: 1,
        snow: { cap: 700, rate: 140 }, rain: { cap: 600, rate: 400 } },
} as const;

/** Resolve preferences only on configuration changes, never as another frame/state clock.
 * Ground tier applies at world creation; water, shadows, dressing and effects can apply live.
 * Initial versus live DPR intentionally preserves the existing Fjord lifecycle behavior. */
export function resolvePresentationQuality(quality: PresentationQuality, effects: EffectQuality,
    devicePixelRatio: number, application: QualityApplication, reducedMotion = false) {
    const profile = presentationProfiles[quality];
    return {
        ...profile, quality, effects, residentLOD: worldResidentDetail.lod,
        pixelRatio: application === 'initial' ? rendererQuality.fjordInitialPixelRatio :
            Math.min(devicePixelRatio, profile.maximumPixelRatio),
        particlesEnabled: effectProfiles[effects].enabled && !reducedMotion,
        effectBudget: effectProfiles[effects],
    };
}

/** Keep native day/night and explicit lighting presets as the source of map resolution. */
export function presentationShadowSize(quality: PresentationQuality, nativeSize: number) {
    return Math.min(nativeSize, presentationProfiles[quality].maximumShadowMapSize ?? nativeSize);
}
