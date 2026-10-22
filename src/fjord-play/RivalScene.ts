import type { WorldBlueprint } from '../world-generation/WorldBlueprint';
import { discoveryAt, type DiscoveryView } from '../simulation/ClanDiscovery';
import type { ObservedRivalSettlement } from './RivalSettlement';
import { FjordEntities } from './FjordEntities';
import type { FjordModels } from './FjordModels';
import { LivingWorldController } from './LivingWorldController';
import type { SeasonAppearance } from '../world/SeasonAppearanceTransition';
import type { Object3D, Texture } from 'three';

/** Only sanitized observed actors reach the existing asset/motion pipeline. This class never ticks Core. */
export class RivalScene {
    private layer: FjordEntities;
    private motion?: LivingWorldController;
    private disposed = false;
    constructor(private world: WorldBlueprint, models: FjordModels, private knowledge: () => DiscoveryView | undefined,
        decorateMaterials?: (root: Object3D) => void, homeMasks?: ReadonlyMap<string, Texture>) {
        this.layer = new FjordEntities(models, decorateMaterials, homeMasks);
    }
    get root() { return this.layer.root; }
    setHomeDarkness(darkness: number) { this.layer.setHomeDarkness(darkness); }
    setSeasonAppearance(appearance: SeasonAppearance) { this.layer.setSeasonAppearance(appearance); }
    async sync(view: ObservedRivalSettlement, season: number,
        trees: Parameters<LivingWorldController['setStandingTrees']>[0], appearance?: SeasonAppearance) {
        if (this.disposed) return;
        if (appearance) this.layer.setSeasonAppearance(appearance);
        else this.layer.setSeason(season);
        const knowledge = this.knowledge();
        this.layer.retainVisibleDeaths((x, z) => Boolean(knowledge && discoveryAt(knowledge, x, z) === 'visible'));
        const observed = new Map(this.layer.describe().map(entity => [entity.id, entity.position]));
        const deaths = view.livestockDeaths?.filter(fact => {
            const position = observed.get(fact.id);
            return position && knowledge && discoveryAt(knowledge, position[0], position[2]) === 'visible';
        });
        await this.layer.sync(view.entities, undefined, () => !this.disposed, deaths);
        if (this.disposed) return;
        if (!this.motion && view.entities.length && view.campfire) {
            const bounds = this.world.rivalSite!.bounds;
            this.motion = new LivingWorldController(this.world, (x, z) => {
                const knowledge = this.knowledge();
                return Boolean(knowledge && discoveryAt(knowledge, x, z) === 'visible' &&
                    x >= bounds.minX && x <= bounds.maxX && z >= bounds.minZ && z <= bounds.maxZ);
            }, view.campfire);
        }
        if (this.motion) {
            this.motion.reconcile(view.entities, view.ground);
            this.motion.setStandingTrees(trees);
            this.layer.configureMotion(this.motion);
            this.layer.advance(this.motion, 0, false);
        }
    }
    advance(delta: number, running: boolean) {
        this.motion?.advance(delta, running, true);
        if (this.motion) this.layer.advance(this.motion, delta, running);
    }
    humanPositions() { return this.layer.humanPositions(); }
    describe() { return this.layer.describe(); }
    dispose() {
        this.disposed = true;
        this.layer.dispose();
        this.motion = undefined;
    }
}
