import { Scene, Color, Fog, PerspectiveCamera, HemisphereLight, DirectionalLight, GridHelper, AxesHelper, Clock, Mesh } from 'three';
import { AssetManager } from './AssetManager';
import { createRenderer } from './Renderer';
import { World } from '../world/World';
import { Villager } from '../entities/Villager';
import { MovementSystem } from '../systems/MovementSystem';
import { RTSCameraController } from '../camera/RTSCameraController';
import { worldConfig as config } from '../config/worldConfig';
import { generateCharacterDNA } from '../characters/generateCharacterDNA';
import { generatePhenotype } from '../characters/generatePhenotype';
import { Mannequin } from '../character-lab/Mannequin';
import { CharacterProfileCard } from '../ui/CharacterProfileCard';
import { setupWorldHUD } from '../ui/WorldHUD';
export class Game {
    async start(canvas: HTMLCanvasElement) {
        setupWorldHUD();
        const renderer = createRenderer(canvas), scene = new Scene();
        scene.background = new Color(config.lighting.sky);
        const fog = new Fog(config.lighting.sky, config.lighting.fogNear, config.lighting.fogFar);
        scene.fog = fog;
        const camera = new PerspectiveCamera(45, 1, .1, 240), controller = new RTSCameraController(camera, canvas);
        scene.add(new HemisphereLight(config.lighting.ambientSky, config.lighting.ambientGround, config.lighting.ambient));
        const sun = new DirectionalLight(config.lighting.sun, config.lighting.sunIntensity);
        sun.position.set(...config.lighting.sunPosition);
        sun.castShadow = true;
        sun.shadow.mapSize.set(config.lighting.shadowMapSize, config.lighting.shadowMapSize);
        Object.assign(sun.shadow.camera, { left: -50, right: 50, top: 50, bottom: -50, near: 1, far: 110 });
        sun.shadow.radius = config.lighting.shadowRadius;
        sun.shadow.blurSamples = config.lighting.shadowBlurSamples;
        sun.shadow.normalBias = config.lighting.shadowNormalBias;
        scene.add(sun);
        const assets = new AssetManager();
        await assets.load();
        const world = new World(assets);
        scene.add(world.root);
        controller.setNavigationSurface(world.terrain);
        const characters=Array.from({length:config.villagers},(_,i)=>{
            const dna=generateCharacterDNA((config.seed+Math.imul(i+1,2654435761))>>>0);
            const phenotype=generatePhenotype(dna),model=new Mannequin(phenotype);
            return {dna,phenotype,model,villager:new Villager(i,model.root)};
        });
        const villagers = characters.map(character=>character.villager);
        villagers.forEach(v => scene.add(v.visual));
        const movement = new MovementSystem(villagers);
        const profiles=new CharacterProfileCard(camera,canvas,scene,characters);
        controller.setSelectionHandler((x,y)=>profiles.select(x,y));
        const helpers = new GridHelper(80, 20, 0x6d7874, 0xadb9a3);
        helpers.position.y = 1;
        helpers.visible = false;
        const axes = new AxesHelper(5);
        helpers.add(axes);
        scene.add(helpers);
        const resize = () => { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); };
        window.addEventListener('resize', resize);
        resize();
        document.querySelector('#home')!.addEventListener('click', () => controller.home());
        const debug = document.querySelector<HTMLElement>('#debug')!;
        document.querySelector('#debug-toggle')!.addEventListener('click', () => debug.hidden = !debug.hidden);
        document.querySelector('#fog')!.addEventListener('change', e => scene.fog = (e.target as HTMLInputElement).checked ? fog : null);
        document.querySelector('#shadows')!.addEventListener('change', e => {
            renderer.shadowMap.enabled = (e.target as HTMLInputElement).checked;
            renderer.shadowMap.needsUpdate = true;
            scene.traverse(node => {
                if (node instanceof Mesh)
                    for (const material of Array.isArray(node.material) ? node.material : [node.material])
                        material.needsUpdate = true;
            });
        });
        document.querySelector('#helpers')!.addEventListener('change', e => helpers.visible = (e.target as HTMLInputElement).checked);
        document.querySelector('#status')!.textContent = `FJORDSIDE · ${villagers.length} inhabitants`;
        const clock = new Clock();
        let time = 0, frames = 0, sample = 0;
        renderer.setAnimationLoop(() => {
            const elapsed = clock.getDelta(), dt = Math.min(elapsed, .05);
            time += dt;
            sample += elapsed;
            frames++;
            controller.update(dt);
            movement.update(dt);
            world.update(time);
            characters.forEach(character=>character.model.update(time+character.villager.id));
            profiles.update();
            renderer.render(scene, camera);
            if (sample > .5) {
                document.querySelector('#metrics')!.textContent = `${Math.round(frames / sample)} FPS\n${renderer.info.render.calls} draw calls\n${renderer.info.render.triangles.toLocaleString()} triangles\n${villagers.length} inhabitants\nCamera ${camera.position.x.toFixed(1)}, ${camera.position.y.toFixed(1)}, ${camera.position.z.toFixed(1)}\nCenter ${controller.focus.x.toFixed(1)}, ${controller.focus.y.toFixed(1)}, ${controller.focus.z.toFixed(1)}`;
                sample = 0;
                frames = 0;
            }
        });
    }
}
