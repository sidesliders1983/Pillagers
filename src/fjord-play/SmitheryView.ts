import type { SimulationState } from '../simulation/SimulationCore';
import { inspectWork } from '../simulation/Mechanics';
import { personaAway } from '../simulation/WorldExpeditions';
import { miningBusy } from '../simulation/Mining';
import { territorialDuty } from '../simulation/ResidentPresence';
import { weatherProfile } from '../simulation/Weather';
import { craftingOccupation, defaultSmitheryConfig, equipmentFor, equipmentItems, equipmentLabels,
    equipmentOwned, equipmentRecipe, equipmentCasualtyRisk, equipmentSpearBonus,
    pillageEquipment, type EquipmentItem, type EquipmentResult, type PillageEquipment } from '../simulation/Smithery';

const escape = (value: unknown) => String(value ?? '').replace(/[&<>"']/g,
    char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));
const percent = (basisPoints: number) => (basisPoints / 100).toFixed(1).replace(/\.0$/, '') + '%';
const reasons: Record<string, string> = {
    'inactive-role': 'Set a production target to begin',
    'target-reached': 'Targets reached', 'missing-materials': 'Needs Materials',
    'missing-hides': 'Needs Hides from livestock slaughter',
    'missing-iron-ore': 'Needs Iron Ore from a worked deposit',
    'missing-ore': 'Needs Iron Ore from a worked deposit', expedition: 'Away on expedition',
    childcare: 'Providing care', underage: 'Below working age', deceased: 'Deceased',
};

/** Specialist production lives in existing occupational home/person details, never the global HUD. */
export function renderSmithery(state: SimulationState): string {
    const rules = state.smithery?.config ?? defaultSmitheryConfig;
    const items = equipmentItems;
    const workers = Object.values(state.personas).filter(person => person.deathWinter === null &&
        craftingOccupation(person.occupation));
    return `<section class="fjord-smithery" aria-label="Smithery production">
        <p><strong>${state.stocks.materials} Materials</strong> · ${state.specialistStocks?.hides ?? 0} Hides${state.mining ? ` · ${state.specialistStocks?.ironOre ?? 0} Iron Ore` : ''}</p>
        <p class="fjord-caption">Set small clan stock targets. Eligible Smiths and Leatherworkers craft over time.
        Targets include stored and assigned items, including equipment away on expedition.</p>
        ${state.landing?.livestock?.version !== 2 ?
            '<p class="fjord-caption">This campaign retains historical slaughter rules without Hides. Wooden equipment remains available.</p>' : ''}
        <div class="fjord-smithery-products">${items.map(item => {
            const recipe = equipmentRecipe(state, item), owned = equipmentOwned(state, item);
            const stored = state.smithery?.stored[item] ?? 0;
            return `<article><h3>${equipmentLabels[item]}</h3>
                <p>${stored} stored · ${owned - stored} assigned · ${owned} total</p>
                <p class="fjord-caption">${item === 'leatherShield' || item === 'leatherBodyArmor' ? 'Leatherworker' : 'Smith'} ·
                ${recipe.materials} Materials${recipe.hides ? ` + ${recipe.hides} ${recipe.hides === 1 ? 'Hide' : 'Hides'}` : ''}${recipe.ironOre ? ` + ${recipe.ironOre} Iron Ore` : ''} per item</p>
                <label>Target stock<input type="number" inputmode="numeric" min="0" max="${rules.maximumTarget}"
                    step="1" value="${state.smithery?.targets[item] ?? 0}" data-smithery-target="${item}"
                    aria-label="${equipmentLabels[item]} target stock"></label></article>`;
        }).join('')}</div>
        <h3>Craftspeople</h3>${workers.length ? workers.map(person => {
            const work = inspectWork(state, person.id);
            return `<p><strong>${escape(person.name)}</strong> · ${person.occupation === 'smith' ? 'Smith' : 'Leatherworker'}<br>
                <small>${work.reason ? escape(reasons[work.reason] ?? work.reason) :
                    `${Math.floor(work.progress * 100)}% item progress · ${percent(work.productivityBps)} effective productivity`}</small></p>`;
        }).join('') : '<p class="fjord-caption">Assign a Smith or Leatherworker through Manage work to start production.</p>'}
        <p class="fjord-caption">Hides come from eligible livestock slaughter. Poultry and natural deaths provide no Hides.
        Iron Ore comes from worked deposits. Inputs are consumed once when an item is finished.
        Setting a target does not spend Materials, Hides or Iron Ore.</p>
    </section>`;
}

export function renderEquipmentReadiness(snapshot: PillageEquipment | undefined, onSite = false): string {
    if (!snapshot) return '<p class="fjord-caption">Historical mission rules: personal equipment is not tracked.</p>';
    if (onSite) return `<section aria-label="Assigned Pillage equipment">
        <p>${snapshot.members.filter(member => member.weapon).length}/${snapshot.members.length} spear holders</p>
        ${snapshot.members.map(member => `<p class="fjord-caption">${escape(member.name)} ·
            ${member.weapon ? equipmentLabels[member.weapon] : 'No weapon'} ·
            ${member.shield ? equipmentLabels[member.shield] : 'No shield'}${member.bodyArmor ? ` · ${equipmentLabels[member.bodyArmor]}` : ''}${member.headgear ? ` · ${equipmentLabels[member.headgear]}` : ''}</p>`).join('')}</section>`;
    return `<section aria-label="Personal Pillage risks"><p>Success: ${percent(snapshot.successBps)} ·
        ${snapshot.members.filter(member => member.weapon).length}/${snapshot.members.length} spear holders</p>
        <p class="fjord-caption">Personal protection affects only its wearer. Casualty risk per member:</p>
        ${snapshot.members.map(member => `<p class="fjord-caption">${escape(member.name)} ·
            ${percent(member.casualtyBps)}${[member.shield, member.bodyArmor, member.headgear].map(item => item ? ` · ${equipmentLabels[item]}` : '').join('')}</p>`).join('')}</section>`;
}

export function renderRaiderEquipment(state: SimulationState, memberIds: readonly string[], onSite = false): string {
    const options = (items: readonly EquipmentItem[], current: string | null) =>
        `<option value="" ${!current ? 'selected' : ''}>None</option>` + items.map(item => {
            const available = state.smithery?.stored[item] ?? 0;
            return `<option value="${item}" ${current === item ? 'selected' : ''}
                ${!available && current !== item ? 'disabled' : ''}>${equipmentLabels[item]} (${available} stored)</option>`;
        }).join('');
    const items = equipmentItems;
    const weapons = items.filter(item => item === 'woodenSpear' || item === 'ironSpear');
    const shields = items.filter(item => ['woodenShield', 'leatherShield', 'ironShield'].includes(item));
    const slots = [
        { key: 'weapon', label: 'Weapon', items: weapons },
        { key: 'shield', label: 'Shield', items: shields },
        { key: 'bodyArmor', label: 'Body Armor', items: ['leatherBodyArmor'] },
        { key: 'headgear', label: 'Headgear', items: ['ironHelmet'] },
    ] as const;
    const snapshot = pillageEquipment(state, memberIds, state.world!.config.successBps.Pillage,
        Math.min(10000, state.world!.config.casualtyBps.Pillage + weatherProfile(state).travelRiskBps));
    return `<details class="fjord-raider-equipment" data-island-equipment open><summary>Pillage equipment</summary>
        <p class="fjord-caption">Assign existing gear to named residents at home. Craft stock through a Smith or Leatherworker's home.</p>
        ${memberIds.map(id => {
            const gear = equipmentFor(state, id);
            const unavailable = personaAway(state, id) || miningBusy(state, id) || territorialDuty(state, id);
            const disabled = unavailable ? 'disabled' : '';
            const rules = state.smithery?.config;
            const effects = onSite && rules
                ? `<p class="fjord-caption">Own attack: +${percent(equipmentSpearBonus(gear.weapon, rules))} ·
                    Own protection: ${percent(10000 - equipmentCasualtyRisk(10000, gear, rules))}${
                        gear.bodyArmor || gear.headgear
                            ? ` (combined cap: ${percent(rules.maximumPersonalProtectionBps!)})` : ''}.
                    Applies to this resident only.</p>` : '';
            return `<fieldset class="fjord-equipment-person"><legend>${escape(state.personas[id].name)}</legend>
                <div class="fjord-equipment-slots">${slots.map(slot => `<label>${slot.label}
                    <select data-equipment-person="${escape(id)}" data-equipment-slot="${slot.key}"
                        aria-label="${escape(state.personas[id].name)} ${slot.label}" ${disabled}>
                        ${options(slot.items, gear[slot.key] ?? null)}</select></label>`).join('')}</div>
                ${effects}
                ${unavailable ? '<p class="fjord-caption">Equipment can be changed after this resident returns home and is off duty.</p>' : ''}
                </fieldset>`;
        }).join('')}${renderEquipmentReadiness(snapshot, onSite)}</details>`;
}

export function renderEquipmentReport(result: EquipmentResult | undefined): string {
    if (!result) return '';
    const rows = (members: EquipmentResult['returned']) => members.filter(m => m.weapon || m.shield || m.bodyArmor || m.headgear)
        .map(member => `${escape(member.name)}: ${[member.weapon, member.shield, member.bodyArmor, member.headgear]
            .filter((item): item is EquipmentItem => !!item).map(item => equipmentLabels[item]).join(', ')}`).join('<br>') || 'None';
    return `<details><summary>Equipment returned &amp; lost</summary><p>Returned with their owners:<br>${rows(result.returned)}</p>
        <p>Permanently lost:<br>${rows(result.lost)}</p></details>`;
}

/** Own-person assignments are factual; work-clothes stowage never changes ownership. */
export function renderPersonalEquipmentSummary(
    state: SimulationState, personaId: string, stowedStatus: readonly string[] = [],
): string {
    if (!state.personas[personaId]) return '';
    const gear = equipmentFor(state, personaId);
    const slots = [
        ['Weapon', gear.weapon], ['Shield', gear.shield],
        ['Body Armor', gear.bodyArmor], ['Headgear', gear.headgear],
    ] as const;
    return `<section aria-label="Personal equipment"><h3>Assigned equipment</h3>
        ${slots.map(([label, item]) => `<p><strong>${label}:</strong>
            ${item ? escape(equipmentLabels[item]) : 'None'}</p>`).join('')}
        ${stowedStatus.map(message => `<p class="fjord-caption">${escape(message)}</p>`).join('')}
        </section>`;
}
