import assert from 'node:assert/strict';
import test from 'node:test';
import {createHash} from 'node:crypto';
import {mkdtemp,mkdir,readFile,readdir,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createMeshyClient,loadMeshyApiKey,MeshyApiError,validateGlb} from '../scripts/characters/meshy-api-client.mjs';
import {runCli} from '../scripts/meshy-api.mjs';

// Every request in this suite uses a mock; neither real credentials nor network
// access is required. Local key fixtures live in a temporary workspace only.
const KEY='offline-meshy-test-key';
const ID='existing_task:3+opaque';
const ASSET='https://assets.meshy.ai/fixture/model.glb?signature=PRIVATE_SIGNED_VALUE';
const task=(changes={})=>({id:ID,type:'image-to-3d',status:'SUCCEEDED',progress:100,created_at:1,model_urls:{glb:ASSET},...changes});
const jsonResponse=value=>new Response(JSON.stringify(value),{status:200,headers:{'content-type':'application/json'}});
const code=expected=>error=>{
  assert.ok(error instanceof MeshyApiError);
  assert.equal(error.code,expected);
  assert.ok(!error.message.includes(KEY));
  assert.ok(!error.message.includes('PRIVATE_SIGNED_VALUE'));
  return true;
};
function makeGlb(changes={}){
  const document={
    asset:{version:'2.0',generator:'offline fixture'},buffers:[{byteLength:44}],
    bufferViews:[{buffer:0,byteOffset:0,byteLength:36},{buffer:0,byteOffset:36,byteLength:6}],
    accessors:[{bufferView:0,componentType:5126,count:3,type:'VEC3',min:[0,0,0],max:[1,1,0]},{bufferView:1,componentType:5123,count:3,type:'SCALAR'}],
    meshes:[{primitives:[{attributes:{POSITION:0},indices:1}]}],
    nodes:[{mesh:0}],scenes:[{nodes:[0]}],scene:0,...changes,
  };
  const source=Buffer.from(JSON.stringify(document));
  const json=Buffer.alloc(Math.ceil(source.length/4)*4,0x20);source.copy(json);
  const bin=Buffer.alloc(44);[0,0,0,1,0,0,0,1,0].forEach((n,i)=>bin.writeFloatLE(n,i*4));
  [0,1,2].forEach((n,i)=>bin.writeUInt16LE(n,36+i*2));
  const bytes=Buffer.alloc(12+8+json.length+8+bin.length);
  bytes.write('glTF');bytes.writeUInt32LE(2,4);bytes.writeUInt32LE(bytes.length,8);
  bytes.writeUInt32LE(json.length,12);bytes.writeUInt32LE(0x4e4f534a,16);json.copy(bytes,20);
  const at=20+json.length;bytes.writeUInt32LE(bin.length,at);bytes.writeUInt32LE(0x004e4942,at+4);bin.copy(bytes,at+8);
  return bytes;
}
async function inWorkspace(callback){
  const root=await mkdtemp(path.join(tmpdir(),'pillagers-meshy-test-'));
  try{return await callback(root);}
  finally{
    assert.equal(path.dirname(root),path.resolve(tmpdir()));
    assert.ok(path.basename(root).startsWith('pillagers-meshy-test-'));
    await rm(root,{recursive:true,force:true});
  }
}
function requestMock(handler){
  const calls=[];
  const fetchImpl=async(url,options)=>{calls.push({url,options});return handler(url,options,calls.length);};
  return {calls,fetchImpl};
}

test('client exposes only existing-task reads and rejects invalid keys',()=>{
  const client=createMeshyClient({apiKey:KEY,fetchImpl:()=>{throw new Error('unexpected request');}});
  assert.deepEqual(Object.keys(client).sort(),['download','list','status']);
  assert.ok(Object.isFrozen(client));
  for(const apiKey of [undefined,'','has space','new\nline','new\rline','💥','x'.repeat(4097)])
    assert.throws(()=>createMeshyClient({apiKey}),code('invalid-key'));
});

test('list uses the documented GET endpoint and a confined Bearer header',async()=>{
  const mock=requestMock(()=>jsonResponse([task()]));
  const summaries=await createMeshyClient({apiKey:KEY,fetchImpl:mock.fetchImpl}).list({pageNum:2,pageSize:5,sortBy:'+created_at'});
  assert.equal(mock.calls.length,1);
  const {url,options}=mock.calls[0],parsed=new URL(url);
  assert.equal(parsed.origin,'https://api.meshy.ai');
  assert.equal(parsed.pathname,'/openapi/v1/image-to-3d');
  assert.equal(parsed.searchParams.get('page_num'),'2');
  assert.equal(parsed.searchParams.get('page_size'),'5');
  assert.equal(parsed.searchParams.get('sort_by'),'+created_at');
  assert.equal(options.method,'GET');
  assert.equal(options.headers.Authorization,'Bearer '+KEY);
  assert.equal(options.redirect,'error');
  assert.equal(options.credentials,'omit');
  assert.equal(options.referrerPolicy,'no-referrer');
  assert.equal(options.cache,'no-store');
  assert.ok(options.signal instanceof AbortSignal);
  assert.equal(summaries[0].hasGlb,true);
  assert.equal(summaries[0].id,ID);
  assert.ok(!JSON.stringify(summaries).includes('PRIVATE_SIGNED_VALUE'));
});

test('list rejects invalid pagination without requesting anything',async()=>{
  const mock=requestMock(()=>{throw new Error('unexpected request');});
  const client=createMeshyClient({apiKey:KEY,fetchImpl:mock.fetchImpl});
  for(const options of [{pageNum:0},{pageNum:1.5},{pageNum:1e6+1},{pageSize:0},{pageSize:101},{pageSize:NaN},{sortBy:'url'}])
    await assert.rejects(client.list(options),code('invalid-options'));
  assert.equal(mock.calls.length,0);
});

test('task IDs remain opaque safe path segments and returned IDs must match',async()=>{
  const mock=requestMock(()=>jsonResponse(task()));
  const client=createMeshyClient({apiKey:KEY,fetchImpl:mock.fetchImpl});
  assert.equal((await client.status(ID)).id,ID);
  assert.equal(new URL(mock.calls[0].url).pathname,'/openapi/v1/image-to-3d/'+encodeURIComponent(ID));
  for(const id of ['','.', '..','other/id','other\\id','space id','id?query','id#hash','id%2fpath','x'.repeat(513)])
    await assert.rejects(client.status(id),code('invalid-task-id'));
  assert.equal(mock.calls.length,1);
  const wrong=createMeshyClient({apiKey:KEY,fetchImpl:async()=>jsonResponse(task({id:'different-task'}))});
  await assert.rejects(wrong.status(ID),code('task-id-mismatch'));
});

test('list validates its shape and does not disclose keys or URL-like metadata',async()=>{
  for(const value of [{tasks:[task()]},[task({type:'text-to-3d'})],[task({id:'bad/id'})],Array(2).fill(task())]){
    const client=createMeshyClient({apiKey:KEY,fetchImpl:async()=>jsonResponse(value)});
    await assert.rejects(client.list({pageSize:1}),error=>error instanceof MeshyApiError);
  }
  const client=createMeshyClient({apiKey:KEY,fetchImpl:async()=>jsonResponse([task({id:'task_'+KEY,status:'private '+KEY,prompt:KEY,model_urls:{glb:ASSET}})])});
  const summary=(await client.list())[0];
  assert.equal(summary.id,'task_[REDACTED]');
  assert.equal(summary.status,'UNKNOWN');
  assert.ok(!JSON.stringify(summary).includes(KEY));
  assert.ok(!Object.hasOwn(summary,'model_urls'));
  assert.ok(!Object.hasOwn(summary,'prompt'));
});

test('network failures, HTTP bodies and invalid JSON remain redacted',async()=>{
  const cases=[
    {fetchImpl:async()=>{throw new Error(KEY+' '+ASSET);},expected:'request-failed'},
    {fetchImpl:async()=>new Response(KEY+' '+ASSET,{status:403}),expected:'http-error'},
    {fetchImpl:async()=>new Response(KEY+' '+ASSET,{status:200}),expected:'invalid-json'},
  ];
  for(const {fetchImpl,expected} of cases)
    await assert.rejects(createMeshyClient({apiKey:KEY,fetchImpl}).status(ID),code(expected));
});

test('redirect status, redirect flags and changed response URLs are blocked',async()=>{
  const cases=[
    new Response(null,{status:302,headers:{location:'https://attacker.invalid/'+KEY}}),
    {ok:true,status:200,redirected:true,headers:new Headers(),body:null},
    {ok:true,status:200,redirected:false,url:'https://attacker.invalid/'+KEY,headers:new Headers(),body:null},
  ];
  for(const response of cases)
    await assert.rejects(createMeshyClient({apiKey:KEY,fetchImpl:async()=>response}).status(ID),code('redirect-blocked'));
});

test('API responses enforce declared and streaming size bounds',async()=>{
  for(const declared of ['4194305','not-a-length','-1']){
    const response=new Response('{}',{status:200,headers:{'content-length':declared}});
    await assert.rejects(createMeshyClient({apiKey:KEY,fetchImpl:async()=>response}).list(),code('response-too-large'));
  }
  const response={ok:true,status:200,headers:new Headers(),body:(async function*(){yield Buffer.alloc(4*1024*1024);yield Buffer.from('x');})()};
  await assert.rejects(createMeshyClient({apiKey:KEY,fetchImpl:async()=>response}).list(),code('response-too-large'));
});

test('downloads require explicit matching confirmation and a succeeded task',async()=>{
  const mock=requestMock(()=>jsonResponse(task({status:'IN_PROGRESS'})));
  const client=createMeshyClient({apiKey:KEY,fetchImpl:mock.fetchImpl});
  await assert.rejects(client.download({taskId:ID}),code('unconfirmed-task'));
  await assert.rejects(client.download({taskId:ID,confirmedTaskId:'another-task'}),code('unconfirmed-task'));
  assert.equal(mock.calls.length,0);
  await assert.rejects(client.download({taskId:ID,confirmedTaskId:ID}),code('task-not-succeeded'));
  assert.equal(mock.calls.length,1);
});

test('asset URL allowlist rejects other hosts, credentials, ports and resources',async()=>{
  const urls=[
    'http://assets.meshy.ai/a.glb','https://assets.meshy.ai.attacker.invalid/a.glb',
    'https://api.meshy.ai/a.glb','https://assets.meshy.ai:444/a.glb',
    'https://user:password@assets.meshy.ai/a.glb','https://assets.meshy.ai/a.glb#fragment',
    'https://assets.meshy.ai/a.gltf','https://elsewhere.invalid/a.glb',
  ];
  for(const glb of urls){
    const mock=requestMock(()=>jsonResponse(task({model_urls:{glb}})));
    const client=createMeshyClient({apiKey:KEY,fetchImpl:mock.fetchImpl});
    await assert.rejects(client.download({taskId:ID,confirmedTaskId:ID}),code('invalid-asset-url'));
    assert.equal(mock.calls.length,1);
  }
});

test('a validated GLB and redacted provenance commit together to a new staging bundle',async()=>inWorkspace(async root=>{
  const glb=makeGlb();
  const mock=requestMock((_url,_options,index)=>index===1?jsonResponse(task()):new Response(glb,{headers:{'content-type':'model/gltf-binary'}}));
  const client=createMeshyClient({apiKey:KEY,fetchImpl:mock.fetchImpl,workspaceRoot:root});
  const result=await client.download({taskId:ID,confirmedTaskId:ID,outputDirectory:'scratch/meshy-api/offline-fixture'});
  assert.equal(mock.calls.length,2);
  assert.equal(new URL(mock.calls[0].url).hostname,'api.meshy.ai');
  assert.equal(new URL(mock.calls[1].url).hostname,'assets.meshy.ai');
  assert.equal(mock.calls[1].options.method,'GET');
  assert.ok(!Object.hasOwn(mock.calls[1].options.headers,'Authorization'));
  assert.equal(mock.calls[1].options.redirect,'error');
  const directory=path.join(root,result.directory);
  assert.deepEqual((await readdir(directory)).sort(),['model.glb','provenance.json']);
  assert.deepEqual(await readFile(path.join(directory,result.model)),glb);
  const text=await readFile(path.join(directory,result.provenance),'utf8'),provenance=JSON.parse(text);
  assert.equal(provenance.schema,'pillagers-meshy-import/1');
  assert.equal(provenance.sourceTaskId,ID);
  assert.equal(provenance.sourceTaskType,'image-to-3d');
  assert.equal(provenance.apiHost,'api.meshy.ai');
  assert.equal(provenance.assetHost,'assets.meshy.ai');
  assert.equal(provenance.assetUrlOmitted,true);
  assert.equal(provenance.bytes,glb.length);
  assert.equal(provenance.sha256,createHash('sha256').update(glb).digest('hex'));
  assert.equal(result.sha256,provenance.sha256);
  assert.ok(!text.includes(KEY));
  assert.ok(!text.includes('PRIVATE_SIGNED_VALUE'));
  assert.ok(!text.includes(ASSET));
  assert.deepEqual(await readdir(path.join(root,'scratch/meshy-api')),['offline-fixture']);
}));

test('existing bundles remain intact and no temporary bundle remains',async()=>inWorkspace(async root=>{
  const output='scratch/meshy-api/existing',directory=path.join(root,output);
  await mkdir(directory,{recursive:true});await writeFile(path.join(directory,'marker.txt'),'keep');
  const mock=requestMock((_url,_options,index)=>index%2?jsonResponse(task()):new Response(makeGlb()));
  const client=createMeshyClient({apiKey:KEY,fetchImpl:mock.fetchImpl,workspaceRoot:root});
  await assert.rejects(client.download({taskId:ID,confirmedTaskId:ID,outputDirectory:output}),code('output-exists'));
  assert.equal(await readFile(path.join(directory,'marker.txt'),'utf8'),'keep');
  assert.deepEqual(await readdir(directory),['marker.txt']);
  assert.deepEqual(await readdir(path.dirname(directory)),['existing']);
}));

test('unsafe output directories never receive a bundle',async()=>inWorkspace(async root=>{
  const mock=requestMock((_url,_options,index)=>index%2?jsonResponse(task()):new Response(makeGlb()));
  const client=createMeshyClient({apiKey:KEY,fetchImpl:mock.fetchImpl,workspaceRoot:root});
  for(const outputDirectory of ['public/models','scratch/meshy-api','scratch/meshy-api/../../production',path.join(root,'outside')])
    await assert.rejects(client.download({taskId:ID,confirmedTaskId:ID,outputDirectory}),code('unsafe-output'));
  assert.deepEqual(await readdir(root),[]);
}));

test('invalid GLB downloads and streamed asset limits leave staging untouched',async()=>inWorkspace(async root=>{
  const mock=requestMock((_url,_options,index)=>index%2?jsonResponse(task()):new Response(Buffer.from('not a model '+KEY)));
  const client=createMeshyClient({apiKey:KEY,fetchImpl:mock.fetchImpl,workspaceRoot:root});
  await assert.rejects(client.download({taskId:ID,confirmedTaskId:ID}),code('invalid-glb'));
  const limited=createMeshyClient({apiKey:KEY,workspaceRoot:root,maxDownloadBytes:20,fetchImpl:async url=>new URL(url).hostname==='api.meshy.ai'?jsonResponse(task()):new Response(makeGlb())});
  await assert.rejects(limited.download({taskId:ID,confirmedTaskId:ID}),code('response-too-large'));
  assert.deepEqual(await readdir(root),[]);
}));

test('GLB structural validation detects malformed headers, external resources and bounds',()=>{
  const good=makeGlb(),result=validateGlb(good);
  assert.equal(result.bytes,good.length);assert.equal(result.glbVersion,2);
  const badMagic=Buffer.from(good);badMagic.write('nope');
  const badVersion=Buffer.from(good);badVersion.writeUInt32LE(1,4);
  const badLength=Buffer.from(good);badLength.writeUInt32LE(good.length-4,8);
  const badChunk=Buffer.from(good);badChunk.writeUInt32LE(3,12);
  for(const bytes of [Buffer.alloc(0),badMagic,badVersion,badLength,badChunk,good.subarray(0,good.length-4)])
    assert.throws(()=>validateGlb(bytes),code('invalid-glb'));
  for(const changes of [{buffers:[{byteLength:44,uri:'https://attacker.invalid/data'}]},{images:[{uri:'texture.png'}]}])
    assert.throws(()=>validateGlb(makeGlb(changes)),code('external-glb-resource'));
  for(const changes of [{buffers:[{byteLength:45}]},{bufferViews:[{buffer:1,byteLength:4}]},{bufferViews:[{buffer:0,byteOffset:43,byteLength:2}]},{meshes:[]}])
    assert.throws(()=>validateGlb(makeGlb(changes)),code('invalid-glb'));
});

test('malformed GLB resource declarations produce safe adapter errors',()=>{
  for(const changes of [
    {meshes:[null]},{buffers:null},{buffers:{}},{buffers:[null]},
    {images:{}},{images:[null]},{bufferViews:{}},{bufferViews:[null]},
  ])assert.throws(()=>validateGlb(makeGlb(changes)),code('invalid-glb'));
});

test('key loading prefers only the server-side environment variable',async()=>inWorkspace(async root=>{
  const value=await loadMeshyApiKey({env:{MESHY_API_KEY:KEY,VITE_MESHY_API_KEY:'never use'},workspaceRoot:root,isIgnored:()=>{throw new Error('must not inspect files');}});
  assert.equal(value,KEY);
  await assert.rejects(loadMeshyApiKey({env:{VITE_MESHY_API_KEY:KEY},workspaceRoot:root}),code('missing-key'));
  await assert.rejects(loadMeshyApiKey({env:{MESHY_API_KEY:KEY+'\n'},workspaceRoot:root}),code('invalid-key'));
}));

test('local key fixtures must be ignored and declare exactly one valid variable',async()=>inWorkspace(async root=>{
  const filename=path.join(root,'.env.meshy.local');
  await writeFile(filename,'# offline fixture\nexport MESHY_API_KEY="'+KEY+'"\n');
  assert.equal(await loadMeshyApiKey({env:{},workspaceRoot:root,isIgnored:()=>true}),KEY);
  await assert.rejects(loadMeshyApiKey({env:{},workspaceRoot:root,isIgnored:()=>false}),code('key-file-not-ignored'));
  await assert.rejects(loadMeshyApiKey({env:{},workspaceRoot:root,isIgnored:()=>'truthy'}),code('key-file-not-ignored'));
  for(const content of [
    'MESHY_API_KEY='+KEY+'\nMESHY_API_KEY=second\n',
    'VITE_MESHY_API_KEY='+KEY+'\n','MESHY_API_KEY="'+KEY+'\n','# missing only\n',
  ]){
    await writeFile(filename,content);
    await assert.rejects(loadMeshyApiKey({env:{},workspaceRoot:root,isIgnored:()=>true}),code('invalid-key-file'));
  }
  await writeFile(filename,'x'.repeat(16385));
  await assert.rejects(loadMeshyApiKey({env:{},workspaceRoot:root,isIgnored:()=>true}),code('invalid-key-file'));
}));

test('CLI supports help and rejects unsupported commands and credential flags before key loading',async()=>inWorkspace(async root=>{
  for(const args of [['--help'],['help'],[]]){
    let out='',err='';
    assert.equal(await runCli(args,{env:{},workspaceRoot:root,stdout:text=>out+=text,stderr:text=>err+=text}),0);
    assert.ok(out.includes('GET only'));assert.equal(err,'');
  }
  for(const args of [['generate'],['delete','--task-id',ID],['list','--api-key',KEY],['status'],['download','--task-id',ID],['list','--page-size','1','--page-size','2']]){
    let out='',err='',requests=0;
    assert.equal(await runCli(args,{env:{},workspaceRoot:root,fetchImpl:async()=>{requests++;},stdout:text=>out+=text,stderr:text=>err+=text}),1);
    assert.equal(requests,0);assert.equal(out,'');
    assert.ok(!err.includes(KEY));assert.ok(!err.includes('missing-key'));
    assert.ok(JSON.parse(err).error.code);
  }
}));

test('CLI successful summaries and failed requests omit secrets and remote details',async()=>{
  let out='',err='';
  assert.equal(await runCli(['list'],{env:{MESHY_API_KEY:KEY},fetchImpl:async()=>jsonResponse([task()]),stdout:text=>out+=text,stderr:text=>err+=text}),0);
  assert.equal(JSON.parse(out)[0].id,ID);assert.equal(err,'');
  assert.ok(!out.includes(KEY));assert.ok(!out.includes(ASSET));
  out='';err='';
  assert.equal(await runCli(['status','--task-id',ID],{env:{MESHY_API_KEY:KEY},fetchImpl:async()=>{throw new Error(KEY+' '+ASSET);},stdout:text=>out+=text,stderr:text=>err+=text}),1);
  assert.equal(out,'');assert.equal(JSON.parse(err).error.code,'request-failed');
  assert.ok(!err.includes(KEY));assert.ok(!err.includes('PRIVATE_SIGNED_VALUE'));
});
