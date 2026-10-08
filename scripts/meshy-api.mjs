import {pathToFileURL} from 'node:url';
import {createMeshyClient,loadMeshyApiKey,MeshyApiError} from './characters/meshy-api-client.mjs';

const HELP=`Read-only Meshy Image-to-3D importer (GET only)

  node scripts/meshy-api.mjs list [--page-num 1] [--page-size 10] [--sort-by -created_at]
  node scripts/meshy-api.mjs status --task-id EXACT_EXISTING_TASK_ID
  node scripts/meshy-api.mjs download --task-id EXACT_EXISTING_TASK_ID --confirm-task-id EXACT_EXISTING_TASK_ID [--out scratch/meshy-api/NEW_BUNDLE]

MESHY_API_KEY comes only from the server-side environment or gitignored
.env.meshy.local. No key argument, browser session, POST, DELETE or generation
is supported. Download never selects an ID from list and never overwrites an
existing bundle. Signed asset URLs and credentials are omitted from output.
`;
function argumentsFor(args){
  if(!args.length||args[0]==='--help'||args[0]==='help')return {help:true};
  const [command,...rest]=args,allowed={list:['--page-num','--page-size','--sort-by'],status:['--task-id'],download:['--task-id','--confirm-task-id','--out']};
  if(!Object.hasOwn(allowed,command))throw new MeshyApiError('invalid-command','Only list, status and download commands are supported.');
  const options={};
  for(let i=0;i<rest.length;i+=2){const name=rest[i],value=rest[i+1];if(!allowed[command].includes(name)||value===undefined||Object.hasOwn(options,name))throw new MeshyApiError('invalid-arguments','Use the documented command flags once with a value; credential arguments are not supported.');options[name]=value;}
  return {command,options};
}
export async function runCli(args,{env=process.env,workspaceRoot=process.cwd(),fetchImpl=globalThis.fetch,stdout=value=>process.stdout.write(value),stderr=value=>process.stderr.write(value),isIgnored}={}){
  try{
    const parsed=argumentsFor(args);if(parsed.help){stdout(HELP);return 0;}
    const {command,options}=parsed;
    // Reject absent IDs/confirmation before credential lookup or any request.
    if(command!=='list'&&!options['--task-id'])throw new MeshyApiError('missing-task-id','Provide the exact existing task ID.');
    if(command==='download'&&options['--confirm-task-id']!==options['--task-id'])throw new MeshyApiError('unconfirmed-task','Download requires --confirm-task-id identical to --task-id.');
    const apiKey=await loadMeshyApiKey({env,workspaceRoot,isIgnored}),client=createMeshyClient({apiKey,workspaceRoot,fetchImpl});
    const result=command==='list'?await client.list({pageNum:options['--page-num']===undefined?1:Number(options['--page-num']),pageSize:options['--page-size']===undefined?10:Number(options['--page-size']),sortBy:options['--sort-by']??'-created_at'}):command==='status'?await client.status(options['--task-id']):await client.download({taskId:options['--task-id'],confirmedTaskId:options['--confirm-task-id'],outputDirectory:options['--out']});
    stdout(JSON.stringify(result,null,2)+'\n');return 0;
  }catch(error){
    const safe=error instanceof MeshyApiError?error:new MeshyApiError('import-failed','The read-only import failed; private details are omitted.');
    stderr(JSON.stringify({error:{code:safe.code,message:safe.message}})+'\n');return 1;
  }
}
if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url)process.exitCode=await runCli(process.argv.slice(2));
