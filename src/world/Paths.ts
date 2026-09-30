import { BufferGeometry, Float32BufferAttribute, Mesh, MeshStandardMaterial } from 'three';
import { pathWeight } from './SettlementLayout';
import { surfaceHeightAt } from './Terrain';
import { worldConfig } from '../config/worldConfig';
// One conforming mesh with feathered vertex alpha replaces overlapping circular decals.
export function createPaths() { const positions: number[] = [], colors: number[] = []; for (let x = -15; x < 16; x += .5)
    for (let z = -11; z < 18; z += .5) {
        if (pathWeight(x + .25, z + .25) < .035)
            continue;
        for (const [dx, dz] of [[0, 0], [0, .5], [.5, 0], [.5, 0], [0, .5], [.5, .5]]) {
            const px = x + dx, pz = z + dz;
            positions.push(px, surfaceHeightAt(px, pz) + .018, pz);
            colors.push(1, 1, 1, pathWeight(px, pz) * .6);
        }
    } const geometry = new BufferGeometry(); geometry.setAttribute('position', new Float32BufferAttribute(positions, 3)); geometry.setAttribute('color', new Float32BufferAttribute(colors, 4)); geometry.computeVertexNormals(); const material = new MeshStandardMaterial({ color: worldConfig.palette.earth, vertexColors: true, transparent: true, depthWrite: false, roughness: 1, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }); const mesh = new Mesh(geometry, material); mesh.receiveShadow = true; return mesh; }
