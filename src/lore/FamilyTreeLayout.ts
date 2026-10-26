import type { FamilyTree } from './FamilyTree';

export const familyCard = {
    width: 252,
    height: 132,
    columnGap: 88,
    rowGap: 20,
    inset: 36,
    heading: 72,
};

export interface FamilyPoint {
    generation: number;
    slot: number;
    x: number;
    y: number;
}

/** Rotate the canonical generation projection, keeping existing campaign anchors.
 * New descendants take the first free place near their real parents; no kinship is inferred here.
 */
export function layoutFamilyTree(tree: FamilyTree, previous = new Map<string, FamilyPoint>()) {
    const points = new Map<string, FamilyPoint>();
    const generations = [...new Set(tree.nodes.map(node => node.row))].sort((a, b) => a - b);
    const point = (generation: number, slot: number): FamilyPoint => ({
        generation, slot,
        x: familyCard.inset + generation * (familyCard.width + familyCard.columnGap),
        y: familyCard.heading + slot * (familyCard.height + familyCard.rowGap),
    });
    for (const generation of generations) {
        const nodes = tree.nodes.filter(node => node.row === generation)
            .sort((a, b) => a.column - b.column || a.id.localeCompare(b.id));
        const occupied = new Set<number>();
        for (const node of nodes) {
            const old = previous.get(node.id);
            if (old?.generation === generation && !occupied.has(old.slot)) {
                points.set(node.id, point(generation, old.slot));
                occupied.add(old.slot);
            }
        }
        for (const node of nodes) {
            if (points.has(node.id)) continue;
            const parents = node.parentIds.map(id => points.get(id))
                .filter((value): value is FamilyPoint => !!value && value.generation < generation);
            let slot = parents.length
                ? Math.round(parents.reduce((sum, parent) => sum + parent.slot, 0) / parents.length)
                : node.column;
            while (occupied.has(slot)) slot++;
            points.set(node.id, point(generation, slot));
            occupied.add(slot);
        }
    }
    const newest = Math.max(0, ...generations);
    const lastSlot = Math.max(0, ...[...points.values()].map(value => value.slot));
    return {
        points, generations, newest,
        width: newest * (familyCard.width + familyCard.columnGap) + familyCard.width + familyCard.inset * 2,
        height: familyCard.heading + lastSlot * (familyCard.height + familyCard.rowGap) + familyCard.height + 28,
    };
}

export type FamilyLayout = ReturnType<typeof layoutFamilyTree>;
