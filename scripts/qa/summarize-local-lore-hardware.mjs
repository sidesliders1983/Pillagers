import { readFile, writeFile } from 'node:fs/promises';
const output = 'docs/qa/local-lore';
const candidates = {};
for (const label of ['B', 'C']) {
    const rows = (await readFile(output + '/resource-' + label + '.jsonl', 'utf8')).trim().split('\n').map(JSON.parse);
    candidates[label] = { samples: rows.length, from: rows[0].at, through: rows.at(-1).at,
        peakWorkingSetBytes: Math.max(...rows.map(row => row.peakWorkingSetBytes)),
        peakCommittedBytes: Math.max(...rows.map(row => row.peakCommittedBytes)),
        minimumFreeRAMBytes: Math.min(...rows.map(row => row.freeRAMBytes)),
        maximumWholeDeviceGPUUseMiB: Math.max(...rows.map(row => Number(row.gpuMemoryMiB.split(',')[0]))) };
}
await writeFile(output + '/hardware-summary.json', JSON.stringify({ candidates,
    note: 'Nominal two-second sampling plus query cost. Process high-water counters differ from sampled whole-device GPU use. No exact per-process VRAM claim.' }, null, 2) + '\n');
console.log(JSON.stringify(candidates));
