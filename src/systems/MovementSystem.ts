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
export const residentMovementConfig={radius:.48,speed:.65,conversationDistance:1.35,conversationSeconds:5,cooldownSeconds:3,separationDistance:1.8,predictionSeconds:1.5,turnSpeed:4,walkAlignment:.85};
type Encounter={a:Villager;b:Villager;endsAt:number};
export interface MovementTerrain {
    walkable(x: number, z: number): boolean;
    heightAt(x: number, z: number): number;
    randomPosition(random: () => number): { x: number; z: number };
}
export class MovementSystem {
    private random=seededRandom(724);private time=0;
    private detours=new Map<Villager,{x:number;z:number}[]>();
    private placed=new Set<Villager>();private encounters:Encounter[]=[];
    private released=new Map<string,{a:Villager;b:Villager;until:number}>();
    constructor(readonly villagers:Villager[],readonly config={...residentMovementConfig}, readonly terrain:MovementTerrain={walkable,heightAt,randomPosition:randomWalkablePosition}){for(const unit of villagers)this.spawn(unit);}
    private key(a:Villager,b:Villager){return [a.id,b.id].sort((x,y)=>x-y).join(':');}
    private distance(a:Villager,b:Villager){return Math.hypot(a.visual.position.x-b.visual.position.x,a.visual.position.z-b.visual.position.z);}
    spawn(unit:Villager){
        // A replaced persona must release its partner rather than leave a stale pair lock.
        for(const encounter of this.encounters.filter(e=>e.a.id===unit.id||e.b.id===unit.id))this.finish(encounter);
        this.encounters=this.encounters.filter(e=>e.a.id!==unit.id&&e.b.id!==unit.id);
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
    private face(unit:Villager,angle:number,dt:number){const difference=Math.atan2(Math.sin(angle-unit.visual.rotation.y),Math.cos(angle-unit.visual.rotation.y));unit.visual.rotation.y+=Math.max(-this.config.turnSpeed*dt,Math.min(this.config.turnSpeed*dt,difference));}
    private finish(e:Encounter){for(const unit of [e.a,e.b]){unit.interactionState='resume';unit.partnerId=null;unit.socialCooldownUntil=this.time+this.config.cooldownSeconds;}this.released.set(this.key(e.a,e.b),{a:e.a,b:e.b,until:this.time+this.config.cooldownSeconds});}
    private eligible(unit:Villager){const v=this.intent(unit);return !unit.busy&&unit.socialEnabled&&unit.interactionState==='none'&&this.time>=unit.socialCooldownUntil&&Math.hypot(v.x,v.z)>0;}
    private startEncounters(){
        for(let i=0;i<this.villagers.length;i++)for(let j=i+1;j<this.villagers.length;j++){
            const a=this.villagers[i],b=this.villagers[j];if(!this.eligible(a)||!this.eligible(b)||this.released.has(this.key(a,b)))continue;
            const p=a.visual.position,q=b.visual.position,dx=q.x-p.x,dz=q.z-p.z,d=Math.hypot(dx,dz);if(d>this.config.conversationDistance||d<2*this.config.radius)continue;
            const va=this.intent(a),vb=this.intent(b),vx=vb.x-va.x,vz=vb.z-va.z,v2=vx*vx+vz*vz;
            if(v2===0||dx*vx+dz*vz>=0)continue;
            const t=Math.min(this.config.predictionSeconds,Math.max(0,-(dx*vx+dz*vz)/v2));
            if(Math.hypot(dx+vx*t,dz+vz*t)>2*this.config.radius+.1)continue;
            a.interactionState='talking';b.interactionState='listening';a.partnerId=b.id;b.partnerId=a.id;a.speed=b.speed=0;
            this.encounters.push({a,b,endsAt:this.time+this.config.conversationSeconds});
        }
    }
    private clearStep(unit:Villager,x:number,z:number){
        if(!this.terrain.walkable(x,z))return false;const p=unit.visual.position,dx=x-p.x,dz=z-p.z,length2=dx*dx+dz*dz;
        return this.villagers.every(other=>{if(other===unit)return true;const q=other.visual.position,t=length2?Math.max(0,Math.min(1,((q.x-p.x)*dx+(q.z-p.z)*dz)/length2)):0;return Math.hypot(p.x+dx*t-q.x,p.z+dz*t-q.z)>=2*this.config.radius-1e-7;});
    }
    private avoidConversation(unit:Villager){
        if(this.detours.has(unit))return;
        const p=unit.visual.position,dx=unit.target.x-p.x,dz=unit.target.z-p.z,length=Math.hypot(dx,dz);if(length<.15)return;
        const ux=dx/length,uz=dz/length;
        for(const pair of this.encounters){
            const a=pair.a.visual.position,b=pair.b.visual.position,cx=(a.x+b.x)/2,cz=(a.z+b.z)/2;
            const radius=this.distance(pair.a,pair.b)/2+2*this.config.radius+.2;
            const along=(cx-p.x)*ux+(cz-p.z)*uz,cross=(cx-p.x)*uz-(cz-p.z)*ux;
            if(along<0||along>Math.min(length,3)||Math.abs(cross)>radius)continue;
            // Commit to one side of the entire pair until the exit waypoint is reached.
            const preferred=cross>0?-1:1;
            for(const side of [preferred,-preferred]){
                const nx=uz*side,nz=-ux*side;
                const points=[{x:cx+nx*radius-ux*.5,z:cz+nz*radius-uz*.5},{x:cx+nx*radius+ux*radius,z:cz+nz*radius+uz*radius}];
                if(points.every(point=>this.terrain.walkable(point.x,point.z))){this.detours.set(unit,points);return;}
            }
        }
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
        const position = unit.visual.position;
        const dx = unit.target.x - position.x, dz = unit.target.z - position.z;
        const distance = Math.hypot(dx, dz);
        if (distance < .15) return;
        const forwardX = dx / distance, forwardZ = dz / distance;
        const clearance = 2 * this.config.radius + .2;
        const lookAhead = clearance + this.config.speed * this.config.predictionSeconds;
        let needsPass = false;
        for (const neighbour of this.villagers) {
            if (neighbour === unit) continue;
            // Let eligible pairs reach the encounter distance before planning a pass.
            if (this.eligible(unit) && this.eligible(neighbour) &&
                !this.released.has(this.key(unit, neighbour))) continue;
            const center = neighbour.visual.position;
            const along = (center.x - position.x) * forwardX +
                (center.z - position.z) * forwardZ;
            const cross = (center.x - position.x) * forwardZ -
                (center.z - position.z) * forwardX;
            if (along <= 0 || along > Math.min(distance, lookAhead) ||
                Math.abs(cross) >= clearance) continue;
            needsPass = true;
            const preferred = cross > 0 ? -1 : 1;
            for (const side of [preferred, -preferred]) {
                const lateralX = forwardZ * side * clearance;
                const lateralZ = -forwardX * side * clearance;
                const points = [
                    { x: center.x + lateralX - forwardX * clearance,
                        z: center.z + lateralZ - forwardZ * clearance },
                    { x: center.x + lateralX + forwardX * clearance,
                        z: center.z + lateralZ + forwardZ * clearance },
                ];
                // Check the whole corridor before committing, including the building corner.
                if (this.clearTerrainRoute(position, points) &&
                    this.clearStep(unit, points[0].x, points[0].z)) {
                    this.detours.set(unit, points);
                    return;
                }
            }
        }
        if (!needsPass) return;
        // A crowded corner can leave only the rear corridor open. Commit to leaving it
        // before reconsidering the destination, rather than alternating forward/backward.
        const angle = Math.atan2(dx, dz);
        for (const offset of [0, Math.PI / 4, Math.PI / 2, 3 * Math.PI / 4,
            -Math.PI / 4, -Math.PI / 2, -3 * Math.PI / 4, Math.PI]) {
            const exit = { x: position.x + Math.sin(angle + offset) * clearance,
                z: position.z + Math.cos(angle + offset) * clearance };
            if (this.clearTerrainRoute(position, [exit]) && this.clearStep(unit, exit.x, exit.z)) {
                this.detours.set(unit, [exit]);
                return;
            }
        }
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
        this.time+=dt;
        for(const [key,pair] of this.released)if(this.time>=pair.until&&this.distance(pair.a,pair.b)>this.config.separationDistance)this.released.delete(key);
        for(const unit of this.villagers){unit.speed=0;if(unit.interactionState==='resume'&&this.time>=unit.socialCooldownUntil)unit.interactionState='none';}
        for(const e of this.encounters)if(this.time+1e-8>=e.endsAt)this.finish(e);
        this.encounters=this.encounters.filter(e=>this.time+1e-8<e.endsAt);this.startEncounters();
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
    snapshot(){return this.villagers.map(unit=>({id:unit.id,radius:this.config.radius,state:unit.interactionState,detouring:this.detours.has(unit),partnerId:unit.partnerId,cooldown:Math.max(0,unit.socialCooldownUntil-this.time)}));}
}
