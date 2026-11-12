import { readFile, writeFile } from 'node:fs/promises';
const profile = JSON.parse(await readFile(new URL('0041b92b-adopted-50-groups-2.cpuprofile', import.meta.url), 'utf8'));
const nodes = new Map(profile.nodes.map(node => [node.id, node]));
const sums = new Map();
function total(id) { if (sums.has(id)) return sums.get(id); const node = nodes.get(id); const sum = (node.hitCount || 0) + (node.children || []).reduce((value, child) => value + total(child), 0); sums.set(id, sum); return sum; }
const routes = [];
function walk(id, path = []) { const node = nodes.get(id), name = node.callFrame.functionName || '(anonymous)'; if (name === 'planRoute') routes.push({ callerPath: path.slice(-6), selfSamples: node.hitCount || 0, inclusiveSamples: total(id) }); for (const child of node.children || []) walk(child, [...path, name]); }
walk(profile.nodes[0].id);
routes.sort((a, b) => b.inclusiveSamples - a.inclusiveSamples);
await writeFile(new URL('0041b92b-routing-callers.json', import.meta.url), JSON.stringify(routes, null, 2));
console.log(JSON.stringify(routes));
