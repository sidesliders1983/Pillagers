import { Group, Raycaster, Vector3, Mesh, InstancedMesh } from 'three';
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
        const paths = createPaths();
        paths.name = 'Settlement paths';
        this.root.add(this.terrain, paths, this.water.mesh, createEnvironment(assets));
        const place = (key: AssetKey, x: number, z: number, rotation = 0, y = heightAt(x, z), scale = 1) => { const model = assets.get(key); model.position.set(x, y, z); model.rotation.y = rotation; model.scale.setScalar(scale); this.root.add(model); };
        const housing=new Group();housing.name='Generated housing';this.root.add(housing);
        for (const b of buildings){
            const parcel=new Group();parcel.name=b.key;parcel.position.set(b.x,heightAt(b.x,b.z),b.z);parcel.rotation.y=b.rotation;
            let floor=0;
            if('terrainKey' in b && assets.has(b.terrainKey)){
                const yard=assets.get(b.terrainKey);yard.updateMatrixWorld(true);
                // The authored yard has an empty centre for its house; ground the foundation on that surface.
                const ray=new Raycaster(new Vector3(0,20,0),new Vector3(0,-1,0));
                floor=ray.intersectObject(yard,true)[0]?.point.y??0;
                parcel.add(yard);parcel.userData.terrain=b.terrainKey;
            }
            const model=assets.get(b.key);model.position.y=floor;parcel.add(model);
            parcel.userData.housing={asset:b.key,x:b.x,z:b.z};housing.add(parcel);
        }
        place('hearth', hearth.x, hearth.z);
        place('well', well.x, well.z, .2);
        // Working clusters leave the central clearing and paths open.
        place('logs', -10, 18, .7);
        place('crate', -10, 16, .22);
        place('barrel', -8.5, .4, -.3);
        place('barrel', 32, 18, .45);
        place('barrel', 34, 19, .1);
        place('crate', 30, 19, -.22);
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
    dispose() {
        this.water.dispose();
        this.root.traverse(node => {
            if (node instanceof InstancedMesh) node.dispose();
            if (node instanceof Mesh && (node === this.terrain || node.name === 'Settlement paths')) {
                node.geometry.dispose();
                for (const material of Array.isArray(node.material) ? node.material : [node.material]) material.dispose();
            }
        });
        this.root.clear();
    }
    update(time: number) { this.water.update(time); }
}
