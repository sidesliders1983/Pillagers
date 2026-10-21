import { identitySample } from './seededRandom';
import type { Persona, SimulationState } from '../simulation/SimulationCore';

export const facialIdentityVersion = 'facial-identity-v1' as const;
export const facialAxes = [
    'faceWidth', 'faceLength', 'jawWidth', 'chinProjection',
    'noseWidth', 'noseProjection', 'eyeSpacing',
] as const;
export type FacialAxis = typeof facialAxes[number];
export interface FacialIdentityV1 {
    version: typeof facialIdentityVersion;
    axes: Record<FacialAxis, number>;
    derivation: 'founder' | 'one-parent' | 'two-parents';
    parentIds: string[];
}
type Family = Pick<SimulationState, 'personas' | 'personaArchive'>;

/** A standalone Lab preview has no recorded parents and shares the founder rule. */
export function founderFacialIdentity(seed: number): FacialIdentityV1 {
    const axes = Object.fromEntries(facialAxes.map(axis => [axis,
        (identitySample(seed, facialIdentityVersion + ':' + axis) * 2 - 1) * .8,
    ])) as Record<FacialAxis, number>;
    return { version: facialIdentityVersion, axes, parentIds: [], derivation: 'founder' };
}

/** A presentation projection of recorded ancestry. Never consumes Core randomness
 * or changes DNA. Version 1 is frozen even when later visual profiles are added. */
export function projectFacialIdentity(family: Family, personaId: string): FacialIdentityV1 {
    const cached = new Map<string, FacialIdentityV1>();
    const visiting = new Set<string>();
    const person = (id: string): Persona | undefined => family.personas[id] ?? family.personaArchive?.[id];
    const derive = (id: string): FacialIdentityV1 => {
        const known = cached.get(id);
        if (known) return known;
        const current = person(id);
        if (!current) throw new Error('Facial identity requires a recorded person.');
        if (visiting.has(id)) throw new Error('Facial identity cannot derive cyclic ancestry.');
        visiting.add(id);
        const parentIds = [...new Set(current.parentIds)]
            .filter(parentId => person(parentId))
            .sort();
        if (parentIds.length > 2) throw new Error('Facial identity supports at most two recorded parents.');
        const parents = parentIds.map(derive);
        const axes = Object.fromEntries(facialAxes.map(axis => {
            const individual = identitySample(current.dna.seed, facialIdentityVersion + ':' + axis) * 2 - 1;
            let value = individual * .8;
            if (parents.length === 2) {
                value = (parents[0].axes[axis] + parents[1].axes[axis]) / 2 + individual * .08;
            } else if (parents.length === 1) {
                value = parents[0].axes[axis] * .8 + individual * .2;
            }
            return [axis, Math.max(-1, Math.min(1, value))];
        })) as Record<FacialAxis, number>;
        const derivation = parents.length === 2 ? 'two-parents'
            : parents.length === 1 ? 'one-parent' : 'founder';
        const result: FacialIdentityV1 = {
            version: facialIdentityVersion,
            axes,
            parentIds,
            derivation,
        };
        visiting.delete(id);
        cached.set(id, result);
        return result;
    };
    return derive(personaId);
}

export function parseFacialIdentity(value: FacialIdentityV1): FacialIdentityV1 {
    if (!value || value.version !== facialIdentityVersion || !value.axes ||
        Object.keys(value.axes).length !== facialAxes.length ||
        facialAxes.some(axis => !Number.isFinite(value.axes[axis]) || Math.abs(value.axes[axis]) > 1) ||
        !['founder', 'one-parent', 'two-parents'].includes(value.derivation) ||
        !Array.isArray(value.parentIds) || value.parentIds.length > 2 ||
        value.parentIds.some(id => typeof id !== 'string' || !id))
        throw new Error('Unsupported or invalid facial identity profile.');
    return {
        version: facialIdentityVersion,
        axes: { ...value.axes },
        derivation: value.derivation,
        parentIds: [...value.parentIds],
    };
}
