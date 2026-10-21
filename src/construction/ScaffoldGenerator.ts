import { Quaternion, Vector3 } from 'three';
import type { BuildEnvelope } from './BuildEnvelope';

export const LIGHT_SCAFFOLD = { spacing: 2.8, radius: .085, levels: 1 } as const;
export const HEAVY_SCAFFOLD = { spacing: 2.1, radius: .105, levels: 2 } as const;

export interface ScaffoldPart {
    geometry: 'pole' | 'plank' | 'lashing' | 'turf';
    role: 'post' | 'ledger' | 'brace' | 'platform' | 'ladder' | 'material' | 'lashing';
    start: Vector3;
    direction: Vector3;
    rotation: Quaternion;
    length: number;
    width: number;
    depth: number;
    erect: number;
    remove: number;
}

/** Deterministic visual variation; never consumes campaign RNG. Generated only at transition start. */
export function generateScaffold(envelope: BuildEnvelope) {
    const preset = envelope.scaffoldPreset === 'heavy' ? HEAVY_SCAFFOLD : LIGHT_SCAFFOLD;
    const xs = envelope.footprint.map(p => p.x), zs = envelope.footprint.map(p => p.z);
    const minX = Math.min(...xs) - envelope.scaffoldMargin;
    const maxX = Math.max(...xs) + envelope.scaffoldMargin;
    const minZ = Math.min(...zs) - envelope.scaffoldMargin;
    const maxZ = Math.max(...zs) + envelope.scaffoldMargin;
    const base = envelope.baseHeight, platform = envelope.eaveHeight - .35;
    const top = Math.min(envelope.ridgeHeight, Math.max(platform + .85, envelope.eaveHeight));
    const corners = [new Vector3(minX, base, minZ), new Vector3(maxX, base, minZ),
        new Vector3(maxX, base, maxZ), new Vector3(minX, base, maxZ)];
    const points: Vector3[] = [];
    for (let edge = 0; edge < 4; edge++) {
        const start = corners[edge], end = corners[(edge + 1) % 4];
        const count = Math.min(24, Math.max(1, Math.ceil(start.distanceTo(end) / preset.spacing)));
        for (let i = 0; i < count; i++) {
            const irregularity = i === 0 ? 0 : Math.sin(edge * 13 + i * 7) * .09 / count;
            points.push(start.clone().lerp(end, i / count + irregularity));
        }
    }
    const parts: ScaffoldPart[] = [];
    const add = (geometry: ScaffoldPart['geometry'], role: ScaffoldPart['role'],
        start: Vector3, end: Vector3, width: number, depth: number, erect: number, remove: number) => {
        const direction = end.clone().sub(start), length = direction.length();
        direction.normalize();
        parts.push({ geometry, role, start, direction, length, width, depth, erect, remove,
            rotation: new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), direction) });
    };
    const atHeight = (p: Vector3, y: number) => new Vector3(p.x, y, p.z);
    points.forEach((point, i) => {
        const radius = preset.radius * (1 + Math.sin(i * 7.3) * .13);
        add('pole', 'post', point.clone(), atHeight(point, top + Math.sin(i * 5) * .08),
            radius, radius, i / points.length * .35, 2.65 + i / points.length * .15);
    });
    const levels = preset.levels === 2 && platform - base > 2.5
        ? [base + (platform - base) * .48, platform] : [platform];
    levels.forEach((height, level) => {
        points.forEach((point, i) => {
            const next = points[(i + 1) % points.length];
            const erect = .45 + level * .13 + i / points.length * .12;
            const remove = 2.4 - level * .15;
            add('pole', 'ledger', atHeight(point, height - .18), atHeight(next, height - .18),
                .065, .065, erect, remove);
            add('pole', 'ledger', atHeight(point, height + .7), atHeight(next, height + .7),
                .055, .055, erect + .08, remove);
            // Two narrow, uneven planks rather than a solid machine-perfect deck.
            const inward = new Vector3(point.z - next.z, 0, next.x - point.x).normalize();
            for (const offset of [.12, .4]) {
                const shift = inward.clone().multiplyScalar(offset);
                add('plank', 'platform', atHeight(point, height).add(shift),
                    atHeight(next, height).add(shift), .25, .055, erect + .15, 2.18 - level * .1);
            }
            add('lashing', 'lashing', atHeight(point, height - .22), atHeight(point, height - .12),
                .22, .22, erect + .08, remove);
            if (i % (preset.levels === 2 ? 2 : 3) === 0)
                add('pole', 'brace', atHeight(point, base + .2), atHeight(next, height - .25),
                    .055, .055, erect + .1, remove + .1);
        });
    });
    const ladderBottom = new Vector3(minX + .5, base, minZ - 1.2);
    const ladderTop = new Vector3(minX + .5, platform + .25, minZ + .1);
    for (const x of [0, .48])
        add('pole', 'ladder', ladderBottom.clone().add(new Vector3(x, 0, 0)),
            ladderTop.clone().add(new Vector3(x, 0, 0)), .055, .055, .85, 2.95);
    const rungs = Math.max(2, Math.ceil((platform - base) / .32));
    for (let i = 1; i < rungs; i++) {
        const rung = ladderBottom.clone().lerp(ladderTop, i / rungs);
        add('pole', 'ladder', rung, rung.clone().add(new Vector3(.48, 0, 0)), .04, .04, .88, 2.95);
    }
    for (let i = 0; i < 3; i++) {
        const start = new Vector3(maxX + .25, base + .12 + i * .16, maxZ - .7);
        const turf = envelope.materialProfile !== 'timber';
        add(turf ? 'turf' : 'pole', 'material', start, start.clone().add(new Vector3(0, 0, 1.15)),
            turf ? .4 : .12, turf ? .18 : .12, .1 + i * .05, 2.95);
    }
    return { parts, postPoints: points.map(p => p.toArray()), envelope };
}
