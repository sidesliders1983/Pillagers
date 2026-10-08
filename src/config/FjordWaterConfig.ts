export type WaterQuality = 'low' | 'standard' | 'legacy';
/** Published source controls; no authored water GLSL. Distances are world metres. */
export interface FjordWaterConfig {
 level: number; size: number; standardSegments: number; lowSegments: number;
 speed: number; normalStrength: number; shallowDepth: number; foamWidth: number;
 specularPower: number; specularIntensity: number; reflectionStrength: number; shoreGlow: number;
 opacity: number; deep: string; shallow: string; nightTint: number; quality: WaterQuality;
}
export const fjordWaterConfig: FjordWaterConfig = {
 level: -.12, size: 180, standardSegments: 180, lowSegments: 90,
 speed: .18, normalStrength: 3, shallowDepth: .53, foamWidth: .3,
 specularPower: 128, specularIntensity: .045, reflectionStrength: .08, shoreGlow: .015,
 opacity: .97, deep: '#355962', shallow: '#749c97', nightTint: .27, quality: 'standard',
};
