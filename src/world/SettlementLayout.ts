// Shared by terrain, scenery and navigation: footprints stay in sync with the composition.
export const buildings = [
    { key: 'greatHall', x: -.8, z: 11.2, rotation: Math.PI + .15, halfWidth: 3.1, halfDepth: 4.3, radius: 5.5 },
    { key: 'hut', x: -10.8, z: 2.6, rotation: .56, halfWidth: 2, halfDepth: 2.4, radius: 3.5 },
    { key: 'storehouse', x: 10.7, z: 8.6, rotation: -.58, halfWidth: 1.9, halfDepth: 2.8, radius: 3.6 },
] as const;
export const hearth = { x: .5, z: .1, r: 1.5 }, well = { x: 7.2, z: -3.8, r: 1.4 };
export const obstacles = [...buildings.map(b => ({ x: b.x, z: b.z, r: b.radius })), hearth, well];
type Point = readonly [
    number,
    number
];
const routes: {
    points: readonly [
        Point,
        Point,
        Point
    ];
    width: number;
}[] = [
    { points: [[-4.8, -10], [-4, -4], [-1.2, -1.6]], width: .85 }, { points: [[-1.2, -1.6], [4, 1.5], [.3, 6.4]], width: 1.05 },
    { points: [[-1.2, -1.6], [-5.5, -.3], [-8.2, 3.7]], width: .8 }, { points: [[2.6, 1.3], [7, 2.5], [9.3, 5.5]], width: .75 },
    { points: [[2.6, -1.2], [4, -4.8], [6, -4.2]], width: .65 }
];
const segments = routes.flatMap(({ points: [a, b, c], width }) => { const samples: {
    a: Point;
    b: Point;
    width: number;
}[] = []; let previous: Point = a; for (let i = 1; i <= 16; i++) {
    const t = i / 16, s = 1 - t;
    const next: Point = [s * s * a[0] + 2 * s * t * b[0] + t * t * c[0], s * s * a[1] + 2 * s * t * b[1] + t * t * c[1]];
    samples.push({ a: previous, b: next, width });
    previous = next;
} return samples; });
export function pathWeight(x: number, z: number) { let weight = 0; for (const { a, b, width } of segments) {
    const dx = b[0] - a[0], dz = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz)));
    const d = Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t);
    weight = Math.max(weight, Math.exp(-d * d / (width * width)));
} return weight; }
export function buildingDistance(x: number, z: number, b: typeof buildings[number]) { const dx = x - b.x, dz = z - b.z, c = Math.cos(b.rotation), s = Math.sin(b.rotation); return Math.max(Math.abs(dx * c - dz * s) - b.halfWidth, Math.abs(dx * s + dz * c) - b.halfDepth); }
