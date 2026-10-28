import { intersectNavigationTerrain } from '../world/TerrainNavigation';
import { solveCameraClearance } from './CameraClearance';
import type { TerrainField } from '../world-generation/WorldBlueprint';
import {PerspectiveCamera,Vector2,Vector3,MathUtils,Object3D,Raycaster,Plane,Box3} from 'three';
import {worldConfig} from '../config/worldConfig';
import {TouchGestures} from './TouchGestures';
const initialElevation=Math.atan2(.8,.7),orbitScale=Math.hypot(.8,.7);
export type CameraNavigationIntent = 'wheel' | 'drag' | 'touch' | 'keyboard' | 'focus' | 'home' | 'escape';
export class RTSCameraController {
    private readonly navigationListeners = new Set<(intent: CameraNavigationIntent) => void>();
    /** Presentation owners yield before native input is applied, so the first gesture is preserved. */
    onNavigationIntent(listener: (intent: CameraNavigationIntent) => void): () => void {
        this.navigationListeners.add(listener);
        return () => { this.navigationListeners.delete(listener); };
    }
    private navigationIntent(intent: CameraNavigationIntent) {
        for (const listener of this.navigationListeners) listener(intent);
    }
    private inputEnabled = true;
    get enabled() { return this.inputEnabled; }
    set enabled(value: boolean) {
        this.inputEnabled = value;
        if (!value) {
            this.keys.clear(); this.drag = false; this.rotateDrag = false; this.mouseStart = null;
            this.touch.reset();
            this.clearHover();
        }
    }
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
    private clearanceSource: { grid?: TerrainField; maximumHeight: number; waterLevel: number } | undefined;
    private collisionLift = 0;
    private viewGroundClearance = worldConfig.camera.clearance.ground;
    private requestedEye = new Vector3();
    private clearanceWorkspace = new Float64Array(worldConfig.camera.clearance.maxSamples * 2);
    private clearanceDiagnostic: (ReturnType<typeof solveCameraClearance> & { milliseconds: number; maximumMs: number }) | null = null;
    private maximumClearanceMs = 0;
    private ray=new Raycaster();private pointer=new Vector2();
    private fallback=new Plane(new Vector3(0,1,0),0);private hit=new Vector3();
    private minimumZoom = worldConfig.camera.minZoom;
    private touch:TouchGestures;
    private select:((x:number,y:number,pointerType:'mouse'|'touch')=>boolean)|null=null;
    private mouseStart:{x:number;y:number;distance:number}|null=null;
    private hover: ((x: number, y: number) => boolean) | null = null;
    private hoverPointer?: {x: number; y: number};
    private hoverElapsed = 0;
    private originalCursor = '';
    constructor(readonly camera: PerspectiveCamera, private canvas: HTMLCanvasElement,
        private dragMode: 'pan' | 'rotate' = 'pan') {
        const settings=worldConfig.camera.touch;
        this.touch=new TouchGestures({
            navigate:(x,y)=>{this.navigationIntent('focus');this.navigate(x,y,'touch');},
            rotate:(dx,dy)=>{if(dx||dy)this.navigationIntent('touch');this.yaw-=dx*settings.rotationSensitivity;this.targetElevation=MathUtils.clamp(this.targetElevation+dy*settings.elevationSensitivity,settings.minElevation,settings.maxElevation);},
            zoom:ratio=>{if(ratio!==1)this.navigationIntent('touch');this.setZoom(this.zoom/ratio);},
        },settings.tapThreshold);
        this.listen(window,'keydown',e=>{
            if(e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.target instanceof HTMLTextAreaElement)return;
            if (e.key === 'Escape') this.navigationIntent('escape');
            else if (['w', 'a', 's', 'd', 'q', 'e', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(e.key.toLowerCase()))
                this.navigationIntent('keyboard');
            if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key))e.preventDefault();
            this.keys.add(e.key.toLowerCase());
        });
        this.listen(window,'keyup',e=>this.keys.delete(e.key.toLowerCase()));
        this.listen(window,'blur',()=>{this.keys.clear();this.drag=false;this.rotateDrag=false;this.mouseStart=null;this.touch.reset();this.clearHover();});
        this.listen(canvas, 'wheel', event => {
            event.preventDefault();
            if (event.deltaX || event.deltaY) this.navigationIntent('wheel');
            this.setZoom(this.zoom + event.deltaY * .025);
        }, { passive: false });
        this.listen(canvas,'pointerdown',e=>{
            canvas.setPointerCapture(e.pointerId);
            if(e.pointerType==='touch'){this.clearHover();e.preventDefault();this.touch.down(e.pointerId,e.clientX,e.clientY);}
            else if(e.button===2){e.preventDefault();this.rotateDrag=true;this.drag=false;this.mouseStart=null;}
            else if(e.button===0){this.rotateDrag=false;this.drag=true;this.mouseStart={x:e.clientX,y:e.clientY,distance:0};}
            if (e.pointerType !== 'touch') {
                this.rememberHover(e.clientX, e.clientY);
                this.updateHover(0);
            }
        });
        this.listen(canvas, 'pointermove', event => {
            if (event.pointerType === 'touch') {
                event.preventDefault();
                this.touch.move(event.pointerId, event.clientX, event.clientY);
                this.clearHover();
                return;
            }
            this.rememberHover(event.clientX, event.clientY);
            if (this.drag && this.mouseStart) {
                this.mouseStart.distance = Math.max(this.mouseStart.distance,
                    Math.hypot(event.clientX - this.mouseStart.x, event.clientY - this.mouseStart.y));
            }
            const rotating = this.rotateDrag || this.drag && this.dragMode === 'rotate' &&
                this.mouseStart !== null && this.mouseStart.distance >= settings.tapThreshold;
            if (rotating) {
                if (event.movementX || event.movementY) this.navigationIntent('drag');
                event.preventDefault();
                this.yaw -= event.movementX * settings.rotationSensitivity;
                this.targetElevation = MathUtils.clamp(
                    this.targetElevation + event.movementY * settings.elevationSensitivity,
                    settings.minElevation, settings.maxElevation);
            } else if (this.drag && this.dragMode === 'pan' && this.mouseStart &&
                this.mouseStart.distance >= settings.tapThreshold) {
                if (event.movementX || event.movementY) this.navigationIntent('drag');
                this.pan(-event.movementX * this.distance * .0015,
                    -event.movementY * this.distance * .0015);
            }
        });
        const release = (event: PointerEvent, cancelled: boolean) => {
            if (event.pointerType === 'touch') {
                if (!cancelled) this.touch.move(event.pointerId, event.clientX, event.clientY);
                this.touch.up(event.pointerId, cancelled);
            } else {
                if (!cancelled && this.mouseStart && this.mouseStart.distance < settings.tapThreshold) {
                    this.navigationIntent('focus');
                    this.navigate(event.clientX, event.clientY);
                }
                this.mouseStart = null;
                this.drag = false;
                this.rotateDrag = false;
                if (cancelled && event.type !== 'lostpointercapture') this.clearHover();
                else {
                    if (event.type !== 'lostpointercapture') this.rememberHover(event.clientX, event.clientY);
                    this.hoverElapsed = .12;
                    this.updateHover(0);
                }
            }
        };
        this.listen(canvas, 'pointerleave', () => this.clearHover());
        this.listen(canvas,'pointerup',e=>release(e,false));
        this.listen(canvas,'pointercancel',e=>release(e,true));
        this.listen(canvas,'lostpointercapture',e=>release(e,true));
        this.listen(canvas,'contextmenu',e=>e.preventDefault());
        this.update(1);
    }
    private listen<K extends keyof WindowEventMap>(target: Window | HTMLCanvasElement,
        type: K,handler: (event: WindowEventMap[K])=>void,options: AddEventListenerOptions = {}) {
        target.addEventListener(type,((event: WindowEventMap[K]) => { if (this.enabled) handler(event); }) as EventListener,{ ...options,signal:this.listeners.signal });
    }
    dispose() {
        this.clearHover();
        this.hover = null;
        this.listeners.abort(); this.touch.reset(); this.keys.clear(); this.navigationListeners.clear();
    }
    setNavigationSurface(surface: Object3D, center = this.homeFocus,
        bounds?: typeof this.bounds, height?: typeof this.height,
        clearance?: { terrain?: TerrainField; waterLevel?: number }) {
        this.surface = surface;
        this.homeFocus.copy(center);
        this.height = height;
        const grid = clearance?.terrain;
        const maximumHeight = grid ? grid.heights.reduce((max, value) => Math.max(max, value), -Infinity) :
            new Box3().setFromObject(surface).max.y;
        this.clearanceSource = height ? { grid, maximumHeight: Number.isFinite(maximumHeight) ? maximumHeight : 0,
            waterLevel: clearance?.waterLevel ?? 0 } : undefined;
        this.maximumClearanceMs = 0;
        if (bounds) this.bounds = { ...bounds };
        this.home();
        this.focus.copy(this.desired);
        this.update(0);
    }
    /** Read-only bounded planning through the same terrain/water/near-plane solver as native navigation. */
    previewView(pose: { position: number[]; target: number[] }): { position: number[]; target: number[] } | undefined {
        if (pose.position.length !== 3 || pose.target.length !== 3 ||
            ![...pose.position, ...pose.target].every(Number.isFinite)) return;
        const inside = (point: number[]) => point[0] >= this.bounds.minX && point[0] <= this.bounds.maxX &&
            point[2] >= this.bounds.minZ && point[2] <= this.bounds.maxZ;
        if (!inside(pose.position) || !inside(pose.target)) return;
        const eye = new Vector3().fromArray(pose.position), focus = new Vector3().fromArray(pose.target);
        if (eye.distanceToSquared(focus) < 1e-6) return;
        if (this.height && this.clearanceSource) {
            const correction = solveCameraClearance({ focus, eye, heightAt: this.height, ...this.clearanceSource,
                nearRadius: this.nearPlaneRadius(), previousLift: 0, deltaSeconds: 0,
                workspace: this.clearanceWorkspace, settings: { ground: worldConfig.camera.clearance.ground } });
            eye.y = correction.eyeY;
        }
        return { position: eye.toArray(), target: [...pose.target] };
    }
    private nearPlaneRadius() {
        const tangent = Math.tan(MathUtils.degToRad(this.camera.fov) / 2);
        return this.camera.near * Math.sqrt(1 + tangent * tangent * (1 + this.camera.aspect ** 2));
    }
    setView(pose: { position: number[]; target: number[] }, options: { groundClearance?: number; presentation?: boolean } = {}) {
        if (pose.position.length !== 3 || pose.target.length !== 3 ||
            ![...pose.position, ...pose.target].every(value => Number.isFinite(value) && Math.abs(value) <= 1e9) ||
            Math.hypot(...pose.position.map((value, i) => value - pose.target[i])) < 1e-6 ||
            options.groundClearance !== undefined && (!Number.isFinite(options.groundClearance) || options.groundClearance < 0))
            throw new RangeError('Camera view requires finite, distinct position and target points.');
        if (!options.presentation) this.navigationIntent('focus');
        this.collisionLift = 0;
        this.viewGroundClearance = options.groundClearance ?? worldConfig.camera.clearance.ground;
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
    setSelectionHandler(select:(x:number,y:number,pointerType:'mouse'|'touch')=>boolean){this.select=select;}
    /** Read-only target query, shared with the scene's real click picking. */
    setHoverHandler(hover: (x: number, y: number) => boolean) {
        if (!this.hover) this.originalCursor = this.canvas.style.cursor;
        this.hover = hover;
        this.hoverElapsed = .12;
    }
    private rememberHover(x: number, y: number) {
        if (!this.hoverPointer) this.hoverElapsed = .12;
        this.hoverPointer = {x, y};
    }
    private clearHover() {
        this.hoverPointer = undefined;
        this.hoverElapsed = 0;
        if (this.hover) this.canvas.style.cursor = this.originalCursor;
    }
    private updateHover(delta: number) {
        if (!this.hover) return;
        if (!this.enabled || !this.hoverPointer) {
            this.canvas.style.cursor = this.originalCursor;
            return;
        }
        if (this.drag || this.rotateDrag) {
            this.canvas.style.cursor = 'grabbing';
            return;
        }
        // Coalesce mouse events and refresh stationary pointers for moving actors/cameras.
        // Touch never enters this path; no extra raycast is performed every rendered frame.
        this.hoverElapsed += Math.max(0, delta);
        if (this.hoverElapsed < .12) return;
        this.hoverElapsed = 0;
        this.canvas.style.cursor = this.hover(this.hoverPointer.x, this.hoverPointer.y)
            ? 'pointer' : this.originalCursor;
    }

    home() {
        this.navigationIntent('home');
        this.viewGroundClearance = worldConfig.camera.clearance.ground;
        this.collisionLift = 0;
        this.minimumZoom = worldConfig.camera.minZoom;
        this.desired.copy(this.homeFocus);
        this.zoom = worldConfig.camera.initialZoom;
        this.yaw = .45;
        this.targetElevation = initialElevation;
    }
    /** Camera-only geographic navigation with existing bounds, terrain clearance and orbit intent. */
    focusAt(point: { x: number; z: number }) {
        if (!Number.isFinite(point.x) || !Number.isFinite(point.z)) throw new RangeError('Camera focus must be finite.');
        this.navigationIntent('focus');
        this.desired.set(point.x, this.desired.y, point.z);
        this.clampFocus();
        if (this.height) this.desired.y = Math.max(0, this.height(this.desired.x, this.desired.z));
    }
    private setZoom(value:number){this.zoom=MathUtils.clamp(value,this.minimumZoom,worldConfig.camera.maxZoom);}
    private navigate(x:number,y:number,pointerType:'mouse'|'touch'='mouse'){
        if(this.select?.(x,y,pointerType))return;
        const rect=this.canvas.getBoundingClientRect();
        this.pointer.set((x-rect.left)/rect.width*2-1,-(y-rect.top)/rect.height*2+1);
        this.camera.updateMatrixWorld();this.ray.setFromCamera(this.pointer,this.camera);
        const terrainPoint = this.surface ? intersectNavigationTerrain(this.surface, this.ray.ray, this.hit) : undefined;
        const intersection = terrainPoint === undefined && this.surface ?
            this.ray.intersectObject(this.surface, false)[0]?.point : terrainPoint;
        const point = intersection ?? this.ray.ray.intersectPlane(this.fallback, this.hit);
        if(!point)return;
        this.desired.set(point.x,Math.max(0,point.y),point.z);this.clampFocus();
    }
    private clampFocus(){const b=this.bounds;this.desired.x=MathUtils.clamp(this.desired.x,b.minX,b.maxX);this.desired.z=MathUtils.clamp(this.desired.z,b.minZ,b.maxZ);}
    private pan(x:number,z:number){if(x===0&&z===0)return;this.desired.x+=x*Math.cos(this.angle)+z*Math.sin(this.angle);this.desired.z+=-x*Math.sin(this.angle)+z*Math.cos(this.angle);this.clampFocus();if(this.height)this.desired.y=Math.max(0,this.height(this.desired.x,this.desired.z));}
    /** Read-only presentation diagnostics; no simulation or saved camera state. */
    inspectClearance() {
        return this.clearanceDiagnostic && { ...this.clearanceDiagnostic,
            focus: this.focus.toArray(), requestedEye: this.requestedEye.toArray(),
            requestedZoom: this.zoom, requestedYaw: this.yaw };
    }
    update(dt: number) {
        const k = this.keys;
        this.pan((Number(k.has('d') || k.has('arrowright')) - Number(k.has('a') || k.has('arrowleft'))) * dt * worldConfig.camera.speed,
            (Number(k.has('s') || k.has('arrowdown')) - Number(k.has('w') || k.has('arrowup'))) * dt * worldConfig.camera.speed);
        this.yaw += (Number(k.has('e')) - Number(k.has('q'))) * dt * .8;
        const t = 1 - Math.exp(-dt * 8);
        const oldFocusX = this.focus.x, oldFocusZ = this.focus.z;
        this.focus.lerp(this.desired, t);
        if (this.height && (this.focus.x !== oldFocusX || this.focus.z !== oldFocusZ)) {
            // Navigation follows the surface between destinations as well as at their endpoints.
            // Orbit and authored stationary review targets keep their requested focus unchanged.
            const ground = this.height(this.focus.x, this.focus.z);
            if (Number.isFinite(ground)) this.focus.y = Math.max(this.focus.y, ground, this.clearanceSource?.waterLevel ?? 0);
        }
        this.distance = MathUtils.lerp(this.distance, this.zoom, t);
        this.angle = MathUtils.lerp(this.angle, this.yaw, t);
        this.elevation = MathUtils.lerp(this.elevation, this.targetElevation, t);
        const horizontal = this.distance * Math.cos(this.elevation) * orbitScale;
        const vertical = this.distance * Math.sin(this.elevation) * orbitScale;
        this.camera.position.set(this.focus.x + Math.sin(this.angle) * horizontal,
            this.focus.y + vertical, this.focus.z + Math.cos(this.angle) * horizontal);
        this.requestedEye.copy(this.camera.position);
        if (this.height && this.clearanceSource) {
            const start = performance.now();
            const nearRadius = this.nearPlaneRadius();
            const correction = solveCameraClearance({ focus: this.focus, eye: this.requestedEye,
                heightAt: this.height, ...this.clearanceSource, nearRadius,
                previousLift: this.collisionLift, deltaSeconds: dt, workspace: this.clearanceWorkspace,
                settings: { ground: this.viewGroundClearance } });
            this.collisionLift = correction.lift;
            this.camera.position.y = correction.eyeY;
            const milliseconds = performance.now() - start;
            this.maximumClearanceMs = Math.max(this.maximumClearanceMs, milliseconds);
            this.clearanceDiagnostic = { ...correction, milliseconds, maximumMs: this.maximumClearanceMs };
        } else this.clearanceDiagnostic = null;
        this.camera.lookAt(this.focus);
        this.updateHover(dt);
    }
}
