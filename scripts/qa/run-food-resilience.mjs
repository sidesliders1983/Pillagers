export { runFoodScenario, runFoodCommandProbe } from './food-scenario.mjs';
export { runFoodStudy } from './food-study.mjs';
import { pathToFileURL } from 'node:url';
import { runFoodStudy } from './food-study.mjs';

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
    const options = {};
    const fields = { '--output': 'output', '--seed-start': 'seedStart', '--seeds': 'seedCount',
        '--winters': 'winters', '--workers': 'workers' };
    try {
        for (let index = 2; index < process.argv.length; index += 2) {
            const flag = process.argv[index];
            if (!Object.hasOwn(fields, flag)) throw new Error('Unknown option: ' + flag);
            const value = process.argv[index + 1];
            if (value === undefined || value.startsWith('--')) throw new Error('Missing value: ' + flag);
            options[fields[flag]] = flag === '--output' ? value : Number(value);
        }
        await runFoodStudy({ ...options, onProgress: progress => {
            if (progress.completed % 5 === 0 || progress.completed === progress.total) {
                console.log(progress.completed + '/' + progress.total + ' seeds complete');
            }
        } });
    } catch (error) {
        console.error(error.message);
        process.exitCode = 1;
    }
}
