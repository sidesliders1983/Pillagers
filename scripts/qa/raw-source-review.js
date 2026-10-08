// Independent raw bytes only. No factory, socket, fitting or geometry mutation.
import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
const renderer=new T.WebGLRenderer({canvas:document.querySelector('canvas'),antialias:true,preserveDrawingBuffer:true});
renderer.setPixelRatio(1);renderer.setSize(640,720);renderer.toneMapping=T.ACESFilmicToneMapping;
const scene=new T.Scene();scene.background=new T.Color('#dbe1d7');
scene.add(new T.HemisphereLight(0xfff3e3,0x9caa9a,2.2));
const sun=new T.DirectionalLight(0xffead5,1.7);sun.position.set(-3,6,5);scene.add(sun);
const camera=new T.PerspectiveCamera(32,640/720,.001,100),loader=new GLTFLoader();
const angles={front:[0,.06,1],side:[1,.06,0],opposite:[-1,.06,0],back:[0,.06,-1],top:[.06,1,.35],underside:[.2,-1,.5],three:[.55,.16,1]};
let object,bounds,proof,originalMaterials=new Map(),neutralMaterials=[];
window.rawReview={
 async load({url,sha256,triangles,label}){
  if(!/^[a-f0-9]{64}$/i.test(sha256))throw new Error('Explicit source SHA256 required');
  const response=await fetch(url);if(!response.ok)throw new Error(`Raw source HTTP ${response.status}`);
  const bytes=await response.arrayBuffer(),digest=await crypto.subtle.digest('SHA-256',bytes);
  const actualSHA256=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
  if(actualSHA256!==sha256.toLowerCase())throw new Error(`Raw source SHA mismatch: ${actualSHA256}`);
  const gltf=await new Promise((resolve,reject)=>loader.parse(bytes,'',resolve,reject));
  object=gltf.scene;object.updateMatrixWorld(true);let actualTriangles=0,vertices=0,meshes=0;const materials=new Set();
  object.traverse(mesh=>{if(!mesh.isMesh)return;meshes++;vertices+=mesh.geometry.attributes.position.count;
   actualTriangles+=(mesh.geometry.index?.count??mesh.geometry.attributes.position.count)/3;
   originalMaterials.set(mesh,mesh.material);for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material])materials.add(material);});
  if(actualTriangles!==triangles)throw new Error(`Raw source triangle mismatch: parsed ${actualTriangles}, expected ${triangles}`);
  bounds=new T.Box3().setFromObject(object,true);scene.add(object);
  proof={label,url,sha256:actualSHA256,bytes:bytes.byteLength,triangles:actualTriangles,vertices,meshes,materials:materials.size,bounds:{min:bounds.min.toArray(),max:bounds.max.toArray()},fitApplied:false};
  return proof;
 },
 sample(angle='front',mode='original'){
  if(!object||!angles[angle])throw new Error('Missing verified source or unknown view');
  for(const material of neutralMaterials)material.dispose();neutralMaterials=[];
  object.traverse(mesh=>{if(!mesh.isMesh)return;if(mode==='original')mesh.material=originalMaterials.get(mesh);
   else{if(!['neutral-front','neutral-double'].includes(mode))throw new Error('Unknown material diagnostic');
    const material=new T.MeshStandardMaterial({color:'#997451',roughness:1,flatShading:true,side:mode==='neutral-double'?T.DoubleSide:T.FrontSide});neutralMaterials.push(material);mesh.material=material;}});
  const sphere=bounds.getBoundingSphere(new T.Sphere()),vertical=T.MathUtils.degToRad(camera.fov*.5),horizontal=Math.atan(Math.tan(vertical)*camera.aspect);
  const distance=sphere.radius/Math.sin(Math.min(vertical,horizontal))*1.12;
  camera.position.copy(sphere.center).add(new T.Vector3(...angles[angle]).normalize().multiplyScalar(distance));camera.lookAt(sphere.center);renderer.render(scene,camera);
  document.querySelector('#label').textContent=`RAW source ${proof.label} | ${proof.triangles} triangles | ${mode} | source-axis ${angle}\nSHA256 ${proof.sha256.slice(0,16)} | no fitting applied`;
  return {...proof,angle,materialMode:mode};
 }
};window.ready=true;
