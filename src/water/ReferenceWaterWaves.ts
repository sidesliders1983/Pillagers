/** Shared by the vertex shader and CPU queries; world distances are in metres. */
export const WATER_WAVE_TAU = 6.2831853;
export const WATER_WAVE_GRAVITY = 9.81;
export const WATER_WAVES = [
    { x: 0.94, z: 0.342, wavelength: 8.5, weight: 0.55 },
    { x: -0.48, z: 0.877, wavelength: 5.2, weight: 0.29 },
    { x: 0.32, z: -0.947, wavelength: 2.8, weight: 0.16 },
] as const;

export function sampleWaveHeight(
    x: number, z: number, time: number,
    amplitude: number, speed: number, gridSpacing: number,
): number {
    let height = 0;
    for (const wave of WATER_WAVES) {
        const frequency = WATER_WAVE_TAU / wave.wavelength;
        const phase = (x * wave.x + z * wave.z) * frequency
            - time * speed * Math.sqrt(WATER_WAVE_GRAVITY * frequency);
        const fraction = Math.max(0, Math.min(1,
            (wave.wavelength - gridSpacing * 2) / (gridSpacing * 2)));
        const resolved = fraction * fraction * (3 - 2 * fraction);
        height += Math.sin(phase) * amplitude * wave.weight * resolved;
    }
    return height;
}