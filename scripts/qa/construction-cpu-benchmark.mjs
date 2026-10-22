import { performance } from 'node:perf_hooks';
import { loadTypeScript } from '../../scripts/load-typescript.mjs';
import { createRequire } from 'node:module';
const { BoxGeometry, Group, InstancedMesh, Mesh, MeshStandardMaterial } = createRequire(import.meta.url)('three');
const { ConstructionTransitions } = loadTypeScript(new URL('../../src/construction/ConstructionTransition.ts', import.meta.url));
const { measureBuildEnvelope } = loadTypeScript(new URL('../../src/construction/BuildEnvelope.ts', import.meta.url));
const geometry = new BoxGeometry(13, 7, 8), material = new MeshStandardMaterial();
const samples = [];
let writes = 0;
const original = InstancedMesh.prototype.setMatrixAt;
InstancedMesh.prototype.setMatrixAt = function (...args) {
    writes++;
    return original.apply(this, args);
};
for (let trial = 0; trial < 31; trial++) {
    const root = new Group(), body = new Mesh(geometry, material);
    body.position.y = 3.5;
    root.add(body);
    root.userData.asset = 'greatHall';
    root.userData.buildEnvelope = measureBuildEnvelope(root, 'greatHall');
    const transitions = new ConstructionTransitions();
    const start = performance.now();
    transitions.play('benchmark', root);
    const initializeMs = performance.now() - start;
    for (let i = 0; i < 120; i++) transitions.update(.01);
    writes = 0;
    const hold = performance.now();
    for (let i = 0; i < 40; i++) transitions.update(1 / 60);
    samples.push({ initializeMs, holdMs: performance.now() - hold, matrixWrites: writes });
    transitions.dispose();
}
InstancedMesh.prototype.setMatrixAt = original;
const median = key => samples.slice(1).map(s => s[key]).sort((a,b) => a-b)[14];
console.log(JSON.stringify({ scope: 'Node CPU only, 40 standing-frame updates; no WebGL/GPU timing',
    first: samples[0], median: { initializeMs:median('initializeMs'), holdMs:median('holdMs'), matrixWrites:median('matrixWrites') } },null,2));
geometry.dispose(); material.dispose();
