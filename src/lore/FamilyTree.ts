import { personaIdentity } from '../simulation/Identity';
import { personaAge, personaAway } from '../simulation/SimulationCore';
import type { GameTime, SimulationState } from '../simulation/SimulationCore';
import { occupationLabel } from './Chronicle';
export type FamilyRelation = {
    id: string;
    name: string;
    role: 'Father' | 'Mother' | 'Parent';
    visibility: 'included' | 'external' | 'incomplete';
    age: number | null;
    deathWinter?: number | null;
};
export type FamilyNode = {
    id: string;
    name: string;
    founder: boolean;
    row: number;
    column: number;
    branch: string;
    occupation: string;
    age: number | null;
    sex: string;
    status: string;
    deathWinter: number | null;
    observedWinter: number | null;
    parentIds: string[];
    childIds: string[];
    parents: FamilyRelation[];
    children: FamilyRelation[];
};
export type FamilyEdge = {
    kind: 'parent' | 'partnership';
    from: string;
    to: string;
    status?: string;
};
export type FamilyTree = {
    nodes: FamilyNode[];
    edges: FamilyEdge[];
    diagnostics: string[];
    revision: number;
};
const strings = (value: unknown): string[] => Array.isArray(value) ? [...new Set(value.filter((id): id is string => typeof id === 'string'))] : [];
/** Current loaded kinship, never inferred from household, work, prose or an old selected chapter. */
export function projectFamilyTree(state: SimulationState): FamilyTree {
    const founders = state.landing?.founderIds ?? strings(state.events.find(event => event.type === 'FoundingPartyLanded')?.details?.founderIds);
    const founderSet = new Set(founders), community = new Set([...Object.keys(state.personas), ...founders]);
    const identities = { ...state.personaArchive, ...state.personas };
    const parents = new Map<string, string[]>(), pairs = new Map<string, FamilyEdge>(), diagnostics: string[] = [];
    const departedAt = new Map<string, GameTime>(), deathWork = new Map<string, string | null>();
    const pair = (a: string, b: string, status = 'Current partnership') => {
        if (a === b) {
            diagnostics.push('Self partnership reference: ' + a);
            return;
        }
        const [from, to] = [a, b].sort();
        const key = JSON.stringify([from, to]);
        if (pairs.get(key)?.status === 'Current partnership')
            return;
        pairs.set(key, {
            kind: 'partnership', from, to, status
        });
    };
    for (const person of Object.values(identities)) {
        if (!Array.isArray(person.parentIds))
            diagnostics.push('Unavailable parent references: ' + person.id);
        const known = strings(person.parentIds);
        if (known.includes(person.id))
            diagnostics.push('Self parent reference: ' + person.id);
        parents.set(person.id, known.filter(id => id !== person.id));
        if (person.partnerId && state.personas[person.id] && state.personas[person.partnerId])
            pair(person.id, person.partnerId);
    }
    for (const event of state.events) {
        const details = event.details ?? {}, id = event.personaId ?? details.personaId;
        if (['PersonaTransferredIn', 'PersonaTransferredOut'].includes(event.type) && typeof id === 'string') {
            community.add(id);
            if (event.type === 'PersonaTransferredOut')
                departedAt.set(id, event.time);
            if (typeof details.formerPartnerId === 'string')
                pair(id, details.formerPartnerId, 'Ended by departure');
        }
        if (['FoundingPartnershipPresent', 'PartnershipFormed'].includes(event.type)) {
            const participants = strings(details.participants);
            if (participants.length === 2) {
                participants.forEach(id => community.add(id));
                pair(participants[0], participants[1], 'Historical partnership · end not observed');
            }
        }
        if (event.type === 'ChildBorn' && typeof id === 'string')
            community.add(id);
        if (event.type === 'PersonaDied' && typeof id === 'string') {
            community.add(id);
            if (typeof details.occupation === 'string' || details.occupation === null)
                deathWork.set(id, details.occupation as string | null);
            if (typeof details.partnerId === 'string')
                pair(id, details.partnerId, 'Ended by death');
        }
    }
    const included = new Set(founders);
    for (const [child, known] of parents)
        for (const parent of known)
            if (community.has(child) && community.has(parent)) {
                included.add(child);
                included.add(parent);
            }
    for (const edge of pairs.values())
        if (community.has(edge.from) && community.has(edge.to)) {
            included.add(edge.from);
            included.add(edge.to);
        }
    const edges: FamilyEdge[] = [];
    for (const id of included)
        for (const parent of parents.get(id) ?? [])
            if (included.has(parent))
                edges.push({ kind: 'parent', from: parent, to: id });
    edges.push(...[...pairs.values()].filter(edge => included.has(edge.from) && included.has(edge.to)));
    const adjacent = new Map([...included].map(id => [id, new Set<string>()]));
    for (const edge of edges) {
        adjacent.get(edge.from)!.add(edge.to);
        adjacent.get(edge.to)!.add(edge.from);
    }
    const connectedToFounders = new Set(founders), walk = [...founders];
    for (let i = 0; i < walk.length; i++)
        for (const id of adjacent.get(walk[i]) ?? [])
            if (!connectedToFounders.has(id)) {
                connectedToFounders.add(id);
                walk.push(id);
            }
    const calculateRows = (preferred = new Map<string, number>()) => {
        const rows = new Map<string, number>(), degree = new Map([...included].map(id => [id, 0]));
        for (const edge of edges)
            if (edge.kind === 'parent')
                degree.set(edge.to, degree.get(edge.to)! + 1);
        const queue = [...included].filter(id => degree.get(id) === 0).sort();
        for (let i = 0; i < queue.length; i++) {
            const id = queue[i], known = (parents.get(id) ?? []).filter(parent => included.has(parent));
            rows.set(id, founderSet.has(id) ? 0 : known.length ? Math.max(...known.map(parent => rows.get(parent) ?? 0)) + 1 :
                preferred.get(id) ?? (connectedToFounders.has(id) || !founders.length ? 0 : 1));
            for (const edge of edges.filter(edge => edge.kind === 'parent' && edge.from === id)) {
                degree.set(edge.to, degree.get(edge.to)! - 1);
                if (degree.get(edge.to) === 0)
                    queue.push(edge.to);
            }
        }
        for (const id of included)
            if (!rows.has(id)) {
                rows.set(id, founderSet.has(id) ? 0 : 1);
                diagnostics.push('Cyclic or blocked ancestry: ' + id);
            }
        return rows;
    };
    let rows = calculateRows();
    const preferred = new Map<string, number>();
    for (const id of included) {
        if (founderSet.has(id) || (parents.get(id) ?? []).some(parent => included.has(parent)))
            continue;
        const partner = state.personas[id]?.partnerId;
        if (partner && included.has(partner) && !founderSet.has(partner))
            preferred.set(id, rows.get(partner)!);
    }
    if (preferred.size)
        rows = calculateRows(preferred);
    const ordered: string[] = [];
    const placedColumns = new Map<string, number>();
    const parentPosition = (id: string): number => {
        const columns = (parents.get(id) ?? []).filter(parent => placedColumns.has(parent))
            .map(parent => placedColumns.get(parent)!);
        return columns.length ? columns.reduce((total, column) => total + column, 0) / columns.length : Infinity;
    };
    for (const row of [...new Set(rows.values())].sort((a, b) => a - b)) {
        const candidates = row === 0 ? [...founders, ...[...included].filter(id => !founderSet.has(id) && rows.get(id) === 0).sort()] :
            [...included].filter(id => rows.get(id) === row).sort((a, b) => parentPosition(a) - parentPosition(b) || (identities[a]?.birthWinter ?? 0) - (identities[b]?.birthWinter ?? 0) || a.localeCompare(b));
        const seen = new Set<string>();
        let column = 0;
        for (const id of candidates) {
            if (seen.has(id))
                continue;
            seen.add(id);
            ordered.push(id);
            placedColumns.set(id, column++);
            const partner = [...pairs.values()].find(edge => edge.from === id || edge.to === id);
            const other = partner?.from === id ? partner.to : partner?.from;
            if (other && rows.get(other) === row && candidates.includes(other) && !seen.has(other)) {
                seen.add(other);
                ordered.push(other);
                placedColumns.set(other, column++);
            }
        }
    }
    const columns = new Map<number, number>();
    const relation = (parentId: string, known: string[]): FamilyRelation => {
        const parent = personaIdentity(state, parentId), sex = parent?.dna.sex;
        const unambiguous = known.filter(id => personaIdentity(state, id)?.dna.sex === sex).length === 1;
        return {
            id: parentId, name: parent?.name ?? 'Name not recorded',
            role: unambiguous && sex === 'female' ? 'Mother' : unambiguous && sex === 'male' ? 'Father' : 'Parent',
            visibility: included.has(parentId) ? 'included' : parent ? 'external' : 'incomplete',
            deathWinter: parent?.deathWinter ?? null, age: state.personas[parentId] ? personaAge(state, parentId) : parent?.deathWinter != null ? personaAge(state, parentId) :
                parent && departedAt.has(parentId) ? personaAge(state, parentId, departedAt.get(parentId)!) : null
        };
    };
    const nodes = ordered.map(id => {
        const person = personaIdentity(state, id), row = rows.get(id)!, column = columns.get(row) ?? 0;
        columns.set(row, column + 1);
        return {
            id, name: person?.name ?? 'Name not recorded', founder: founderSet.has(id), row, column,
            branch: connectedToFounders.has(id) ? 'Founding families' : 'Independent family',
            occupation: !person ? 'Occupation not observed' : occupationLabel(person?.deathWinter != null ? (deathWork.has(id) ? deathWork.get(id)! : person.occupationHistory?.at(-1)?.occupation ?? null) : person?.occupation ?? null),
            age: state.personas[id] ? personaAge(state, id) : person?.deathWinter != null ? personaAge(state, id) :
                departedAt.has(id) && person ? personaAge(state, id, departedAt.get(id)!) : null,
            sex: person?.dna.sex ?? 'Not recorded', status: !person ? 'Identity not observed' : person.deathWinter != null ? 'Deceased' : !state.personas[id] ? 'Departed · last known' : personaAway(state, id) ? 'Away on expedition' : 'Present',
            deathWinter: person?.deathWinter ?? null, observedWinter: departedAt.get(id)?.winter ?? null, parentIds: parents.get(id) ?? [], parents: (parents.get(id) ?? []).map(parent => relation(parent, parents.get(id) ?? [])),
            childIds: [...parents].filter(([, known]) => known.includes(id)).map(([child]) => child),
            children: [...parents].filter(([, known]) => known.includes(id)).map(([child, known]) => ({ ...relation(child, []), role: relation(id, known).role }))
        };
    });
    return {
        nodes, edges, diagnostics: [...new Set(diagnostics)], revision: 0
    };
}
/** Session-owned derived cache: routine resources only advance the event cursor, not the graph or DOM revision. */
export class FamilyTreeIndex {
    private cached: FamilyTree | null = null;
    private cursor = 0;
    private winter = -1;
    private nextBirthday = Infinity;
    private revision = 0;
    read(state: SimulationState): FamilyTree {
        const now = state.time.winter * state.ticksPerWinter + state.time.tick;
        let topology = !this.cached, cards = this.winter !== state.time.winter || now >= this.nextBirthday;
        for (; this.cursor < state.events.length; this.cursor++) {
            const type = state.events[this.cursor].type;
            if (['ChildBorn', 'PartnershipFormed', 'FoundingPartnershipPresent', 'PersonaDied', 'PersonaTransferredIn', 'PersonaTransferredOut', 'FoundingPartyLanded'].includes(type))
                topology = true;
            if (['OccupationAssigned', 'OccupationReleased', 'ExpeditionDeparted', 'ExpeditionReturned'].includes(type))
                cards = true;
        }
        if (topology)
            this.cached = projectFamilyTree(state);
        else if (cards)
            this.cached = { ...this.cached!, nodes: this.cached!.nodes.map(node => {
                    const person = state.personas[node.id];
                    return {
                        ...node,
                        age: person ? personaAge(state, node.id) : node.age,
                        occupation: person && person.deathWinter === null ? occupationLabel(person.occupation) : node.occupation,
                        status: person && person.deathWinter === null ? (personaAway(state, node.id) ? 'Away on expedition' : 'Present') : node.status,
                        parents: node.parents.map(parent => ({ ...parent, age: state.personas[parent.id] ? personaAge(state, parent.id) : parent.age })),
                        children: node.children.map(child => ({ ...child, age: state.personas[child.id] ? personaAge(state, child.id) : child.age }))
                    };
                }) };
        if (topology || cards) {
            this.cached!.revision = ++this.revision;
            this.nextBirthday = Infinity;
            for (const person of Object.values(state.personas)) if (person.deathWinter === null) {
                const tick = person.birthTick ?? 0;
                const due = (state.time.winter + (tick <= state.time.tick ? 1 : 0)) * state.ticksPerWinter + tick;
                this.nextBirthday = Math.min(this.nextBirthday, due);
            }
        }
        this.winter = state.time.winter;
        return structuredClone(this.cached!);
    }
}
