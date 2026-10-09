import {validateTemplateProvenance} from './template-provenance.mjs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {Matrix4,Quaternion,Vector3} from 'three';
import {accessorValues} from './glb-inspection.mjs';
import {inspectGeometryQuality} from './geometry-quality.mjs';
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');

/** Exact canonical boundary signatures, after the same metric positional weld
 * used by geometry quality. Flat-normal/color corners are not separate seams.
 * This describes evidence; it never declares an opening visually acceptable. */
export function moduleBoundaryEvidence(record,{weldTolerance=1e-6}={}){
 assert.equal(weldTolerance,1e-6,'canonical opening evidence uses the fixed 1 micron metric weld');
 const {json,binary}=record,points=[],parents=[],buckets=new Map(),faces=[];
 const find=id=>{while(parents[id]!==id){parents[id]=parents[parents[id]];id=parents[id];}return id;};
 const add=point=>{
  const id=points.length;points.push(point);parents.push(id);const cell=point.map(v=>Math.floor(v/weldTolerance));
  for(let x=-1;x<=1;x++)for(let y=-1;y<=1;y++)for(let z=-1;z<=1;z++)for(const other of buckets.get([cell[0]+x,cell[1]+y,cell[2]+z].join(','))??[])
   if(point.reduce((sum,v,k)=>sum+(v-points[other][k])**2,0)<=weldTolerance**2)parents[find(id)]=find(other);
  const key=cell.join(',');if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(id);return id;
 };
 const visit=(mesh,matrix)=>{const pools=new Map();for(const p of mesh.primitives){let ids=pools.get(p.attributes.POSITION);if(!ids){ids=accessorValues(json,binary,p.attributes.POSITION).map(v=>add(new Vector3(...v).applyMatrix4(matrix).toArray()));pools.set(p.attributes.POSITION,ids);}const indices=p.indices===undefined?ids.map((_,i)=>i):accessorValues(json,binary,p.indices).flat();for(let i=0;i<indices.length;i+=3)faces.push(indices.slice(i,i+3).map(index=>ids[index]));}};
 if(!json.nodes?.length){for(const mesh of json.meshes??[])visit(mesh,new Matrix4());}
 else{
  const children=new Set(json.nodes.flatMap(n=>n.children??[])),roots=json.scenes?.[json.scene??0]?.nodes??json.nodes.map((_,i)=>i).filter(i=>!children.has(i));
  const walk=(id,parent,ancestry)=>{assert.ok(!ancestry.has(id),'cyclic canonical mesh scene');const n=json.nodes[id];assert.ok(n,'missing canonical mesh node');const local=n.matrix?new Matrix4().fromArray(n.matrix):new Matrix4().compose(new Vector3(...(n.translation??[0,0,0])),new Quaternion(...(n.rotation??[0,0,0,1])),new Vector3(...(n.scale??[1,1,1]))),matrix=parent.clone().multiply(local);if(n.mesh!==undefined)visit(json.meshes[n.mesh],matrix);for(const child of n.children??[])walk(child,matrix,new Set([...ancestry,id]));};
  for(const root of roots)walk(root,new Matrix4(),new Set());
 }
 // Choose a stable coordinate representative for every metric welded cluster.
 const canonical=new Map();for(let id=0;id<points.length;id++){const root=find(id),key=points[id].map(v=>Math.round(v/weldTolerance)).join(',');if(!canonical.has(root)||key<canonical.get(root))canonical.set(root,key);}
 const edges=new Map();for(const face of faces){const ids=face.map(find);for(let k=0;k<3;k++){const a=ids[k],b=ids[(k+1)%3],key=a<b?a+','+b:b+','+a;edges.set(key,(edges.get(key)??0)+1);}}
 const boundary=[...edges].filter(([,count])=>count===1).map(([edge])=>edge.split(',').map(Number)),adjacency=new Map();
 for(const [a,b]of boundary)for(const [s,t]of [[a,b],[b,a]]){if(!adjacency.has(s))adjacency.set(s,new Set());adjacency.get(s).add(t);}
 const remaining=new Set(adjacency.keys()),loops=[];
 while(remaining.size){const first=remaining.values().next().value,pending=[first],vertices=[];remaining.delete(first);while(pending.length){const id=pending.pop();vertices.push(id);assert.equal(adjacency.get(id).size,2,'canonical boundary is not one closed manifold loop');for(const next of adjacency.get(id))if(remaining.delete(next))pending.push(next);}assert.ok(vertices.length>=3,'canonical boundary loop is too short');const members=new Set(vertices),loopEdges=boundary.filter(([a,b])=>members.has(a)&&members.has(b)).map(pair=>pair.map(id=>canonical.get(id)).sort().join('|')).sort();const positions=vertices.map(id=>canonical.get(id).split(',').map(v=>Number(v)*weldTolerance));loops.push({edgeHashSHA256:sha256(JSON.stringify(loopEdges)),vertices:vertices.length,edges:loopEdges.length,bounds:{min:[0,1,2].map(k=>Math.min(...positions.map(p=>p[k]))),max:[0,1,2].map(k=>Math.max(...positions.map(p=>p[k])))}});}
 loops.sort((a,b)=>a.edgeHashSHA256.localeCompare(b.edgeHashSHA256));return {schema:'pillagers-intentional-openings/1',outputSha256:record.sha256,weldTolerance,boundaryEdges:boundary.length,loops};
}

function validateV04AuthoringReceipt(asset,canonical,outputSha256,{authoringReceiptBytes,record},fail){
 fail(Buffer.isBuffer(authoringReceiptBytes)||authoringReceiptBytes instanceof Uint8Array,'actual public authoring receipt bytes are required');
 fail(sha256(authoringReceiptBytes)===canonical.authoringReceiptSHA256,'authoring receipt bytes/hash are stale');
 let receipt;try{receipt=JSON.parse(Buffer.from(authoringReceiptBytes).toString('utf8').replace(/^\uFEFF/,''));}catch{fail(false,'authoring receipt is not valid JSON');}
 fail(receipt.input?.sha256===canonical.inputMeshSHA256,'authoring receipt input disagrees with generated mesh');
 fail(receipt.output?.sha256===outputSha256,'authoring receipt output disagrees with module GLB');
 fail(receipt.calibration?.units==='metres'&&receipt.calibration.up==='+Y'&&receipt.calibration.front==='+Z','authoring receipt canonical frame disagrees');
 assert.deepEqual(receipt.metadata,asset.metadata,asset.id+': authoring receipt metadata differs from registry');
 fail(record?.sha256===outputSha256,'actual module GLB record is required for authoring receipt validation');
 const quality=inspectGeometryQuality(record);
 for(const key of ['unusedVertices','degenerateTriangles','duplicateTriangles','invalidNormals','opposedNormals','nonManifoldEdges','nonManifoldVertices'])fail(quality[key]===0,'v0.4 source topology is unqualified: '+key+'='+quality[key]);
 fail(receipt.output.triangles===quality.triangles,'authoring receipt output triangle count is stale');
 for(const key of ['triangles','unusedVertices','degenerateTriangles','duplicateTriangles','invalidNormals','opposedNormals','boundaryEdges','nonManifoldEdges','nonManifoldVertices','components'])fail(receipt.topology?.[key]===quality[key],'authoring receipt topology '+key+' is stale');
 const actual=moduleBoundaryEvidence(record),declared=receipt.intentionalOpenings;
 if(!actual.boundaryEdges){fail(declared===undefined||declared.schema===actual.schema&&declared.outputSha256===outputSha256&&declared.boundaryEdges===0&&Array.isArray(declared.loops)&&declared.loops.length===0,'closed module declares stale opening evidence');return receipt;}
 fail(asset.type!=='equipment','rigid equipment must be closed');
 fail(declared?.schema===actual.schema&&declared.outputSha256===outputSha256&&declared.weldTolerance===actual.weldTolerance&&declared.boundaryEdges===actual.boundaryEdges&&Array.isArray(declared.loops),'missing source-specific intentional opening evidence');
 const roles=asset.type==='garment'?['neck','armhole','cuff','waist','hem','ankle','foot-contact','layer-opening']:asset.type==='beard'?['face-contact','mouth-aperture']:['hairline','scalp-cavity','face-contact'];
 const ids=new Set(),signatures=new Set();
 for(const loop of declared.loops){fail(typeof loop.id==='string'&&loop.id.length>0&&!ids.has(loop.id),'opening IDs must be unique');ids.add(loop.id);fail(roles.includes(loop.role)&&typeof loop.reason==='string'&&loop.reason.trim().length>=12,'opening needs a module-specific role and authoring reason');fail(!signatures.has(loop.edgeHashSHA256),'duplicate intentional opening evidence');signatures.add(loop.edgeHashSHA256);const measured=actual.loops.find(item=>item.edgeHashSHA256===loop.edgeHashSHA256);fail(!!measured,'intentional opening signature does not match actual GLB boundary');for(const key of ['vertices','edges','bounds'])assert.deepEqual(loop[key],measured[key],asset.id+': intentional opening '+key+' is stale');}
 fail(declared.loops.length===actual.loops.length,'unaccounted canonical boundary loop');return receipt;
}


/** Validate the embedded authoring history without requiring local scratch files.
 * Historical optimization wrappers do not always store their immediate output;
 * missing historical links remain unverified, rather than being invented.
 */
export function validateModuleProvenance(asset,lod,provenance,outputSha256,{allowLabPreview=false,authoringReceiptBytes,record}={}){
 if(asset.scope==='body-bound')return validateTemplateProvenance(asset,provenance,outputSha256,{allowLabPreview,record});
 const fail=(condition,message)=>assert.ok(condition,`${asset.id} LOD${lod}: ${message}`),sha=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
 fail(provenance&&typeof provenance==='object','missing module provenance');
 fail(provenance.outputSha256===outputSha256,'stale generated provenance');
 const generationSources=new Set(),sourceLinks=[];
 const walk=(value,path='provenance')=>{
  if(!value||typeof value!=='object')return;
  if(Array.isArray(value)){value.forEach((item,index)=>walk(item,`${path}[${index}]`));return;}
  for(const [key,child]of Object.entries(value)){
   if(/^(?:sha256|sourceSha256|outputSha256|referenceSha256|inputSha256)$/.test(key))fail(sha(child),`${path}.${key}: invalid SHA256`);
   if(key==='redrawn')fail(child===false,`${path}: source reference was redrawn`);
  }
  const generation=value.generation;
  if(generation?.backend){
   fail(sha(generation.output?.sha256),`${path}: generated source output hash missing`);
   fail(sha(generation.input?.sha256),`${path}: generation input hash missing`);
   if(value.outputSha256!==undefined)fail(value.outputSha256===generation.output.sha256,`${path}: generation output hash disagrees with source stage`);
   generationSources.add(generation.output.sha256);
  }
  if(value.sourceSha256&&value.sourceProvenance){
   const parent=value.sourceProvenance;
   // Older extraction envelopes carry their pre-optimization output beside
   // generatedBust; batch optimization reports carry several LOD outputs.
   // Neither claims to be the immediate file named by this stage's source.
   const legacyEnvelope=!!(parent.generatedBust&&parent.extraction)||Array.isArray(parent.lods);
   const parentHash=legacyEnvelope?undefined:parent.outputSha256??parent.generation?.output?.sha256??parent.output?.sha256;
   if(parentHash){fail(value.sourceSha256===parentHash,`${path}: source hash disagrees with direct parent`);sourceLinks.push({path,sha256:parentHash,verified:true});}
   else sourceLinks.push({path,sha256:value.sourceSha256,verified:false,reason:legacyEnvelope?'historical extraction/batch envelope omits immediate source stage':'parent output hash not recorded'});
  }
  for(const [key,child]of Object.entries(value))walk(child,`${path}.${key}`);
 };
 walk(provenance);
 if(asset.tags?.includes('image-to-3d'))fail(generationSources.size>0,'missing image-to-3d source history');
 if(asset.sourceFrame)fail(generationSources.has(asset.sourceFrame.sourceSha256),'measured frame belongs to another generated source');
 if(Number(lod)===asset.runtimeLOD||asset.runtimeLOD==='requested'){
  const preview=allowLabPreview===true&&asset.scope==='lab-v04'&&asset.reviewStatus==='preview';
  fail(provenance.reviewRequired===false||preview&&provenance.reviewRequired===true,'runtime source still requires reference review');
 }
 if(asset.scope==='lab-v04'){
  const preview=allowLabPreview===true&&asset.reviewStatus==='preview';
  fail(asset.reviewStatus==='accepted'||preview,'unreviewed v0.4 catalog entry');
  if(!preview)fail(provenance.review?.status==='accepted','v0.4 final source lacks accepted visual review status');
  const canonical=provenance.v04Canonicalization;
  fail(canonical?.schema==='pillagers-v04-canonical-source/1','missing v0.4 source-bound canonicalization');
  fail(canonical.noPreV04Reuse===true&&canonical.units==='metres'&&canonical.up==='+Y'&&canonical.front==='+Z','invalid v0.4 source policy/frame');
  fail(asset.compatibleBodies?.some(b=>b.id===canonical.body?.id&&b.sha256===canonical.body?.sha256),'canonical calibration belongs to another body');
  fail(sha(canonical.inputMeshSHA256)&&generationSources.has(canonical.inputMeshSHA256),'canonical calibration is not tied to a real generated mesh');
  fail(sha(canonical.authoringReceiptSHA256)&&typeof canonical.authoringReceipt==='string'&&/^\/[\w/.-]+\.json$/.test(canonical.authoringReceipt)&&!canonical.authoringReceipt.includes('..'),'missing exact public authoring receipt');
  validateV04AuthoringReceipt(asset,canonical,outputSha256,{authoringReceiptBytes,record},fail);
 }
 return {generationSources:[...generationSources],sourceLinks};
}
