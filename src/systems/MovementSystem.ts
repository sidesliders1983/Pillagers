import { Villager } from '../entities/Villager';
import { heightAt } from '../world/Terrain';
import { obstacles } from '../world/World';
import { seededRandom } from '../config/worldConfig';
export function walkable(x: number, z: number) { return x > -16 && x < 16 && z > -7 && z < 19 && heightAt(x,z)>0 && obstacles.every(o => (x - o.x) ** 2 + (z - o.z) ** 2 > (o.r + .4) ** 2); }
export function randomWalkablePosition(random:()=>number){
    for(let i=0;i<100;i++){const x=random()*30-15,z=random()*24-6;if(walkable(x,z))return {x,z};}
    for(let x=-15;x<16;x++)for(let z=-6;z<19;z++)if(walkable(x,z))return {x,z};
    throw new Error('Fjordside has no safe spawn location.');
}
export class MovementSystem {
    private random = seededRandom(724);
    constructor(readonly villagers: Villager[]) {
        for (const unit of villagers) {
            this.spawn(unit);
        }
    }
    spawn(unit:Villager){
        this.choose(unit);unit.visual.position.set(unit.target.x,heightAt(unit.target.x,unit.target.z),unit.target.z);
        unit.wait=0;unit.speed=0;this.choose(unit);
    }
    private choose(unit: Villager) {
        Object.assign(unit.target,randomWalkablePosition(this.random));
    }
    update(dt: number) {
        for (const unit of this.villagers) {
            unit.speed=0;
            const p = unit.visual.position;
            const dx = unit.target.x - p.x, dz = unit.target.z - p.z, distance = Math.hypot(dx, dz);
            if (distance < .15) {
                if(unit.wait===0)unit.wait=1+this.random()*3;
                unit.wait -= dt;
                if (unit.wait <= 0) {
                    this.choose(unit);
                    unit.wait = 0;
                }
                continue;
            }
            const step = Math.min(distance, .65 * dt), x = p.x + dx / distance * step, z = p.z + dz / distance * step;
            if (!walkable(x, z)) {
                this.choose(unit);
                continue;
            }
            unit.phase += dt * 5;
            unit.speed=dt>0?step/dt:0;
            p.set(x, heightAt(x, z), z);
            unit.visual.rotation.y = Math.atan2(dx, dz);
        }
    }
}
