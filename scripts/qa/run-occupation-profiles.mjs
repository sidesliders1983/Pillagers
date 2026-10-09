export { sampleProfiles, evaluateProfiles } from './profile-models.mjs';
export { runProfileScenario, proveProfileReplay } from './profile-scenario.mjs';
export { runProfileStudy } from './profile-study.mjs';
import { pathToFileURL } from 'node:url';
import { runProfileStudy } from './profile-study.mjs';

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
    const options = {};
    const fields = { '--output': 'output', '--seed-start': 'seedStart', '--seeds': 'seedCount',
        '--winters': 'winters', '--workers': 'workers' };
    try {
        for (let index = 2; index < process.argv.length; index += 2) {
            const flag = process.argv[index], value = process.argv[index + 1];
            if (!Object.hasOwn(fields, flag) || Object.hasOwn(options, fields[flag]) ||
                value === undefined || value.startsWith('--')) throw new Error('Invalid option: ' + flag);
            options[fields[flag]] = flag === '--output' ? value : Number(value);
        }
        await runProfileStudy({ ...options, onProgress: progress => {
            if (progress.completed % 5 === 0 || progress.completed === progress.total) {
                console.log(progress.completed + '/' + progress.total + ' seeds complete');
            }
        } });
    } catch (error) {
        console.error(error.stack);
        process.exitCode = 1;
    }
}
