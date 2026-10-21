import { spawn } from 'node:child_process';
import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

const sweep = resolve(process.argv[2] ?? 'scratch/island-seed-expansion/run-1');
const output = resolve(process.argv[3] ?? 'scratch/island-seed-expansion/inspections-v4');
const runner = resolve('scripts/qa/inspect-island-candidate.mjs');
const runnerSha256 = createHash('sha256').update(await readFile(runner)).digest('hex');
const rows = await Promise.all((await readdir(sweep + '/results')).filter(file => file.endsWith('.json'))
    .map(async file => JSON.parse(await readFile(sweep + '/results/' + file, 'utf8'))));
const seeds = rows.filter(row => !row.control && row.preparationPassed).map(row => row.seed).sort((a, b) => a - b);
const concurrency = 2, timeoutMs = 180000, heapMB = 1024;
await mkdir(output, { recursive: true });
const protocol = { runnerSha256, sweepProtocolSha256: rows[0].protocolSha256, seeds,
    concurrency, timeoutMs, heapMB,
    fixture: 'Ten independent homes: 10000 Materials, all founders assigned woodworker then founder-1 farmer. Separate travel: unchanged current newFjordScenario, one member, eight Food, no test override.',
    limits: 'Direct QA reachability probe knows the target as an observer. It is not an information-limited player exploration strategy. No compact unapproved recipe is forged or admitted to the game.' };
try {
    const previous = JSON.parse(await readFile(output + '/manifest.json', 'utf8'));
    if (JSON.stringify(previous) !== JSON.stringify(protocol))
        throw new Error('Inspection protocol changed; use a separate output directory.');
} catch (error) { if (error.code !== 'ENOENT') throw error; }
await writeFile(output + '/manifest.json', JSON.stringify(protocol, null, 2));
const outcomes = [];
const remaining = [...seeds];
await Promise.all(Array.from({ length: concurrency }, async () => {
    while (remaining.length) {
        const seed = remaining.shift();
        let report;
        try { report = JSON.parse(await readFile(output + '/' + seed + '.json', 'utf8')); }
        catch (error) { if (error.code !== 'ENOENT') throw error; }
        if (report && report.inspectionRunnerSha256 !== runnerSha256)
            throw new Error('Changed inspection source; use a new output directory.');
        if (!report) {
            const outcome = await new Promise(resolveOutcome => {
                const child = spawn(process.execPath, ['--max-old-space-size=' + heapMB, runner,
                    String(seed), sweep, output], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
                let stdout = '', stderr = '', timedOut = false;
                const timer = setTimeout(() => { timedOut = true; child.kill(); }, timeoutMs);
                child.stdout.on('data', data => stdout += data);
                child.stderr.on('data', data => stderr = (stderr + data).slice(-8000));
                child.on('error', error => stderr += error.message);
                child.on('close', code => {
                    clearTimeout(timer);
                    if (timedOut) return resolveOutcome({ seed, technicalStatus: 'timeout' });
                    try {
                        if (code !== 0) throw new Error('Child exit ' + code + ': ' + stderr);
                        resolveOutcome({ seed, technicalStatus: 'complete', report: JSON.parse(stdout) });
                    } catch (error) { resolveOutcome({ seed, technicalStatus: 'runtime-error', error: error.message }); }
                });
            });
            if (!outcome.report) { outcomes.push(outcome); console.log(JSON.stringify(outcome)); continue; }
            report = outcome.report;
        }
        const outcome = { seed, technicalStatus: 'complete', repeat: report.repeatedBlueprintIdentical,
            pier: report.checks.authoredPier?.supported ?? false,
            returned: report.checks.travel?.returned ?? false, findings: report.findings };
        outcomes.push(outcome);
        console.log(JSON.stringify(outcome));
    }
}));
await writeFile(output + '/completeness.json', JSON.stringify({ ...protocol,
    outcomes: outcomes.sort((a, b) => a.seed - b.seed) }, null, 2));
