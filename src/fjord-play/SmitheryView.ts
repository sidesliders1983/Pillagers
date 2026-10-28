import type { SimulationState } from '../simulation/SimulationCore';
import { inspectWork } from '../simulation/Mechanics';
import { personaAway } from '../simulation/WorldExpeditions';
import { weatherProfile } from '../simulation/Weather';
import { craftingOccupation, defaultSmitheryConfig, equipmentFor, equipmentItems, equipmentLabels,
    equipmentOwned, pillageEquipment, type EquipmentItem, type EquipmentResult,
    type PillageEquipment } from '../simulation/Smithery';

const escape = (value: unknown) => String(value ?? '').replace(/[&<>"']/g,
    char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));
const percent = (basisPoints: number) => (basisPoints / 100).toFixed(1).replace(/\.0$/, '') + '%';
const reasons: Record<string, string> = {
    'inactive-role': 'Set a production target to begin',
    'target-reached': 'Targets reached', 'missing-materials': 'Needs Materials',
    'missing-hides': 'Needs Hides from livestock slaughter', expedition: 'Away on expedition',
    childcare: 'Providing care', underage: 'Below working age', deceased: 'Deceased',
};

/** Specialist production lives in existing occupational home/person details, never the global HUD. */
export function renderSmithery(state: SimulationState): string {
    const rules = state.smithery?.config ?? defaultSmitheryConfig;
    const workers = Object.values(state.personas).filter(person => person.deathWinter === null &&
        craftingOccupation(person.occupation));
    return `<section class="fjord-smithery" aria-label="Smithery production">
        <p><strong>${state.stocks.materials} Materials</strong> · ${state.specialistStocks?.hides ?? 0} Hides${state.mining ? ` · ${state.specialistStocks?.ironOre ?? 0} Iron Ore` : ''}</p>
        <p class="fjord-caption">Set small clan stock targets. Eligible Smiths and Leatherworkers craft over time.
        Targets include stored and worn items, including equipment away on expedition.</p>
        ${state.landing?.livestock?.version !== 2 ?
            '<p class="fjord-caption">This campaign retains historical slaughter rules without Hides. Wooden equipment remains available.</p>' : ''}
        <div class="fjord-smithery-products">${equipmentItems.map(item => {
            const recipe = rules.recipes[item], owned = equipmentOwned(state, item);
            const stored = state.smithery?.stored[item] ?? 0;
            return `<article><h3>${equipmentLabels[item]}</h3>
                <p>${stored} stored · ${owned - stored} worn · ${owned} total</p>
                <p class="fjord-caption">${item === 'leatherShield' ? 'Leatherworker' : 'Smith'} ·
                ${recipe.materials} Materials${recipe.hides ? ` + ${recipe.hides} Hide` : ''} per item</p>
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
        Inputs are consumed once when an item is finished. No Materials or Hides are spent when setting a target.</p>
    </section>`;
}

export function renderEquipmentReadiness(snapshot: PillageEquipment | undefined): string {
    if (!snapshot) return '<p class="fjord-caption">Historical mission rules: personal equipment is not tracked.</p>';
    return `<section aria-label="Personal Pillage risks"><p>Success: ${percent(snapshot.successBps)} ·
        ${snapshot.members.filter(member => member.weapon).length}/${snapshot.members.length} spear holders</p>
        <p class="fjord-caption">Shields protect only their wearer. Casualty risk per member:</p>
        ${snapshot.members.map(member => `<p class="fjord-caption">${escape(member.name)} ·
            ${percent(member.casualtyBps)}${member.shield ? ` · ${equipmentLabels[member.shield]}` : ' · No shield'}</p>`).join('')}</section>`;
}

export function renderRaiderEquipment(state: SimulationState, memberIds: readonly string[]): string {
    const options = (items: readonly EquipmentItem[], current: string | null) =>
        `<option value="" ${!current ? 'selected' : ''}>None</option>` + items.map(item => {
            const available = state.smithery?.stored[item] ?? 0;
            return `<option value="${item}" ${current === item ? 'selected' : ''}
                ${!available && current !== item ? 'disabled' : ''}>${equipmentLabels[item]} (${available} stored)</option>`;
        }).join('');
    const snapshot = pillageEquipment(state, memberIds, state.world!.config.successBps.Pillage,
        Math.min(10000, state.world!.config.casualtyBps.Pillage + weatherProfile(state).travelRiskBps));
    return `<details class="fjord-raider-equipment" data-island-equipment open><summary>Pillage equipment</summary>
        <p class="fjord-caption">Assign existing gear to named residents at home. Craft stock through a Smith or Leatherworker's home.</p>
        ${memberIds.map(id => {
            const gear = equipmentFor(state, id), disabled = personaAway(state, id) ? 'disabled' : '';
            return `<fieldset class="fjord-equipment-person"><legend>${escape(state.personas[id].name)}</legend>
                <div class="fjord-equipment-slots"><label>Weapon<select data-equipment-person="${escape(id)}"
                    data-equipment-slot="weapon" aria-label="${escape(state.personas[id].name)} Weapon" ${disabled}>
                    ${options(['woodenSpear'], gear.weapon)}</select></label>
                <label>Shield<select data-equipment-person="${escape(id)}" data-equipment-slot="shield"
                    aria-label="${escape(state.personas[id].name)} Shield" ${disabled}>
                    ${options(['woodenShield', 'leatherShield'], gear.shield)}</select></label></div></fieldset>`;
        }).join('')}${renderEquipmentReadiness(snapshot)}</details>`;
}

export function renderEquipmentReport(result: EquipmentResult | undefined): string {
    if (!result) return '';
    const rows = (members: EquipmentResult['returned']) => members.filter(m => m.weapon || m.shield)
        .map(member => `${escape(member.name)}: ${[member.weapon, member.shield]
            .filter((item): item is EquipmentItem => !!item).map(item => equipmentLabels[item]).join(', ')}`).join('<br>') || 'None';
    return `<details><summary>Equipment returned &amp; lost</summary><p>Returned with their owners:<br>${rows(result.returned)}</p>
        <p>Permanently lost:<br>${rows(result.lost)}</p></details>`;
}
