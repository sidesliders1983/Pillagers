import {BufferGeometry, Float32BufferAttribute, Group, Mesh, MeshStandardMaterial, type Object3D} from 'three';
import {discoveryAt, inspectClanDiscovery} from '../simulation/ClanDiscovery';
import type {SimulationState} from '../simulation/SimulationCore';
import type {WorldBlueprint} from '../world-generation/WorldBlueprint';
import {createBlueprintSurface} from '../world-generation/TerrainQueries';
import {StructureSeasonTint} from '../world/StructureSeasonTint';
import {WetlandTextureAsset} from './WetlandTextureAsset';
import {WetlandModelAsset} from './WetlandModelAsset';
import {WetlandVegetation, type MarshPlant} from './WetlandVegetation';
import {seededRandom} from '../config/worldConfig';
import type {WorldLighting} from '../core/WorldLighting';

/** Connected peat beds and shallow, horizontal pools in existing low terrain; Core geography stays exact. */
export class WetLowlandLayer {
    readonly root = new Group();
    private world?: WorldBlueprint;
    private signature = '';
    private cells: number[] = [];
    private ground?: BufferGeometry;
    private waterGeometry?: BufferGeometry;
    private groundMesh?: Mesh;
    private vegetation: WetlandVegetation;
    private mud = new MeshStandardMaterial({color: '#6c614c', transparent: true, opacity: .98,
        alphaTest: .025, depthWrite: false, roughness: .85});
    private water = new MeshStandardMaterial({color: '#82958a', transparent: true, opacity: .48,
        alphaTest: .015, depthWrite: false, roughness: .22, metalness: .08});
    private texture = new WetlandTextureAsset();
    private texturePreparation?: Promise<void>;
    private tint?: StructureSeasonTint;
    private time = {value: 0};
    private snow = 0;
    private waterPatches = 0;
    private disposed = false;
    constructor(private decorate?: (root: Object3D) => void, private base = '/', source = new WetlandModelAsset(base)) {
        this.vegetation = new WetlandVegetation(source, decorate);
        this.mask(this.mud,false); this.mask(this.water,true);
    }
    private mask(material: MeshStandardMaterial, water: boolean) {
        material.onBeforeCompile = shader => {
            shader.uniforms.wetTime = this.time;
            shader.vertexShader = `attribute float wetCoverage; varying float vWetCoverage;
                ${water ? 'attribute float waterDepth; varying float vWaterDepth; varying vec2 vWetXZ;' : ''}
` + shader.vertexShader;
            shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
                vWetCoverage=wetCoverage;
                ${water ? 'vWaterDepth=waterDepth;vWetXZ=position.xz;' : ''}`);
            shader.fragmentShader = `varying float vWetCoverage;
                ${water ? 'varying float vWaterDepth;varying vec2 vWetXZ;uniform float wetTime;' : ''}
` + shader.fragmentShader;
            shader.fragmentShader = shader.fragmentShader.replace('#include <alphatest_fragment>', `
                diffuseColor.a *= smoothstep(.08,.9,vWetCoverage);
                ${water ? 'diffuseColor.a *= smoothstep(.005,.08,vWaterDepth);' : ''}
                #include <alphatest_fragment>`);
            if (water) shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_maps>', `
                #include <normal_fragment_maps>
                vec3 ripple=vec3(sin(vWetXZ.x*1.7+vWetXZ.y*.8+wetTime*.6)*.045,0.0,
                    cos(vWetXZ.y*1.4-vWetXZ.x*.7+wetTime*.45)*.035);
                normal=normalize(normal+mat3(viewMatrix)*ripple);`);
        };
        material.customProgramCacheKey = () => 'connected-bog-v2:' + (water ? 'water' : 'peat');
    }
    sync(state: SimulationState, world: WorldBlueprint): void {
        if (this.disposed) return;
        const knowledge = state.discovery && inspectClanDiscovery(state.discovery,state.clan.id), env = world.environment;
        const patches = world.oreSites?.wetLowlands?.patches ?? [];
        const point = (cell: number) => ({x: world.terrain.bounds.minX + cell % env!.columns * env!.spacing,
            z: world.terrain.bounds.minZ + Math.floor(cell / env!.columns) * env!.spacing});
        const cells = !env || !knowledge ? [] : patches.flatMap(p => p.cells).filter(cell => {
            const p = point(cell); return discoveryAt(knowledge,p.x,p.z) !== 'unknown';
        });
        const signature = cells.join(',');
        if (this.world === world && signature === this.signature) return;
        this.clear(); this.world = world; this.signature = signature; this.cells = cells;
        if (!cells.length || !env || !knowledge) return;
        const known = new Set(cells), surface = createBlueprintSurface(world), spacing = env.spacing;
        const coverage = (x: number,z: number) => {
            if (discoveryAt(knowledge,x,z) === 'unknown') return 0;
            const gx = (x-world.terrain.bounds.minX)/spacing, gz = (z-world.terrain.bounds.minZ)/spacing;
            const col = Math.floor(gx), row = Math.floor(gz), u = gx-col, v = gz-row;
            const sample = (c: number,r: number) => known.has(r*env.columns+c) ? 1 : 0;
            return sample(col,row)*(1-u)*(1-v)+sample(col+1,row)*u*(1-v)+
                sample(col,row+1)*(1-u)*v+sample(col+1,row+1)*u*v;
        };
        const bed: number[] = [], waterPositions: number[] = [], uv: number[] = [], alpha: number[] = [], depth: number[] = [];
        const grass: MarshPlant[] = [], cattails: MarshPlant[] = [];
        const divisions = Math.round(spacing/world.terrain.spacing), step = spacing/divisions;
        for (const patch of patches) {
            const visible = patch.cells.filter(cell => known.has(cell));
            if (!visible.length) continue;
            const ring = new Set<number>();
            for (const cell of visible) for (let dz=-1;dz<=1;dz++) for (let dx=-1;dx<=1;dx++) {
                const col=cell%env.columns+dx,row=Math.floor(cell/env.columns)+dz;
                if (col>0&&col<env.columns-1&&row>0&&row<env.rows-1) ring.add(row*env.columns+col);
            }
            const vertices: {x: number;z: number;y: number;alpha: number}[] = [];
            const vertex = (center: {x:number;z:number},col: number,row: number) => {
                const x=center.x+col*step-spacing/2,z=center.z+row*step-spacing/2;
                vertices.push({x,z,y:surface.surfaceHeightAt(x,z),alpha:coverage(x,z)});
            };
            for (const cell of ring) {
                const center=point(cell);
                for(let row=0;row<divisions;row++) for(let col=0;col<divisions;col++) {
                    const terrainRow=Math.round((center.z-spacing/2-world.terrain.bounds.minZ)/step)+row;
                    const terrainCol=Math.round((center.x-spacing/2-world.terrain.bounds.minX)/step)+col;
                    const a=[col,row],b=[col,row+1],c=[col+1,row],d=[col+1,row+1];
                    for(const [x,z] of (terrainRow+terrainCol)%2===0?[a,b,c,c,b,d]:[a,b,d,a,d,c]) vertex(center,x,z);
                }
            }
            const core = vertices.filter(vertex => vertex.alpha >= .7);
            const flatHeights = core
                .filter(vertex => surface.slopeAt(vertex.x, vertex.z) <= .08)
                .map(vertex => vertex.y)
                .sort((a, b) => a - b);
            if (!core.length) continue;
            // Fill the broad flat bed, rather than measuring 18 cm from its lowest edge.
            // One horizontal plane per pocket still leaves naturally raised banks dry.
            const bedLevel = flatHeights.length
                ? flatHeights[Math.floor((flatHeights.length - 1) * .75)]
                : Math.min(...core.map(vertex => vertex.y));
            const level = bedLevel + .12;
            this.waterPatches++;
            for (const cell of visible) {
                // A presentation-only stream per cell keeps revealed clumps stable and never consumes Core RNG.
                const random = seededRandom((cell ^ Math.imul(world.config.seed, 2654435761) ^ 22367) >>> 0);
                const center = point(cell), grassy = random() < .7, reedy = random() < .4;
                const plant = (height: number): MarshPlant | undefined => {
                    const x = center.x + (random() - .5) * 3.2, z = center.z + (random() - .5) * 3.2;
                    const y = surface.surfaceHeightAt(x, z), wet = coverage(x, z), depth = level - y;
                    if (wet < .3 || surface.slopeAt(x, z) > .12 || depth < -.18 || depth > .65 || y + height < level + .2) return;
                    return {x, y: y + .01, z, height, width: .85 + random() * .3, rotation: random() * Math.PI * 2};
                };
                if (grassy) for (let i = 0; i < 4; i++) {
                    const slot = plant(.9 + random() * .25);
                    if (slot && grass.length < 256) grass.push({...slot, width: slot.width * 1.65});
                }
                if (reedy) for (let i = 0; i < 2; i++) {
                    const slot = plant(1.4 + random() * .45);
                    if (slot && cattails.length < 32) cattails.push(slot);
                }
            }
            for (const p of vertices) {
                bed.push(p.x,p.y+.025,p.z); waterPositions.push(p.x,level+.028,p.z);
                // World coordinates remain continuous across every old 4 m cell boundary.
                uv.push(p.x/16,p.z/16); alpha.push(p.alpha); depth.push(level-p.y);
            }
        }
        const geometry = (positions: number[], water: boolean) => {
            const result=new BufferGeometry();
            result.setAttribute('position',new Float32BufferAttribute(positions,3));
            result.setAttribute('uv',new Float32BufferAttribute(uv,2));
            result.setAttribute('wetCoverage',new Float32BufferAttribute(alpha,1));
            if(water) result.setAttribute('waterDepth',new Float32BufferAttribute(depth,1));
            result.computeVertexNormals(); return result;
        };
        this.ground=geometry(bed,false); this.waterGeometry=geometry(waterPositions,true);
        const ground = this.groundMesh = new Mesh(this.ground, this.mud);
        ground.name = 'Wet peat bed';
        ground.receiveShadow = true;
        const water = new Mesh(this.waterGeometry, this.water);
        water.name = 'Shallow bog water';
        water.receiveShadow = true;
        water.raycast = () => {};
        // Native ground has transparent colour overlays with depth writes disabled.
        // Draw these local layers after them, regardless of camera-distance sorting.
        // Depth testing still lets real hills, buildings and actors occlude the bog.
        ground.renderOrder = 1;
        water.renderOrder = 2;
        this.root.add(ground, water);
        this.tint = new StructureSeasonTint(this.root);
        this.tint.setSnowAmount(this.snow); this.decorate?.(this.root);
        this.vegetation.sync(grass, cattails);
        this.root.add(this.vegetation.root);
        this.texturePreparation ??= this.texture.prepare(this.base).then(texture=>{
            if(!texture||this.disposed)return;
            this.mud.map=texture;this.mud.color.set('#ffffff');this.mud.needsUpdate=true;
            const material=this.groundMesh?.material as MeshStandardMaterial|undefined;
            if(material){material.map=texture;material.color.copy(this.mud.color);material.needsUpdate=true;}
        });
    }
    setTime(time: number) {this.time.value=time;this.vegetation.setTime(time);}
    setLighting(lighting: WorldLighting) {this.vegetation.setLighting(lighting);}
    setSnowAmount(amount: number) {this.snow=amount;this.tint?.setSnowAmount(amount);this.vegetation.setSnowAmount(amount);}
    inspect() {
        const plants = this.vegetation.inspect();
        return {cells:this.cells.length, reedInstances:plants.reedInstances, grassTufts:plants.grassTufts,
            waterPatches:this.waterPatches,
            triangles:((this.ground?.getAttribute('position').count??0)+(this.waterGeometry?.getAttribute('position').count??0))/3+plants.triangles,
            drawCalls:this.cells.length?2+plants.drawCalls:0,textureBytes:262144,textureResolution:256,
            cattailAsset:plants.asset,windTime:plants.windTime};
    }
    private clear() {
        this.tint?.dispose();this.tint=undefined;this.ground?.dispose();this.ground=undefined;
        this.waterGeometry?.dispose();this.waterGeometry=undefined;this.groundMesh=undefined;
        this.vegetation.clear();this.root.clear();this.cells=[];this.waterPatches=0;
    }
    dispose() {
        if(this.disposed)return;
        this.disposed=true;this.clear();this.root.removeFromParent();this.texture.dispose();
        this.vegetation.dispose();this.mud.dispose();this.water.dispose();
    }
}
