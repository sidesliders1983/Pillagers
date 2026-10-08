import './asset-lab.css';
import {Box3, Group, Scene, Color, PerspectiveCamera, HemisphereLight, DirectionalLight, Mesh, Vector3} from 'three';
import {meshyHumanFactory} from '../characters/MeshyHuman';
import {generateCharacterDNA} from '../characters/generateCharacterDNA';
import {createRenderer} from '../core/Renderer';
import {worldConfig} from '../config/worldConfig';

interface Asset {label:string;file:string;triangles:number;vertices:number;bytes:number;textureSize?:number}
interface Manifest {name:string;height:number;assets:Asset[]}
type Distance='lab'|'near'|'game'|'rts';

export class AssetLab {
    private distance:Distance='lab';
    private angle=0;
    private previews:{camera:PerspectiveCamera;scene:Scene;renderer:ReturnType<typeof createRenderer>;root:Group;metric:HTMLElement;loadMs:number;frames:number;elapsed:number;last:number;label:string}[]=[];
    private manifest!:Manifest;
    async start(){
        document.title='Asset Lab · Pillagers';document.body.className='asset-lab';
        document.body.innerHTML=`<main><header><div><a href="/character-lab">← Character Lab</a><h1>Asset optimization lab</h1><p>Same scale, lighting and camera for every LOD.</p></div><nav aria-label="Comparison controls"><label>Distance <select id="asset-distance"><option value="lab">Close inspection</option><option value="near">Gameplay · zoom 15</option><option value="game">Gameplay · zoom 40</option><option value="rts">RTS · zoom 65</option></select></label><label>Angle <select id="asset-angle"><option value="0">Front</option><option value="90">Side</option><option value="180">Back</option><option value="45">Three-quarter</option></select></label></nav></header><p id="asset-status" role="status">Loading benchmark…</p><section id="asset-grid" aria-label="LOD comparison"></section><footer>Gameplay views retain the pixel scale of the full-window world camera. Frame times include this comparison page and depend on this device. Load times include network and decoding. Meshy Human · 10 animated characters per LOD.</footer></main>`;
        document.querySelector('#asset-distance')!.addEventListener('change',event=>{this.distance=(event.target as HTMLSelectElement).value as Distance;this.layout();});
        document.querySelector('#asset-angle')!.addEventListener('change',event=>{this.angle=Number((event.target as HTMLSelectElement).value)*Math.PI/180;this.layout();});
        try{
            const response=await fetch('/game-assets/human/manifest.json');
            if(!response.ok)throw new Error('Benchmark files are unavailable. Run npm run assets:publish after optimization.');
            const prepared=await response.json();
            this.manifest={name:'Meshy Human',height:1.5,assets:prepared.lods.map((lod:{level:number;file:string;triangles:number;bytes:number})=>({label:'LOD'+lod.level,file:lod.file,triangles:lod.triangles,vertices:0,bytes:lod.bytes}))};
            if(!this.manifest.assets?.length||!Number.isFinite(this.manifest.height)||this.manifest.height<=0)throw new Error('Invalid benchmark manifest');
            for(const asset of this.manifest.assets)await this.load(asset);
            this.layout();
            document.querySelector('#asset-status')!.textContent=`${this.manifest.name} · ${this.previews.length} versions · display height ${this.manifest.height} m · 10 characters per version · geometry statistics are per character`;
        }catch(error){document.querySelector('#asset-status')!.textContent=(error as Error).message;}
    }
    private async load(asset:Asset){
        if(!/^[\w.-]+\.glb$/.test(asset.file))throw new Error('Invalid local asset filename');
        const card=document.createElement('article');card.className='asset-card';
        const heading=document.createElement('h2');heading.textContent=asset.label;
        const stats=document.createElement('p');stats.textContent=`${asset.triangles.toLocaleString()} tris · ${(asset.bytes/1048576).toFixed(2)} MiB${asset.textureSize?` · ${asset.textureSize}px albedo`:''}`;
        const canvas=document.createElement('canvas');canvas.setAttribute('aria-label',`${asset.label} character preview`);
        const metric=document.createElement('p');metric.className='asset-metric';metric.textContent='Loading…';
        card.append(heading,stats,canvas,metric);document.querySelector('#asset-grid')!.append(card);
        const start=performance.now(),level=Number(asset.file.match(/LOD(\d)/)?.[1]??0);
        const models=await Promise.all(Array.from({length:10},(_,i)=>meshyHumanFactory.create(generateCharacterDNA(1983+i),level)));
        const root=new Group();models.forEach((model,i)=>{model.root.position.set((i%5-2)*1.5,0,Math.floor(i/5)*1.8);root.add(model.root);});
        canvas.dataset.instances='10';canvas.dataset.characterSource='meshy';
        const gltf={scene:root};
        // One transform from the source, shared by all LODs. Do not fit each LOD independently.
        if(!this.previews.length){const box=new Box3().setFromObject(root),size=box.getSize(new Vector3()),center=box.getCenter(new Vector3());root.userData.sharedScale=this.manifest.height/size.y;root.userData.sharedOffset=[-center.x,-box.min.y,-center.z];root.userData.sharedWidth=Math.hypot(size.x,size.z)*root.userData.sharedScale;}
        const reference=this.previews[0]?.root??root;
        root.userData.sharedScale=reference.userData.sharedScale;root.userData.sharedOffset=reference.userData.sharedOffset;root.userData.sharedWidth=reference.userData.sharedWidth;
        root.position.fromArray(root.userData.sharedOffset);root.scale.setScalar(root.userData.sharedScale);
        gltf.scene.traverse(object=>{if(object instanceof Mesh){object.castShadow=false;object.receiveShadow=false;}});
        const scene=new Scene();scene.background=new Color(worldConfig.lighting.sky);scene.add(root);
        const light=worldConfig.lighting;
        scene.add(new HemisphereLight(light.ambientSky,light.ambientGround,light.ambient));
        const sun=new DirectionalLight(light.sun,light.sunIntensity);sun.position.set(...light.sunPosition);scene.add(sun);
        const renderer=createRenderer(canvas);renderer.shadowMap.enabled=false;renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));
        const camera=new PerspectiveCamera(45,1,.05,240);
        const preview={camera,scene,renderer,root,metric,loadMs:performance.now()-start,frames:0,elapsed:0,last:performance.now(),label:asset.label};
        this.previews.push(preview);
        new ResizeObserver(()=>{const rect=canvas.getBoundingClientRect();renderer.setSize(rect.width,rect.height,false);camera.aspect=rect.width/Math.max(1,rect.height);camera.updateProjectionMatrix();this.layout();}).observe(canvas);
        renderer.setAnimationLoop(()=>{
            const now=performance.now(),delta=now-preview.last;preview.last=now;preview.elapsed+=delta;preview.frames++;
            models.forEach(model=>model.update(Math.min(delta/1000,.05)));renderer.render(scene,camera);
            if(preview.elapsed>=1000){
                const pixels=this.manifest.height/(2*Math.tan(camera.fov*Math.PI/360)*camera.position.distanceTo(new Vector3(0,this.manifest.height*.5,0)))*canvas.clientHeight;
                metric.textContent=`${(preview.elapsed/preview.frames).toFixed(1)} ms/frame · ${renderer.info.render.calls} draw calls · ${renderer.info.render.triangles.toLocaleString()} rendered tris · ~${Math.round(pixels)}px tall · load ${Math.round(preview.loadMs)} ms`;
                preview.frames=preview.elapsed=0;
            }
        });
    }
    private layout(){
        for(const {camera,root,renderer} of this.previews){
            // Crop the world camera into each card while retaining the same CSS-pixel
            // character height as a full-window gameplay canvas.
            camera.fov=this.distance==='lab'?45:2*Math.atan(Math.tan(Math.PI/8)*renderer.domElement.clientHeight/innerHeight)*180/Math.PI;
            const fit=root.userData.sharedWidth/(2*Math.tan(camera.fov*Math.PI/360)*camera.aspect)*1.1;
            const zoom=this.distance==='lab'?Math.max(3.8,fit):(this.distance==='near'?worldConfig.camera.minZoom:this.distance==='game'?worldConfig.camera.initialZoom:worldConfig.camera.maxZoom)*Math.hypot(.8,.7);
            const elevation=this.distance==='lab'?.15:Math.atan2(.8,.7);
            const horizontal=zoom*Math.cos(elevation),vertical=zoom*Math.sin(elevation);
            camera.position.set(Math.sin(this.angle)*horizontal,this.manifest.height*.5+vertical,-Math.cos(this.angle)*horizontal);
            camera.lookAt(0,this.manifest.height*.5,0);camera.updateProjectionMatrix();
        }
    }
}
