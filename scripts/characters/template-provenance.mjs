import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {createHash} from 'node:crypto';import {fileURLToPath} from 'node:url';
import {publicFile,accessorValues} from './glb-inspection.mjs';import {moduleBoundaryEvidence} from './provenance-validation.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
/** Explicit authored-template route. Historical Imagegen/provider routes retain their checks. */
export function validateTemplateProvenance(asset,provenance,outputSha256,{allowLabPreview=false,record}={}){
 const check=(ok,message)=>assert.ok(ok,asset.id+': '+message),binding=asset.metadata?.nativeBinding;
 check(asset.scope==='body-bound'&&asset.metadata.version==='pillagers-fit/0.2','Template route needs a native body-bound registry entry');
 check(provenance.schemaVersion===2&&provenance.route==='authored-template'&&provenance.moduleId===asset.id&&provenance.moduleSha256===outputSha256,'Stale authored-template output');
 check(provenance.provider===null&&provenance.concept===null,'These proof designs must declare their actual template lineage');
 check(provenance.sourceBodySha256==='be5173fa4f3b6e63fa7bc3506b3d61b4def28b7f67477b9a29b5eb527d80f8fe'&&provenance.rigSignature===binding.rigSignature,'Wrong template master or rig');
 check(provenance.recipe.path==='scripts/characters/templates/meshy_modules_v2.py'&&provenance.recipe.blender==='4.5.9'&&provenance.recipe.version===1,'Unsupported template recipe');
 check(sha(readFileSync(new URL('../../'+provenance.recipe.path,import.meta.url)))===provenance.recipe.sha256,'Stale template recipe bytes');
 check(provenance.pipeline.path==='scripts/prepare-meshy-modules.mjs'&&sha(readFileSync(new URL('../../'+provenance.pipeline.path,import.meta.url)))===provenance.pipeline.sha256,'Stale export pipeline bytes');
 check(['authored-four-native-with-surface-rims','native-head'].includes(provenance.pipeline.weightAuthority),'Missing declared native weight authority');
 const bytes=readFileSync(publicFile(binding.path));check(sha(bytes)===binding.sha256&&binding.sha256===provenance.bindingSha256,'Stale binding bytes');
 const b=JSON.parse(bytes);check(b.id===asset.id&&b.moduleSha256===outputSha256&&b.rigSignature===binding.rigSignature,'Binding belongs to another module');
 for(const source of asset.compatibleBodies)check(Object.values(b.lods).some(lod=>lod.bodySha256===source.sha256),'Missing exact body/LOD correspondence');
 check(asset.reviewStatus===provenance.reviewStatus,'Registry and template review status differ');
 if(asset.reviewStatus==='preview')check(allowLabPreview&&provenance.visualApproval===null,'Authored template still needs independent visual approval');
 else check(provenance.visualApproval?.status==='accepted'&&provenance.visualApproval.moduleSha256===outputSha256&&provenance.visualApproval.bindingSha256===binding.sha256,'Missing approval of the exact artwork and binding');
 const actual=moduleBoundaryEvidence(record);assert.deepEqual(provenance.openings,actual,asset.id+': stale or undeclared source openings');
 check(record.json.nodes.every(n=>n.mesh===undefined||n.name.startsWith('Module_'))&&!record.json.images?.length&&!record.json.animations?.length&&!record.json.skins?.length,'Export includes body/helper/textures/clips');
 for(const mesh of record.json.meshes)for(const p of mesh.primitives){
  if(asset.type==='equipment')continue;
  const weights=accessorValues(record.json,record.binary,p.attributes.WEIGHTS_0),joints=accessorValues(record.json,record.binary,p.attributes.JOINTS_0);
  check(!p.attributes.WEIGHTS_1&&!p.attributes.JOINTS_1&&weights.every(row=>row.length===4&&row.every(w=>w>=0&&w<=1)&&Math.abs(row.reduce((a,b)=>a+b,0)-1)<.0001)&&joints.every(row=>row.length===4&&row.every(j=>Number.isInteger(j)&&j>=0&&j<44)),'Invalid native influence reduction');
 }
 return {generationSources:[],sourceLinks:[{sha256:provenance.sourceBodySha256,verified:true,route:'authored-template'}]};
}
