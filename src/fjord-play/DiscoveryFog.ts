import {
    BufferGeometry, ClampToEdgeWrapping, DataTexture, DoubleSide, Float32BufferAttribute,
    Group, LinearFilter, Mesh, MeshBasicMaterial, RGBAFormat, UnsignedByteType,
} from 'three';
import { lightingConfig } from '../config/lightingConfig';
import type { FogPresentation } from '../config/FjordFog';
import type { DiscoveryView } from '../simulation/ClanDiscovery';
import { DiscoveryFogMask } from './DiscoveryFogMask';
import { terrainTriangles } from '../world-generation/TerrainQueries';
import type { WorldBlueprint } from '../world-generation/WorldBlueprint';

/** Native alphaMap on the canonical surface: no custom shader, camera reveal or render target.
 * Feathering lies INSIDE known cells; unknown cells stay opaque. Only changed texels fade. */
export class DiscoveryFog {
    readonly root = new Group();
    private geometry = new BufferGeometry();
    private current: Mesh<BufferGeometry, MeshBasicMaterial>;
    private mask: DiscoveryFogMask;
    private view: DiscoveryView;
    constructor(world: Pick<WorldBlueprint, 'terrain' | 'waterLevel'>, view: DiscoveryView) {
        this.view = view;
        this.mask = new DiscoveryFogMask(view);
        this.root.name = 'Clan discovery fog';
        const { terrain, waterLevel } = world, { bounds, columns, rows, heights, spacing } = terrain;
        const positions: number[] = [], uvs: number[] = [];
        const width = bounds.maxX - bounds.minX, depth = bounds.maxZ - bounds.minZ;
        const textureWidth = view.grid.columns * 4 + 2, textureHeight = view.grid.rows * 4 + 2;
        const append = (x: number, y: number, z: number, u: number, v: number) => {
            positions.push(x, y, z);
            uvs.push(u, v);
        };
        for (let row = 0; row < rows; row++) for (let col = 0; col < columns; col++) {
            append(bounds.minX + col * spacing, Math.max(waterLevel, heights[row * columns + col]) + .2,
                bounds.minZ + row * spacing,
                (1 + col / (columns - 1) * (textureWidth - 2)) / textureWidth,
                (1 + row / (rows - 1) * (textureHeight - 2)) / textureHeight);
        }
        const indices = terrainTriangles(terrain).flat();
        // A sea apron closes the horizon without rendering information outside the discovery grid.
        const inner = [[bounds.minX, bounds.minZ], [bounds.maxX, bounds.minZ],
            [bounds.maxX, bounds.maxZ], [bounds.minX, bounds.maxZ]];
        const outer = [[bounds.minX - 2000, bounds.minZ - 2000], [bounds.maxX + 2000, bounds.minZ - 2000],
            [bounds.maxX + 2000, bounds.maxZ + 2000], [bounds.minX - 2000, bounds.maxZ + 2000]];
        for (let edge = 0; edge < 4; edge++) {
            const start = positions.length / 3, next = (edge + 1) % 4;
            for (const point of [inner[edge], inner[next], outer[next], outer[edge]])
                append(point[0], waterLevel + .2, point[1],
                    Math.max(0, Math.min(1, (point[0] - bounds.minX) / width)),
                    Math.max(0, Math.min(1, (point[1] - bounds.minZ) / depth)));
            indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
        }
        this.geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
        this.geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
        this.geometry.setIndex(indices);
        this.geometry.computeBoundingSphere();
        this.current = this.layer();
        this.root.add(this.current);
    }
    private layer() {
        const texture = new DataTexture(this.mask.pixels, this.mask.width, this.mask.height,
            RGBAFormat, UnsignedByteType);
        texture.minFilter = texture.magFilter = LinearFilter;
        texture.wrapS = texture.wrapT = ClampToEdgeWrapping;
        texture.generateMipmaps = false;
        texture.needsUpdate = true;
        const mesh = new Mesh(this.geometry, new MeshBasicMaterial({
            color: lightingConfig.day.sky,
            alphaMap: texture, transparent: true, alphaTest: .002, depthWrite: false,
            depthTest: true, side: DoubleSide, forceSinglePass: true,
            fog: false, toneMapped: false }));
        mesh.renderOrder = 950;
        mesh.frustumCulled = false;
        mesh.raycast = () => {};
        return mesh;
    }
    /** Tint the persistent layer without regenerating masks or changing canonical knowledge. */
    setPresentation(presentation?: FogPresentation) {
        const material = this.current.material;
        material.color.setHex(presentation?.shroudColor ?? lightingConfig.day.sky);
        const distanceFog = presentation?.shroudDistanceFog ?? false;
        if (material.fog !== distanceFog) {
            material.fog = distanceFog;
            material.needsUpdate = true;
        }
    }
    setKnowledge(view: DiscoveryView) {
        if (this.mask.setKnowledge(view)) this.current.material.alphaMap!.needsUpdate = true;
        this.view = view;
    }
    update(delta: number) {
        if (this.mask.update(delta)) this.current.material.alphaMap!.needsUpdate = true;
    }
    inspect() {
        return { active: this.root.visible, cellSize: this.view.cellSize, ...this.mask.inspect(),
            maskBytes: (this.view.explored.length + this.view.visible.length) / 2,
            textureBytes: (this.current.material.alphaMap as import('three').DataTexture).image.data!.byteLength,
            drawCalls: 1, triangles: this.geometry.index!.count / 3,
            nativeMaterial: true,
            geometryBytes: this.geometry.getAttribute('position').array.byteLength +
                this.geometry.getAttribute('uv').array.byteLength + this.geometry.index!.array.byteLength };
    }
    private release(mesh?: Mesh<BufferGeometry, MeshBasicMaterial>) {
        if (!mesh) return;
        mesh.removeFromParent();
        mesh.material.alphaMap?.dispose();
        mesh.material.dispose();
    }
    dispose() {
        this.release(this.current);
        this.geometry.dispose();
        this.root.removeFromParent();
        this.root.clear();
    }
}
