import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, dirname, relative, sep } from 'node:path';
import ts from 'typescript';

/** Include the generator's transitive local inputs, including rules and asset catalogs. */
export function campaignIslandInputs() {
    const visited = new Set();
    const visit = file => {
        const path = resolve(file);
        if (visited.has(path)) return;
        visited.add(path);
        const source = readFileSync(path, 'utf8');
        for (const { fileName } of ts.preProcessFile(source).importedFiles)
            if (fileName.startsWith('.')) visit(resolve(dirname(path), fileName + '.ts'));
    };
    visit('src/fjord-play/CampaignIsland.ts');
    visited.add(resolve('pnpm-lock.yaml'));
    return Object.fromEntries([...visited].sort().map(path => [relative('.', path).split(sep).join('/'),
        createHash('sha256').update(readFileSync(path, 'utf8').replace(/\r\n/g, '\n')).digest('hex')]));
}
