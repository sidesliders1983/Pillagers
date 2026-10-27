import {
    BoxGeometry, BufferGeometry, Camera, Color, CylinderGeometry, Float32BufferAttribute,
    Group, Mesh, MeshStandardMaterial, Object3D, OctahedronGeometry, Vector3,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { SelectionLabels, type SelectionLabel } from './SelectionLabels';
import './cultural-ceremony.css';

export type CeremonyOccasion = 'wedding' | 'communal_ceremony';
export type CeremonyFrame = {
    id: string;
    occasion: string;
    phase: string;
    position: { x: number; y: number; z: number };
    visible: boolean;
    wedding?: { rotation: number };
    spouseIds: readonly string[];
};
export type CeremonySpouseAnchor = {
    id: string;
    name: string;
    position: { x: number; y: number; z: number };
    visible: boolean;
};
export type CeremonyVisualState = {
    /** Foreground presentation is allowed, independently of the simulation clock. */
    active: boolean;
    fireLit: boolean;
    spouses: readonly CeremonySpouseAnchor[];
    camera?: Camera;
    width?: number;
    height?: number;
};

const wood = '#77513a';
const foliage = '#617343';
const blossom = '#e8d5a6';
const gold = '#d4ae64';
const cloth = '#854a43';

/** One static, vertex-coloured mesh; decoration stays inside the fire's existing obstacle. */
function ceremonyGeometry(occasion: CeremonyOccasion): BufferGeometry {
    const parts: BufferGeometry[] = [];
    const add = (shape: BufferGeometry, color: string, position: Vector3,
        rotation = new Vector3()) => {
        const geometry = shape.index ? shape.toNonIndexed() : shape;
        if (geometry !== shape) shape.dispose();
        geometry.deleteAttribute('uv');
        geometry.rotateX(rotation.x);
        geometry.rotateY(rotation.y);
        geometry.rotateZ(rotation.z);
        geometry.translate(position.x, position.y, position.z);
        const tint = new Color(color);
        const colors = new Float32Array(geometry.getAttribute('position').count * 3);
        for (let index = 0; index < colors.length; index += 3) {
            colors[index] = tint.r;
            colors[index + 1] = tint.g;
            colors[index + 2] = tint.b;
        }
        geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
        parts.push(geometry);
    };
    const beam = (from: Vector3, to: Vector3, radius: number, color: string) => {
        const shape = new CylinderGeometry(radius, radius * 1.08, from.distanceTo(to), 6);
        shape.applyQuaternion(new Object3D().quaternion.setFromUnitVectors(
            new Vector3(0, 1, 0), to.clone().sub(from).normalize()));
        add(shape, color, from.clone().add(to).multiplyScalar(.5));
    };
    const flowers = (point: Vector3, index: number) => {
        add(new OctahedronGeometry(.1, 0), gold, point);
        for (let petal = 0; petal < 4; petal++) {
            const angle = index * .37 + petal * Math.PI / 2;
            add(new OctahedronGeometry(.13, 0), blossom,
                point.clone().add(new Vector3(Math.cos(angle) * .14, Math.sin(angle) * .14, 0)),
                new Vector3(.1, angle, .3));
        }
    };

    const standardHalfSpan = occasion === 'wedding' ? 3.55 : 2.15;
    const standardDepth = occasion === 'wedding' ? .4 : -3.25;
    for (const side of [-1, 1]) {
        const x = side * standardHalfSpan;
        beam(new Vector3(x, 0, standardDepth), new Vector3(x, 2.6, standardDepth), .07, wood);
        beam(new Vector3(x - .4, 2.45, standardDepth), new Vector3(x + .4, 2.45, standardDepth), .035, wood);
        add(new BoxGeometry(.72, 1.05, .035), cloth, new Vector3(x, 1.9, standardDepth));
        add(new BoxGeometry(.035, 1.05, .045), gold, new Vector3(x - .32, 1.9, standardDepth));
        add(new BoxGeometry(.035, 1.05, .045), gold, new Vector3(x + .32, 1.9, standardDepth));
    }
    if (occasion === 'wedding') {
        for (const side of [-1, 1])
            beam(new Vector3(side * 2.15, 0, -3.25), new Vector3(side * 2.15, 2.7, -3.25), .09, wood);
        let previous = new Vector3(-2.15, 2.7, -3.25);
        for (let segment = 1; segment <= 12; segment++) {
            const x = -2.15 + 4.3 * segment / 12;
            const next = new Vector3(x, 2.7 + Math.sin(segment / 12 * Math.PI) * .65, -3.25);
            beam(previous, next, .075, foliage);
            add(new OctahedronGeometry(.18, 0), foliage,
                next.clone().add(new Vector3(0, -.11, .02)), new Vector3(0, .4, segment));
            if (segment % 2 === 0) flowers(next.clone().add(new Vector3(0, 0, .12)), segment);
            previous = next;
        }
    } else {
        // A neutral garland links the standards without assigning a religion or ritual symbol.
        let previous = new Vector3(-standardHalfSpan, 2.45, standardDepth);
        for (let segment = 1; segment <= 14; segment++) {
            const x = -standardHalfSpan + 2 * standardHalfSpan * segment / 14;
            const next = new Vector3(x, 2.45 - Math.sin(segment / 14 * Math.PI) * .45, standardDepth);
            beam(previous, next, .035, foliage);
            add(new OctahedronGeometry(.13, 0), foliage, next, new Vector3(0, .4, segment));
            previous = next;
        }
    }
    const geometry = mergeGeometries(parts, false);
    for (const part of parts) part.dispose();
    if (!geometry) throw new Error('Could not prepare cultural ceremony decoration.');
    geometry.computeBoundingSphere();
    return geometry;
}

/** Transient scene decoration only. The caller supplies an already accepted live presentation. */
export class CulturalCeremonyVisuals {
    private readonly root = new Group();
    private readonly material = new MeshStandardMaterial({ color: '#ffffff', vertexColors: true, roughness: 1 });
    private readonly geometries = new Map<CeremonyOccasion, BufferGeometry>();
    private mesh?: Mesh;
    private disposed = false;
    private labelLayer?: HTMLElement;
    private leaderLayer?: SVGSVGElement;
    private labels?: SelectionLabels;
    private labelKey = '';

    constructor(scene: Object3D, labelHost?: HTMLElement) {
        this.root.name = 'Cultural ceremony';
        this.root.visible = false;
        scene.add(this.root);
        if (labelHost) {
            const document = labelHost.ownerDocument;
            this.labelLayer = document.createElement('div');
            this.labelLayer.className = 'fjord-ceremony-labels';
            this.labelLayer.setAttribute('aria-hidden', 'true');
            this.labelLayer.hidden = true;
            this.leaderLayer = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            this.leaderLayer.classList.add('fjord-ceremony-leaders');
            this.leaderLayer.setAttribute('aria-hidden', 'true');
            this.leaderLayer.setAttribute('hidden', '');
            labelHost.append(this.leaderLayer, this.labelLayer);
            this.labels = new SelectionLabels(this.labelLayer, this.leaderLayer);
        }
    }

    update(frame: CeremonyFrame | null, state: CeremonyVisualState): void {
        const occasion = frame?.occasion;
        if (this.disposed || !frame?.id || !frame.visible || !state.active || !state.fireLit ||
            !['approach', 'gathering', 'response'].includes(frame.phase) ||
            (occasion !== 'wedding' && occasion !== 'communal_ceremony')) {
            this.root.visible = false;
            this.hideLabels();
            return;
        }
        let geometry = this.geometries.get(occasion);
        if (!geometry) {
            geometry = ceremonyGeometry(occasion);
            this.geometries.set(occasion, geometry);
        }
        if (!this.mesh) {
            this.mesh = new Mesh(geometry, this.material);
            this.mesh.name = 'Temporary ceremony decoration';
            this.mesh.castShadow = false;
            this.root.add(this.mesh);
        }
        this.mesh.geometry = geometry;
        this.root.position.set(frame.position.x, frame.position.y, frame.position.z);
        this.root.rotation.y = frame.wedding?.rotation ?? 0;
        this.root.visible = true;
        this.updateLabels(frame, state);
    }

    private hideLabels(): void {
        if (this.labelLayer) this.labelLayer.hidden = true;
        this.leaderLayer?.setAttribute('hidden', '');
    }

    private updateLabels(frame: CeremonyFrame, state: CeremonyVisualState): void {
        if (!this.labels || !this.labelLayer || !this.leaderLayer || frame.occasion !== 'wedding' ||
            frame.spouseIds.length !== 2 || new Set(frame.spouseIds).size !== 2 ||
            !state.camera || !state.width || !state.height) {
            this.hideLabels();
            return;
        }
        const markers: SelectionLabel[] = frame.spouseIds.flatMap(id => {
            const person = state.spouses.find(candidate => candidate.id === id && candidate.visible);
            return person ? [{ selectionKey: 'ceremony:' + id, role: 'partner' as const,
                roleLabel: 'Wedding', label: person.name, color: '#ebcb7e',
                anchor: [person.position.x, person.position.y, person.position.z] }] : [];
        });
        const key = JSON.stringify(markers.map(marker => [marker.selectionKey, marker.label]));
        if (key !== this.labelKey) {
            this.labels.sync(markers);
            this.labelKey = key;
        } else this.labels.setAnchors(markers);
        this.labelLayer.hidden = markers.length === 0;
        this.leaderLayer.toggleAttribute('hidden', markers.length === 0);
        this.labels.update(state.camera, state.width, state.height);
    }

    dispose(): void {
        if (this.disposed) return;
        this.root.removeFromParent();
        this.root.clear();
        this.mesh = undefined;
        this.labels?.sync([]);
        this.labels = undefined;
        this.labelLayer?.remove();
        this.leaderLayer?.remove();
        this.labelLayer = undefined;
        this.leaderLayer = undefined;
        for (const geometry of this.geometries.values()) geometry.dispose();
        this.geometries.clear();
        this.material.dispose();
        this.disposed = true;
    }
}
