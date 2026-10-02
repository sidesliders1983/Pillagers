import { Scene, PerspectiveCamera, GridHelper, AxesHelper, Clock, Mesh } from 'three';
import { AssetManager } from './AssetManager';
import { createRenderer } from './Renderer';
import { World } from '../world/World';
import { Villager } from '../entities/Villager';
import { MovementSystem } from '../systems/MovementSystem';
import { RTSCameraController } from '../camera/RTSCameraController';
import { worldConfig as config } from '../config/worldConfig';
import { generateCharacterDNA } from '../characters/generateCharacterDNA';
import { generatePhenotype } from '../characters/generatePhenotype';
import { characterFactory } from '../characters/CharacterFactory';
import { universalHumanProfile } from '../characters/UniversalHumanProfile';
import { CharacterProfileCard } from '../ui/CharacterProfileCard';
import { setupWorldHUD } from '../ui/WorldHUD';
import { WorldLighting } from './WorldLighting';
import { AnnualCycle, agePersona } from '../systems/AnnualCycle';
import { TimeVisualization, seasonBlend } from '../config/timeVisualization';
import { SeasonTint } from '../world/SeasonTint';
export class Game {
    async start(canvas: HTMLCanvasElement) {
        setupWorldHUD();
        const renderer = createRenderer(canvas), scene = new Scene();
        const camera = new PerspectiveCamera(45, 1, .1, 240), controller = new RTSCameraController(camera, canvas);
        const assets = new AssetManager();
        await assets.load();
        const world = new World(assets);
        scene.add(world.root);
        const lighting=new WorldLighting(scene,renderer,assets);
        controller.setNavigationSurface(world.terrain);
        const seasons=new SeasonTint(world.root,world.terrain);
        const characters=await Promise.all(Array.from({length:config.villagers},async (_,i)=>{
            const dna=generateCharacterDNA((config.seed+Math.imul(i+1,2654435761))>>>0);
            const phenotype=generatePhenotype(dna),model=await characterFactory.createWorld(dna);
            const profile=universalHumanProfile(dna);phenotype.height=profile.height*(1-.35*profile.weights.Child);
            return {dna,phenotype,model,villager:new Villager(i,model.root)};
        }));
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
        document.querySelector('#fog')!.addEventListener('change', e => lighting.setFog((e.target as HTMLInputElement).checked));
        const syncVisualization=()=>{
            for(const option of ['off','day-night','seasons'])document.querySelector(`#time-${option}`)!.setAttribute('aria-pressed',String(lighting.visualization===option));
        };
        for(const mode of ['off','day-night','seasons'] as TimeVisualization[])document.querySelector(`#time-${mode}`)!.addEventListener('click',()=>{lighting.setVisualization(mode);syncVisualization();});
        for(const mode of ['day','night'] as const)document.querySelector(`#lighting-${mode}`)!.addEventListener('click',()=>{
            lighting.setMode(mode);syncVisualization();seasons.update(null);
            document.body.dataset.lighting=mode;
            for(const option of ['day','night'])document.querySelector(`#lighting-${option}`)!.setAttribute('aria-pressed',String(option===mode));
        });
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
        window.addEventListener('pagehide',()=>{renderer.setAnimationLoop(null);for(const character of characters)character.model.dispose();profiles.dispose();seasons.dispose();renderer.dispose();},{once:true});
        const cycle=new AnnualCycle(performance.now());let replacements=0;
        const populationSnapshot=()=>{canvas.dataset.population=JSON.stringify(characters.map(c=>({seed:c.dna.seed,age:c.dna.age,x:c.villager.visual.position.x,z:c.villager.visual.position.z})));};
        populationSnapshot();
        const annualTick=(year:number)=>{
            for(const [index,character] of characters.entries()){
                const result=agePersona(character.dna,year,index);
                if(result.replaced){
                    const previous=character.villager.visual;
                    const model=characterFactory.createWorldReady(result.dna),villager=new Villager(index,model.root);
                    scene.remove(previous);character.model.dispose();
                    Object.assign(character,{dna:result.dna,model,villager});villagers[index]=villager;
                    movement.spawn(villager);scene.add(villager.visual);replacements++;
                    character.phenotype=generatePhenotype(result.dna);
                    const profile=universalHumanProfile(result.dna);character.phenotype.height=profile.height*(1-.35*profile.weights.Child);
                    profiles.replace(previous,character);
                }else{
                    character.model.applyDNA(result.dna);character.dna=result.dna;
                    character.phenotype=generatePhenotype(result.dna);
                    const profile=universalHumanProfile(result.dna);character.phenotype.height=profile.height*(1-.35*profile.weights.Child);
                    profiles.refresh(character);
                }
            }
            populationSnapshot();
        };
        const clock = new Clock();
        let time = 0, frames = 0, sample = 0;
        renderer.setAnimationLoop(() => {
            const elapsed = clock.getDelta(), dt = Math.min(elapsed, .05);
            cycle.update(performance.now(),annualTick);
            canvas.dataset.yearProgress=String(cycle.progress);
            document.querySelector('#world-year')!.textContent=`Year: ${cycle.year} DC`;
            time += dt;
            sample += elapsed;
            frames++;
            controller.update(dt);
            movement.update(dt);
            world.update(time);
            lighting.update(time,cycle.progress);
            seasons.update(lighting.visualization==='seasons'?cycle.progress:null);
            document.body.dataset.lighting=lighting.mode;
            characters.forEach(character=>{character.model.setMovementSpeed(character.villager.speed);character.model.update(dt,camera.position.distanceTo(character.villager.visual.position));});
            profiles.update();
            renderer.render(scene, camera);
            if (sample > .5) {
                for(const option of ['day','night'])document.querySelector(`#lighting-${option}`)!.setAttribute('aria-pressed',String(lighting.visualization==='off'&&lighting.mode===option));
                document.querySelector('#world-fps')!.textContent=`FPS: ${Math.round(frames/sample)}`;
                document.querySelector('#metrics')!.textContent = `${Math.round(frames / sample)} FPS\n${renderer.info.render.calls} draw calls\n${renderer.info.render.triangles.toLocaleString()} triangles\n${villagers.length} inhabitants\nYear ${cycle.year} DC · ${(cycle.progress*60).toFixed(1)} / 60s\nVisualization ${lighting.visualization}${lighting.visualization==='seasons'?` · ${seasonBlend(cycle.progress).from.name}`:''}\nRespawns ${replacements}\nAges ${characters.map(c=>c.dna.age).join(', ')}\nRigged humans: ${characters.filter(c=>c.model.lod===1).length} LOD1 / ${characters.filter(c=>c.model.lod===2).length} LOD2\nStates: ${characters.map(c=>`${c.dna.seed}:${c.model.state}`).join(', ')}\nCamera ${camera.position.x.toFixed(1)}, ${camera.position.y.toFixed(1)}, ${camera.position.z.toFixed(1)}\nCenter ${controller.focus.x.toFixed(1)}, ${controller.focus.y.toFixed(1)}, ${controller.focus.z.toFixed(1)}\nLighting ${lighting.mode} · ${lighting.mode==='night'?2:1} direct lights\n${renderer.shadowMap.enabled?1:0} shadow source · ${lighting.directional.shadow.mapSize.x}px\n${assets.windowMaterials.length} emissive window materials`;
                sample = 0;
                frames = 0;
            }
        });
    }
}
