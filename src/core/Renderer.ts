import { WebGLRenderer, SRGBColorSpace, ACESFilmicToneMapping } from 'three';
import { worldConfig } from '../config/worldConfig';
import { rendererQuality } from '../config/PresentationQuality';

export function createRenderer(canvas: HTMLCanvasElement) {
    const renderer = new WebGLRenderer({ canvas, antialias: rendererQuality.antialias });
    renderer.setPixelRatio(Math.min(devicePixelRatio, rendererQuality.maximumPixelRatio));
    renderer.shadowMap.enabled = rendererQuality.shadowsEnabled;
    renderer.shadowMap.type = rendererQuality.shadowType;
    renderer.outputColorSpace = SRGBColorSpace;
    renderer.toneMapping = ACESFilmicToneMapping;
    renderer.toneMappingExposure = worldConfig.lighting.exposure;
    return renderer;
}
