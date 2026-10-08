// Server-side, GET-only Meshy Image-to-3D import adapter.
import {createHash,randomUUID} from 'node:crypto';
import {readFile,realpath,mkdir,mkdtemp,open,rename,rm,lstat} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import path from 'node:path';

const API_ORIGIN='https://api.meshy.ai';
const TASK_PATH='/openapi/v1/image-to-3d';
const JSON_LIMIT=4*1024*1024;
const DEFAULT_GLB_LIMIT=512*1024*1024;
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');

export class MeshyApiError extends Error{
  constructor(code,message){super(message);this.name='MeshyApiError';this.code=code;}
}
const fail=(code,message)=>{throw new MeshyApiError(code,message);};
const safeError=(error,code,message)=>error instanceof MeshyApiError?error:new MeshyApiError(code,message);

function validateKey(value){
  if(typeof value!=='string'||!value||value.length>4096||/[^\x21-\x7e]/.test(value))fail('invalid-key','MESHY_API_KEY must contain a nonempty token without whitespace.');
  return value;
}
function ignoredKeyFile(workspaceRoot){
  const result=spawnSync('git',['check-ignore','--quiet','--','.env.meshy.local'],{cwd:workspaceRoot,stdio:'ignore',windowsHide:true,shell:false});
  return result.status===0;
}
/** Read only the server-side variable or a verified gitignored local file. */
export async function loadMeshyApiKey({env=process.env,workspaceRoot=process.cwd(),isIgnored=ignoredKeyFile}={}){
  if(env.MESHY_API_KEY!==undefined)return validateKey(env.MESHY_API_KEY);
  const filename=path.join(workspaceRoot,'.env.meshy.local');
  try{
    const info=await lstat(filename);
    if(!info.isFile()||info.isSymbolicLink()||info.size>16384)fail('invalid-key-file','The local Meshy key file must be a small regular file.');
    if(isIgnored(workspaceRoot)!==true)fail('key-file-not-ignored','.env.meshy.local must be untracked and gitignored before it can be read.');
    const lines=(await readFile(filename,'utf8')).split(/\r?\n/),values=[];
    for(const line of lines){
      const text=line.trim();if(!text||text.startsWith('#'))continue;
      const match=/^(?:export\s+)?MESHY_API_KEY\s*=\s*(.*)$/.exec(text);
      if(!match)fail('invalid-key-file','The local Meshy key file may contain only MESHY_API_KEY and comments.');
      let value=match[1].trim();
      if(value.startsWith('"')||value.startsWith("'")){
        const quote=value[0];if(value.length<2||!value.endsWith(quote))fail('invalid-key-file','The local Meshy key value has invalid quoting.');
        value=value.slice(1,-1);
      }
      values.push(value);
    }
    if(values.length!==1)fail('invalid-key-file','The local Meshy key file must define MESHY_API_KEY exactly once.');
    return validateKey(values[0]);
  }catch(error){
    if(error?.code==='ENOENT')fail('missing-key','Provide MESHY_API_KEY or a gitignored .env.meshy.local after API-key creation is approved.');
    throw safeError(error,'key-file-read-failed','The local Meshy key file could not be read.');
  }
}
function taskId(value){
  // IDs are opaque, not assumed to be UUIDs; keep them one safe path segment.
  if(typeof value!=='string'||!value||value.length>512||/[\s\x00-\x1f\x7f/\\?#%]/u.test(value)||value==='.'||value==='..')fail('invalid-task-id','Provide the exact existing task ID as one path segment.');
  return value;
}
function assetUrl(value){
  let url;try{url=new URL(value);}catch{fail('invalid-asset-url','The task did not return an allowed GLB asset URL.');}
  if(url.protocol!=='https:'||url.hostname!=='assets.meshy.ai'||url.port||url.username||url.password||url.hash||!url.pathname.toLowerCase().endsWith('.glb'))fail('invalid-asset-url','Only HTTPS GLB assets on assets.meshy.ai are allowed.');
  return url;
}
function boundedInteger(value,min,max,message){if(!Number.isSafeInteger(value)||value<min||value>max)fail('invalid-options',message);return value;}

async function readLimited(response,limit){
  const declared=response.headers?.get('content-length');
  if(declared!==null&&declared!==undefined&&(!/^\d+$/.test(declared)||Number(declared)>limit))fail('response-too-large','The response exceeds the allowed size.');
  if(!response.body||typeof response.body[Symbol.asyncIterator]!=='function')fail('invalid-response','The response did not contain a readable body.');
  const chunks=[];let size=0;
  for await(const chunk of response.body){
    const bytes=Buffer.from(chunk);size+=bytes.length;
    if(size>limit)fail('response-too-large','The response exceeds the allowed size.');
    chunks.push(bytes);
  }
  return Buffer.concat(chunks,size);
}
function safeSummary(task,key){
  const redact=value=>typeof value==='string'?value.split(key).join('[REDACTED]'):null;
  const summary={id:redact(task.id),type:'image-to-3d',status:['PENDING','IN_PROGRESS','SUCCEEDED','FAILED','CANCELED'].includes(task.status)?task.status:'UNKNOWN',progress:Number.isFinite(task.progress)?task.progress:null};
  for(const name of ['created_at','started_at','finished_at'])if(Number.isFinite(task[name]))summary[name]=task[name];
  try{summary.hasGlb=!!assetUrl(task.model_urls?.glb);}catch{summary.hasGlb=false;}
  return summary;
}
function validateTask(task,expectedId){
  if(!task||typeof task!=='object'||Array.isArray(task)||task.type!=='image-to-3d')fail('invalid-task-response','The API did not return an Image-to-3D task.');
  taskId(task.id);
  if(expectedId!==undefined&&task.id!==expectedId)fail('task-id-mismatch','The returned task ID does not match the explicitly requested task.');
  return task;
}

/** Structural container validation; this is not face/anatomy/rig qualification. */
export function validateGlb(bytes){
  if(!Buffer.isBuffer(bytes))bytes=Buffer.from(bytes);
  if(bytes.length<20||bytes.toString('ascii',0,4)!=='glTF')fail('invalid-glb','The download is not a GLB container.');
  if(bytes.readUInt32LE(4)!==2||bytes.readUInt32LE(8)!==bytes.length||bytes.length%4!==0)fail('invalid-glb','The GLB header or declared length is invalid.');
  let offset=12,json=null,bin=null;
  while(offset<bytes.length){
    if(offset+8>bytes.length)fail('invalid-glb','The GLB chunk header is truncated.');
    const length=bytes.readUInt32LE(offset),type=bytes.readUInt32LE(offset+4);offset+=8;
    if(length%4!==0||offset+length>bytes.length)fail('invalid-glb','The GLB chunk length is invalid.');
    if(type===0x4e4f534a){
      if(json!==null||offset!==20)fail('invalid-glb','The GLB must begin with exactly one JSON chunk.');
      try{json=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes.subarray(offset,offset+length)));}catch{fail('invalid-glb','The GLB JSON chunk is invalid.');}
    }else if(type===0x004e4942){if(json===null||bin!==null)fail('invalid-glb','The GLB binary chunk order is invalid.');bin=bytes.subarray(offset,offset+length);}
    else fail('invalid-glb','The GLB contains an unsupported chunk.');
    offset+=length;
  }
  if(!json||json.asset?.version!=='2.0'||!Array.isArray(json.meshes)||!json.meshes.some(m=>m&&typeof m==='object'&&Array.isArray(m.primitives)&&m.primitives.length))fail('invalid-glb','The GLB must declare glTF 2.0 and contain mesh primitives.');
  for(const group of ['buffers','images','bufferViews']){
    if(json[group]!==undefined&&(!Array.isArray(json[group])||json[group].some(entry=>!entry||typeof entry!=='object'||Array.isArray(entry))))fail('invalid-glb','The GLB resource declarations are invalid.');
  }
  for(const group of ['buffers','images'])for(const entry of json[group]??[])if(entry.uri!==undefined)fail('external-glb-resource','The imported GLB must embed its buffers and images.');
  if(!Array.isArray(json.buffers)||json.buffers.length!==1||!bin||!Number.isSafeInteger(json.buffers[0].byteLength)||json.buffers[0].byteLength<1||bin.length<json.buffers[0].byteLength||bin.length-json.buffers[0].byteLength>3)fail('invalid-glb','The GLB embedded buffer length is invalid.');
  for(const view of json.bufferViews??[])if(view.buffer!==0||!Number.isSafeInteger(view.byteLength)||view.byteLength<0||!Number.isSafeInteger(view.byteOffset??0)||(view.byteOffset??0)<0||(view.byteOffset??0)+view.byteLength>json.buffers[0].byteLength)fail('invalid-glb','A GLB buffer view exceeds the embedded buffer.');
  return {bytes:bytes.length,sha256:hash(bytes),glbVersion:2,assetVersion:'2.0'};
}

function within(parent,target){const relative=path.relative(parent,target);return relative!==''&&!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative);}
async function commitBundle({workspaceRoot,outputDirectory,bytes,provenance}){
  let temporary;
  try{
    const workspace=await realpath(workspaceRoot),stagingRoot=path.join(workspace,'scratch','meshy-api');
    const destination=path.resolve(workspaceRoot,outputDirectory??path.join('scratch','meshy-api','task-'+hash(provenance.sourceTaskId).slice(0,16)));
    if(!within(stagingRoot,destination))fail('unsafe-output','Imports must be staged in a new directory under scratch/meshy-api.');
    // Validate existing ancestors before mkdir, then resolve again to reject
    // symlinks/junctions that could route a scratch write into production.
    let ancestor=path.dirname(destination);
    for(;;){try{const resolved=await realpath(ancestor);if(resolved!==workspace&&!within(workspace,resolved))fail('unsafe-output','The staging path leaves the workspace.');if(resolved!==ancestor)fail('unsafe-output','The staging path may not traverse a symlink or junction.');break;}catch(error){if(error?.code!=='ENOENT')throw error;const next=path.dirname(ancestor);if(next===ancestor)throw error;ancestor=next;}}
    await mkdir(path.dirname(destination),{recursive:true});
    const parent=await realpath(path.dirname(destination));
    if(parent!==path.dirname(destination))fail('unsafe-output','The staging path may not traverse a symlink or junction.');
    try{await lstat(destination);fail('output-exists','The import directory already exists; choose a new staging directory.');}catch(error){if(error?.code!=='ENOENT')throw error;}
    temporary=await mkdtemp(path.join(parent,'.meshy-import-'));
    for(const [name,data]of [['model.glb',bytes],['provenance.json',Buffer.from(JSON.stringify(provenance,null,2)+'\n')]]){
      const handle=await open(path.join(temporary,name),'wx',0o600);try{await handle.writeFile(data);await handle.sync();}finally{await handle.close();}
    }
    await rename(temporary,destination);temporary=null;
    return {directory:path.relative(workspace,destination).split(path.sep).join('/'),model:'model.glb',provenance:'provenance.json'};
  }catch(error){throw safeError(error,'local-import-failed','The validated import could not be committed to staging.');}
  finally{if(temporary)await rm(temporary,{recursive:true,force:true}).catch(()=>{});}
}

/** No generic request, generation, deletion, purchase or browser-session API. */
export function createMeshyClient({apiKey,fetchImpl=globalThis.fetch,workspaceRoot=process.cwd(),maxDownloadBytes=DEFAULT_GLB_LIMIT}={}){
  const key=validateKey(apiKey);
  if(typeof fetchImpl!=='function')fail('missing-fetch','A Fetch implementation is required.');
  boundedInteger(maxDownloadBytes,20,DEFAULT_GLB_LIMIT,'The GLB size limit must be between 20 bytes and 512 MiB.');
  async function get(url,{asset=false,limit=JSON_LIMIT}={}){
    try{
      const parsed=new URL(url);
      if(asset)assetUrl(parsed.href);else if(parsed.origin!==API_ORIGIN||!parsed.pathname.startsWith(TASK_PATH)||parsed.username||parsed.password||parsed.hash)fail('unsafe-endpoint','Only the documented Meshy read endpoints are allowed.');
      const headers=asset?{Accept:'model/gltf-binary, application/octet-stream'}:{Accept:'application/json',Authorization:'Bearer '+key};
      const response=await fetchImpl(parsed.href,{method:'GET',headers,redirect:'error',credentials:'omit',referrerPolicy:'no-referrer',cache:'no-store',signal:AbortSignal.timeout(asset?120000:30000)});
      if(response.redirected||response.status>=300&&response.status<400)fail('redirect-blocked','Meshy redirects are blocked.');
      if(response.url&&new URL(response.url).href!==parsed.href)fail('redirect-blocked','The response URL changed; redirects are blocked.');
      if(!response.ok)fail('http-error','The Meshy '+(asset?'asset':'API')+' request failed with HTTP '+boundedInteger(response.status,100,599,'The response status is invalid.')+'.');
      return await readLimited(response,limit);
    }catch(error){throw safeError(error,'request-failed','The Meshy read request failed; credentials and remote details are omitted.');}
  }
  async function rawTask(id){
    const requested=taskId(id);let task;
    const bytes=await get(API_ORIGIN+TASK_PATH+'/'+encodeURIComponent(requested));
    try{task=JSON.parse(bytes.toString('utf8'));}catch{fail('invalid-json','The API task response is not valid JSON.');}
    return validateTask(task,requested);
  }
  return Object.freeze({
    async list({pageNum=1,pageSize=10,sortBy='-created_at'}={}){
      boundedInteger(pageNum,1,1000000,'pageNum must be a positive integer.');boundedInteger(pageSize,1,100,'pageSize must be between 1 and 100.');
      if(!['+created_at','-created_at'].includes(sortBy))fail('invalid-options','sortBy must be +created_at or -created_at.');
      const query=new URLSearchParams({page_num:String(pageNum),page_size:String(pageSize),sort_by:sortBy});
      const bytes=await get(API_ORIGIN+TASK_PATH+'?'+query);let tasks;
      try{tasks=JSON.parse(bytes.toString('utf8'));}catch{fail('invalid-json','The API list response is not valid JSON.');}
      if(!Array.isArray(tasks)||tasks.length>pageSize)fail('invalid-list-response','The API did not return the requested task list.');
      return tasks.map(t=>safeSummary(validateTask(t),key));
    },
    async status(id){return safeSummary(await rawTask(id),key);},
    async download({taskId:id,confirmedTaskId,outputDirectory}={}){
      const requested=taskId(id);
      if(confirmedTaskId!==requested)fail('unconfirmed-task','Download requires the exact task ID and an identical confirmedTaskId; no task is selected automatically.');
      const task=await rawTask(requested);
      if(task.status!=='SUCCEEDED')fail('task-not-succeeded','The confirmed Image-to-3D task has not succeeded.');
      const url=assetUrl(task.model_urls?.glb),bytes=await get(url.href,{asset:true,limit:maxDownloadBytes}),validation=validateGlb(bytes);
      const provenance={schema:'pillagers-meshy-import/1',provider:'Meshy',sourceTaskId:requested.split(key).join('[REDACTED]'),sourceTaskType:'image-to-3d',apiHost:'api.meshy.ai',assetHost:url.hostname,assetUrlOmitted:true,importedAt:new Date().toISOString(),importId:randomUUID(),task:safeSummary(task,key),...validation};
      const bundle=await commitBundle({workspaceRoot,outputDirectory,bytes,provenance});
      return {taskId:provenance.sourceTaskId,...validation,...bundle};
    },
  });
}
