/** Native material study delivery. Source physical scale is preserved inside each periodic atlas. */
export const groundBlendConfig = { periodMeters: 24, standardPixels: 1024, lowPixels: 512 } as const;
export type GroundBlending = 'baseline' | 'zoned';
export type RockTone = 'source' | 'cool-grey';
