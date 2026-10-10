import { GameplaySession } from '../gameplay-lab/GameplaySession';
import { generateWorld } from '../world-generation/GenerateWorld';
import { parseWorld } from '../world-generation/WorldSave';
import { createBlueprintSurface } from '../world-generation/TerrainQueries';
import type { WorldBlueprint } from '../world-generation/WorldBlueprint';
import { createFjordLayout, fjordPlotFits, projectFjordSettlement } from './FjordProjection';
import type { FjordLayout, FjordTransform } from './FjordProjection';
export const sharedCampaignKey = 'pillagers.gameplay-lab.v1';
export const fjordCampaignKey = 'pillagers.fjord-play.v1';
/** Presentation adapter around the very same session used by both existing gameplay views. */
export class FjordCampaign {
    blueprint: WorldBlueprint;
    layout: FjordLayout;
    selection: {
        kind: string;
        id: string;
    } | null = null;
    constructor(readonly session: GameplaySession) {
        this.blueprint = generateWorld({ seed: session.snapshot().seed, conifers: 'ez-tree' });
        this.layout = createFjordLayout(this.blueprint);
    }
    project() {
        const view = projectFjordSettlement(this.session.snapshot(), this.blueprint, this.layout);
        this.layout = view.layout;
        return view;
    }
    setMooring(transform: FjordTransform) {
        if (this.layout.mooringResolved)
            return;
        this.layout.mooring = { ...transform };
        this.layout.mooringResolved = true;
    }
    exportJSON() {
        this.project();
        return JSON.stringify({ bridgeVersion: 1, campaign: JSON.parse(this.session.saveJSON()),
            blueprint: this.blueprint, layout: this.layout, selection: this.selection });
    }
    importJSON(text: string) {
        if (text.length > 24000000)
            throw new Error('Campaign file exceeds the 24MB limit.');
        const saved = JSON.parse(text);
        const proposal = new GameplaySession();
        const extended = saved.bridgeVersion !== undefined;
        if (extended && saved.bridgeVersion !== 1)
            throw new Error('Unsupported Fjord campaign version.');
        proposal.loadJSON(extended ? JSON.stringify(saved.campaign) : text);
        const seed = proposal.snapshot().seed;
        const blueprint = extended ? parseWorld(JSON.stringify({ schemaVersion: 1, blueprint: saved.blueprint })) :
            seed === this.blueprint.config.seed ? this.blueprint : generateWorld({ seed, conifers: 'ez-tree' });
        if (blueprint.config.seed !== seed)
            throw new Error('Campaign and geography seed identities do not match.');
        const layout = extended ? saved.layout as FjordLayout :
            seed === this.layout.seed ? structuredClone(this.layout) : createFjordLayout(blueprint);
        const finiteTransform = (p: FjordTransform) => p &&
            [p.x, p.y, p.z, p.rotation, p.scale].every(Number.isFinite) && p.scale === 1;
        if (!layout || !layout.plots || !layout.points || !finiteTransform(layout.mooring) ||
            !Object.values(layout.plots).every(p => finiteTransform(p) && p.halfWidth === 6.5 && p.halfDepth === 6.5) ||
            !Object.values(layout.points).every(finiteTransform))
            throw new Error('Invalid presentation layout.');
        const plots = Object.values(layout.plots);
        if (typeof layout.mooringResolved !== 'boolean' || plots.some(p => !fjordPlotFits(blueprint, p)))
            throw new Error('Invalid plot support in presentation layout.');
        for (let i = 0; i < plots.length; i++)
            for (const q of plots.slice(i + 1)) {
                const p = plots[i];
                if (Math.abs(p.x - q.x) <= p.halfWidth + q.halfWidth &&
                    Math.abs(p.z - q.z) <= p.halfDepth + q.halfDepth)
                    throw new Error('Overlapping presentation plots.');
            }
        const surface = createBlueprintSurface(blueprint);
        if (Object.values(layout.points).some(p => Math.abs(p.y - surface.surfaceHeightAt(p.x, p.z)) > 1e-6 ||
            p.y <= blueprint.waterLevel + .25))
            throw new Error('Invalid outdoor support in presentation layout.');
        const view = projectFjordSettlement(proposal.snapshot(), blueprint, layout);
        this.session.loadJSON(proposal.saveJSON());
        this.blueprint = blueprint;
        this.layout = view.layout;
        this.selection = extended && saved.selection && typeof saved.selection.kind === 'string' &&
            typeof saved.selection.id === 'string' ? saved.selection : null;
    }
    restart(sameFounders = true, weatherEnabled = this.session.snapshot().weather?.config.enabled ?? false) {
        this.session.restartCampaign(sameFounders, undefined, weatherEnabled);
        const seed = this.session.snapshot().seed;
        if (seed !== this.blueprint.config.seed)
            this.blueprint = generateWorld({ seed, conifers: 'ez-tree' });
        const sameGeography = seed === this.layout.seed, resolved = this.layout.mooringResolved;
        this.layout = createFjordLayout(this.blueprint, sameGeography ? this.layout.mooring : undefined);
        this.layout.mooringResolved = sameGeography && resolved;
        this.selection = null;
    }
}
