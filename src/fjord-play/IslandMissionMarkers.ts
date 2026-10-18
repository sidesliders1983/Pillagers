import { Camera, Group, Mesh, MeshBasicMaterial, RingGeometry, DoubleSide, Vector2, Vector3 } from 'three';
import { inspectIslandMissions } from '../simulation/IslandMissions';
import type { SimulationState } from '../simulation/SimulationCore';
import type { PhysicalExpeditionContext } from '../simulation/SpatialExpeditions';
import { createBlueprintSurface } from '../world-generation/TerrainQueries';

/** Only saved eyewitness markers enter this overlay; canonical rival state is never read. */
export class IslandMissionMarkers {
    readonly root = new Group();
    private geometry = new RingGeometry(3.8, 4.3, 32);
    private material = new MeshBasicMaterial({ color: '#ffe09a', side: DoubleSide,
        depthTest: false, depthWrite: false, transparent: true, opacity: .95 });
    private signature = '';
    sync(state: SimulationState, world: PhysicalExpeditionContext['world']) {
        const sites = inspectIslandMissions(state).sites;
        const signature = JSON.stringify(sites.map(site => [site.id, site.position]));
        if (signature === this.signature) return;
        this.signature = signature;
        this.root.clear();
        const surface = createBlueprintSurface(world);
        for (const site of sites) {
            const ring = new Mesh(this.geometry, this.material);
            ring.rotation.x = -Math.PI / 2;
            ring.position.set(site.position.x, surface.surfaceHeightAt(site.position.x, site.position.z) + .7, site.position.z);
            ring.renderOrder = 1001;
            ring.userData.siteId = site.id;
            this.root.add(ring);
        }
    }
    pick(camera: Camera, x: number, y: number, rect: DOMRect) {
        camera.updateMatrixWorld(true);
        const pointer = new Vector2(x, y);
        let best: { id: string; distance: number } | undefined;
        for (const ring of this.root.children) {
            const point = new Vector3().copy(ring.position).project(camera);
            if (point.z < -1 || point.z > 1) continue;
            const center = new Vector2(rect.left + (point.x + 1) * rect.width / 2,
                rect.top + (1 - point.y) * rect.height / 2);
            const distance = center.distanceTo(pointer);
            if (distance <= 24 && (!best || distance < best.distance)) best = { id: ring.userData.siteId, distance };
        }
        return best?.id;
    }
    dispose() { this.root.clear(); this.geometry.dispose(); this.material.dispose(); }
}
