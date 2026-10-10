import { Scene, PerspectiveCamera, GridHelper, AxesHelper, Clock, Mesh } from 'three';
import { AssetManager } from './AssetManager';
import { createRenderer } from './Renderer';
import { createWorld } from '../world/WorldFactory';
import { FjordsideControls } from '../ui/FjordsideControls';
import { Villager } from '../entities/Villager';
import { MovementSystem } from '../systems/MovementSystem';
import { MovementDebug } from '../ui/MovementDebug';
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
        const worldControls = new FjordsideControls();
        const meshy=new URLSearchParams(location.search).get('characters')!=='published';
        const population=new URLSearchParams(location.search).get('residents')==='40'?40:config.villagers;
        canvas.dataset.characterSource=meshy?'meshy':'published';canvas.dataset.instances=String(population);
        const renderer = createRenderer(canvas), scene = new Scene();
        const camera = new PerspectiveCamera(45, 1, .1, 400), controller = new RTSCameraController(camera, canvas);
        const assets = new AssetManager();
        await assets.load();
        const world = await createWorld(assets,{ ...worldControls.selection,
            anisotropy: renderer.capabilities.getMaxAnisotropy() }).catch(error => {
                document.querySelector<HTMLElement>('#debug')!.hidden = false;
                controller.dispose();
                assets.dispose();
                renderer.dispose();
                throw error;
            });
        worldControls.bind(() => world.exportSave(),async selection => {
            const proposal = await createWorld(assets,selection);
            const saved = proposal.exportSave();
            proposal.dispose();
            return saved;
        },quality => {
            world.setQuality(quality);
            lighting.setQuality(quality);
            renderer.setPixelRatio(Math.min(devicePixelRatio,quality === 'low' ? 1 : 1.5));
            canvas.dataset.world = JSON.stringify(world.describe());
        });
        const windControl = document.querySelector<HTMLInputElement>('#fjordside-wind-motion');
        if (windControl) windControl.disabled = world.describe().source !== 'ez-tree';
        canvas.dataset.world = JSON.stringify(world.describe());
        renderer.setPixelRatio(Math.min(devicePixelRatio,world.quality === 'low' ? 1 : 1.5));
        scene.add(world.root);
        const lighting=new WorldLighting(scene,renderer,assets,world.hearth,world.blueprint?world.center:undefined,world.quality);
        controller.setNavigationSurface(world.terrain,world.center,world.blueprint?.terrain.bounds,world.movement.heightAt);
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
        const movement = new MovementSystem(villagers,undefined,world.movement);
        const profiles=new CharacterProfileCard(camera,canvas,scene,characters);
        controller.setSelectionHandler((x,y)=>profiles.select(x,y));
        const helpers = new GridHelper(80, 20, 0x6d7874, 0xadb9a3);
        helpers.position.y = 1;
        helpers.visible = false;
        const axes = new AxesHelper(5);
        helpers.add(axes);
        scene.add(helpers);
        const movementDebug = new MovementDebug(movement);
        scene.add(movementDebug.root);
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
        document.querySelector('#helpers')!.addEventListener('change', event => {
            const visible = (event.target as HTMLInputElement).checked;
            helpers.visible = movementDebug.root.visible = visible;
        });
        document.querySelector('#status')!.textContent = `FJORDSIDE · ${villagers.length} inhabitants`;
        window.addEventListener('pagehide', () => {
            renderer.setAnimationLoop(null);
            for (const character of characters) character.model.dispose();
            profiles.dispose();
            seasons.dispose();
            controller.dispose();
            lighting.dispose();
            movementDebug.dispose();
            world.dispose();
            assets.dispose();
            renderer.dispose();
            window.removeEventListener('resize', resize);
        }, { once: true });
        const cycle=new AnnualCycle(performance.now());let replacements=0;
        let manuallyPaused = false,heldAt = 0,heldMs = 0;
        const cycleNow = () => performance.now()-heldMs;
        const pauseButton = document.querySelector<HTMLButtonElement>('#fjordside-pause');
        pauseButton?.addEventListener('click',() => {
            manuallyPaused = !manuallyPaused;
            if (manuallyPaused) heldAt = performance.now();
            else heldMs += performance.now()-heldAt;
            pauseButton.textContent = manuallyPaused ? 'Resume world' : 'Pause world';
        });
        for (const id of ['water','wind']) document.querySelector('#fjordside-'+id+'-motion')?.addEventListener('change',() => {
            world.setMotion({ water: (document.querySelector('#fjordside-water-motion') as HTMLInputElement).checked,
                wind: (document.querySelector('#fjordside-wind-motion') as HTMLInputElement).checked });
            canvas.dataset.world = JSON.stringify(world.describe());
        });
        const reviewCamera = document.querySelector<HTMLSelectElement>('#fjordside-camera');
        if (!world.describe().tent) for (const option of Array.from(reviewCamera?.options ?? [])) {
            if (option.value.startsWith('tent')) option.disabled = true;
        }
        document.querySelector('#fjordside-camera')?.addEventListener('change',event => {
            const view = (event.target as HTMLSelectElement).value;
            const state = world.describe();
            const site = state.site;
            const boat = state.water.boat;
            const boatView = (distance: number, height: number) => {
                const [x, y, z] = boat.position;
                const yaw = boat.heading;
                return { position: [x + distance*Math.cos(yaw)-distance*1.4*Math.sin(yaw),
                    y+height, z-distance*Math.sin(yaw)-distance*1.4*Math.cos(yaw)], target: [x,y+.35,z] };
            };
            const tentView = (interior: boolean) => {
                const tent = state.tent!;
                const distance = interior ? .65 : 3.5;
                const side = interior ? 0 : .4;
                const yaw = tent.rotation;
                return { position: [tent.x + distance*Math.sin(yaw) + side*Math.cos(yaw),
                    tent.y + (interior ? .6 : 1.25),
                    tent.z + distance*Math.cos(yaw) - side*Math.sin(yaw)],
                    target: [tent.x,tent.y + (interior ? .6 : .66),tent.z] };
            };
            if (view.startsWith('tent')) {
                if (state.tent) controller.setView(tentView(view === 'tent-interior'));
                return;
            }
            const poses = { village: { position: [site.x+34,15,site.z-20],target: [site.x,3,site.z+18] },
                shore: { position: [site.x+46,20,site.z-50],target: [site.x-25,7,site.z+20] },
                overlook: { position: [88,78,-78],target: [0,5,16] },
                boat: boatView(4,2.5), grazing: boatView(6,1.2) };
            controller.setView(poses[view as keyof typeof poses]);
        });
        const populationSnapshot=()=>{canvas.dataset.population=JSON.stringify(characters.map(c=>({
            id:c.villager.id,seed:c.dna.seed,age:c.dna.age,x:c.villager.visual.position.x,
            y:c.villager.visual.position.y,z:c.villager.visual.position.z,
            safe:world.movement.walkable(c.villager.visual.position.x,c.villager.visual.position.z),
            ground:world.movement.heightAt(c.villager.visual.position.x,c.villager.visual.position.z),
            speed:c.villager.speed,animation:c.model.state,
            screen:c.villager.visual.position.clone().addScaledVector(camera.up,c.phenotype.height/2).project(camera).toArray(),
        })));};
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
        };
        canvas.dataset.ready = 'true';
        document.querySelector('#fjordside-effects-scrub')?.addEventListener('click',() => {
            const input = document.querySelector<HTMLInputElement>('#fjordside-effects-time')!;
            const value = Number(input.value);
            if (!Number.isFinite(value) || value < 0 || value > 120) return;
            if (!manuallyPaused) {
                manuallyPaused = true;
                heldAt = performance.now();
                if (pauseButton) pauseButton.textContent = 'Resume world';
            }
            time = value;
        });
        const clock = new Clock();
        let time = 0, frames = 0, sample = 0;
        renderer.setAnimationLoop(() => {
            const elapsed = clock.getDelta(), dt = Math.min(elapsed, .05);
            if (!manuallyPaused) cycle.update(cycleNow(),annualTick);
            const paused = manuallyPaused;
            canvas.dataset.paused = String(paused);
            canvas.dataset.yearProgress=String(cycle.progress);
            document.querySelector('#world-year')!.textContent=`Year: ${cycle.year} DC`;
            if(!paused)time += dt;
            sample += elapsed;
            frames++;
            controller.update(dt);
            if(!paused)movement.update(dt);
            if (movementDebug.root.visible) movementDebug.update();
            lighting.update(time,cycle.progress);
            world.update(time,lighting,camera);
            seasons.update(lighting.visualization==='seasons'?cycle.progress:null);
            document.body.dataset.lighting=lighting.mode;
            characters.forEach(character=>{if(!paused){const state=character.villager.interactionState;if(character.model instanceof MeshyHuman&&(state==='talking'||state==='listening'))character.model.setAnimation(state==='talking'?'Talk':'Listen');else character.model.setMovementSpeed(character.villager.speed);}character.model.update(paused?0:dt,camera.position.distanceTo(character.villager.visual.position));});
            profiles.update();
            renderer.render(scene, camera);
            if (sample > .5) {
                populationSnapshot();
                canvas.dataset.fixture = JSON.stringify({ time,paused,year:cycle.year,progress:cycle.progress,
                    camera: { position:camera.position.toArray(),target:controller.focus.toArray(),fov:camera.fov },
                    lighting:lighting.mode,visualization:lighting.visualization,quality:world.quality,
                    pixelRatio:renderer.getPixelRatio(),world:world.describe() });
                canvas.dataset.metrics = JSON.stringify({ ms:sample/frames*1000,calls:renderer.info.render.calls,
                    triangles:renderer.info.render.triangles,geometries:renderer.info.memory.geometries,
                    textures:renderer.info.memory.textures,population:characters.length });
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
