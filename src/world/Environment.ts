import { Group, InstancedMesh, Matrix4, Mesh, Object3D } from 'three';
import { AssetManager, AssetKey } from '../core/AssetManager';
import { seededRandom, worldConfig } from '../config/worldConfig';
import { heightAt } from './Terrain';
import { obstacles, pathWeight } from './SettlementLayout';
export function createEnvironment(assets: AssetManager) {
    const group = new Group();
    group.name = 'Scenery';
    const random = seededRandom(worldConfig.seed);
    const dummy = new Object3D(), matrix = new Matrix4();
    for (const [key, count] of [['spruce', 100], ['birch', 24], ['boulder', 35], ['heather', 65], ['grass', 90]] as [
        AssetKey,
        number
    ][]) {
        const model = assets.get(key);
        model.updateMatrixWorld(true);
        const transforms: Matrix4[] = [];
        for (let i = 0; i < count; i++) {
            const tree = key === 'spruce' || key === 'birch';
            let x = 0, z = 0;
            for (let attempt = 0; attempt < 200; attempt++) {
                x = random() * 76 - 38;
                z = random() * 48 - 5;
                const clear = obstacles.every(o => Math.hypot(x - o.x, z - o.z) > o.r + (tree ? 2 : .9));
                const clearing = x * x / 350 + (z - 5) * (z - 5) / 240;
                const forestEdge = 1 + .14 * Math.sin(x * .35 + z * .22);
                if (clear && pathWeight(x, z) < .08 && (tree ? clearing > forestEdge : clearing > .18))
                    break;
            }
            dummy.position.set(x, heightAt(x, z), z);
            dummy.rotation.y = random() * Math.PI * 2;
            dummy.scale.setScalar(.7 + random() * .65);
            dummy.updateMatrix();
            transforms.push(dummy.matrix.clone());
        }
        model.traverse(child => {
            if (!(child instanceof Mesh))
                return;
            const instances = new InstancedMesh(child.geometry, child.material, count);
            instances.userData.seasonalFoliage=key!=='boulder';
            transforms.forEach((transform, i) => instances.setMatrixAt(i, matrix.multiplyMatrices(transform, child.matrixWorld)));
            instances.castShadow = key === 'spruce' || key === 'birch' || key === 'boulder';
            instances.receiveShadow = true;
            instances.computeBoundingSphere();
            group.add(instances);
        });
    }
    return group;
}
