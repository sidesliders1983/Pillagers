import {PerspectiveCamera,Vector2,Vector3,MathUtils,Object3D,Raycaster,Plane} from 'three';
import {worldConfig} from '../config/worldConfig';
import {TouchGestures} from './TouchGestures';
const initialElevation=Math.atan2(.8,.7),orbitScale=Math.hypot(.8,.7);
export class RTSCameraController {
    readonly focus=new Vector3(0,0,16);
    private desired=new Vector3(0,0,16);
    private distance=worldConfig.camera.initialZoom;
    private zoom=worldConfig.camera.initialZoom;
    private angle=.45;private yaw=.45;
    private elevation=initialElevation;private targetElevation=initialElevation;
    private keys=new Set<string>();private drag=false;private rotateDrag=false;
    private surface:Object3D|null=null;
    private readonly listeners = new AbortController();
    private homeFocus = new Vector3(0,0,16);
    private bounds = { minX:-worldConfig.camera.bounds,maxX:worldConfig.camera.bounds,
        minZ:-20,maxZ:worldConfig.camera.bounds };
    private height: ((x:number,z:number)=>number) | undefined;
    private ray=new Raycaster();private pointer=new Vector2();
    private fallback=new Plane(new Vector3(0,1,0),0);private hit=new Vector3();
    private minimumZoom = worldConfig.camera.minZoom;
    private touch:TouchGestures;
    private select:((x:number,y:number)=>boolean)|null=null;
    private mouseStart:{x:number;y:number;distance:number}|null=null;
    constructor(readonly camera:PerspectiveCamera,private canvas:HTMLCanvasElement){
        const settings=worldConfig.camera.touch;
        this.touch=new TouchGestures({
            navigate:(x,y)=>this.navigate(x,y),
            rotate:(dx,dy)=>{this.yaw-=dx*settings.rotationSensitivity;this.targetElevation=MathUtils.clamp(this.targetElevation+dy*settings.elevationSensitivity,settings.minElevation,settings.maxElevation);},
            zoom:ratio=>this.setZoom(this.zoom/ratio),
        },settings.tapThreshold);
        this.listen(window,'keydown',e=>{
            if(e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.target instanceof HTMLTextAreaElement)return;
            if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key))e.preventDefault();
            this.keys.add(e.key.toLowerCase());
        });
        this.listen(window,'keyup',e=>this.keys.delete(e.key.toLowerCase()));
        this.listen(window,'blur',()=>{this.keys.clear();this.drag=false;this.rotateDrag=false;this.mouseStart=null;this.touch.reset();});
        this.listen(canvas,'wheel',e=>{e.preventDefault();this.setZoom(this.zoom+e.deltaY*.025);},{passive:false});
        this.listen(canvas,'pointerdown',e=>{
            canvas.setPointerCapture(e.pointerId);
            if(e.pointerType==='touch'){e.preventDefault();this.touch.down(e.pointerId,e.clientX,e.clientY);}
            else if(e.button===2){e.preventDefault();this.rotateDrag=true;this.drag=false;this.mouseStart=null;}
            else if(e.button===0){this.rotateDrag=false;this.drag=true;this.mouseStart={x:e.clientX,y:e.clientY,distance:0};}
        });
        this.listen(canvas,'pointermove',e=>{
            if(e.pointerType==='touch'){e.preventDefault();this.touch.move(e.pointerId,e.clientX,e.clientY);}
            else if(this.rotateDrag){e.preventDefault();this.yaw-=e.movementX*settings.rotationSensitivity;this.targetElevation=MathUtils.clamp(this.targetElevation+e.movementY*settings.elevationSensitivity,settings.minElevation,settings.maxElevation);}
            else if(this.drag){if(this.mouseStart)this.mouseStart.distance=Math.max(this.mouseStart.distance,Math.hypot(e.clientX-this.mouseStart.x,e.clientY-this.mouseStart.y));this.pan(-e.movementX*this.distance*.0015,-e.movementY*this.distance*.0015);}
        });
        const release=(e:PointerEvent,cancelled:boolean)=>{
            if(e.pointerType==='touch'){
                if(!cancelled)this.touch.move(e.pointerId,e.clientX,e.clientY);
                this.touch.up(e.pointerId,cancelled);
            }
            else {if(!cancelled&&this.mouseStart&&this.mouseStart.distance<settings.tapThreshold)this.select?.(e.clientX,e.clientY);this.mouseStart=null;this.drag=false;this.rotateDrag=false;}
        };
        this.listen(canvas,'pointerup',e=>release(e,false));
        this.listen(canvas,'pointercancel',e=>release(e,true));
        this.listen(canvas,'lostpointercapture',e=>release(e,true));
        this.listen(canvas,'contextmenu',e=>e.preventDefault());
        this.update(1);
    }
    private listen<K extends keyof WindowEventMap>(target: Window | HTMLCanvasElement,
        type: K,handler: (event: WindowEventMap[K])=>void,options: AddEventListenerOptions = {}) {
        target.addEventListener(type,handler as EventListener,{ ...options,signal:this.listeners.signal });
    }
    dispose() { this.listeners.abort();this.touch.reset();this.keys.clear(); }
    setNavigationSurface(surface:Object3D,center = this.homeFocus,
        bounds?:typeof this.bounds,height?:typeof this.height) {
        this.surface=surface;
        this.homeFocus.copy(center);
        this.height=height;
        if(bounds)this.bounds={...bounds};
        this.home();
        this.focus.copy(this.desired);
    }
    setView(pose:{position:number[];target:number[]}) {
        const position=new Vector3().fromArray(pose.position);
        this.focus.fromArray(pose.target);
        this.desired.copy(this.focus);
        const offset=position.sub(this.focus);
        this.distance=this.zoom=offset.length()/orbitScale;
        // Close review poses need a matching zoom floor; preserve the normal RTS floor at Home.
        this.minimumZoom=Math.min(worldConfig.camera.minZoom,this.zoom/2);
        this.angle=this.yaw=Math.atan2(offset.x,offset.z);
        this.elevation=this.targetElevation=Math.atan2(offset.y,Math.hypot(offset.x,offset.z));
        this.update(0);
    }
    setSelectionHandler(select:(x:number,y:number)=>boolean){this.select=select;}
    home(){this.minimumZoom=worldConfig.camera.minZoom;this.desired.copy(this.homeFocus);this.zoom=worldConfig.camera.initialZoom;this.yaw=.45;this.targetElevation=initialElevation;}
    private setZoom(value:number){this.zoom=MathUtils.clamp(value,this.minimumZoom,worldConfig.camera.maxZoom);}
    private navigate(x:number,y:number){
        if(this.select?.(x,y))return;
        const rect=this.canvas.getBoundingClientRect();
        this.pointer.set((x-rect.left)/rect.width*2-1,-(y-rect.top)/rect.height*2+1);
        this.camera.updateMatrixWorld();this.ray.setFromCamera(this.pointer,this.camera);
        const intersection=this.surface?this.ray.intersectObject(this.surface,false)[0]:undefined;
        const point=intersection?.point??this.ray.ray.intersectPlane(this.fallback,this.hit);
        if(!point)return;
        this.desired.set(point.x,Math.max(0,point.y),point.z);this.clampFocus();
    }
    private clampFocus(){const b=this.bounds;this.desired.x=MathUtils.clamp(this.desired.x,b.minX,b.maxX);this.desired.z=MathUtils.clamp(this.desired.z,b.minZ,b.maxZ);}
    private pan(x:number,z:number){if(x===0&&z===0)return;this.desired.x+=x*Math.cos(this.angle)+z*Math.sin(this.angle);this.desired.z+=-x*Math.sin(this.angle)+z*Math.cos(this.angle);this.clampFocus();if(this.height)this.desired.y=Math.max(0,this.height(this.desired.x,this.desired.z));}
    update(dt:number){
        const k=this.keys;
        this.pan((Number(k.has('d')||k.has('arrowright'))-Number(k.has('a')||k.has('arrowleft')))*dt*worldConfig.camera.speed,(Number(k.has('s')||k.has('arrowdown'))-Number(k.has('w')||k.has('arrowup')))*dt*worldConfig.camera.speed);
        this.yaw+=(Number(k.has('e'))-Number(k.has('q')))*dt*.8;
        const t=1-Math.exp(-dt*8);this.focus.lerp(this.desired,t);this.distance=MathUtils.lerp(this.distance,this.zoom,t);this.angle=MathUtils.lerp(this.angle,this.yaw,t);this.elevation=MathUtils.lerp(this.elevation,this.targetElevation,t);
        const horizontal=this.distance*Math.cos(this.elevation)*orbitScale,vertical=this.distance*Math.sin(this.elevation)*orbitScale;
        this.camera.position.set(this.focus.x+Math.sin(this.angle)*horizontal,this.focus.y+vertical,this.focus.z+Math.cos(this.angle)*horizontal);this.camera.lookAt(this.focus);
    }
}
