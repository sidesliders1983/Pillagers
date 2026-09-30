import { Group } from 'three';
import { AssetManager, AssetKey } from '../core/AssetManager';
import { createTerrain, heightAt } from './Terrain';
import { createEnvironment } from './Environment';
import { createPaths } from './Paths';
import { buildings, hearth, well } from './SettlementLayout';
import { Water } from './Water';
export { obstacles } from './SettlementLayout';
export class World {
    readonly root = new Group();
    readonly water = new Water();
    readonly terrain = createTerrain();
    constructor(assets: AssetManager) {
        this.root.name = 'Fjordside';
        this.root.add(this.terrain, createPaths(), this.water.mesh, createEnvironment(assets));
        const place = (key: AssetKey, x: number, z: number, rotation = 0, y = heightAt(x, z), scale = 1) => { const model = assets.get(key); model.position.set(x, y, z); model.rotation.y = rotation; model.scale.setScalar(scale); this.root.add(model); };
        for (const b of buildings)
            place(b.key, b.x, b.z, b.rotation);
        place('hearth', hearth.x, hearth.z);
        place('well', well.x, well.z, .2);
        // Working clusters leave the central clearing and paths open.
        place('logs', -14, 6.5, .7);
        place('crate', -13.7, 4.1, .22);
        place('barrel', -8.5, .4, -.3);
        place('barrel', 12.8, 4.9, .45);
        place('barrel', 13.5, 5.6, .1);
        place('crate', 13.6, 7.1, -.22);
        place('crate', 2.9, 15.3, .18);
        place('logs', 4.5, 15.8, -.35);
        place('fish', -8.8, -6.7, .25);
        place('barrel', -10.9, -6.2);
        place('rune', 17.5, 16.5, -.4);
        place('jetty', -5, -11, .06, -.6);
        place('boat', -8.2, -15, .3, -.2);
        for (const [x, z, rotation, scale] of [[-30, -8, .4, 1.15], [-27, -6.7, 1.2, .85], [-23, -8.6, 2.1, .95], [-19.5, -7.7, .7, .65]])
            place('cliff', x, z, rotation, undefined, scale);
    }
    update(time: number) { this.water.update(time); }
}
