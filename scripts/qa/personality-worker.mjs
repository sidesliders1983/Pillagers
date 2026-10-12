import {parentPort} from 'node:worker_threads';
import {runSocialScenario} from './personality-scenario.mjs';
parentPort.on('message', job => {
    try { parentPort.postMessage({run: runSocialScenario(job)}); }
    catch (error) { parentPort.postMessage({error: error.stack}); }
});
