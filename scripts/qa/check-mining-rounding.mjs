import {readFileSync, writeFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {loadTypeScript} from '../load-typescript.mjs';
const {campaignIslandCatalog} = loadTypeScript(new URL('../../src/fjord-play/BakedIslandCatalog.ts',import.meta.url));
const {planMiningSites, assertOreSitePlan} = loadTypeScript(new URL('../../src/world-generation/OreSites.ts',import.meta.url));
const original = Math.hypot, results = [];
for (const entry of campaignIslandCatalog.entries.filter(e => e.version === 'island-pool-v3')) {
    const world = JSON.parse(gunzipSync(readFileSync('public' + entry.path))).world, saved = planMiningSites(world);
    for (const direction of [-1,1]) {
        try {
            Math.hypot = (...values) => {const value = original(...values); return value ? value * (1 + direction * Number.EPSILON) : value;};
            assertOreSitePlan(world,saved);
            results.push({seed:entry.seed,direction,status:'passed',version:saved.version});
        } finally {Math.hypot = original;}
    }
}
const output = {version:2,runnerSha256:createHash('sha256').update(readFileSync(new URL(import.meta.url))).digest('hex'),results};
writeFileSync('docs/qa/mining-223/cross-engine-rounding-v2.json',JSON.stringify(output,null,2));
console.log(JSON.stringify({cases:results.length,passed:results.filter(r => r.status === 'passed').length}));
