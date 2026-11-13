import type { MeshyHuman } from '../characters/MeshyHuman';
import type { NativeEncounterPoseRequest } from '../characters/NativeEncounterPose';
import { characterAsset } from '../characters/CharacterAssets';
import { nativeCombatEquipmentByItem } from '../characters/NativeCombatEquipmentCatalog';

/** Lab names retain the game sampler while keeping raw source clips separately selectable. */
export const labCombatAnimations = Object.freeze([
    { id: 'CombatReady', label: 'Combat · Ready', action: 'ready', sourceClip: 'Idle_02', seconds: 2 },
    { id: 'CombatSpear', label: 'Combat · Spear action', action: 'spear', sourceClip: 'Attack' },
    { id: 'CombatStrike', label: 'Combat · Unarmed strike', action: 'strike', sourceClip: 'Attack' },
    { id: 'CombatShield', label: 'Combat · Shield defence', action: 'shield', sourceClip: 'Idle_02', seconds: 2 },
    { id: 'CombatBrace', label: 'Combat · Brace', action: 'brace', sourceClip: 'Idle_02', seconds: 2 },
    { id: 'CombatWithdraw', label: 'Combat · Withdrawal', action: 'withdraw', sourceClip: 'Idle_02', seconds: 2 },
    { id: 'CombatDeath', label: 'Combat · Fall', action: 'death', sourceClip: 'Fall_Dead_from_Abdominal_Injury' },
] satisfies readonly { id: string; label: string; action: NativeEncounterPoseRequest['action']; sourceClip: string; seconds?: number }[]);

export function labCombatAnimation(id: string) {
    return labCombatAnimations.find(animation => animation.id === id);
}

export function labCombatAnimationAvailable(id: string, equipmentIds: readonly string[]): boolean {
    const animation = labCombatAnimation(id);
    if (animation?.action === 'strike') return !equipmentIds.some(id =>
        characterAsset(id).type === 'equipment' && characterAsset(id).metadata?.anchor === 'socket_hand_R');
    if (animation?.action === 'spear') return equipmentIds.includes(nativeCombatEquipmentByItem.woodenSpear);
    if (animation?.action === 'shield') return equipmentIds.includes(nativeCombatEquipmentByItem.woodenShield) ||
        equipmentIds.includes(nativeCombatEquipmentByItem.leatherShield);
    return true;
}

export function labCombatDuration(model: MeshyHuman, id: string): number {
    const animation = labCombatAnimation(id);
    if (!animation) throw new Error('Unknown combat review pose.');
    const source = model.clips.find(clip => clip.name === animation.sourceClip);
    if (!source) throw new Error('The native source motion for this combat pose is unavailable.');
    return animation.seconds ?? source.duration;
}

export function sampleLabCombatPose(model: MeshyHuman, id: string, time: number): boolean {
    const animation = labCombatAnimation(id);
    if (!animation) return false;
    const equipment = [...model.fit.modules.keys()];
    if (!labCombatAnimationAvailable(id, equipment))
        throw new Error(animation.action === 'spear' ? 'Equip a Wooden Spear to review its action.' :
            animation.action === 'strike' ? 'Clear the weapon hand to review an unarmed strike.' :
            'Equip a shield to review shield defence.');
    return model.sampleEncounterPose({ key: 'lab:' + id, action: animation.action,
        startedAt: 0, durationTicks: labCombatDuration(model, id), tick: time,
        hasSpear: equipment.includes(nativeCombatEquipmentByItem.woodenSpear),
        hasShield: equipment.includes(nativeCombatEquipmentByItem.woodenShield) ||
            equipment.includes(nativeCombatEquipmentByItem.leatherShield) });
}
