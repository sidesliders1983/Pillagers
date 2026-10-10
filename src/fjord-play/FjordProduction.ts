import type { SimulationEvent } from '../simulation/SimulationCore';

export type ProductionOutput = {
    kind: 'persona' | 'cattle';
    id: string;
    resource: 'food' | 'materials';
    units: number;
};

/** A presentation cursor over factual awards, independent of stocks and simulation timing. */
export class FjordProduction {
    private cursor = 0;
    constructor(events: readonly SimulationEvent[]) { this.reset(events); }

    reset(events: readonly SimulationEvent[]) { this.cursor = events.length; }

    read(events: readonly SimulationEvent[]): ProductionOutput[] {
        const outputs = new Map<string, ProductionOutput>();
        for (const event of events.slice(this.cursor)) {
            const cow = event.type === 'CattleFoodProduced';
            if (!cow && event.type !== 'ResourceProduced') continue;
            const kind = cow ? 'cattle' : 'persona';
            const id = cow ? event.details?.cattleId : event.personaId;
            const resource = cow ? 'food' : event.details?.resource;
            const units = event.details?.units;
            if (typeof id !== 'string' || !id || (resource !== 'food' && resource !== 'materials') ||
                typeof units !== 'number' || !Number.isSafeInteger(units) || units <= 0) continue;
            const key = kind + ':' + id + ':' + resource;
            const output = outputs.get(key) ?? { kind, id, resource, units: 0 };
            output.units += units;
            outputs.set(key, output);
        }
        this.cursor = events.length;
        return [...outputs.values()];
    }
}
