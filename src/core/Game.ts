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
import { meshyHumanFactory, MeshyHuman } from '../characters/MeshyHuman';
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
        const meshy=new URLSearchParams(location.search).get('characters')!=='published';
        const population=new URLSearchParams(location.search).get('residents')==='40'?40:config.villagers;
        canvas.dataset.characterSource=meshy?'meshy':'published';canvas.dataset.instances=String(population);
        const renderer = createRenderer(canvas), scene = new Scene();
        const camera = new PerspectiveCamera(45, 1, .1, 240), controller = new RTSCameraController(camera, canvas);
        const assets = new AssetManager();
        await assets.load();
        const world = new World(assets);
        scene.add(world.root);
        const lighting=new WorldLighting(scene,renderer,assets);
        controller.setNavigationSurface(world.terrain);
        const seasons=new SeasonTint(world.root,world.terrain);
        const characters=await Promise.all(Array.from({length:population},async (_,i)=>{
            const dna=generateCharacterDNA((config.seed+Math.imul(i+1,2654435761))>>>0);
            const phenotype=generatePhenotype(dna),model=await (meshy?meshyHumanFactory.createWorld(dna):characterFactory.createWorld(dna));
            const profile=universalHumanProfile(dna);phenotype.height=profile.height*(1-.35*profile.weights.Child);
            return {dna,phenotype,model,villager:new Villager(i,model.root)};
        }));
        characters.forEach(c=>c.villager.socialEnabled=c.model instanceof MeshyHuman);
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
        const summary=document.createElement('dialog');summary.id='year-summary';summary.setAttribute('aria-labelledby','year-summary-title');
        summary.innerHTML='<h2 id="year-summary-title"></h2><p id="year-summary-count"></p><p id="year-summary-age"></p><button id="year-continue">Continue</button>';
        document.body.append(summary);summary.addEventListener('cancel',event=>event.preventDefault());
        summary.querySelector('button')!.addEventListener('click',()=>{summary.close();cycle.resume(performance.now());});
        const populationSnapshot=()=>{canvas.dataset.population=JSON.stringify(characters.map(c=>({seed:c.dna.seed,age:c.dna.age,x:c.villager.visual.position.x,z:c.villager.visual.position.z})));};
        populationSnapshot();
        const annualTick=(year:number)=>{
            for(const [index,character] of characters.entries()){
                const result=agePersona(character.dna,year,index);
                if(result.replaced){
                    const previous=character.villager.visual;
                    // Retire the persona, retaining the slot's GPU geometry and rig.
                    const model=character.model;model.applyDNA(result.dna);
                    const villager=new Villager(index,model.root);villager.socialEnabled=model instanceof MeshyHuman;
                    scene.remove(previous);
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
            cycle.pause();
            summary.querySelector('h2')!.textContent=`Year ${year-1} complete`;
            summary.querySelector('#year-summary-count')!.textContent=`Community: ${characters.length} persons`;
            const average=characters.reduce((sum,c)=>sum+c.dna.age,0)/characters.length;
            summary.querySelector('#year-summary-age')!.textContent=`Average age: ${average.toFixed(1)} years`;
            summary.showModal();
        };
        const clock = new Clock();
        let time = 0, frames = 0, sample = 0;
        renderer.setAnimationLoop(() => {
            const elapsed = clock.getDelta(), dt = Math.min(elapsed, .05);
            cycle.update(performance.now(),annualTick);
            canvas.dataset.yearProgress=String(cycle.progress);
            document.querySelector('#world-year')!.textContent=`Year: ${cycle.year} DC`;
            if(!cycle.paused)time += dt;
            sample += elapsed;
            frames++;
            controller.update(dt);
            if(!cycle.paused)movement.update(dt);
            world.update(time);
            lighting.update(time,cycle.progress);
            seasons.update(lighting.visualization==='seasons'?cycle.progress:null);
            document.body.dataset.lighting=lighting.mode;
            characters.forEach(character=>{if(!cycle.paused){const state=character.villager.interactionState;if(character.model instanceof MeshyHuman&&(state==='talking'||state==='listening'))character.model.setAnimation(state==='talking'?'Talk':'Listen');else character.model.setMovementSpeed(character.villager.speed);}character.model.update(cycle.paused?0:dt,camera.position.distanceTo(character.villager.visual.position));});
            profiles.update();
            renderer.render(scene, camera);
            if (sample > .5) {
                canvas.dataset.interactions=JSON.stringify(movement.snapshot());
                for(const option of ['day','night'])document.querySelector(`#lighting-${option}`)!.setAttribute('aria-pressed',String(lighting.visualization==='off'&&lighting.mode===option));
                document.querySelector('#world-fps')!.textContent=`FPS: ${Math.round(frames/sample)}`;
                document.querySelector('#metrics')!.textContent = `${Math.round(frames / sample)} FPS\n${renderer.info.render.calls} draw calls\n${renderer.info.render.triangles.toLocaleString()} triangles\n${villagers.length} inhabitants\nYear ${cycle.year} DC · ${(cycle.progress*60).toFixed(1)} / 60s\nVisualization ${lighting.visualization}${lighting.visualization==='seasons'?` · ${seasonBlend(cycle.progress).from.name}`:''}\nRespawns ${replacements}\nAges ${characters.map(c=>c.dna.age).join(', ')}\nRigged humans: ${characters.filter(c=>c.model.lod===1).length} LOD1 / ${characters.filter(c=>c.model.lod===2).length} LOD2\nSocial: ${movement.snapshot().map(u=>`${u.id}:${u.state}${u.partnerId===null?'':'→'+u.partnerId}${u.cooldown>0?' ('+u.cooldown.toFixed(1)+'s)':''}`).join(', ')}\nStates: ${characters.map(c=>`${c.dna.seed}:${c.model.state}`).join(', ')}\nCamera ${camera.position.x.toFixed(1)}, ${camera.position.y.toFixed(1)}, ${camera.position.z.toFixed(1)}\nCenter ${controller.focus.x.toFixed(1)}, ${controller.focus.y.toFixed(1)}, ${controller.focus.z.toFixed(1)}\nLighting ${lighting.mode} · ${lighting.mode==='night'?2:1} direct lights\n${renderer.shadowMap.enabled?1:0} shadow source · ${lighting.directional.shadow.mapSize.x}px\n${assets.windowMaterials.length} emissive window materials`;
                sample = 0;
                frames = 0;
            }
        });
    }
}
