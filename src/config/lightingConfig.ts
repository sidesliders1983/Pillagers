import { worldConfig } from './worldConfig';
export type LightingMode='day'|'night';
export const lightingConfig={
    day:worldConfig.lighting,
    night:{sky:0x273c52,fogColor:0x324b62,fogNear:32,fogFar:108,
        ambientSky:0xa3b8d5,ambientGround:0x586773,ambient:.85,
        moon:0xc2d3e8,moonIntensity:1.15,moonPosition:[-24,42,-18] as const,
        shadowMapSize:1024,exposure:.95},
    fire:{color:0xffb467,intensity:28,radius:10,decay:2,height:1.15,
        flickerAmount:.055,flickerSpeed:2.2,emissive:0xff7626,emissiveIntensity:1.8,
        haloRadius:3.8,haloOpacity:.14},
    windows:{color:0xffc481,emissiveIntensity:2.4},
};
export function fireFlicker(time:number):number {
    const f=lightingConfig.fire;
    return 1+f.flickerAmount*(.65*Math.sin(time*f.flickerSpeed)+.35*Math.sin(time*f.flickerSpeed*1.71+.8));
}
