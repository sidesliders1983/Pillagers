import { readFile, writeFile } from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';
const load = async variant => JSON.parse(await readFile(new URL('final-0041b92b-population-100-groups-1-' + variant + '.shared.json', import.meta.url), 'utf8'));
const disabled = await load('disabled'), enabled = await load('enabled');
const differences = [];
for (const part of ['layout', 'rivalLayout']) {
    for (const name of new Set([...Object.keys(disabled.fjord[part]?.plots || {}), ...Object.keys(enabled.fjord[part]?.plots || {})])) {
        const off = disabled.fjord[part]?.plots[name], on = enabled.fjord[part]?.plots[name];
        if (!isDeepStrictEqual(off, on)) differences.push({ part, name, disabled: off, enabled: on });
    }
}
await writeFile(new URL('final-100-context-difference.json', import.meta.url), JSON.stringify(differences, null, 2));
console.log(JSON.stringify(differences));
