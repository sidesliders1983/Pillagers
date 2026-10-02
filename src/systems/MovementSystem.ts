import { Villager } from '../entities/Villager';
import { heightAt } from '../world/Terrain';
import { obstacles } from '../world/World';
import { seededRandom } from '../config/worldConfig';
export function walkable(x: number, z: number) { return x > -16 && x < 16 && z > -7 && z < 19 && obstacles.every(o => (x - o.x) ** 2 + (z - o.z) ** 2 > (o.r + .4) ** 2); }
export class MovementSystem {
    private random = seededRandom(724);
    constructor(readonly villagers: Villager[]) {
        for (const unit of villagers) {
            this.choose(unit);
            unit.visual.position.set(unit.target.x, heightAt(unit.target.x, unit.target.z), unit.target.z);
            this.choose(unit);
        }
    }
    private choose(unit: Villager) {
        for (let i = 0; i < 100; i++) {
            const x = this.random() * 30 - 15, z = this.random() * 24 - 6;
            if (walkable(x, z)) {
                unit.target.x = x;
                unit.target.z = z;
                return;
            }
        }
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
