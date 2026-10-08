import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {readGLB} from '../scripts/characters/glb-inspection.mjs';
import {inspectGeometryQuality} from '../scripts/characters/geometry-quality.mjs';
import {validateModuleProvenance,moduleBoundaryEvidence} from '../scripts/characters/provenance-validation.mjs';
const raw='a'.repeat(64),stage='b'.repeat(64),output='c'.repeat(64),input='d'.repeat(64);
const asset={id:'hair/test',runtimeLOD:2,tags:['image-to-3d'],sourceFrame:{sourceSha256:raw}};
const history=()=>({outputSha256:output,sourceSha256:stage,reviewRequired:false,sourceProvenance:{outputSha256:stage,sourceSha256:raw,sourceProvenance:{outputSha256:raw,reviewRequired:true,reference:{redrawn:false},generation:{backend:'pixal3d',input:{sha256:input},output:{sha256:raw}}}}});
test('follows nested original generation through authoring stages; source review does not approve or reject derived runtime',()=>{
 const result=validateModuleProvenance(asset,2,history(),output);assert.deepEqual(result.generationSources,[raw]);assert.equal(result.sourceLinks.length,2);assert.ok(result.sourceLinks.every(link=>link.verified));
 const unreviewed=history();unreviewed.reviewRequired=true;assert.throws(()=>validateModuleProvenance(asset,2,unreviewed,output),/runtime source still requires reference review/);
});
test('rejects wrong direct parents, stale frames, corrupt hashes, redrawn references and missing generation history',()=>{
 const badParent=history();badParent.sourceSha256=raw;assert.throws(()=>validateModuleProvenance(asset,2,badParent,output),/source hash disagrees with direct parent/);
 assert.throws(()=>validateModuleProvenance({...asset,sourceFrame:{sourceSha256:stage}},2,history(),output),/measured frame belongs to another generated source/);
 const malformed=history();malformed.sourceSha256='bad';assert.throws(()=>validateModuleProvenance(asset,2,malformed,output),/invalid SHA256/);
 const redraw=history();redraw.sourceProvenance.sourceProvenance.reference.redrawn=true;assert.throws(()=>validateModuleProvenance(asset,2,redraw,output),/reference was redrawn/);
 assert.throws(()=>validateModuleProvenance(asset,2,{outputSha256:output,reviewRequired:false},output),/missing image-to-3d source history/);
});
test('legacy optimization wrappers retain honest unverified links while preserving their original generated source',()=>{
 for(const [id,path]of [['hair/short','public/appearance/short/Hair_short_LOD2.provenance.json'],['beard/stubble','public/appearance/beards/stubble/Beard_stubble_LOD2.provenance.json'],['garment/cream-tunic','public/clothing/cream-tunic/Clothing_cream-tunic_LOD2.provenance.json']]){
  const provenance=JSON.parse(readFileSync(new URL(`../${path}`,import.meta.url),'utf8')),result=validateModuleProvenance({id,runtimeLOD:2,tags:['image-to-3d']},2,provenance,provenance.outputSha256);
  assert.equal(result.generationSources.length,1);assert.ok(result.sourceLinks.some(link=>!link.verified));
 }
});


const receiptHash=bytes=>createHash('sha256').update(bytes).digest('hex');
function v04Fixture(record=readGLB('/character-lab/modules/v04/equipment/sword/sword.glb')){
 const body={id:'lab-body/golden-test',sha256:'e'.repeat(64)},a={...asset,type:'hair',scope:'lab-v04',reviewStatus:'preview',compatibleBodies:[body],metadata:{id:asset.id,type:'hair',authoringFrame:'canonical'}},p=history();
 p.outputSha256=record.sha256;p.reviewRequired=true;p.v04Canonicalization={schema:'pillagers-v04-canonical-source/1',noPreV04Reuse:true,units:'metres',up:'+Y',front:'+Z',body,inputMeshSHA256:raw,authoringReceipt:'/character-lab/test.authoring.json',authoringReceiptSHA256:''};
 const receipt={input:{sha256:raw},output:{sha256:record.sha256,triangles:inspectGeometryQuality(record).triangles},metadata:structuredClone(a.metadata),calibration:{units:'metres',up:'+Y',front:'+Z'},topology:inspectGeometryQuality(record)};
 const setReceipt=value=>{const bytes=Buffer.from(JSON.stringify(value));p.v04Canonicalization.authoringReceiptSHA256=receiptHash(bytes);return {record,authoringReceiptBytes:bytes,allowLabPreview:true};};
 return {a,p,receipt,record,setReceipt,options:setReceipt(receipt)};
}
test('new v04 canonical source requires actual receipt bytes and exact lineage; preview measurement never approves runtime',()=>{
 const {a,p,record,options}=v04Fixture();
 assert.throws(()=>validateModuleProvenance(a,2,p,record.sha256),/runtime source still requires/);
 assert.ok(validateModuleProvenance(a,2,p,record.sha256,options));
 assert.throws(()=>validateModuleProvenance({...a,reviewStatus:'accepted'},2,p,record.sha256,options),/runtime source still requires/);
 assert.throws(()=>validateModuleProvenance(asset,2,p,record.sha256,options),/runtime source still requires/);
 assert.throws(()=>validateModuleProvenance(a,2,p,record.sha256,{allowLabPreview:true,record}),/actual public authoring receipt bytes/);
 assert.throws(()=>validateModuleProvenance(a,2,p,record.sha256,{...options,authoringReceiptBytes:Buffer.from('{}')}),/receipt bytes\/hash are stale/);
 for(const mutate of [v=>v.v04Canonicalization.body.sha256='0'.repeat(64),v=>v.v04Canonicalization.inputMeshSHA256=record.sha256,v=>v.v04Canonicalization.noPreV04Reuse=false,v=>v.v04Canonicalization.front='-Z',v=>delete v.v04Canonicalization.authoringReceiptSHA256,v=>v.v04Canonicalization.authoringReceipt='/../private.json']){const changed=structuredClone(p);mutate(changed);assert.throws(()=>validateModuleProvenance(a,2,changed,record.sha256,options));}
});
test('receipt content cannot be authorized by rehashing wrong input, output, topology, frame or metadata',()=>{
 for(const mutate of [r=>r.input.sha256=stage,r=>r.output.sha256=stage,r=>r.output.triangles++,r=>r.calibration.front='-Z',r=>r.metadata.anchor='socket_back',r=>r.topology.boundaryEdges++]){
  const {a,p,record,receipt,setReceipt}=v04Fixture();mutate(receipt);const options=setReceipt(receipt);assert.throws(()=>validateModuleProvenance(a,2,p,record.sha256,options));
 }
 const {a,p,record,options}=v04Fixture();assert.throws(()=>validateModuleProvenance(a,2,p,record.sha256,{...options,record:undefined}),/actual module GLB record/);
});
function openPanel(){
 const values=[0,0,0,1,0,0,1,1,0,0,1,0],normals=Array.from({length:4},()=>[0,0,1]).flat(),indices=[0,1,2,0,2,3];const binary=Buffer.alloc(108);values.forEach((v,i)=>binary.writeFloatLE(v,i*4));normals.forEach((v,i)=>binary.writeFloatLE(v,48+i*4));indices.forEach((v,i)=>binary.writeUInt16LE(v,96+i*2));
 const json={scene:0,scenes:[{nodes:[0]}],nodes:[{mesh:0}],meshes:[{primitives:[{attributes:{POSITION:0,NORMAL:1},indices:2}]}],bufferViews:[{buffer:0,byteOffset:0,byteLength:48},{buffer:0,byteOffset:48,byteLength:48},{buffer:0,byteOffset:96,byteLength:12}],accessors:[{bufferView:0,componentType:5126,count:4,type:'VEC3'},{bufferView:1,componentType:5126,count:4,type:'VEC3'},{bufferView:2,componentType:5123,count:6,type:'SCALAR'}]};return {json,binary,sha256:receiptHash(Buffer.concat([Buffer.from(JSON.stringify(json)),binary]))};
}
test('intentional openings require exact closed boundary signatures and a source-specific semantic reason',()=>{
 const {a,p,receipt,record,setReceipt}=v04Fixture(openPanel()),measured=moduleBoundaryEvidence(record);assert.equal(measured.boundaryEdges,4);assert.equal(measured.loops.length,1);
 assert.throws(()=>validateModuleProvenance(a,2,p,record.sha256,setReceipt(receipt)),/missing source-specific intentional opening evidence/);
 receipt.intentionalOpenings={...measured,loops:measured.loops.map(loop=>({...loop,id:'hairline-1',role:'hairline',reason:'Authored open rim follows the scalp contact boundary.'}))};
 assert.ok(validateModuleProvenance(a,2,p,record.sha256,setReceipt(receipt)));
 for(const mutate of [r=>r.intentionalOpenings.loops[0].edgeHashSHA256=raw,r=>r.intentionalOpenings.loops[0].edges++,r=>r.intentionalOpenings.loops[0].role='cuff',r=>r.intentionalOpenings.loops[0].reason='waived',r=>r.intentionalOpenings.loops.push({...r.intentionalOpenings.loops[0]}),r=>r.intentionalOpenings.outputSha256=raw]){const bad=structuredClone(receipt);mutate(bad);assert.throws(()=>validateModuleProvenance(a,2,p,record.sha256,setReceipt(bad)));}
 const transformed={...record,json:structuredClone(record.json)};transformed.json.nodes[0].translation=[.01,0,0];assert.notEqual(moduleBoundaryEvidence(transformed).loops[0].edgeHashSHA256,measured.loops[0].edgeHashSHA256);
 const equipment={...a,type:'equipment'};assert.throws(()=>validateModuleProvenance(equipment,2,p,record.sha256,setReceipt(receipt)),/rigid equipment must be closed/);
});

test('final v04 validation rejects preview catalog entries and failed visual review despite a false reviewRequired flag',()=>{
 const {a,p,record,options}=v04Fixture();p.reviewRequired=false;
 assert.throws(()=>validateModuleProvenance(a,2,p,record.sha256,{...options,allowLabPreview:false}),/unreviewed v0.4 catalog entry/);
 const accepted={...a,reviewStatus:'accepted'};for(const status of [undefined,'preview','HOLD','rejected']){p.review={status};assert.throws(()=>validateModuleProvenance(accepted,2,p,record.sha256,options),/lacks accepted visual review status/);}
 p.review={status:'accepted'};assert.ok(validateModuleProvenance(accepted,2,p,record.sha256,options));
});
