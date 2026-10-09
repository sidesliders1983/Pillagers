import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {accessorValues} from './glb-inspection.mjs';
import {inspectGeometryQuality} from './geometry-quality.mjs';
export const DEFAULT_VERTEX_PALETTE_PROFILE=Object.freeze({id:'constant-facet-vertex-palette/1',facetUnit:'coplanar-region',maxTriangles:10000,maxRenderVertices:30000,maxMaterials:2,maxColors:16,colorTolerance:1e-6,normalLengthTolerance:1e-4,hardNormalMinDot:.99999,coplanarAngleDegrees:.1,coplanarPlaneDistanceMetres:1e-6,opaque:true,closedTopology:true,gradientRegions:Object.freeze([])});
function canonical(value){if(Array.isArray(value))return value.map(canonical);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])]));return value;}
export function styleProfileHash(profile){return createHash('sha256').update(JSON.stringify(canonical(profile))).digest('hex');}
function parseGLB(bytes){
 if(!Buffer.isBuffer(bytes)||bytes.length<28||bytes.readUInt32LE(0)!==0x46546c67||bytes.readUInt32LE(4)!==2||bytes.readUInt32LE(8)!==bytes.length)throw Error('Invalid GLB2 header/length');
 let json,binary;for(let at=12;at<bytes.length;){if(at+8>bytes.length)throw Error('Truncated GLB chunk');const n=bytes.readUInt32LE(at),kind=bytes.readUInt32LE(at+4);at+=8;if(n%4||at+n>bytes.length)throw Error('Invalid GLB chunk');if(kind===0x4e4f534a){if(json||at!==20)throw Error('Invalid JSON chunk');json=JSON.parse(bytes.subarray(at,at+n).toString());}else if(kind===0x004e4942){if(binary)throw Error('Duplicate BIN chunk');binary=bytes.subarray(at,at+n);}else throw Error('Unexpected GLB chunk');at+=n;}if(json?.asset?.version!=='2.0'||!binary)throw Error('Missing glTF2 JSON/BIN');
 return {bytes,json,binary,sha256:createHash('sha256').update(bytes).digest('hex')};
}
export function readLocalGLB(path){return parseGLB(readFileSync(path));}
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&(Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null);
const hash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const limits=Object.freeze({colorTolerance:[0,1e-6],normalLengthTolerance:[0,1e-4],hardNormalMinDot:[.99999,1],coplanarAngleDegrees:[.1,.1],coplanarPlaneDistanceMetres:[1e-6,1e-6]});
function checkProfile(declaration,profile,fail){
 if(!plain(declaration)){fail('PROFILE_INVALID','Profile must be a plain declarative object');return;}
 for(const key of Object.keys(declaration))if(!Object.hasOwn(DEFAULT_VERTEX_PALETTE_PROFILE,key))fail(key==='allowGradients'?'GRADIENT_BYPASS':'PROFILE_INVALID','Unknown profile field: '+key);
 if(typeof profile.id!=='string'||!profile.id.length||profile.id.length>100||!/^[a-z0-9/._-]+$/.test(profile.id))fail('PROFILE_INVALID','Profile id must be a bounded nonempty identifier');
 for(const key of ['maxTriangles','maxRenderVertices','maxMaterials','maxColors'])if(!Number.isInteger(profile[key])||profile[key]<=0||profile[key]>DEFAULT_VERTEX_PALETTE_PROFILE[key])fail('PROFILE_INVALID',key+' must be a positive integer within the repository ceiling');
 for(const [key,[min,max]]of Object.entries(limits))if(!Number.isFinite(profile[key])||profile[key]<min||profile[key]>max)fail('PROFILE_INVALID',key+' is outside the fixed strict tolerance range');
 for(const key of ['opaque','closedTopology'])if(typeof profile[key]!=='boolean')fail('PROFILE_INVALID',key+' must be a boolean');
 if(!['triangle','coplanar-region'].includes(profile.facetUnit))fail('PROFILE_INVALID','facetUnit must declare triangle or coplanar-region');
 const regions=profile.gradientRegions;if(!Array.isArray(regions)||regions.length>64){fail('PROFILE_INVALID','gradientRegions must be a bounded declarative array');return;}
 const allowed=['mesh','primitive','triangles','axis','fromMetres','toMetres','startRGBA','endRGBA'];
 for(const region of regions){
  if(!plain(region)||Object.keys(region).some(key=>!allowed.includes(key))||!Number.isInteger(region.mesh)||region.mesh<0||!Number.isInteger(region.primitive)||region.primitive<0||!Array.isArray(region.triangles)||region.triangles.length===0||region.triangles.length>profile.maxTriangles||!region.triangles.every(t=>Number.isInteger(t)&&t>=0)||new Set(region.triangles).size!==region.triangles.length||!Number.isInteger(region.axis)||region.axis<0||region.axis>2||!Number.isFinite(region.fromMetres)||!Number.isFinite(region.toMetres)||region.toMetres<=region.fromMetres||![region.startRGBA,region.endRGBA].every(c=>Array.isArray(c)&&c.length===4&&c.every(v=>Number.isFinite(v)&&v>=0&&v<=1)))fail('GRADIENT_DECLARATION','Gradient requires exact bounded mesh/primitive/triangle scopes, axis/range and normalized RGBA stops');
 }
}
function activeMeshes(json){
 if(!Array.isArray(json.scenes)||!json.scenes.length||!Number.isInteger(json.scene??0)||!json.scenes[json.scene??0]||!Array.isArray(json.nodes)||!Array.isArray(json.scenes[json.scene??0].nodes))throw Error('A valid explicit active scene and nodes are required');
 const pending=[...json.scenes[json.scene??0].nodes],seen=new Set(),meshes=[];
 while(pending.length){const id=pending.pop();if(!Number.isInteger(id)||id<0||!plain(json.nodes[id])||seen.has(id))throw Error('Invalid, cyclic or multiply parented active scene node');seen.add(id);const node=json.nodes[id];if(node.mesh!==undefined){if(!Number.isInteger(node.mesh)||node.mesh<0||!json.meshes?.[node.mesh])throw Error('Active node references a missing mesh');meshes.push(node.mesh);}if(node.children!==undefined&&!Array.isArray(node.children))throw Error('Node children must be an array');pending.push(...(node.children??[]));}
 return meshes;
}

const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),sub=(a,b)=>a.map((v,i)=>v-b[i]),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],norm=a=>Math.hypot(...a),key=a=>a.map(v=>v.toFixed(6)).join(','),rgba=c=>[...c.slice(0,3),c[3]??1];
const equal=(a,b,tol)=>a.length===b.length&&a.every((v,i)=>Math.abs(v-b[i])<=tol);
function textureKeys(obj,path='material'){if(!obj||typeof obj!=='object')return [];return Object.entries(obj).flatMap(([k,v])=>[...(k.toLowerCase().endsWith('texture')?[path+'.'+k]:[]),...textureKeys(v,path+'.'+k)]);}
/** Generic technical style checks. A pass never certifies intentional planes, fit or visual acceptance. */
export function validateVertexPaletteStyle(record,declaration={},authority={}){
 const profile={...DEFAULT_VERTEX_PALETTE_PROFILE,...(plain(declaration)?declaration:{})},issues=[],warnings=[],diagnostics={profileId:profile.id,profileHash:null,triangles:0,authoredTriangles:0,renderedTriangles:0,authoredVertices:0,renderVertices:0,materials:0,uniqueColors:0,coplanarColorDiscontinuities:0,coplanarExamples:[],gradientRegions:0,technicalPassIsVisualAcceptance:false,issueCounts:{}};
 const finish=()=>({valid:issues.length===0,issues,warnings,diagnostics,qualification:profile.facetUnit==='triangle'?'conditional-diagnostic':'technical-only',scope:'technical vertex-palette policy only; intentional planes, silhouette, morphology, sockets, fit, animation and visual acceptability require independent validation'});
 const fail=(code,message,detail)=>{diagnostics.issueCounts[code]=(diagnostics.issueCounts[code]??0)+1;if(!issues.some(i=>i.code===code))issues.push({code,message,...(detail?{firstDetail:detail}:{})});};
 checkProfile(declaration,profile,fail);if(issues.length)return finish();diagnostics.profileHash=styleProfileHash(profile);diagnostics.gradientRegions=profile.gradientRegions.length;
 if(!plain(authority)||Object.keys(authority).some(key=>key!=='reviewedGradientProfiles')||authority.reviewedGradientProfiles!==undefined&&(!Array.isArray(authority.reviewedGradientProfiles)||!authority.reviewedGradientProfiles.every(r=>plain(r)&&hash(r.profileHash)&&hash(r.sourceSHA256)&&typeof r.status==='string'&&typeof r.evidence==='string'&&r.evidence.trim().length))) {fail('AUTHORITY_INVALID','Gradient authority must be external reviewed source/profile hash records');return finish();}
 try{const actual=parseGLB(record?.bytes);if(actual.sha256!==record.sha256||JSON.stringify(canonical(actual.json))!==JSON.stringify(canonical(record.json))||!Buffer.isBuffer(record.binary)||!actual.binary.equals(record.binary))throw Error('Decoded record or hash differs from actual GLB bytes');record=actual;}catch(error){fail('RECORD_INVALID',String(error.message));return finish();}
 if(!Array.isArray(record.json.materials)||!Array.isArray(record.json.meshes)){fail('ASSET_STRUCTURE','Materials and authored meshes must be arrays');return finish();}
 let instances;try{instances=activeMeshes(record.json);}catch(error){fail('SCENE_INVALID',String(error.message));instances=[];}
 diagnostics.materials=record.json.materials.length;
 const meshCounts=new Map();
 if((record.json.images?.length??0)||(record.json.textures?.length??0))fail('PAINTED_MAP_POLICY','Selected vertex-palette policy permits no images or texture resources');
 if(diagnostics.materials===0||diagnostics.materials>profile.maxMaterials)fail('MATERIAL_BUDGET','Material count outside selected budget');
 for(const [index,m]of(record.json.materials??[]).entries()){
  if(!plain(m)){fail('MATERIAL_FACTOR','Material must be an object',{index});continue;}
  const f=m.pbrMetallicRoughness?.baseColorFactor??[1,1,1,1];
  if(!Array.isArray(f)||f.length!==4||f.some(v=>!Number.isFinite(v)||v<0||v>1))fail('MATERIAL_FACTOR','Base-color factor must be finite normalized RGBA',{index});
  else {if(!equal(f.slice(0,3),[1,1,1],profile.colorTolerance))fail('MATERIAL_RGB','Base-color RGB must be neutral white; tint multiplication defeats white facets',{index,factor:f});if(profile.opaque&&(Math.abs(f[3]-1)>profile.colorTolerance||(m.alphaMode??'OPAQUE')!=='OPAQUE'))fail('MATERIAL_ALPHA','Opaque policy requires alpha1 and OPAQUE mode',{index});}
  const maps=textureKeys(m);if(maps.length)fail('MATERIAL_MAP_POLICY','Albedo/normal/noise/other texture maps are prohibited under selected policy',{index,maps});
 }
 const regions=profile.gradientRegions??[],gradientLookup=new Map();
 if(!Array.isArray(regions))fail('PROFILE_INVALID','gradientRegions must be a bounded declarative array');
 else if(regions.length){
  const hash=styleProfileHash(profile),review=(authority.reviewedGradientProfiles??[]).find(r=>r.profileHash===hash&&r.sourceSHA256===record.sha256&&r.status==='approved'&&typeof r.evidence==='string'&&r.evidence.length);
  if(!review)fail('GRADIENT_UNREVIEWED','Gradient profile and exact source hashes require external reviewed authority; declaration alone cannot approve itself');
  for(const [ri,r]of regions.entries()){
   const valid=Number.isInteger(r.mesh)&&Number.isInteger(r.primitive)&&Array.isArray(r.triangles)&&r.triangles.length>0&&r.triangles.every(t=>Number.isInteger(t)&&t>=0)&&Number.isInteger(r.axis)&&r.axis>=0&&r.axis<=2&&Number.isFinite(r.fromMetres)&&Number.isFinite(r.toMetres)&&r.toMetres>r.fromMetres&&Array.isArray(r.startRGBA)&&Array.isArray(r.endRGBA)&&[r.startRGBA,r.endRGBA].every(c=>c.length===4&&c.every(v=>Number.isFinite(v)&&v>=0&&v<=1));
   if(!valid){fail('GRADIENT_DECLARATION','Gradient requires exact mesh/primitive/triangles, axis/range and two finite normalized RGBA stops',{region:ri});continue;}
   for(const ti of r.triangles){const k=`${r.mesh}:${r.primitive}:${ti}`;if(gradientLookup.has(k))fail('GRADIENT_OVERLAP','Gradient scopes must not overlap',{triangle:k});gradientLookup.set(k,r);}
  }
 }
 const seenGradientTriangles=new Set(),palette=new Set();
 for(const [mi,mesh]of(record.json.meshes??[]).entries()){
  if(!plain(mesh)||!Array.isArray(mesh.primitives)){fail('MESH_INVALID','Authored mesh must have primitive arrays',{mesh:mi});continue;}
  meshCounts.set(mi,{triangles:0,vertices:0});
  for(const [pi,p]of mesh.primitives.entries()){
  if(!plain(p)||!plain(p.attributes)){fail('MESH_INVALID','Primitive requires an attribute object',{mesh:mi,primitive:pi});continue;}
  if(!Number.isInteger(p.material)||p.material<0||p.material>=record.json.materials.length)fail('MATERIAL_REFERENCE','Each primitive must select a valid vertex-palette material',{mesh:mi,primitive:pi});
  if((p.mode??4)!==4){fail('TRIANGLE_MODE','Only explicit triangular primitives supported',{mesh:mi,primitive:pi});continue;}
  let positions,normals,colors,indices;
  try {positions=accessorValues(record.json,record.binary,p.attributes.POSITION);indices=p.indices===undefined?positions.map((_,i)=>i):accessorValues(record.json,record.binary,p.indices).map(([i])=>i);}catch(error){fail('ACCESSOR_INVALID',String(error.message),{mesh:mi,primitive:pi});continue;}
  if(record.json.accessors[p.attributes.POSITION].type!=='VEC3'){fail('GEOMETRY_ATTRIBUTE_TYPE','POSITION requires VEC3');continue;}
  // Geometric presence and budgets are independent of absent/invalid palette or normals.
  diagnostics.authoredVertices+=positions.length;meshCounts.get(mi).vertices+=positions.length;
  for(let at=0;at+2<indices.length;at+=3){const ids=indices.slice(at,at+3);if(ids.some(i=>!Number.isInteger(i)||i<0||i>=positions.length)){fail('INDEX_INVALID','Triangle index outside attribute arrays');continue;}diagnostics.triangles++;meshCounts.get(mi).triangles++;}
  try {normals=accessorValues(record.json,record.binary,p.attributes.NORMAL);colors=accessorValues(record.json,record.binary,p.attributes.COLOR_0).map(rgba);}catch(error){fail('ACCESSOR_INVALID',String(error.message),{mesh:mi,primitive:pi});continue;}
  if(record.json.accessors[p.attributes.NORMAL].type!=='VEC3'){fail('GEOMETRY_ATTRIBUTE_TYPE','NORMAL requires VEC3');continue;}
  const ca=record.json.accessors[p.attributes.COLOR_0];if(!['VEC3','VEC4'].includes(ca.type)||![5121,5123,5126].includes(ca.componentType)||ca.componentType!==5126&&!ca.normalized)fail('COLOR_ENCODING','COLOR_0 must be float or normalized unsigned RGB/RGBA');
  if(normals.length!==positions.length||colors.length!==positions.length||indices.length%3){fail('ATTRIBUTE_CORRESPONDENCE','Positions/normals/colors/triangular indices must correspond');continue;}
  if(colors.some(c=>c.some(v=>!Number.isFinite(v)||v<0||v>1)))fail('COLOR_NORMALIZED','COLOR_0 channels must be finite and within0..1');
  if(profile.opaque&&colors.some(c=>Math.abs(c[3]-1)>profile.colorTolerance))fail('VERTEX_ALPHA','Opaque policy requires vertex alpha1');
  if(normals.some(n=>Math.abs(norm(n)-1)>profile.normalLengthTolerance))fail('NORMAL_UNIT','Each shading normal must have unit length');
  const triangles=[],edgeOwners=new Map();
  for(let at=0;at<indices.length;at+=3){const ti=at/3,ids=indices.slice(at,at+3);if(ids.some(i=>!Number.isInteger(i)||i<0||i>=positions.length)){fail('INDEX_INVALID','Triangle index outside attribute arrays');continue;}
   const pts=ids.map(i=>positions[i]),cols=ids.map(i=>colors[i]),n=cross(sub(pts[1],pts[0]),sub(pts[2],pts[0])),length=norm(n),unit=n.map(v=>v/length);
   if(length>1e-12&&ids.some(i=>dot(normals[i],unit)<profile.hardNormalMinDot))fail('HARD_NORMAL','Triangle corner normals must align with its geometric face plane',{mesh:mi,primitive:pi,triangle:ti});
   const gradientKey=`${mi}:${pi}:${ti}`,gradient=gradientLookup.get(gradientKey);
   if(gradient){seenGradientTriangles.add(gradientKey);for(let k=0;k<3;k++){const t=Math.max(0,Math.min(1,(pts[k][gradient.axis]-gradient.fromMetres)/(gradient.toMetres-gradient.fromMetres))),expected=gradient.startRGBA.map((v,i)=>v+(gradient.endRGBA[i]-v)*t);if(!equal(cols[k],expected,profile.colorTolerance))fail('GRADIENT_VALUE','Actual vertex color differs from reviewed declared gradient',{triangle:gradientKey,corner:k});}palette.add(key(gradient.startRGBA));palette.add(key(gradient.endRGBA));}
   else {if(!equal(cols[0],cols[1],profile.colorTolerance)||!equal(cols[0],cols[2],profile.colorTolerance))fail('FACET_COLOR_VARIATION','All three corners of a constant facet must have the same color',{mesh:mi,primitive:pi,triangle:ti});cols.forEach(c=>palette.add(key(c)));}
   triangles.push({ti,pts,unit,cols,gradient:!!gradient});
   for(let k=0;k<3;k++){const e=[key(pts[k]),key(pts[(k+1)%3])].sort().join('|');if(!edgeOwners.has(e))edgeOwners.set(e,[]);edgeOwners.get(e).push(triangles.length-1);}
  }
  for(const [edge,owners]of edgeOwners)if(owners.length===2){const [a,b]=owners.map(i=>triangles[i]);if(a.gradient||b.gradient)continue;const coplanar=dot(a.unit,b.unit)>=Math.cos(profile.coplanarAngleDegrees*Math.PI/180)&&b.pts.every(pt=>Math.abs(dot(a.unit,sub(pt,a.pts[0])))<=profile.coplanarPlaneDistanceMetres);
   if(coplanar&&!equal(a.cols[0],b.cols[0],profile.colorTolerance)){diagnostics.coplanarColorDiscontinuities++;if(diagnostics.coplanarExamples.length<10)diagnostics.coplanarExamples.push({mesh:mi,primitive:pi,triangles:[a.ti,b.ti],edge});}
  }
 }
 }
 diagnostics.authoredTriangles=diagnostics.triangles;
 for(const mesh of instances){diagnostics.renderedTriangles+=meshCounts.get(mesh)?.triangles??0;diagnostics.renderVertices+=meshCounts.get(mesh)?.vertices??0;}
 if(diagnostics.authoredTriangles===0)fail('EMPTY_AUTHORED_GEOMETRY','The asset must contain actual authored triangles');
 if(diagnostics.renderedTriangles===0)fail('EMPTY_RENDERED_GEOMETRY','The active scene must render actual triangles');
 if(profile.facetUnit==='triangle')warnings.push({code:'TRIANGLE_POLICY_DIAGNOSTIC',message:'Triangle-unit checks are conditional diagnostics; they cannot satisfy coplanar-region proof acceptance'});
 for(const k of gradientLookup.keys())if(!seenGradientTriangles.has(k))fail('GRADIENT_SCOPE','Declared gradient references a missing triangle',{triangle:k});
 diagnostics.uniqueColors=palette.size;if(diagnostics.authoredTriangles>profile.maxTriangles||diagnostics.renderedTriangles>profile.maxTriangles)fail('TRIANGLE_BUDGET','Triangle budget exceeded');if(diagnostics.authoredVertices>profile.maxRenderVertices||diagnostics.renderVertices>profile.maxRenderVertices)fail('VERTEX_BUDGET','Render vertex budget exceeded');if(palette.size>profile.maxColors)fail('PALETTE_BUDGET','Constant-facet/declared-stop palette budget exceeded');
 if(diagnostics.coplanarColorDiscontinuities){if(profile.facetUnit==='coplanar-region')fail('COPLANAR_COLOR_DISCONTINUITY','Declared planar facets have inconsistent colors');else warnings.push({code:'COPLANAR_COLOR_DIAGNOSTIC',message:'Triangle-unit policy permits these boundaries; human review must establish intentional facets/semantic borders, not paint noise'});}
 if(!issues.some(issue=>issue.code==='SCENE_INVALID'))try {diagnostics.geometryQuality=inspectGeometryQuality(record);for(const k of ['unusedVertices','degenerateTriangles','duplicateTriangles','invalidNormals','opposedNormals','nonManifoldEdges','nonManifoldVertices'])if(diagnostics.geometryQuality[k])fail('GEOMETRY_'+k.toUpperCase(),k+' detected');if(profile.closedTopology&&diagnostics.geometryQuality.boundaryEdges)fail('GEOMETRY_BOUNDARY','Closed-module policy requires no boundary edges');}catch(error){fail('GEOMETRY_INVALID',String(error.message));}
 return finish();
}

/** Repository-controlled policy choices. Input GLBs and CLI flags cannot approve or weaken them. */
export const STYLE_FAMILY_PROFILES=Object.freeze({
 'body-proof':Object.freeze({...DEFAULT_VERTEX_PALETTE_PROFILE,id:'body-proof-vertex-palette/1',maxTriangles:1600,maxRenderVertices:4800,maxMaterials:1,facetUnit:'coplanar-region'}),
 // Open modules require a separate source-bound intended-opening receipt.
 'v04-head-source':Object.freeze({...DEFAULT_VERTEX_PALETTE_PROFILE,id:'v04-head-source-vertex-palette/1',maxTriangles:1000,maxRenderVertices:3000,maxMaterials:1,maxColors:4,closedTopology:false,facetUnit:'coplanar-region'}),
 'v04-outfit-source':Object.freeze({...DEFAULT_VERTEX_PALETTE_PROFILE,id:'v04-outfit-source-vertex-palette/1',maxTriangles:2400,maxRenderVertices:7200,maxMaterials:1,maxColors:8,closedTopology:false,facetUnit:'coplanar-region'}),
 'v04-outfit-runtime':Object.freeze({...DEFAULT_VERTEX_PALETTE_PROFILE,id:'v04-outfit-runtime-vertex-palette/1',maxTriangles:4400,maxRenderVertices:13200,maxMaterials:1,maxColors:8,closedTopology:false,facetUnit:'coplanar-region'}),
 'v04-equipment-source':Object.freeze({...DEFAULT_VERTEX_PALETTE_PROFILE,id:'v04-equipment-source-vertex-palette/1',maxTriangles:1000,maxRenderVertices:3000,maxMaterials:1,maxColors:4,closedTopology:true,facetUnit:'coplanar-region'}),
 'meshy-v2-head':Object.freeze({...DEFAULT_VERTEX_PALETTE_PROFILE,id:'meshy-v2-head/1',maxTriangles:600,maxRenderVertices:1800,maxMaterials:1,maxColors:4,closedTopology:false,facetUnit:'coplanar-region'}),
 'meshy-v2-clothing':Object.freeze({...DEFAULT_VERTEX_PALETTE_PROFILE,id:'meshy-v2-clothing/1',maxTriangles:1700,maxRenderVertices:5100,maxMaterials:1,maxColors:4,closedTopology:false,facetUnit:'coplanar-region'}),
 'meshy-v2-accessory':Object.freeze({...DEFAULT_VERTEX_PALETTE_PROFILE,id:'meshy-v2-accessory/1',maxTriangles:300,maxRenderVertices:900,maxMaterials:1,maxColors:4,closedTopology:true,facetUnit:'coplanar-region'}),
 'diagnostic-triangle':Object.freeze({...DEFAULT_VERTEX_PALETTE_PROFILE,id:'diagnostic-triangle-vertex-palette/1',facetUnit:'triangle'}),
});
