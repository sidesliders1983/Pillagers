import * as THREE from 'three';
import {MeshyHumanFactory} from '/src/characters/MeshyHuman.ts';
import {defaultDNA} from '/src/characters/CharacterDNA.ts';
import {defaultCharacterPresentation} from '/src/characters/CharacterPresentation.ts';
const scene=new THREE.Scene();scene.background=new THREE.Color('#dce1d6');
scene.add(new THREE.HemisphereLight(0xffffff,0x665746,2));
const light=new THREE.DirectionalLight(0xffffff,2.5);light.position.set(2,3,4);scene.add(light);
const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});
renderer.setSize(1600,600);document.body.append(renderer.domElement);
const camera=new THREE.OrthographicCamera(-.95,.95,.36,-.36,.01,20);
const factory=new MeshyHumanFactory(),humans=[];
for(const [i,hat]of ['farmer','fisher','hunter','smith'].entries()){
 const human=await factory.create({...defaultDNA(),age:32},0,undefined,
 {...defaultCharacterPresentation,hair:'none',beard:'none',outfit:'none',headwear:'headwear/occupation-'+hat});
 human.root.position.x=(i-1.5)*.45;scene.add(human.root);humans.push(human);
}
window.hatSet=async(hair='none',view='front',clip='neutral',time=0)=>{
 const report=[];
 for(const [i,human]of humans.entries()){
  await factory.equip(human,{...defaultCharacterPresentation,hair,beard:'none',outfit:'none',
   headwear:'headwear/occupation-'+['farmer','fisher','hunter','smith'][i]});
  if(clip==='neutral')human.sampleNativeNeutral();else human.sampleAnimation(clip,time);
  human.root.rotation.y = view === 'back' ? Math.PI : view === 'side' ? Math.PI / 2 : 0;
  let cap;human.root.traverse(node=>{if(node.isMesh&&node.userData.headwearFit)cap=node.userData.headwearFit;});
  report.push(cap);
 }
 scene.updateMatrixWorld(true);
 const target=new THREE.Vector3(0,1.52,0);
 camera.up.set(0,1,0);
 if(view==='top'){camera.position.set(0,5.52,.0001);camera.up.set(0,0,-1);}
 else camera.position.set(0,1.52,4);
 camera.lookAt(target);camera.updateProjectionMatrix();renderer.render(scene,camera);
 window.hatReport=report;return report;
};
window.humans=humans;window.hatRenderer=renderer;
await window.hatSet();window.hatsReady=true;
