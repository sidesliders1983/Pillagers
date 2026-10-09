import { createRequire } from 'node:module';
import { writeFile } from 'node:fs/promises';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ||
    'C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
    const page = await browser.newPage();
    await page.goto((process.env.QA_ORIGIN || 'http://127.0.0.1:5181') + '/package.json');
    const results = await page.evaluate(async () => {
        const { AssetManager } = await import('/src/core/AssetManager.ts');
        const { createWorld } = await import('/src/world/WorldFactory.ts');
        const { generateWorld } = await import('/src/world-generation/GenerateWorld.ts');
        const { Box3, Ray, Vector3 } = await import('/node_modules/three/build/three.module.js');
        const assets = new AssetManager();
        await assets.load();
        const results = [];

        function triangles(root) {
            const output = [];
            root.traverse(node => {
                if (!node.isMesh) return;
                const positions = node.geometry.attributes.position;
                const indices = node.geometry.index;
                for (let index = 0; index < (indices?.count ?? positions.count); index += 3) {
                    const vertices = [0, 1, 2].map(offset => new Vector3()
                        .fromBufferAttribute(positions, indices ? indices.getX(index + offset) : index + offset)
                        .applyMatrix4(node.matrixWorld));
                    output.push({ vertices, bounds: new Box3().setFromPoints(vertices) });
                }
            });
            return output;
        }

        function edgeContact(first, second) {
            for (let index = 0; index < 3; index++) {
                const start = first[index];
                const direction = first[(index + 1) % 3].clone().sub(start);
                const length = direction.length();
                if (!length) continue;
                const ray = new Ray(start, direction.divideScalar(length));
                const hit = ray.intersectTriangle(...second, false, new Vector3());
                if (hit && start.distanceTo(hit) > 1e-5 && start.distanceTo(hit) < length - 1e-5) {
                    return hit.toArray();
                }
            }
            return null;
        }

        function firstContact(boat, pier) {
            for (const hull of boat) {
                for (const dock of pier) {
                    if (!hull.bounds.intersectsBox(dock.bounds)) continue;
                    const contact = edgeContact(hull.vertices, dock.vertices) ||
                        edgeContact(dock.vertices, hull.vertices);
                    if (contact) return contact;
                }
            }
            return null;
        }

        try {
            for (const mode of ['reference', 17, 91]) {
                const world = await createWorld(assets, {
                    mode: mode === 'reference' ? 'reference' : 'generated', quality: 'standard',
                    blueprint: mode === 'reference' ? undefined : generateWorld({ seed: mode, conifers: 'ez-tree' }),
                });
                try {
                    const boat = world.root.getObjectByName('boat');
                    const pier = world.root.getObjectByName('jetty');
                    for (const quality of ['standard', 'low']) {
                        world.setQuality(quality);
                        let trough = { time: 0, height: Infinity };
                        let crest = { time: 0, height: -Infinity };
                        for (let time = 0; time <= 16; time += 0.25) {
                            world.update(time);
                            const height = boat.position.y;
                            if (height < trough.height) trough = { time, height };
                            if (height > crest.height) crest = { time, height };
                        }
                        for (const time of ['baseline', 0, 2.5, 8.1, trough.time, crest.time]) {
                            if (time === 'baseline') {
                                boat.rotation.set(0, world.describe().water.boat.heading, 0);
                                boat.position.y = mode === 'reference' ? -0.2 : world.blueprint.waterLevel + 0.15;
                            } else world.update(time);
                            world.root.updateMatrixWorld(true);
                            const hull = triangles(boat);
                            const dock = triangles(pier);
                            let minimumTerrainClearance = Infinity;
                            for (const triangle of hull) {
                                for (const point of triangle.vertices) {
                                    minimumTerrainClearance = Math.min(minimumTerrainClearance,
                                        point.y - world.movement.heightAt(point.x, point.z));
                                }
                            }
                            results.push({ mode, quality, time, boat: boat.position.toArray(),
                                pier: pier.position.toArray(), contact: firstContact(hull, dock),
                                minimumTerrainClearance });
                        }
                    }
                } finally { world.dispose(); }
            }
        } finally { assets.dispose(); }
        return results;
    });
    await writeFile(process.env.QA_OUTPUT || 'scratch/boat-pier-final.json', JSON.stringify(results, null, 2));
    const failures = results.filter(row => row.contact !== null || row.minimumTerrainClearance < 0);
    if (failures.length) throw new Error(JSON.stringify(failures));
    console.log('PASS: no pier triangle crossings and positive hull-vertex terrain clearance at fixed times and sampled extrema.');
} finally {
    await browser.close();
}
