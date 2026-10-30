// THROWAWAY #318: live values only; no campaign or browser preference persistence.
export const motionControls = {
    auroraBrightness: { label: 'Aurora brightness', min: 0, max: 3, step: .05, initial: 1.1 },
    auroraSpeed: { label: 'Aurora speed', min: 0, max: 4, step: .1, initial: 0.2 },
    auroraSway: { label: 'Aurora sway', min: 0, max: 3, step: .05, initial: 1.75 },
    cloudDrift: { label: 'Cloud drift', min: 0, max: 4, step: .1, initial: 0.1 },
    cloudCoverage: { label: 'Cloud coverage', min: 0, max: 1, step: .05, initial: 0.8 },
    waveStrength: { label: 'Wave strength', min: 0, max: 3, step: .05, initial: 2.5 },
    waveSpeed: { label: 'Wave speed', min: 0, max: 4, step: .1, initial: 1 },
    reflectionStrength: { label: 'Aurora reflection', min: 0, max: 3, step: .05, initial: 3 },
} as const;

export type MotionSettings = Record<keyof typeof motionControls, number>;
export type MotionControl = keyof MotionSettings;

export function defaultMotionSettings(): MotionSettings {
    return Object.fromEntries(Object.entries(motionControls)
        .map(([key, control]) => [key, control.initial])) as MotionSettings;
}
