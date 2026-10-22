type RGB = readonly [number, number, number];

export interface SeasonalLightState {
    readonly profile: 'northern-v1';
    readonly yearProgress: number;
    readonly sunDirection: readonly [number, number, number];
    readonly sunElevation: number;
    readonly solarStrength: number;
    readonly solarColor: RGB;
    readonly ambient: Readonly<{ skyColor: RGB; groundColor: RGB; strength: number }>;
    readonly darkness: number;
}

export interface SeasonalLightInputs {
    solarColor: RGB;
    solarStrength: number;
    skyColor: RGB;
    groundColor: RGB;
    ambientStrength: number;
    nightSkyColor: RGB;
    nightGroundColor: RGB;
}

function smoothstep(low: number, high: number, value: number) {
    const t = Math.max(0, Math.min(1, (value - low) / (high - low)));
    return t * t * (3 - 2 * t);
}

function blend(a: RGB, b: RGB, weight: number): RGB {
    return Object.freeze([a[0] + (b[0] - a[0]) * weight,
        a[1] + (b[1] - a[1]) * weight, a[2] + (b[2] - a[2]) * weight]);
}

/** Artistic annual profile, not a daily solar calculation. +Y up; +X east; -Z north. */
export function northernLightProfile(progress: number) {
    if (!Number.isFinite(progress)) throw new RangeError('Year progress must be finite.');
    const yearProgress = ((progress % 1) + 1) % 1;
    const degrees = 20 - 25 * Math.cos(yearProgress * Math.PI * 2);
    const sunElevation = degrees * Math.PI / 180;
    // Retain the approved bearing atan2(x,z)=135°, varying elevation alone.
    const horizontal = Math.cos(sunElevation) * Math.SQRT1_2;
    const sunDirection: readonly [number, number, number] = Object.freeze([
        horizontal, Math.sin(sunElevation), -horizontal,
    ]);
    return Object.freeze({ yearProgress, sunElevation, sunDirection,
        solarScale: smoothstep(0, 18, degrees), darkness: 1 - smoothstep(-4, 12, degrees) });
}

/** Inputs are the existing composed seasonal/weather treatment, in linear RGB. */
export function northernLightState(progress: number, inputs: SeasonalLightInputs): SeasonalLightState {
    const profile = northernLightProfile(progress);
    return Object.freeze({ profile: 'northern-v1', yearProgress: profile.yearProgress,
        sunDirection: profile.sunDirection, sunElevation: profile.sunElevation,
        solarStrength: inputs.solarStrength * profile.solarScale,
        solarColor: Object.freeze([...inputs.solarColor]) as RGB,
        ambient: Object.freeze({
            skyColor: blend(inputs.skyColor, inputs.nightSkyColor, profile.darkness),
            groundColor: blend(inputs.groundColor, inputs.nightGroundColor, profile.darkness),
            strength: Math.max(.6, inputs.ambientStrength * (1 - .25 * profile.darkness)),
        }),
        darkness: profile.darkness });
}
