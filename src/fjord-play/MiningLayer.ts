import { MineWinterLight } from './MineWinterLight';
import { BoxGeometry, BufferGeometry, Camera, DoubleSide, Float32BufferAttribute, Group, IcosahedronGeometry,
    Mesh, MeshStandardMaterial, Raycaster, Vector2, Vector3, type Object3D } from 'three';
import { inspectMining, type MiningSite } from '../simulation/Mining';
import type { SimulationState } from '../simulation/SimulationCore';
import type { WorldBlueprint } from '../world-generation/WorldBlueprint';
import { createBlueprintSurface } from '../world-generation/TerrainQueries';
import { StructureSeasonTint } from '../world/StructureSeasonTint';
import { MiningModelAsset, type MiningModelSource } from './MiningModelAsset';
import { miningAsset } from './MiningAssets';
import { placeMiningModel, miningForecourtHeight, type MiningPlacement } from './MiningPlacement';

type KnownSite = {site: MiningSite; developed: boolean};
/** Unknown sites have neither meshes nor pick targets; authored mine data loads only after development. */
export class MiningLayer {
    readonly root = new Group();
    private geometry = new IcosahedronGeometry(1, 0);
    private rock = new MeshStandardMaterial({color: '#55534f', roughness: 1, flatShading: true});
    private ore = new MeshStandardMaterial({color: '#8a5637', roughness: 1, flatShading: true});
    private timberGeometry = new BoxGeometry(1, 1, 1);
    private timber = new MeshStandardMaterial({color: '#695039', roughness: 1});
    private soil = new MeshStandardMaterial({color: '#77654d', roughness: 1, side: DoubleSide});
    private signature = '';
    private world?: WorldBlueprint;
    private known: KnownSite[] = [];
    private placements = new Map<string, MiningPlacement>();
    private floors: BufferGeometry[] = [];
    private tints: StructureSeasonTint[] = [];
    private template?: Object3D;
    private preparation?: Promise<void>;
    private snow = 0;
    private winter = 0;
    private winterLights: MineWinterLight[] = [];
    private disposed = false;
    constructor(private source: MiningModelSource = new MiningModelAsset(), private decorate?: (root: Object3D) => void) {}
    sync(state: SimulationState, world?: WorldBlueprint): void {
        if (this.disposed) return;
        const sites = inspectMining(state).sites;
        const signature = JSON.stringify(sites.map(site => [site.id, site.position, site.developed]));
        if (signature === this.signature && this.world === world) return;
        this.signature = signature;
        this.world = world;
        this.known = sites.map(view => ({site: state.mining!.sites.find(site => site.id === view.id)!, developed: view.developed}));
        this.rebuild();
        if (sites.some(site => site.developed) && !this.preparation) {
            this.preparation = this.source.prepare().then(template => {
                if (this.disposed || !template) return;
                this.template = template;
                this.rebuild();
            });
        }
    }
    private clearInstances(): void {
        for (const tint of this.tints) tint.dispose();
        for (const light of this.winterLights) light.dispose();
        this.winterLights = [];
        for (const geometry of this.floors) geometry.dispose();
        this.tints = []; this.floors = []; this.placements.clear(); this.root.clear();
    }
    private outcrop(): Group {
        const group = new Group(), rock = new Mesh(this.geometry, this.rock);
        rock.scale.set(2.1, 1.65, 1.5); rock.castShadow = true; rock.receiveShadow = true;
        group.add(rock);
        for (const offset of [-.7, .5]) {
            const seam = new Mesh(this.geometry, this.ore);
            seam.position.set(offset, .3, 1.1); seam.scale.set(.24, .9, .25); seam.rotation.z = -.35;
            group.add(seam);
        }
        return group;
    }
    private forecourt(placement: MiningPlacement): Mesh {
        const pad = placement.forecourt, surface = createBlueprintSurface(this.world!);
        const coordinates = [[-pad.width/2,-pad.back],[pad.width/2,-pad.back],
            [pad.width/2,pad.forward],[-pad.width/2,pad.forward]];
        const top = coordinates.map(([x,z]) => new Vector3(pad.center.x+pad.right.x*x+pad.front.x*z,
            pad.height,pad.center.z+pad.right.z*x+pad.front.z*z));
        const bottom = coordinates.map(([x,z]) => {
            const outsideX = x + Math.sign(x) * .5;
            const outsideZ = z + (z < 0 ? -.5 : .5);
            const worldX = pad.center.x + pad.right.x * outsideX + pad.front.x * outsideZ;
            const worldZ = pad.center.z + pad.right.z * outsideX + pad.front.z * outsideZ;
            return new Vector3(worldX, surface.surfaceHeightAt(worldX,worldZ) - .08, worldZ);
        });
        const positions: number[] = [];
        const triangle = (a: Vector3,b: Vector3,c: Vector3) => positions.push(...a.toArray(),...b.toArray(),...c.toArray());
        triangle(top[0],top[3],top[2]); triangle(top[0],top[2],top[1]);
        for (let i=0;i<4;i++) {
            const next=(i+1)%4;
            triangle(top[i],bottom[i],bottom[next]); triangle(top[i],bottom[next],top[next]);
        }
        const geometry = new BufferGeometry();
        geometry.setAttribute('position',new Float32BufferAttribute(positions,3));
        geometry.computeVertexNormals(); this.floors.push(geometry);
        const mesh = new Mesh(geometry,this.soil); mesh.receiveShadow=true;
        return mesh;
    }
    private rebuild(): void {
        this.clearInstances();
        for (const {site,developed} of this.known) {
            const group = new Group();
            group.userData.oreSiteId = site.id;
            group.userData.developed = developed;
            if (!developed || !this.world) {
                group.position.set(site.position.x,site.position.y+.65,site.position.z);
                const outcrop = this.outcrop();
                if (site.appearance === 'bog-iron') {
                    outcrop.scale.set(.65,.18,.65);
                    group.position.y = site.position.y + .12;
                }
                group.add(outcrop);
                group.userData.pickPoint = [site.position.x,site.position.y+1,site.position.z];
            } else {
                const placement = placeMiningModel(this.world,site);
                this.placements.set(site.id,placement);
                group.add(this.forecourt(placement));
                const model = this.template?.clone(true) ?? this.outcrop();
                model.position.set(placement.model.x,placement.model.y,placement.model.z);
                model.rotation.y=placement.model.rotation;
                group.add(model);
                if (!this.template) for (const x of [-1.2,1.2]) {
                    const post=new Mesh(this.timberGeometry,this.timber);
                    post.position.set(x,.5,1.6); post.scale.set(.2,2.4,.2); model.add(post);
                }
                const tint = new StructureSeasonTint(group); tint.setSnowAmount(this.snow); this.tints.push(tint);
                if (this.template) {
                    const light = new MineWinterLight();
                    light.setWinterWeight(this.winter);
                    model.add(light.root); this.winterLights.push(light);
                }
                group.userData.pickPoint=[site.approach.x,placement.forecourt.height+1,site.approach.z];
            }
            this.decorate?.(group);
            this.root.add(group);
        }
        this.root.updateMatrixWorld(true);
    }
    heightAt(x: number,z: number,natural: number): number {
        for (const placement of this.placements.values()) natural=miningForecourtHeight(placement,{x,z},natural);
        return natural;
    }
    clearingPlots() {
        return [...this.placements].map(([id,placement]) => ({id,...placement.clearing}));
    }
    setSnowAmount(value: number): void {
        this.snow=value;
        for (const tint of this.tints) tint.setSnowAmount(value);
    }
    setWinterWeight(value: number): void {
        this.winter = Math.max(0,Math.min(1,value));
        for (const light of this.winterLights) light.setWinterWeight(this.winter);
    }
    pick(camera: Camera,x: number,y: number,rect: DOMRect,pointerType: 'mouse'|'touch' = 'mouse'): string | undefined {
        const ray = new Raycaster();
        ray.setFromCamera(new Vector2((x-rect.left)/rect.width*2-1,-(y-rect.top)/rect.height*2+1),camera);
        let hit: Object3D | null = ray.intersectObject(this.root,true)[0]?.object ?? null;
        while (hit && hit !== this.root) {
            if (hit.userData.oreSiteId) return hit.userData.oreSiteId;
            hit=hit.parent;
        }
        if (pointerType !== 'touch') return;
        let nearest: {id: string;distance: number} | undefined;
        for (const group of this.root.children) {
            const point = new Vector3().fromArray(group.userData.pickPoint).project(camera);
            if (point.z < -1 || point.z > 1 || Math.abs(point.x)>1 || Math.abs(point.y)>1) continue;
            const distance = Math.hypot((point.x+1)*rect.width/2+rect.left-x,(-point.y+1)*rect.height/2+rect.top-y);
            if (distance<=22 && (!nearest || distance<nearest.distance)) nearest={id:group.userData.oreSiteId,distance};
        }
        return nearest?.id;
    }
    inspect() {
        return {sites:this.root.children.map(child=>child.userData.oreSiteId),trianglesPerSite:60,
            maximumTrianglesPerSite:miningAsset.triangles+38,
            winterLights:this.winterLights.filter(light => light.inspect().active).length, shadowLights:0,developedSites:this.placements.size,asset:this.source.inspect(),
            placements:[...this.placements].map(([id,placement])=>({id,...placement}))};
    }
    dispose(): void {
        if (this.disposed) return;
        this.disposed=true; this.clearInstances(); this.root.removeFromParent(); this.source.dispose();
        this.geometry.dispose(); this.rock.dispose(); this.ore.dispose(); this.timberGeometry.dispose(); this.timber.dispose(); this.soil.dispose();
    }
}
