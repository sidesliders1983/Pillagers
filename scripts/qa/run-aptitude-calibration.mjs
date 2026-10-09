export { sampleAptitudes } from './aptitude-sampling.mjs';
export { runEconomyScenario } from './aptitude-economy.mjs';
export { summarizeAptitudes } from './aptitude-statistics.mjs';
export { runStudy } from './aptitude-study.mjs';

// Importing the public harness has no measurement side effects.
if (process.argv[1] && (await import('node:url')).pathToFileURL(process.argv[1]).href === import.meta.url) {
    const allowed = new Set(['output', 'seed-start', 'seeds', 'winters', 'workers']);
    const options = {};
    for (let index = 2; index < process.argv.length; index += 2) {
        const flag = process.argv[index].replace(/^--/, '');
        const value = process.argv[index + 1];
        if (!allowed.has(flag) || value === undefined || Object.hasOwn(options, flag)) throw new Error('Invalid argument: ' + flag);
        options[flag] = value;
    }
    const integer = (flag, fallback) => options[flag] === undefined ? fallback
        : /^\d+$/.test(options[flag]) ? Number(options[flag]) : NaN;
    const { runStudy } = await import('./aptitude-study.mjs');
    const output = options.output || 'artifacts/occupation-aptitude-v03';
    await runStudy({ output, seedStart: integer('seed-start', 0), seedCount: integer('seeds', 100),
        winters: integer('winters', 25), workers: integer('workers', 4),
        onProgress: progress => console.log(`Completed ${progress.completed}/${progress.total} seeds (seed ${progress.seed})`) });
    console.log('Study artifacts: ' + output);
}
