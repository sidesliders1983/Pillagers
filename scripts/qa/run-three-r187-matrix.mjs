import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';

const protocolPath = 'docs/qa/three-r187-323/protocol.json';
const protocolText = readFileSync(protocolPath, 'utf8');
const protocol = JSON.parse(protocolText);
const protocolSHA256 = createHash('sha256').update(protocolText).digest('hex');
const directory = path.resolve('scratch/three-r187-323/matrix');
mkdirSync(directory, { recursive: true });
const manifest = { protocolSHA256, startedUtc: new Date().toISOString(), rows: [] };
for (const [index, arm] of protocol.primary.order.entries()) {
    const output = path.join(directory, `${index + 1}-${arm}`);
    const file = path.join(output, 'run.json');
    let saved = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : undefined;
    if (saved?.status !== 'complete' || saved.protocolSHA256 !== protocolSHA256) {
        if (saved) throw new Error(`Preserve existing incompatible/incomplete evidence at ${output}; use a new matrix directory.`);
        console.log(`Starting repetition ${index + 1}/${protocol.primary.order.length}: ${arm}`);
        const result = spawnSync(process.execPath, ['scripts/qa/benchmark-three-r187.mjs', `--arm=${arm}`,
            `--origin=http://127.0.0.1:${arm === 'A' ? 5206 : 5207}`, `--output=${output}`,
            `--seconds=${protocol.primary.sampleSeconds}`, `--warmup=${protocol.primary.warmupSeconds}`],
        { stdio: 'inherit', windowsHide: true });
        saved = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : undefined;
        manifest.rows.push({ index: index + 1, arm, output, status: saved?.status ?? 'technical-failure',
            exitCode: result.status, summary: saved?.summary });
        writeFileSync(path.join(directory, 'manifest.json'), JSON.stringify(manifest, null, 2));
        if (result.status !== 0) throw new Error(`Repetition ${index + 1} failed; evidence retained.`);
    } else {
        manifest.rows.push({ index: index + 1, arm, output, status: saved.status, resumed: true, summary: saved.summary });
    }
}
manifest.finishedUtc = new Date().toISOString();
writeFileSync(path.join(directory, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log(JSON.stringify(manifest));
