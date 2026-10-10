import { Box3, Vector3 } from 'three';
import type { AssetManager, AssetKey } from '../core/AssetManager';
import type { WorldBlueprint } from '../world-generation/WorldBlueprint';
import { createBlueprintSurface } from './BlueprintTerrain';
import { buildingDistance, pathWeight, settlementBounds } from './SettlementLayout';
import { fitsBuildingFoundation, tentBuildingPlot, overlapsBuildingPlot } from './BuildingPlot';
import { surfaceHeightAt } from './Terrain';
import type { World } from './World';

export interface WorldAttachment {
    id: string;
    key: AssetKey;
    x: number;
    y: number;
    z: number;
    rotation: number;
    scale: number;
    halfWidth: number;
    halfDepth: number;
    support: 'ground' | 'marine' | 'coast';
}

// Measured bounds of the initial 2.6m preview, retained only to validate v2 saves
// before migrating only the tent to a reserved building plot.
export const initialTentFootprint = {
    halfWidth: 1.6281861900759753,
    halfDepth: 2.2875729735965815,
};

// Original production scenery, including all four authored coastal cliffs.
const groundProps = [
    ['storehouse',32,24,-Math.PI/2], ['hearth',.5,3,0], ['well',7.2,-3.8,.2],
    ['logs',-10,18,.7], ['crate',-10,16,.22], ['barrel',-8.5,.4,-.3],
    ['barrel',32,18,.45], ['barrel',34,19,.1], ['crate',30,19,-.22],
    ['crate',2.9,15.3,.18], ['logs',4.5,15.8,-.35], ['fish',-8.8,-6.7,.25],
    ['barrel',-10.9,-6.2,0], ['rune',17.5,16.5,-.4],
] as const;

/** Actual loaded source bounds, rather than guessed radii, govern production attachments. */
export function planWorldAttachments(assets: AssetManager, world: WorldBlueprint, includeTent = true,
    previousTentFootprint?: Pick<WorldAttachment, 'halfWidth' | 'halfDepth'>,
    reserveHousePlot = true): WorldAttachment[] {
    const surface = createBlueprintSurface(world);
    const attachments: WorldAttachment[] = [];
    const center = world.settlement.center;
    const plotBounds = includeTent && reserveHousePlot ? tentBuildingPlot(assets,0,0) : undefined;
    const measure = (key: AssetKey, rotation: number, scale: number) => {
        const model = assets.get(key);
        model.rotation.y = rotation;
        model.scale.setScalar(scale);
        model.updateMatrixWorld(true);
        const size = new Box3().setFromObject(model).getSize(new Vector3());
        if (!Number.isFinite(size.x + size.y + size.z) || size.length() === 0)
            throw new Error('Invalid required scenery bounds: ' + key);
        // World-aligned extents contain the actual rotated mesh, including overhangs.
        return { halfWidth: size.x / 2, halfDepth: size.z / 2 };
    };
    const buildingBounds = plotBounds ? world.settlement.buildings.map(building => {
        const bounds = new Box3();
        for (const key of [building.key,building.terrainKey].filter(Boolean)) {
            const model = assets.get(key as AssetKey);
            model.rotation.y = building.rotation;
            model.position.set(building.x,0,building.z);
            bounds.union(new Box3().setFromObject(model));
        }
        return bounds;
    }) : [];
    const distance = (x: number,z: number,p: WorldAttachment) =>
        Math.max(Math.abs(x-p.x)-p.halfWidth, Math.abs(z-p.z)-p.halfDepth);
    const fit = (p: WorldAttachment, housePlot = false) => {
        if (housePlot) {
            const plot = { ...p,futureAsset: 'hut' as const };
            if (buildingBounds.some(bounds => overlapsBuildingPlot(bounds,plot,.65))) return false;
            if (attachments.some(a => Math.abs(a.x-p.x) < a.halfWidth+p.halfWidth+.65 &&
                Math.abs(a.z-p.z) < a.halfDepth+p.halfDepth+.65)) return false;
        } else {
            const radius = Math.hypot(p.halfWidth,p.halfDepth);
            if (world.settlement.buildings.some(b => buildingDistance(p.x,p.z,b) < radius + .65)) return false;
            if (attachments.some(a => distance(p.x,p.z,a) < radius + .65)) return false;
        }
        if (world.settlement.accessPaths.some(route => route.some(q =>
            distance(q.x,q.z,p) < .8))) return false;
        if (world.placementPlan.some(q => !q.assetId.includes('grass') &&
            distance(q.x,q.z,p) < q.clearance + .25)) return false;
        return fitsBuildingFoundation(surface,p);
    };
    const placeGround = (key: AssetKey, dx: number, dz: number, rotation: number) => {
        const bounds = key === 'tent' && previousTentFootprint ?
            previousTentFootprint : measure(key,rotation,1);
        const preferred = { x: center.x+dx,z: center.z+dz };
        const candidates: { x: number; z: number }[] = [];
        for (let z = Math.ceil(world.settlement.bounds.minZ); z < world.settlement.bounds.maxZ; z++)
            for (let x = Math.ceil(world.settlement.bounds.minX); x < world.settlement.bounds.maxX; x++)
                candidates.push({ x,z });
        candidates.sort((a,b) => Math.hypot(a.x-preferred.x,a.z-preferred.z) -
            Math.hypot(b.x-preferred.x,b.z-preferred.z));
        const placed = candidates.map(point => ({ id: key+'-'+attachments.length, key,
            ...point, y: surface.surfaceHeightAt(point.x,point.z), rotation, scale: 1,
            ...bounds, support: 'ground' as const })).find(candidate => {
                if (key !== 'tent' || !plotBounds) return fit(candidate);
                const plot = { ...candidate,halfWidth: plotBounds.halfWidth,
                    halfDepth: plotBounds.halfDepth };
                const { minX,maxX,minZ,maxZ } = world.settlement.bounds;
                return plot.x-plot.halfWidth >= minX && plot.x+plot.halfWidth <= maxX &&
                    plot.z-plot.halfDepth >= minZ && plot.z+plot.halfDepth <= maxZ && fit(plot,true);
            });
        if (!placed) throw new Error('No safe production attachment location: ' + key);
        attachments.push(placed);
    };
    for (const [key,dx,dz,rotation] of groundProps) placeGround(key,dx,dz,rotation);
    const harbor = world.settlement.harbor;
    if (!harbor) throw new Error('Generated world has no validated harbor.');
    const coast = world.coast.map(segment => ({ x: (segment.a.x+segment.b.x)/2,
        z: (segment.a.z+segment.b.z)/2 })).sort((a,b) =>
        Math.hypot(a.x-harbor.x,a.z-harbor.z)-Math.hypot(b.x-harbor.x,b.z-harbor.z));
    const shore = coast[0];
    const direction = new Vector3(shore.x-harbor.x,0,shore.z-harbor.z).normalize();
    const rotation = Math.atan2(direction.x,direction.z);
    const pierBounds = measure('jetty',rotation,1);
    const landing = coast.find(point => {
        if (Math.hypot(point.x-shore.x,point.z-shore.z) > 16) return false;
        const box = { ...point,...pierBounds } as WorldAttachment;
        const x = point.x+direction.x*1.5,z = point.z+direction.z*1.5;
        box.x=x;box.z=z;
        return world.settlement.accessPaths.every(route => route.every(q =>
            attachmentClearance(q.x,q.z,box) >= .65)) &&
            attachments.every(a => attachmentClearance(x,z,a) > Math.hypot(pierBounds.halfWidth,pierBounds.halfDepth)+.65);
    });
    if (!landing) throw new Error('No source pier landing preserves the harbor approach.');
    for (const key of ['jetty','boat'] as const) {
        const bounds = measure(key,rotation,1);
        const offset = key === 'boat' ? 6 : 1.5;
        attachments.push({ id: key, key, x: landing.x+direction.x*offset,
            z: landing.z+direction.z*offset, y: world.waterLevel+(key === 'boat' ? .15 : -.25),
            rotation, scale: 1, ...bounds, support: 'marine' });
    }
    for (const [index,scale] of [1.15,.85,.95,.65].entries()) {
        const rotation = [.4,1.2,2.1,.7][index];
        const bounds = measure('cliff',rotation,scale);
        const radius = Math.hypot(bounds.halfWidth,bounds.halfDepth);
        const point = coast.find(p => Math.hypot(p.x-harbor.x,p.z-harbor.z) > 14 &&
            world.settlement.buildings.every(b => buildingDistance(p.x,p.z,b) > radius+1) &&
            world.settlement.accessPaths.every(route => route.every(q =>
                Math.hypot(q.x-p.x,q.z-p.z) > radius+1)) &&
            attachments.every(a => distance(p.x,p.z,a) > radius+1));
        if (!point) throw new Error('No safe authored cliff location.');
        attachments.push({ id: 'cliff-'+index,key: 'cliff',...point,
            y: surface.surfaceHeightAt(point.x,point.z)-.15,rotation,scale,...bounds,support: 'coast' });
    }
    // Append after the locked v1 plan: existing source placements and IDs stay reproducible.
    if (includeTent) placeGround('tent',9,17,Math.PI);
    return attachments;
}

export function attachmentClearance(x: number,z: number,p: WorldAttachment) {
    return Math.max(Math.abs(x-p.x)-p.halfWidth,Math.abs(z-p.z)-p.halfDepth);
}

/** Reserve a house-sized gap in the authored Reference village without moving existing props. */
export function planReferenceTent(assets: AssetManager, classic: World): WorldAttachment {
    const model = assets.get('tent');
    model.rotation.y = Math.PI;
    model.updateMatrixWorld(true);
    const size = new Box3().setFromObject(model).getSize(new Vector3());
    const plotBounds = tentBuildingPlot(assets,0,0);
    const housing = classic.root.getObjectByName('Generated housing')!;
    const existing = [...housing.children,...classic.root.children.filter(child =>
        child.type === 'Group' && !['Generated housing','Scenery','Settlement paths'].includes(child.name))]
        .map(child => new Box3().setFromObject(child));
    const candidates: { x: number; z: number }[] = [];
    for (let z = settlementBounds.minZ+plotBounds.halfDepth; z <= settlementBounds.maxZ-plotBounds.halfDepth; z++)
        for (let x = settlementBounds.minX+plotBounds.halfWidth; x <= settlementBounds.maxX-plotBounds.halfWidth; x++)
            candidates.push({ x,z });
    candidates.sort((a,b) => Math.hypot(a.x-9,a.z-17)-Math.hypot(b.x-9,b.z-17));
    const point = candidates.find(candidate => {
        const plot = { ...plotBounds,...candidate };
        if (existing.some(bounds => overlapsBuildingPlot(bounds,plot,.65))) return false;
        const heights: number[] = [];
        for (let dx = -plot.halfWidth; dx <= plot.halfWidth; dx += .5)
            for (let dz = -plot.halfDepth; dz <= plot.halfDepth; dz += .5) {
                const x = plot.x+dx,z = plot.z+dz;
                if (pathWeight(x,z) >= .08 || surfaceHeightAt(x,z) <= .25) return false;
                heights.push(surfaceHeightAt(x,z));
            }
        return Math.max(...heights)-Math.min(...heights) < .3;
    });
    if (!point) throw new Error('No safe Reference tent building plot.');
    return { id: 'tent',key: 'tent',...point,y: surfaceHeightAt(point.x,point.z),
        rotation: Math.PI,scale: 1,halfWidth: size.x/2,halfDepth: size.z/2,support: 'ground' };
}
