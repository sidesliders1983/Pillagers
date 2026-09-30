import { WebGLRenderer, PCFShadowMap, SRGBColorSpace, ACESFilmicToneMapping } from 'three';
import { worldConfig } from '../config/worldConfig';
export function createRenderer(canvas: HTMLCanvasElement) { const renderer = new WebGLRenderer({ canvas, antialias: true }); renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.shadowMap.enabled = true; renderer.shadowMap.type = PCFShadowMap; renderer.outputColorSpace = SRGBColorSpace; renderer.toneMapping = ACESFilmicToneMapping; renderer.toneMappingExposure = worldConfig.lighting.exposure; return renderer; }
