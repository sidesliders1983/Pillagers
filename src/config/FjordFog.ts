import { Color } from 'three';

export type FjordFogProfile = 'current' | 'nordic';
export interface FogPresentation {
    near: number;
    far: number;
    skyMix: number;
    shroudColor: number;
    shroudDistanceFog: boolean;
}

/** Presentation only. Call on a weather/season change, never to discover territory. */
export function fjordFogPresentation(profile: FjordFogProfile, conditions: {
    width: number;
    winterWeight?: number;
    rainWeight?: number;
    weather?: string | null;
    nightWeight?: number;
}): FogPresentation | undefined {
    if (profile === 'current') return undefined;
    const { width, weather } = conditions;
    if (!Number.isFinite(width) || width <= 0) throw new Error('Invalid fog world width.');
    const clamp = (value = 0) => Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
    const mix = (from: number, to: number, weight: number) => from + (to - from) * weight;
    const winter = clamp(conditions.winterWeight);
    const rain = clamp(conditions.rainWeight);
    const night = clamp(conditions.nightWeight);
    const scale = Math.max(.75, Math.min(1.5, width / 800));
    let near = mix(160, 125, winter);
    let far = 400;
    near = mix(near, 75, rain);
    far = mix(far, 300, rain);
    if (weather === 'Harsh' || weather === 'Severe') {
        near = mix(near, weather === 'Severe' ? 15 : 45, winter);
        far = mix(far, weather === 'Severe' ? 200 : 260, winter);
    }
    const shroud = new Color('#344b54').lerp(new Color('#445b67'), winter * .45)
        .lerp(new Color('#32444f'), night);
    return {
        near: mix(near, 70, night) * scale,
        far: mix(far, 270, night) * scale,
        skyMix: .25,
        shroudColor: shroud.getHex(),
        // Native distance fog joins the existing sea apron to the sky at the horizon.
        shroudDistanceFog: true,
    };
}
