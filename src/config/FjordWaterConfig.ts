export type WaterQuality='low'|'standard'|'legacy';
export interface FjordWaterConfig {level:number;amplitude:number;wavelength:number;speed:number;foamWidth:number;foamIntensity:number;deep:string;shallow:string;foam:string;quality:WaterQuality}
export const fjordWaterConfig:FjordWaterConfig={level:-.12,amplitude:.025,wavelength:9,speed:.18,foamWidth:.45,foamIntensity:.18,deep:'#355962',shallow:'#749c97',foam:'#c7d4c3',quality:'standard'};
