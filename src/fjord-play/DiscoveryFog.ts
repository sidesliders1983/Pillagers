import {
    BufferGeometry, ClampToEdgeWrapping, DataTexture, DoubleSide, Float32BufferAttribute,
    Group, LinearFilter, Mesh, MeshBasicMaterial, RGBAFormat, UnsignedByteType,
} from 'three';
import { lightingConfig } from '../config/lightingConfig';
import type { FogPresentation } from '../config/FjordFog';
import { discoveryAt, type DiscoveryView } from '../simulation/ClanDiscovery';
import { terrainTriangles } from '../world-generation/TerrainQueries';
import type { WorldBlueprint } from '../world-generation/WorldBlueprint';

/** Native alphaMap on the canonical surface: no custom shader, camera reveal or render target.
 * Feathering lies INSIDE known cells; unknown cells stay opaque. Previous masks fade visually only. */
export class DiscoveryFog {
    readonly root = new Group();
    private geometry = new BufferGeometry();
    private current: Mesh<BufferGeometry, MeshBasicMaterial>;
    private previous?: Mesh<BufferGeometry, MeshBasicMaterial>;
    private elapsed = 1;
    private signature = '';
    private view: DiscoveryView;
    private readonly fadeSeconds = .8;
    private presentation?: FogPresentation;
    constructor(world: Pick<WorldBlueprint, 'terrain' | 'waterLevel'>, view: DiscoveryView) {
        this.view = view;
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
        this.current = this.layer(view);
        this.root.add(this.current);
        this.signature = view.explored + ':' + view.visible;
    }
    private layer(view: DiscoveryView) {
        const { grid, cellSize } = view, { bounds, columns, rows } = grid;
        const width = columns * 4 + 2, height = rows * 4 + 2;
        const bytes = new Uint8Array(width * height * 4);
        for (let row = 0; row < height; row++) for (let col = 0; col < width; col++) {
            const x = bounds.minX + (col - .5) * cellSize / 4;
            const z = bounds.minZ + (row - .5) * cellSize / 4;
            let alpha = 255;
            const known = discoveryAt(view, x, z);
            if (known !== 'unknown') {
                let distance = cellSize;
                const cx = Math.floor((x - bounds.minX) / cellSize), cz = Math.floor((z - bounds.minZ) / cellSize);
                for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
                    const minX = bounds.minX + (cx + dx) * cellSize;
                    const minZ = bounds.minZ + (cz + dz) * cellSize;
                    if (discoveryAt(view, minX + cellSize / 2, minZ + cellSize / 2) !== 'unknown') continue;
                    distance = Math.min(distance, Math.hypot(
                        Math.max(minX - x, x - minX - cellSize, 0),
                        Math.max(minZ - z, z - minZ - cellSize, 0)));
                }
                // Keep the last 1 m of known ground opaque before bilinear interpolation.
                alpha = Math.max(known === 'mapped' ? 55 : 0,
                    Math.round(255 * Math.max(0, Math.min(1, 1 - (distance - 1) / (cellSize - 1)))));
            }
            bytes.set([alpha, alpha, alpha, 255], (row * width + col) * 4);
        }
        const texture = new DataTexture(bytes, width, height, RGBAFormat, UnsignedByteType);
        texture.minFilter = texture.magFilter = LinearFilter;
        texture.wrapS = texture.wrapT = ClampToEdgeWrapping;
        texture.generateMipmaps = false;
        texture.needsUpdate = true;
        const mesh = new Mesh(this.geometry, new MeshBasicMaterial({
            color: this.presentation?.shroudColor ?? lightingConfig.day.sky,
            alphaMap: texture, transparent: true, alphaTest: .002, depthWrite: false,
            depthTest: true, side: DoubleSide, forceSinglePass: true,
            fog: this.presentation?.shroudDistanceFog ?? false, toneMapped: false }));
        mesh.renderOrder = 950;
        mesh.frustumCulled = false;
        mesh.raycast = () => {};
        return mesh;
    }
    /** Tint both fade layers without regenerating masks or changing canonical knowledge. */
    setPresentation(presentation?: FogPresentation) {
        this.presentation = presentation;
        for (const mesh of [this.current, this.previous]) {
            if (!mesh) continue;
            mesh.material.color.setHex(presentation?.shroudColor ?? lightingConfig.day.sky);
            const distanceFog = presentation?.shroudDistanceFog ?? false;
            if (mesh.material.fog !== distanceFog) {
                mesh.material.fog = distanceFog;
                mesh.material.needsUpdate = true;
            }
        }
    }
    setKnowledge(view: DiscoveryView) {
        if (view.worldId !== this.view.worldId) throw new Error('Fog belongs to a different world.');
        const signature = view.explored + ':' + view.visible;
        if (signature === this.signature) return;
        if (this.previous) {
            // Preserve an interrupted visual fade while committing the next canonical mask immediately.
            const old = this.previous.material.alphaMap!.image.data as Uint8Array;
            const current = this.current.material.alphaMap!.image.data as Uint8Array;
            const opacity = this.previous.material.opacity;
            for (let i = 0; i < current.length; i += 4) {
                const alpha = current[i] / 255;
                const combined = Math.round(255 * (alpha + (1 - alpha) * old[i] / 255 * opacity));
                current[i] = current[i + 1] = current[i + 2] = combined;
            }
            this.current.material.alphaMap!.needsUpdate = true;
        }
        this.release(this.previous);
        this.previous = this.current;
        this.current = this.layer(view);
        this.root.add(this.current);
        this.elapsed = 0;
        this.view = view;
        this.signature = signature;
    }
    update(delta: number) {
        if (!this.previous) return;
        this.elapsed = Math.min(this.fadeSeconds, this.elapsed + Math.max(0, delta));
        this.previous.material.opacity = 1 - this.elapsed / this.fadeSeconds;
        if (this.elapsed >= this.fadeSeconds) {
            this.release(this.previous);
            this.previous = undefined;
        }
    }
    inspect() {
        let exploredCells = 0, visibleCells = 0;
        const { grid, cellSize } = this.view;
        for (let row = 0; row < grid.rows; row++) for (let col = 0; col < grid.columns; col++) {
            const known = discoveryAt(this.view, grid.bounds.minX + (col + .5) * cellSize,
                grid.bounds.minZ + (row + .5) * cellSize);
            if (known !== 'unknown') exploredCells++;
            if (known === 'visible') visibleCells++;
        }
        return { active: this.root.visible, cellSize, exploredCells, visibleCells,
            unknownCells: grid.rows * grid.columns - exploredCells,
            maskBytes: (this.view.explored.length + this.view.visible.length) / 2,
            textureBytes: this.current.material.alphaMap!.image.data.byteLength,
            drawCalls: this.previous ? 2 : 1, triangles: this.geometry.index!.count / 3,
            nativeMaterial: true, fadeSeconds: this.fadeSeconds, transitioning: !!this.previous,
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
        this.release(this.previous);
        this.release(this.current);
        this.geometry.dispose();
        this.root.removeFromParent();
        this.root.clear();
    }
}
