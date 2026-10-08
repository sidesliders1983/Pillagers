import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';import {resolve,dirname} from 'node:path';import {fileURLToPath} from 'node:url';import {createHash} from 'node:crypto';import {createRequire} from 'node:module';import {spawnSync} from 'node:child_process';
import {readGLB} from './characters/glb-inspection.mjs';import {moduleBoundaryEvidence} from './characters/provenance-validation.mjs';
import {Document,NodeIO} from '@gltf-transform/core';import {loadTypeScript} from './load-typescript.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),require=createRequire(import.meta.url),{GLTFLoader}=require('three/addons/loaders/GLTFLoader.js'),{MeshoptDecoder}=require('three/addons/libs/meshopt_decoder.module.js'),{Group,Vector3,Matrix4}=require('three');
const {MeshyBodyFitAdapter,closestSurface}=loadTypeScript(new URL('../src/characters/MeshyBodyFitAdapter.ts',import.meta.url));const {meshyHumanAssetIdentity}=loadTypeScript(new URL('../src/characters/MeshyHumanAssetIdentity.ts',import.meta.url));
const hash=b=>createHash('sha256').update(b).digest('hex'),sourcePath=resolve(root,'Assets/Characters/Human/Human-textured.glb'),sourceHash=hash(readFileSync(sourcePath));
if(sourceHash!=='be5173fa4f3b6e63fa7bc3506b3d61b4def28b7f67477b9a29b5eb527d80f8fe')throw new Error('Refuse to author against a changed Meshy master');
const editable=resolve(root,'Assets/Characters/Human/Modules-v2'),out=resolve(root,'public/character-lab/modules/meshy-v2');mkdirSync(editable,{recursive:true});mkdirSync(out,{recursive:true});
globalThis.self=globalThis;globalThis.createImageBitmap=async()=>({width:2048,height:2048,close(){}});const loader=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder),adapters=[];
for(const lod of [0,1,2]){const bytes=readFileSync(resolve(root,'public'+meshyHumanAssetIdentity[lod].path));if(hash(bytes)!==meshyHumanAssetIdentity[lod].sha256)throw new Error('Stale prepared body LOD'+lod);const gltf=await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');let mesh;gltf.scene.traverse(n=>{if(n.isSkinnedMesh)mesh=n;});const wrapper=new Group();wrapper.add(gltf.scene);adapters.push(new MeshyBodyFitAdapter(mesh,wrapper,gltf.scene,lod));}
writeFileSync(resolve(editable,'master.json'),JSON.stringify({sourcePath,sourceHash,nativeJointNames:adapters[0].nativeSkeleton.bones.map(b=>b.name),surfaces:adapters.map(a=>({...a.surface('source'),joints:Array.from(a.mesh.geometry.getAttribute('skinIndex').array),weights:Array.from({length:a.mesh.geometry.getAttribute('skinWeight').count*4},(_,i)=>a.mesh.geometry.getAttribute('skinWeight').getComponent(Math.floor(i/4),i%4))}))}));
const blender=process.env.PILLAGERS_BLENDER??[resolve(root,'tools/blender-4.5.9-windows-x64/blender.exe'),'C:/CodexWorkspaces/Pillagers/tools/blender-4.5.9-windows-x64/blender.exe'].find(existsSync);
if(!blender)throw new Error('Set PILLAGERS_BLENDER to Blender 4.5.9 LTS');
if(!spawnSync(blender,['--version'],{encoding:'utf8'}).stdout.includes('Blender 4.5.9'))throw new Error('This template is pinned to Blender 4.5.9 LTS');
const built=spawnSync(blender,['--background','--factory-startup','--python',resolve(root,'scripts/characters/templates/meshy_modules_v2.py'),'--',resolve(editable,'master.json'),editable],{encoding:'utf8',maxBuffer:16*1024*1024});console.log(built.stdout);if(built.status!==0||!built.stdout.includes('MODULE_TEMPLATES_EXPORTED'))throw new Error(built.stderr||'Blender recipe failed');
const sources=JSON.parse(readFileSync(resolve(editable,'authored-meshes.json'),'utf8')),ids={hair:'hair/meshy-short-angular',beard:'beard/meshy-compact-wedge',outfit:'garment/meshy-tunic-trousers',pouch:'equipment/meshy-belt-pouch'},io=new NodeIO(),measurements={},catalog=[];
const recipeHash=hash(readFileSync(resolve(root,'scripts/characters/templates/meshy_modules_v2.py')));
function vertexContact(adapter,point){
 let best=0,distance=Infinity;for(let v=0;v<adapter.source.positions.length/3;v++){const p=new Vector3().fromArray(adapter.source.positions,v*3),d=p.distanceToSquared(point);if(d<distance){best=v;distance=d;}}
 const slot=adapter.source.indices.indexOf(best),triangle=Math.floor(slot/3),barycentric=[0,0,0];barycentric[slot%3]=1;const p=new Vector3().fromArray(adapter.source.positions,best*3);return {triangle,barycentric,offset:point.clone().sub(p).toArray()};
}
const neckOpening = {regions: ['NECK'], regionMatch: 'any', normal: [0, 1, 0.3], constant: -1.415};

function openingContact(adapter, point, plane) {
    const normal = new Vector3(...plane.normal);
    let best;
    let distance = Infinity;
    for (let triangle = 0; triangle < adapter.source.triangles; triangle++) {
        const ids = adapter.source.indices.slice(triangle * 3, triangle * 3 + 3);
        const matches = ids.map(vertex => plane.regions.includes(adapter.source.regions[vertex]));
        if (!(plane.regionMatch === 'any' ? matches.some(Boolean) : matches.every(Boolean))) continue;
        const corners = ids.map(vertex => new Vector3().fromArray(adapter.source.positions, vertex * 3));
        const distances = corners.map(corner => corner.dot(normal) + plane.constant);
        const cuts = [];
        for (let k = 0; k < 3; k++) {
            const next = (k + 1) % 3;
            if ((distances[k] >= 0) === (distances[next] >= 0)) continue;
            const fraction = distances[k] / (distances[k] - distances[next]);
            const barycentric = [0, 0, 0];
            barycentric[k] = 1 - fraction;
            barycentric[next] = fraction;
            cuts.push({point: corners[k].clone().lerp(corners[next], fraction), barycentric});
        }
        if (cuts.length !== 2) continue;
        const [a, b] = cuts;
        const edge = b.point.clone().sub(a.point);
        const fraction = Math.max(0, Math.min(1, point.clone().sub(a.point).dot(edge) / edge.lengthSq()));
        const hit = a.point.clone().lerp(b.point, fraction);
        const candidate = hit.distanceToSquared(point);
        if (candidate < distance) {
            distance = candidate;
            best = {
                triangle,
                barycentric: a.barycentric.map((value, k) => value * (1 - fraction) + b.barycentric[k] * fraction),
                offset: [0, 0, 0],
            };
        }
    }
    if (!best) throw new Error('Missing fixed body opening section');
    return best;
}

function cuffContact(adapter, point) {
    const side = point.x >= 0 ? 1 : -1;
    const normal = new Vector3(side * 0.38, -0.923, -0.06);
    const origin = new Vector3(side * 0.182, 1.298, -0.062);
    return openingContact(adapter, point, {
        regions: side === 1 ? ['UPPER_ARM_L', 'LOWER_ARM_L'] : ['UPPER_ARM_R', 'LOWER_ARM_R'],
        normal: normal.toArray(), constant: -origin.dot(normal) - 0.456,
    });
}
function contactWeights(adapter,anchor){const map=new Map();for(let k=0;k<3;k++){const v=adapter.source.indices[anchor.triangle*3+k];for(let j=0;j<4;j++){const joint=adapter.mesh.geometry.getAttribute('skinIndex').getComponent(v,j),weight=adapter.mesh.geometry.getAttribute('skinWeight').getComponent(v,j)*anchor.barycentric[k];map.set(joint,(map.get(joint)??0)+weight);}}const values=[...map].filter(([,w])=>w>1e-8).sort((a,b)=>b[1]-a[1]).slice(0,4),total=values.reduce((sum,[,w])=>sum+w,0);return {joints:[...values.map(([j])=>j),...Array(4-values.length).fill(0)],weights:[...values.map(([,w])=>w/total),...Array(4-values.length).fill(0)]};}
function covered(surface, triangle, necklineMinimum) {
    return surface.indices.slice(triangle * 3, triangle * 3 + 3).every(vertex => {
        const x = surface.positions[vertex * 3];
        const y = surface.positions[vertex * 3 + 1];
        const z = surface.positions[vertex * 3 + 2];
        const zone = surface.regions[vertex];

        if (['TORSO_UPPER', 'TORSO_LOWER', 'PELVIS'].includes(zone)) {
            return y > 0.80 && y < 1.415;
        }
        if (zone === 'NECK') {
            // A whole neck triangle may be hidden only below the lowest opening.
            // The former average-height mask cut away skin exposed by the front notch.
            return y < necklineMinimum - 0.004;
        }
        if (['UPPER_LEG_L', 'UPPER_LEG_R', 'LOWER_LEG_L', 'LOWER_LEG_R', 'FEET'].includes(zone)) {
            return y < 1.035;
        }
        if (['UPPER_ARM_L', 'UPPER_ARM_R', 'LOWER_ARM_L', 'LOWER_ARM_R'].includes(zone)) {
            const delta = new Vector3(Math.abs(x) - 0.182, y - 1.298, z + 0.062);
            return delta.dot(new Vector3(0.38, -0.923, -0.06)) < 0.448;
        }
        return false;
    });
}
const pending=[];
for(const [name,source] of Object.entries(sources)){
 const contacts=new Set(source.parts.flatMap(p=>p.contactIndices??[]));
 const necklineContacts = name === 'outfit'
     ? source.parts.find(part => part.name === 'Module_tunic_panels').contactIndices
         .filter(vertex => Math.abs(source.vertices[vertex][0]) < 0.16
             && source.vertices[vertex][1] > 1.33)
     : [];
 const necklineMinimum = Math.min(...necklineContacts.map(vertex => source.vertices[vertex][1]));
 const originalAnchors=adapters.map(a=>source.vertices.map((v,i)=>{const point=new Vector3(...v),isCuff=name==='outfit'&&source.parts.find(p=>i>=p.start&&i<p.start+p.count)?.name==='Module_tunic_panels'&&contacts.has(i)&&Math.abs(point.x)>.16&&point.y<1.30;if(isCuff)return cuffContact(a,point);if(name==='outfit'&&contacts.has(i)&&point.y>1.33&&Math.abs(point.x)<.16)return openingContact(a,point,neckOpening);const vertex=name==='outfit'&&contacts.has(i)?vertexContact(a,point):null;return vertex&&Math.hypot(...vertex.offset)<=.055?vertex:closestSurface(a.source,point,name==='hair'||name==='beard'?['HEAD']:undefined);}));
 const lodWeights=adapters.map((a,lod)=>source.vertices.map((v,i)=>name==='hair'||name==='beard'?{joints:[5,0,0,0],weights:[1,0,0,0]}:name==='pouch'?null:contacts.has(i)?contactWeights(a,originalAnchors[lod][i]):source.skinWeights[i]));
 // The dense authored collar band shares each corresponding native rim influence.
 for (const [bandVertex, rimVertex] of source.parts.flatMap(part => part.rimWeightPairs ?? [])) {
     for (let lod = 0; lod < adapters.length; lod++) {
         lodWeights[lod][bandVertex] = contactWeights(adapters[lod], originalAnchors[lod][rimVertex]);
     }
 }
 const sourceWeights=lodWeights[0];
 const flat=source.faces.flat(),positions=flat.flatMap(v=>source.vertices[v]),colors=source.faces.flatMap((face,t)=>face.flatMap(()=>source.faceColors[t])),joints=name==='pouch'?[]:flat.flatMap(v=>sourceWeights[v].joints),skinWeights=name==='pouch'?[]:flat.flatMap(v=>sourceWeights[v].weights),normals=[];
 for(let t=0;t<positions.length;t+=9){const a=new Vector3().fromArray(positions,t),b=new Vector3().fromArray(positions,t+3),c=new Vector3().fromArray(positions,t+6),normal=b.sub(a).cross(c.sub(a)).normalize().toArray();for(let k=0;k<3;k++)normals.push(...normal);}
 const doc=new Document(),buffer=doc.createBuffer(),attribute=(label,array,type)=>doc.createAccessor(label).setType(type).setArray(array).setBuffer(buffer);
 const primitive=doc.createPrimitive().setAttribute('POSITION',attribute('metre positions',new Float32Array(positions),'VEC3')).setAttribute('NORMAL',attribute('facet normals',new Float32Array(normals),'VEC3')).setAttribute('COLOR_0',attribute('linear broad palette',new Float32Array(colors),'VEC3'));
 if(name!=='pouch')primitive.setAttribute('JOINTS_0',attribute('native ordered joints',new Uint16Array(joints),'VEC4')).setAttribute('WEIGHTS_0',attribute('native influences',new Float32Array(skinWeights),'VEC4'));
 primitive.setMaterial(doc.createMaterial('Opaque linear COLOR_0').setBaseColorFactor([1,1,1,1]).setRoughnessFactor(1).setMetallicFactor(0).setAlphaMode('OPAQUE').setDoubleSided(name==='outfit'));
 doc.createScene().addChild(doc.createNode('Module_'+name).setMesh(doc.createMesh('Module_'+name).addPrimitive(primitive)));
 const bytes=Buffer.from(await io.writeBinary(doc)),moduleSha256=hash(bytes);pending.push([resolve(out,name+'.glb'),bytes]);
 const regions=Object.fromEntries(source.parts.map(part=>[part.name,{contact:flat.flatMap((v,i)=>v>=part.start&&v<part.start+part.count&&(name==='outfit'?(part.contactIndices??[]).includes(v):part.contact)?[i]:[]),free:flat.flatMap((v,i)=>v>=part.start&&v<part.start+part.count&&(name==='outfit'?!(part.contactIndices??[]).includes(v):!part.contact)?[i]:[]),boundary:flat.flatMap((v,i)=>part.boundary.includes(v)?[i]:[])}]));
 const duplicates=new Map();flat.forEach((v,i)=>{const key=positions.slice(i*3,i*3+3).map(n=>Math.round(n*1e7)).join(',');const ids=duplicates.get(key)??[];ids.push(i);duplicates.set(key,ids);});
 const binding={version:'pillagers-fit/0.2',id:ids[name],moduleSha256,rigSignature:adapters[0].body.rigSignature,recipe:{id:'meshy-modules-v2',version:1,blender:'4.5.9'},coordinateFrame:{up:'+Y',front:'+Z',unit:'metre',origin:'Meshy source bind'},construction:name==='pouch'?'intentional-asymmetry':'bilateral',skinning:name==='outfit'?'authored-four-native':'rigid-native-head',reviewScope:name==='outfit'?'adult-neutral-narrow-broad/idle-walk-run':'retained-proof',supportedAges:{min:name==='beard'||name==='outfit'?18:6,max:90},lods:Object.fromEntries(adapters.map((a,lod)=>[lod,{bodySha256:a.body.sha256,topology:a.topologySignature,anchors:name==='pouch'?[]:originalAnchors[lod],vertexAnchors:name==='pouch'?[]:flat,weights:name==='pouch'?[]:lodWeights[lod].map(({joints,weights})=>({joints,weights})),coverageTriangles:name==='outfit'?Array.from({length:a.source.triangles},(_,t)=>t).filter(t=>covered(a.source,t,necklineMinimum)):[]}])) ,regions,seams:[...duplicates.values()].filter(ids=>ids.length>1),garmentFrames:{}};
 if(name==='outfit'){binding.coverageRimContacts=flat.flatMap((v,i)=>contacts.has(v)&&source.parts.find(p=>v>=p.start&&v<p.start+p.count)?.name==='Module_tunic_panels'?[i]:[]);binding.coverageClipPlanes=[-1,1].map(side=>({regions:side===1?['UPPER_ARM_L','LOWER_ARM_L']:['UPPER_ARM_R','LOWER_ARM_R'],normal:[side*.38,-.923,-.06],constant:-new Vector3(side*.182,1.298,-.062).dot(new Vector3(side*.38,-.923,-.06))-.456}));let best=0,distance=Infinity;for(let i=0;i<flat.length;i++){const point=new Vector3().fromArray(positions,i*3),d=point.distanceToSquared(new Vector3(.14,1.03,.08));if(d<distance){best=i;distance=d;}}binding.coverageClipPlanes.push(neckOpening);binding.garmentFrames.belt_side_L={vertex:best,quaternion:[0,0,0,1]};}
 if(name==='pouch')binding.dependency={module:ids.outfit,frame:'belt_side_L'};
 const bindingBytes=Buffer.from(JSON.stringify(binding)+'\n');pending.push([resolve(out,name+'.binding.json'),bindingBytes]);
 const provenance={schemaVersion:2,route:'authored-template',moduleId:ids[name],moduleSha256,bindingSha256:hash(bindingBytes),sourceBodySha256:sourceHash,rigSignature:binding.rigSignature,recipe:{path:'scripts/characters/templates/meshy_modules_v2.py',sha256:recipeHash,version:1,blender:'4.5.9'},editableSource:'Assets/Characters/Human/Modules-v2/MeshyHuman_modules-v2.blend',editableSourceSha256:hash(readFileSync(resolve(editable,'MeshyHuman_modules-v2.blend'))),pipeline:{path:'scripts/prepare-meshy-modules.mjs',sha256:hash(readFileSync(fileURLToPath(import.meta.url))),weightAuthority:name==='outfit'?'authored-four-native-with-surface-rims':'native-head'},provider:null,concept:null,reviewStatus:'preview',visualApproval:null,openings:moduleBoundaryEvidence({sha256:moduleSha256,json:JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString()),binary:bytes.subarray(28+bytes.readUInt32LE(12))}),technicalViews:'Character Lab fixed front/back/side/RTS; all from this GLB',conditions:['Body-free export and linear broad material regions','Bounded source-derived contacts and deliberate free volumes','Bilateral construction except one-sided pouch','Native skin motion at all declared LODs','Garment dependency and exact snapshot binding identity']};
 pending.push([resolve(out,name+'.provenance.json'),JSON.stringify(provenance,null,2)+'\n']);const path='/character-lab/modules/meshy-v2/'+name+'.glb';
 const minimum=[Infinity,Infinity,Infinity],maximum=[-Infinity,-Infinity,-Infinity];positions.forEach((v,i)=>{minimum[i%3]=Math.min(minimum[i%3],v);maximum[i%3]=Math.max(maximum[i%3],v);});measurements[path]={sha256:moduleSha256,triangles:flat.length/3,materials:1,bytes:bytes.length,bounds:{min:minimum,max:maximum}};
 catalog.push({id:ids[name],name,path,binding:{path:path.replace('.glb','.binding.json'),sha256:hash(bindingBytes),rigSignature:binding.rigSignature},triangles:flat.length/3});console.log(name,flat.length/3+' triangles',bytes.length+' bytes');
}
for(const [path,bytes] of pending)writeFileSync(path,bytes);
writeFileSync(resolve(root,'src/characters/MeshyModuleMeasurements.ts'),'// Generated by assets:human-modules.\nexport const meshyModuleMeasurements='+JSON.stringify(measurements)+';\nexport const meshyModuleFiles='+JSON.stringify(catalog)+' as const;\n');
console.log('Editable template:',resolve(editable,'MeshyHuman_modules-v2.blend'));
