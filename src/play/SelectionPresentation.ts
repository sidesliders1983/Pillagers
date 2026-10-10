import type { SimulationState } from '../simulation/SimulationCore';
import type { FjordEntity } from '../fjord-play/FjordProjection';
import type { SettlementSelection } from './SharedSettlement';
import type { EntityKind } from './SettlementView';
export type SelectionMarker = {
    kind: EntityKind;
    id: string;
    selectionKey: string;
    label: string;
    role: 'selected' | 'partner' | 'child' | 'home' | 'resident';
};
/** Visible relationships derive from canonical identity records, never renderer names. */
export function projectSelection(state: SimulationState, selection: SettlementSelection, visible: readonly FjordEntity[]): SelectionMarker[] {
    if (!selection)
        return [];
    const markers: SelectionMarker[] = [];
    const add = (kind: EntityKind, id: string, role: SelectionMarker['role']) => {
        const entity = visible.find(e => e.kind === kind && e.id === id && e.transform);
        if (entity && !markers.some(m => m.selectionKey === entity.selectionKey))
            markers.push({ kind, id, role, selectionKey: entity.selectionKey, label: entity.label });
    };
    const home = Object.values(state.households).find(h => selection.kind === 'persona' ?
        h.memberIds.includes(selection.id) : selection.kind === 'household' ? h.id === selection.id :
        selection.kind === 'building' && h.residenceId && state.residences[h.residenceId]?.buildingId === selection.id);
    const residence = home?.residenceId ? state.residences[home.residenceId] : undefined;
    const homeMarker = (role: SelectionMarker['role']) => {
        if (residence?.buildingId)
            add('building', residence.buildingId, role);
        else if (home)
            add('household', home.id, role);
    };
    if (selection.kind === 'household')
        homeMarker('selected');
    else
        add(selection.kind, selection.id, 'selected');
    if (selection.kind === 'persona') {
        const person = state.personas[selection.id];
        if (person?.partnerId)
            add('persona', person.partnerId, 'partner');
        for (const child of Object.values(state.personas).filter(p => p.parentIds.includes(selection.id)))
            add('persona', child.id, 'child');
        homeMarker('home');
    }
    else if (selection.kind === 'household' || selection.kind === 'building') {
        for (const id of home?.memberIds ?? [])
            add('persona', id, 'resident');
    }
    return markers;
}
