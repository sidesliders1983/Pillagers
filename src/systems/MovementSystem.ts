import { passConversation, passNeighbours } from './ResidentPassing';
import { SocialEncounters, residentMovementConfig, turnToward } from './SocialEncounters';
export { residentMovementConfig } from './SocialEncounters';
import { Villager } from '../entities/Villager';
import { heightAt } from '../world/Terrain';
import { obstacles, settlementBounds } from '../world/SettlementLayout';
import { seededRandom } from '../config/worldConfig';
export function walkable(x: number, z: number) { return x > settlementBounds.minX && x < settlementBounds.maxX && z > settlementBounds.minZ && z < settlementBounds.maxZ && heightAt(x,z)>0 && obstacles.every(o => (x - o.x) ** 2 + (z - o.z) ** 2 > (o.r + .4) ** 2); }
export function randomWalkablePosition(random:()=>number){
    for(let i=0;i<100;i++){const x=settlementBounds.minX+1+random()*(settlementBounds.maxX-settlementBounds.minX-2),z=settlementBounds.minZ+1+random()*(settlementBounds.maxZ-settlementBounds.minZ-2);if(walkable(x,z))return {x,z};}
    for(let x=settlementBounds.minX+1;x<settlementBounds.maxX;x++)for(let z=settlementBounds.minZ+1;z<settlementBounds.maxZ;z++)if(walkable(x,z))return {x,z};
    throw new Error('Fjordside has no safe spawn location.');
}
type Encounter={a:Villager;b:Villager;endsAt:number};
export interface MovementTerrain {
    walkable(x: number, z: number): boolean;
    heightAt(x: number, z: number): number;
    randomPosition(random: () => number): { x: number; z: number };
}
export class MovementSystem {
    private random=seededRandom(724);
    private social: SocialEncounters;
    private detours=new Map<Villager,{x:number;z:number}[]>();
    private placed=new Set<Villager>();
    private get encounters(): Encounter[] {
        return this.social.activePairs().map(pair => ({
            a: this.villagers.find(unit => String(unit.id) === pair.a)!,
            b: this.villagers.find(unit => String(unit.id) === pair.b)!, endsAt: pair.endsAt,
        }));
    }
    private actor(unit: Villager) {
        return { key: String(unit.id), x: unit.visual.position.x, z: unit.visual.position.z,
            radius: this.config.radius, velocity: this.intent(unit),
            enabled: unit.socialEnabled, busy: unit.busy };
    }
    private applyEncounters() {
        for (const unit of this.villagers) {
            const state = this.social.inspect(String(unit.id));
            unit.interactionState = state.state;
            unit.partnerId = state.partnerKey === null ? null : Number(state.partnerKey);
            unit.socialCooldownUntil = state.cooldownUntil;
        }
    }
    constructor(readonly villagers:Villager[],readonly config={...residentMovementConfig}, readonly terrain:MovementTerrain={walkable,heightAt,randomPosition:randomWalkablePosition}){this.social=new SocialEncounters(config);for(const unit of villagers)this.spawn(unit);}
    private distance(a:Villager,b:Villager){return Math.hypot(a.visual.position.x-b.visual.position.x,a.visual.position.z-b.visual.position.z);}
    spawn(unit:Villager){
        // A replaced persona must release its partner rather than leave a stale pair lock.
        this.social.remove(String(unit.id));
        this.applyEncounters();
        for(const old of this.placed)if(old.id===unit.id)this.placed.delete(old);
        let found=false;
        for(let attempt=0;attempt<1000;attempt++){const p=this.terrain.randomPosition(this.random);if([...this.placed].every(other=>Math.hypot(p.x-other.visual.position.x,p.z-other.visual.position.z)>=2*this.config.radius)){unit.visual.position.set(p.x,this.terrain.heightAt(p.x,p.z),p.z);found=true;break;}}
        if(!found)throw new Error('No unoccupied resident spawn location.');
        this.detours.delete(unit);this.placed.add(unit);unit.interactionState='none';unit.partnerId=null;unit.wait=0;unit.speed=0;this.choose(unit);
    }
    private choose(unit:Villager){Object.assign(unit.target,this.terrain.randomPosition(this.random));}
    private intent(unit: Villager) {
        const position = unit.visual.position;
        const goal = this.detours.get(unit)?.[0] ?? unit.target;
        const dx = goal.x - position.x, dz = goal.z - position.z;
        const distance = Math.hypot(dx, dz);
        return distance > .15 && unit.wait <= 0 ?
            { x: dx / distance * this.config.speed, z: dz / distance * this.config.speed } :
            { x: 0, z: 0 };
    }
    private face(unit: Villager, angle: number, dt: number) {
        unit.visual.rotation.y = turnToward(unit.visual.rotation.y, angle, dt, this.config.turnSpeed);
    }
    private eligible(unit: Villager) { return this.social.eligible(this.actor(unit)); }
    private clearStep(unit:Villager,x:number,z:number){
        if(!this.terrain.walkable(x,z))return false;const p=unit.visual.position,dx=x-p.x,dz=z-p.z,length2=dx*dx+dz*dz;
        return this.villagers.every(other=>{if(other===unit)return true;const q=other.visual.position,t=length2?Math.max(0,Math.min(1,((q.x-p.x)*dx+(q.z-p.z)*dz)/length2)):0;return Math.hypot(p.x+dx*t-q.x,p.z+dz*t-q.z)>=2*this.config.radius-1e-7;});
    }
    private avoidConversation(unit: Villager) {
        if (this.detours.has(unit)) return;
        const points = passConversation(unit.visual.position, unit.target,
            this.encounters.map(pair => ({ a: pair.a.visual.position, b: pair.b.visual.position })),
            this.config, route => route.every(point => this.terrain.walkable(point.x, point.z)));
        if (points) this.detours.set(unit, points);
    }
    private clearTerrainRoute(start: { x: number; z: number }, points: { x: number; z: number }[]) {
        for (const end of points) {
            const length = Math.hypot(end.x - start.x, end.z - start.z);
            const samples = Math.max(1, Math.ceil(length / .1));
            for (let sample = 1; sample <= samples; sample++) {
                const fraction = sample / samples;
                if (!this.terrain.walkable(start.x + (end.x - start.x) * fraction,
                    start.z + (end.z - start.z) * fraction)) return false;
            }
            start = end;
        }
        return true;
    }
    private avoidNeighbours(unit: Villager) {
        if (this.detours.has(unit)) return;
        const points = passNeighbours(unit.visual.position, unit.target,
            this.villagers.filter(other => other !== unit).map(other => ({
                x: other.visual.position.x, z: other.visual.position.z, radius: this.config.radius,
                encounterEligible: this.eligible(unit) && this.eligible(other) &&
                    !this.social.blocked(String(unit.id), String(other.id)),
            })), this.config, route => this.clearTerrainRoute(unit.visual.position, route),
            point => this.clearStep(unit, point.x, point.z));
        if (points) this.detours.set(unit, points);
    }
    private avoidTerrain(unit: Villager) {
        if (this.detours.has(unit)) return;
        const position = unit.visual.position;
        const dx = unit.target.x - position.x, dz = unit.target.z - position.z;
        const distance = Math.hypot(dx, dz);
        const length = Math.min(distance, this.config.speed * this.config.predictionSeconds);
        if (length < .15) return;
        const angle = Math.atan2(dx, dz);
        const endpoint = (heading: number) => ({
            x: position.x + Math.sin(heading) * length,
            z: position.z + Math.cos(heading) * length,
        });
        if (this.clearTerrainRoute(position, [endpoint(angle)])) return;
        // Small turns win when a forward corridor is available; retain the waypoint
        // long enough to finish the turn instead of changing steering every frame.
        for (let turn = 1; turn <= 8; turn++) {
            for (const side of [1, -1]) {
                const exit = endpoint(angle + side * turn * Math.PI / 8);
                if (this.clearTerrainRoute(position, [exit]) &&
                    this.clearStep(unit, exit.x, exit.z)) {
                    this.detours.set(unit, [exit]);
                    return;
                }
            }
        }
    }
    update(dt:number){
        if(!Number.isFinite(dt)||dt<0)throw new Error('Invalid movement timestep');if(dt===0)return;
        // Bound steps for continuous personal-space checks and stable steering.
        if(dt>.05){let remaining=dt;while(remaining>1e-8){const step=Math.min(.05,remaining);this.update(step);remaining-=step;}return;}
        for (const unit of this.villagers) unit.speed = 0;
        this.social.advance(dt, this.villagers.map(unit => this.actor(unit)));
        this.applyEncounters();
        for(const e of this.encounters){const dx=e.b.visual.position.x-e.a.visual.position.x,dz=e.b.visual.position.z-e.a.visual.position.z;this.face(e.a,Math.atan2(dx,dz),dt);this.face(e.b,Math.atan2(-dx,-dz),dt);}
        for(const unit of this.villagers){
            if(unit.partnerId!==null)continue;
            this.avoidConversation(unit);
            this.avoidNeighbours(unit);
            this.avoidTerrain(unit);
            const p=unit.visual.position,points=this.detours.get(unit);
            if(points&&Math.hypot(points[0].x-p.x,points[0].z-p.z)<.15){points.shift();if(!points.length)this.detours.delete(unit);}
            const goal=this.detours.get(unit)?.[0]??unit.target,dx=goal.x-p.x,dz=goal.z-p.z,distance=Math.hypot(dx,dz);
            if(distance<.15){if(unit.wait===0)unit.wait=1+this.random()*3;unit.wait-=dt;if(unit.wait<=0){this.choose(unit);unit.wait=0;}continue;}
            const step=Math.min(distance,this.config.speed*dt),angle=Math.atan2(dx,dz);
            let moved=false;
            // Prefer the route direction; turn consistently around neighbours instead of flipping sides.
            for(const offset of [0,Math.PI/4,Math.PI/2,3*Math.PI/4,-Math.PI/4,-Math.PI/2,-3*Math.PI/4]){
                const x=p.x+Math.sin(angle+offset)*step,z=p.z+Math.cos(angle+offset)*step;
                if(!this.clearStep(unit,x,z))continue;
                const heading=angle+offset;this.face(unit,heading,dt);
                const alignment=Math.cos(heading-unit.visual.rotation.y);
                // Turn in place before locomotion; translation must never run against the facing direction.
                moved=true;if(alignment<this.config.walkAlignment)break;
                const advance=step*alignment,nx=p.x+Math.sin(heading)*advance,nz=p.z+Math.cos(heading)*advance;
                // Alignment shortens the proposed step. Its actual endpoint needs the same clearance test.
                if(!this.clearStep(unit,nx,nz)){moved=false;continue;}
                p.set(nx,this.terrain.heightAt(nx,nz),nz);unit.phase+=dt*5;unit.speed=advance/dt;break;
            }
            // Only static terrain can change a route; neighbours never replace its destination.
            if(!moved&&!this.detours.has(unit)&&!this.terrain.walkable(p.x+dx/distance*step,p.z+dz/distance*step))this.choose(unit);
        }
    }
    navigationProbes() {
        const length = this.config.speed * this.config.predictionSeconds;
        return this.villagers.filter(unit => unit.partnerId === null && unit.wait <= 0).map(unit => {
            const position = unit.visual.position;
            const end = { x: position.x + Math.sin(unit.visual.rotation.y) * length,
                z: position.z + Math.cos(unit.visual.rotation.y) * length };
            const elevated = (point: { x: number; z: number }) => ({ ...point,
                y: this.terrain.heightAt(point.x, point.z) + .06 });
            return { id: unit.id, start: elevated(position), end: elevated(end),
                clear: this.clearTerrainRoute(position, [end]) && this.clearStep(unit, end.x, end.z),
                route: (this.detours.get(unit) ?? []).map(elevated) };
        });
    }
    snapshot(){return this.villagers.map(unit=>({id:unit.id,radius:this.config.radius,state:unit.interactionState,detouring:this.detours.has(unit),partnerId:unit.partnerId,cooldown:this.social.inspect(String(unit.id)).cooldown}));}
}
