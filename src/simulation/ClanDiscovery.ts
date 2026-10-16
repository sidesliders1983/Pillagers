import { createBlueprintSurface } from '../world-generation/TerrainQueries';
import { traceTerrainSightline } from '../world-generation/SettlementVisibility';
import type { Bounds2, WorldBlueprint } from '../world-generation/WorldBlueprint';

type Landscape = Pick<WorldBlueprint, 'terrain' | 'waterLevel'>;
export interface DiscoveryPolicy {
    cellSize: number;
    settlementRadius: number;
    expeditionRadius: number;
    eyeHeight: number;
}
export const prototypeDiscoveryPolicy: Readonly<DiscoveryPolicy> = Object.freeze({
    cellSize: 8, settlementRadius: 96, expeditionRadius: 64, eyeHeight: 1.7,
});
export interface ClanObservation {
    id: string;
    kind: 'settlement' | 'landing' | 'expedition';
    x: number;
    z: number;
}
export interface DiscoveryGrid {
    bounds: Bounds2;
    columns: number;
    rows: number;
}
export interface ClanDiscovery {
    version: 1;
    worldId: string;
    policy: DiscoveryPolicy;
    grid: DiscoveryGrid;
    clans: Record<string, { explored: string; visible: string; observedAt: number }>;
}
export interface DiscoveryView {
    version: 1;
    worldId: string;
    cellSize: number;
    grid: DiscoveryGrid;
    explored: string;
    visible: string;
}
const encode = (bytes: Uint8Array) => Array.from(bytes, n => n.toString(16).padStart(2, '0')).join('');
const decode = (hex: string) => Uint8Array.from(hex.match(/../g) ?? [], n => parseInt(n, 16));
const flag = (hex: string, index: number) =>
    (parseInt(hex.slice((index >> 3) * 2, (index >> 3) * 2 + 2), 16) & (1 << (index & 7))) !== 0;

/** New physical campaigns opt in explicitly; old graph and domestic saves remain untouched. */
export function createClanDiscovery(world: Landscape, worldId: string, clanId: string,
    observations: readonly ClanObservation[], atTick: number,
    policy: DiscoveryPolicy = prototypeDiscoveryPolicy): ClanDiscovery {
    const bounds = { ...world.terrain.bounds };
    const grid = { bounds, columns: Math.ceil((bounds.maxX - bounds.minX) / policy.cellSize),
        rows: Math.ceil((bounds.maxZ - bounds.minZ) / policy.cellSize) };
    const state: ClanDiscovery = { version: 1, worldId, policy: { ...policy }, grid, clans: {} };
    return commitClanObservation(state, world, worldId, clanId, observations, atTick);
}

/** Trusted simulation seam: callers supply only CONFIRMED canonical observers, never a camera,
 * a planned route or an arbitrary player movement command. #148 owns actual group progression. */
export function commitClanObservation(input: ClanDiscovery, world: Landscape, worldId: string,
    clanId: string, observations: readonly ClanObservation[], atTick: number): ClanDiscovery {
    validateClanDiscovery(input, atTick);
    if (!clanId || clanId.length > 100 || ['__proto__', 'prototype', 'constructor'].includes(clanId) ||
        !Number.isSafeInteger(atTick) || atTick < 800000 || observations.length > 64)
        throw new Error('Invalid discovery observation.');
    const state = structuredClone(input), { grid, policy } = state;
    assertDiscoveryWorld(state, world, worldId);
    const count = grid.columns * grid.rows, length = Math.ceil(count / 8);
    const explored = state.clans[clanId] ? decode(state.clans[clanId].explored) : new Uint8Array(length);
    const visible = new Uint8Array(length);
    const surface = createBlueprintSurface(world), bounds = grid.bounds;
    for (const observer of observations) {
        if (!observer.id || !['settlement', 'landing', 'expedition'].includes(observer.kind) ||
            !Number.isFinite(observer.x) || !Number.isFinite(observer.z) ||
            observer.x < bounds.minX || observer.x >= bounds.maxX ||
            observer.z < bounds.minZ || observer.z >= bounds.maxZ)
            throw new Error('Invalid discovery observer.');
        const radius = observer.kind === 'expedition' ? policy.expeditionRadius : policy.settlementRadius;
        const from = { x: observer.x, z: observer.z,
            y: Math.max(world.waterLevel, surface.surfaceHeightAt(observer.x, observer.z)) + policy.eyeHeight };
        const minCol = Math.max(0, Math.floor((observer.x - radius - bounds.minX) / policy.cellSize));
        const maxCol = Math.min(grid.columns - 1, Math.floor((observer.x + radius - bounds.minX) / policy.cellSize));
        const minRow = Math.max(0, Math.floor((observer.z - radius - bounds.minZ) / policy.cellSize));
        const maxRow = Math.min(grid.rows - 1, Math.floor((observer.z + radius - bounds.minZ) / policy.cellSize));
        for (let row = minRow; row <= maxRow; row++) {
            for (let col = minCol; col <= maxCol; col++) {
                const x = Math.min(bounds.maxX, bounds.minX + (col + .5) * policy.cellSize);
                const z = Math.min(bounds.maxZ, bounds.minZ + (row + .5) * policy.cellSize);
                if (Math.hypot(x - from.x, z - from.z) > radius) continue;
                const to = { x, z, y: Math.max(world.waterLevel, surface.surfaceHeightAt(x, z)) + .05 };
                if (!traceTerrainSightline(world, from, to).visible) continue;
                const index = row * grid.columns + col;
                visible[index >> 3] |= 1 << (index & 7);
            }
        }
    }
    for (let i = 0; i < length; i++) explored[i] |= visible[i];
    state.clans[clanId] = { explored: encode(explored), visible: encode(visible), observedAt: atTick };
    validateClanDiscovery(state, atTick);
    return state;
}

/** A player's read model contains only that clan's compact knowledge, never other observers/intel. */
export function inspectClanDiscovery(state: ClanDiscovery, clanId: string): DiscoveryView {
    const empty = '00'.repeat(Math.ceil(state.grid.columns * state.grid.rows / 8));
    return Object.freeze({ version: 1, worldId: state.worldId, cellSize: state.policy.cellSize,
        grid: Object.freeze({ ...state.grid, bounds: Object.freeze({ ...state.grid.bounds }) }),
        explored: state.clans[clanId]?.explored ?? empty, visible: state.clans[clanId]?.visible ?? empty });
}
export function discoveryAt(view: DiscoveryView, x: number, z: number): 'unknown' | 'mapped' | 'visible' {
    const { bounds, columns, rows } = view.grid;
    if (!Number.isFinite(x) || !Number.isFinite(z) || x < bounds.minX || x >= bounds.maxX ||
        z < bounds.minZ || z >= bounds.maxZ) return 'unknown';
    const col = Math.floor((x - bounds.minX) / view.cellSize);
    const row = Math.floor((z - bounds.minZ) / view.cellSize);
    if (col >= columns || row >= rows) return 'unknown';
    const index = row * columns + col;
    if (flag(view.visible, index)) return 'visible';
    return flag(view.explored, index) ? 'mapped' : 'unknown';
}

/** Saved compact masks are canonical; loading never silently replaces invalid knowledge. */
export function validateClanDiscovery(state: ClanDiscovery, now = Number.MAX_SAFE_INTEGER): void {
    const fail = () => { throw new Error('Invalid physical discovery state.'); };
    const finite = (n: number) => Number.isFinite(n) && Math.abs(n) <= 100000;
    if (!state || state.version !== 1 || typeof state.worldId !== 'string' ||
        !state.worldId.length || state.worldId.length > 256 || !state.policy || !state.grid ||
        !state.clans || Array.isArray(state.clans)) fail();
    const { grid, policy } = state;
    const b = grid.bounds;
    if (!b || ![b.minX, b.maxX, b.minZ, b.maxZ].every(finite) ||
        b.maxX <= b.minX || b.maxZ <= b.minZ || b.maxX - b.minX > 8192 || b.maxZ - b.minZ > 8192 ||
        !Number.isInteger(policy.cellSize) || policy.cellSize < 4 || policy.cellSize > 32 ||
        ![policy.settlementRadius, policy.expeditionRadius].every(n => Number.isFinite(n) && n > 0 && n <= 512) ||
        !Number.isFinite(policy.eyeHeight) || policy.eyeHeight < .5 || policy.eyeHeight > 10 ||
        grid.columns !== Math.ceil((b.maxX - b.minX) / policy.cellSize) ||
        grid.rows !== Math.ceil((b.maxZ - b.minZ) / policy.cellSize) ||
        grid.columns * grid.rows > 65536 || Object.keys(state.clans).length > 16) fail();
    const count = grid.columns * grid.rows, bytes = Math.ceil(count / 8);
    for (const [id, clan] of Object.entries(state.clans)) {
        if (!id || id.length > 100 || ['__proto__', 'prototype', 'constructor'].includes(id) ||
            !clan || !Number.isSafeInteger(clan.observedAt) || clan.observedAt < 800000 || clan.observedAt > now ||
            ![clan.explored, clan.visible].every(hex => typeof hex === 'string' &&
                hex.length === bytes * 2 && /^[0-9a-f]+$/.test(hex))) fail();
        const explored = decode(clan.explored), visible = decode(clan.visible);
        for (let i = 0; i < bytes; i++) if (visible[i] & ~explored[i]) fail();
        if (count % 8 && ((explored.at(-1)! | visible.at(-1)!) >> (count % 8))) fail();
    }
}

export interface DiscoveryEntity {
    id: string;
    clanId: string;
    kind: string;
    label: string;
    x: number;
    y: number;
    z: number;
}
/** Live foreign details require current observation. Historical intelligence is a separate contract.
 * Explicit field selection prevents a canonical object's inventory/DNA from leaking by spreading it. */
export function projectDiscoveryEntities(view: DiscoveryView, playerClan: string,
    entities: readonly DiscoveryEntity[]): ReadonlyArray<Readonly<DiscoveryEntity>> {
    return Object.freeze(entities.filter(entity => entity.clanId === playerClan ||
        discoveryAt(view, entity.x, entity.z) === 'visible').map(entity => Object.freeze({
            id: entity.id, clanId: entity.clanId, kind: entity.kind, label: entity.label,
            x: entity.x, y: entity.y, z: entity.z,
        })));
}


export function assertDiscoveryWorld(state: ClanDiscovery, world: Landscape, worldId: string): void {
    const keys = ['minX', 'maxX', 'minZ', 'maxZ'] as const;
    if (state.worldId !== worldId || keys.some(key => state.grid.bounds[key] !== world.terrain.bounds[key]))
        throw new Error('Discovery belongs to a different physical world.');
}
