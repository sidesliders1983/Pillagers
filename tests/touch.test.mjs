import {test} from 'node:test';import assert from 'node:assert/strict';import {PerspectiveCamera,Mesh,PlaneGeometry,MeshBasicMaterial} from 'three';import {load} from './load-source.mjs';
const {TouchGestures}=load('../src/camera/TouchGestures.ts');
const {RTSCameraController}=load('../src/camera/RTSCameraController.ts');
function events(){const result=[];const gesture=new TouchGestures({navigate:(...v)=>result.push(['tap',...v]),rotate:(...v)=>result.push(['rotate',...v]),zoom:r=>result.push(['zoom',r])});return {gesture,result};}
test('small finger movement remains a tap, dragging and cancellation never navigate',()=>{
const {gesture:g,result}=events();g.down(1,100,100);g.move(1,104,102);g.up(1);assert.deepEqual(result,[['tap',104,102]]);
result.length=0;g.down(2,0,0);g.move(2,40,0);g.move(2,0,0);g.up(2);assert.ok(result.every(e=>e[0]==='rotate'));
result.length=0;g.down(3,20,20);g.up(3,true);assert.equal(result.length,0);
});
test('pinch has the requested direction and cannot become a tap or swipe after lifting a finger',()=>{
const {gesture:g,result}=events();g.down(1,100,100);g.down(2,200,100);g.move(2,150,100);assert.deepEqual(result,[['zoom',.5]]);
g.move(2,250,100);assert.deepEqual(result[1],['zoom',3]);
g.up(2);g.move(1,130,100);g.up(1);assert.equal(result.length,2);
g.down(3,50,50);g.up(3);assert.deepEqual(result[2],['tap',50,50]);
});
test('touch camera centers terrain taps, orbits that center and clamps conventional pinch zoom',()=>{
const handlers=new Map();globalThis.window={addEventListener(){}};
const canvas={addEventListener:(name,fn)=>handlers.set(name,fn),setPointerCapture(){},getBoundingClientRect:()=>({left:0,top:0,width:800,height:600})};
const camera=new PerspectiveCamera(45,800/600,.1,240),controller=new RTSCameraController(camera,canvas);
const plane=new Mesh(new PlaneGeometry(200,200),new MeshBasicMaterial());plane.rotation.x=-Math.PI/2;plane.updateMatrixWorld(true);controller.setNavigationSurface(plane);
const send=(name,id,x,y)=>handlers.get(name)({pointerId:id,pointerType:'touch',clientX:x,clientY:y,preventDefault(){}});
send('pointerdown',1,550,320);send('pointerup',1,550,320);controller.update(2);assert.ok(controller.focus.x>2);
const center=controller.focus.clone(),before=camera.position.clone(),radius=camera.position.distanceTo(center);
send('pointerdown',2,300,300);send('pointermove',2,400,300);send('pointerup',2,400,300);controller.update(2);
assert.ok(controller.focus.distanceTo(center)<.001);assert.ok(camera.position.distanceTo(before)>5);assert.ok(Math.abs(camera.position.distanceTo(center)-radius)<.001);
send('pointerdown',3,300,300);send('pointerdown',4,500,300);send('pointermove',4,400,300);controller.update(2);assert.ok(camera.position.distanceTo(center)>radius*1.5);
send('pointermove',4,10000,300);controller.update(2);assert.ok(camera.position.distanceTo(center)>15&&camera.position.distanceTo(center)<16.1);
send('pointermove',4,320,300);controller.update(2);assert.ok(camera.position.distanceTo(center)>68.8&&camera.position.distanceTo(center)<70);
send('pointerup',4,320,300);send('pointerup',3,300,300);controller.update(2);assert.ok(controller.focus.distanceTo(center)<.001);
plane.geometry.dispose();plane.material.dispose();delete globalThis.window;
});
test('resident selection consumes taps and clicks while drags and pinch never select',()=>{
 const handlers=new Map();globalThis.window={addEventListener(){}};
 const canvas={addEventListener:(name,fn)=>handlers.set(name,fn),setPointerCapture(){},getBoundingClientRect:()=>({left:0,top:0,width:800,height:600})};
 const controller=new RTSCameraController(new PerspectiveCamera(45,800/600,.1,240),canvas),selected=[];
 controller.setSelectionHandler((x,y)=>{selected.push([x,y]);return true;});const focus=controller.focus.clone();
 const send=(name,type,id,x,y,movementX=0)=>handlers.get(name)({pointerId:id,pointerType:type,button:0,clientX:x,clientY:y,movementX,movementY:0,preventDefault(){}});
 send('pointerdown','touch',1,550,320);send('pointerup','touch',1,550,320);controller.update(2);assert.deepEqual(selected,[[550,320]]);assert.ok(controller.focus.equals(focus));
 send('pointerdown','mouse',2,300,300);send('pointerup','mouse',2,300,300);assert.equal(selected.length,2);
 send('pointerdown','mouse',3,300,300);send('pointermove','mouse',3,360,300,60);send('pointerup','mouse',3,360,300);assert.equal(selected.length,2);
 send('pointerdown','touch',4,300,300);send('pointermove','touch',4,360,300);send('pointerup','touch',4,360,300);assert.equal(selected.length,2);
 send('pointerdown','touch',5,300,300);send('pointerdown','touch',6,500,300);send('pointermove','touch',6,400,300);send('pointerup','touch',6,400,300);send('pointerup','touch',5,300,300);assert.equal(selected.length,2);
 delete globalThis.window;
});
