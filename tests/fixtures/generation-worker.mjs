import {parentPort} from 'node:worker_threads';
import {loadTypeScript} from '../../scripts/load-typescript.mjs';
const {runGenerationTask}=loadTypeScript(new URL('../../src/world-generation/GenerationTask.ts',import.meta.url));
parentPort.on('message',task=>{try{
 const result=runGenerationTask(task,event=>parentPort.postMessage(event));
 parentPort.postMessage({type:'result',result});
}catch(error){parentPort.postMessage({type:'error',message:String(error)});}});
