import { careActive } from '../simulation/CareCalendar';
import { inspectCampfire } from '../simulation/SimulationCore';
import { housingName } from '../simulation/HousingNames';
import { commandAvailability } from './SharedSettlement';
import { canApplyCommand, personaAge, occupationAptitude, inspectWork, inspectBuilding, inspectLivestock, landingSummary, occupationIds, caregiverEligible } from '../simulation/SimulationCore';
import type { SimulationState, SimulationCommand, Occupation } from '../simulation/SimulationCore';
import type { EntityKind } from './SettlementView';
import type { SettlementSelection } from './SharedSettlement';
const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const option = (id: string, text: string, chosen: string | null) => `<option value="${esc(id)}" ${id === (chosen ?? '') ? 'selected' : ''}>${esc(text)}</option>`;
const percent = (n: number) => `${(n / 100).toFixed(1)}%`;
export class SettlementPanel {
    button(state: SimulationState, command: SimulationCommand, text: string) {
        const availability = commandAvailability(state, command);
        return `<button data-command="${esc(JSON.stringify(command))}" title="${esc(availability.reason)}" ${availability.allowed ? '' : 'disabled'}>${esc(text)}</button>
            <small data-availability ${availability.allowed ? 'hidden' : ''}>${esc(availability.reason)}</small>`;

    }
    private select(kind: EntityKind, id: string, name: string) {
        return `<button class="entity-link" data-kind="${kind}" data-select="${esc(id)}">${esc(name)}</button>`;
    }
    private roles(current: string | null, state?: SimulationState, personaId?: string) {
        return option('', 'No occupation', current) + occupationIds.map(id => option(id, state && personaId ? `${id} · ${percent(occupationAptitude(state, personaId, id))} fit` : id, current)).join('');
    }
    render(state: SimulationState, selection: SettlementSelection, history = '',
        options: { homeImprovements?: boolean } = {}): string {
        if (!selection)
            return '<h2>Settlement</h2><p>Select a home, resident or animal on the board.</p><p class="muted">Drag the board to pan. Scroll or use the controls to zoom. Select an entity below if sprites overlap.</p>';
        const { kind, id } = selection;
        const personLink = (id: string) => this.select('persona', id, state.personas[id]?.name ?? state.personaArchive?.[id]?.name ?? id);
        if (kind === 'campfire') {
            const fire = inspectCampfire(state);
            const label = fire.lit ? 'Extinguish campfire' : fire.fuelTicks > 0
                ? 'Relight campfire' : 'Light campfire (1 Material)';
            return '<h2>Settlement campfire</h2><p>' + (fire.lit ? 'Burning' : 'Unlit') + '</p>' +
                '<p>Fuel remaining: ' + Math.round(fire.fuelTicks / state.ticksPerWinter * 100) + '% of a year.</p>' +
                this.button(state, { type: 'SetCampfire', lit: !fire.lit }, label) +
                '<p class="muted">1 Material per burning year. Unused fuel is kept when extinguished. ' +
                'The fire goes out when fuel and Materials run out.</p>';
        }
        if (kind === 'longship') {
            const ship = state.landing?.longships[id];
            if (!ship)
                return '<h2>Longship</h2><p>Ship not found.</p>';
            return '<h2>Longship</h2>' + (ship.salvagedWinter === null ? '<p>Available for maritime travel. Salvaging permanently removes the ship.</p>' + this.button(state, { type: 'KeepLongship', longshipId: id }, 'Keep longship') + this.button(state, { type: 'SalvageLongship', longshipId: id }, 'Salvage longship (' + state.landing!.config.longshipSalvage + ' Materials)') : '<p>Salvaged in Winter ' + ship.salvagedWinter + '. No maritime capacity remains from this ship.</p>');
        }
        if (kind === 'persona') {
            const archived = state.personaArchive?.[id];
            if (!state.personas[id] && archived)
                return `<h2>${esc(archived.name)}</h2><p>Historical identity from ${esc(archived.originClanId)}. Current status is not observed.</p><p>Birth Winter: ${archived.birthWinter} · ${archived.dna.sex}<br>Parents: ${archived.parentIds.map(personLink).join(', ') || 'no recorded parents'}</p><details><summary>Recorded occupation history</summary>${archived.occupationHistory.map(h => `<p>${esc(h.occupation)} · ${h.startedAt.winter}–${h.endedAt?.winter ?? 'unobserved'}</p>`).join('')}</details>${history}`;
            const p = state.personas[id];
            if (!p)
                return '<p>Resident not found.</p>';
            const info = state.mechanics!.people[id], work = inspectWork(state, id), home = Object.values(state.households).find(h => h.memberIds.includes(id)), assignment = commandAvailability(state, { type: 'AssignOccupation', personaId: id, occupation: p.occupation ?? occupationIds[0] }), eligible = assignment.allowed;
            return `<h2>${esc(p.name)}</h2><p>${personaAge(state, id)} Winters · ${esc(p.dna.sex)} · ${p.deathWinter === null ? 'alive' : `deceased in Winter ${p.deathWinter}`}</p><p>Occupation: <strong>${esc(p.occupation ?? 'none')}</strong><br>Productivity: ${percent(work.productivityBps)} ${work.reason ? `(${esc(work.reason)})` : ''}</p><p>Household: ${home ? this.select('household', home.id, housingName(state, 'household', home.id)) : 'none'}</p><p>Partner: ${p.partnerId ? personLink(p.partnerId) : 'none'}<br>Parents: ${p.parentIds.map(personLink).join(', ') || 'no recorded parents'}<br>Children: ${Object.values(state.personas).filter(c => c.parentIds.includes(id)).map(c => personLink(c.id)).join(', ') || 'none'}</p>${eligible ? `<label>Occupation<select id="occupation">${this.roles(p.occupation, state, id)}</select></label><button data-action="occupation">Assign occupation</button><small data-availability hidden></small>${this.button(state, { type: 'ReleaseOccupation', personaId: id }, 'Career autonomy')}` : `<p class="muted">${p.deathWinter === null ? `Occupation unavailable: ${esc(assignment.reason)}.` : 'History and lineage remain available.'}</p>`}${careActive(state, info) ? `<p>Childcare until Winter ${info.childcareUntilWinter}${info.childcareUntilTick !== undefined ? `, tick ${info.childcareUntilTick}` : ''}</p><label>Caregiver<select id="caregiver">${option('', 'Mother', info.caregiverId)}${Object.keys(state.personas).filter(c => c === info.caregiverId || caregiverEligible(state, c)).map(c => option(c, state.personas[c].name, info.caregiverId)).join('')}</select></label><button data-action="caregiver">Assign caregiver</button><small data-availability hidden></small>` : ''}<details><summary>Occupation history</summary>${p.occupationHistory.map(h => `<p>${esc(h.occupation)} · ${h.startedAt.winter}–${h.endedAt?.winter ?? 'present'}</p>`).join('') || '<p>No occupation history.</p>'}</details>${history}`;
        }
        if (kind === 'cattle') {
            if (!state.landing?.cattle[id] && !state.landing?.cattleArchive?.[id])
                return '<h2>Livestock</h2><p>This animal is no longer present in the settlement.</p>';
            const c = inspectLivestock(state, id), yards = landingSummary(state).farmyards;
            const parents = c.parentIds.map(parentId => {
                const known = state.landing!.cattle[parentId] ?? state.landing!.cattleArchive?.[parentId];
                return known ? this.select('cattle', parentId, inspectLivestock(state, parentId).name) : 'Recorded parent';
            }).join(', ') || 'No recorded parents';
            const biology = `<h2>${esc(c.name)}</h2><p>${esc(c.speciesName)} · ${esc(c.sexTerm)} · ${c.sex} · ${c.age === null ? 'Age unobserved' : c.age + ' Winters'}${c.stage ? ' · ' + esc(c.stage) : ''}</p><p>Parents: ${parents}<br>Origin: ${esc(c.origin)}</p>`;
            if (c.historical) return biology + '<p>Historical record. Current status is not observed.</p>' +
                (c.observedAt ? `<p>Last observed in Winter ${c.observedAt.winter}, tick ${c.observedAt.tick}.</p>` : '');
            return biology + `<p>${c.deathWinter !== null ? `Died / slaughtered in Winter ${c.deathWinter}` : c.sheltered ? 'Sheltered' : 'Exposed'}</p><p>Farmyard: ${c.farmyardId ? this.select('building', c.farmyardId, housingName(state, 'building', c.farmyardId)) : 'unassigned'}</p>${c.deathWinter === null ? `<p>Annual mortality risk: ${percent(c.mortalityRiskBps)}<br>Overcrowding: ${c.overcrowding}</p><label>Farmyard<select id="farmyard">${option('', 'Exposed / unassigned', c.farmyardId)}${yards.map(f => option(f.id, housingName(state, 'building', f.id), c.farmyardId)).join('')}</select></label><button data-action="cattle">Assign livestock</button><small data-availability hidden></small>${this.button(state, { type: 'SlaughterLivestock', livestockId: id }, `Slaughter (${c.slaughterFood} Food${c.slaughterHides ? `, ${c.slaughterHides} Hides` : ''})`)}` : ''}`;
        }
        const building = kind === 'building' ? state.buildings[id] : null;
        const home = kind === 'household' ? state.households[id] : Object.values(state.households).find(h => h.residenceId && state.residences[h.residenceId]?.buildingId === id);
        if (kind === 'building' && !building)
            return '<h2>House removed</h2><p>This house has been salvaged or collapsed. Select its household to manage the tent.</p>';
        const residence = home?.residenceId ? state.residences[home.residenceId] : null;
        let html = `<h2>${esc(housingName(state, kind === 'building' ? 'building' : 'household', id))}</h2><p>Household: ${home ? esc(housingName(state, 'household', home.id)) : 'vacant'}</p>${home ? `<ul>${home.memberIds.map(id => {
            const p = state.personas[id];
            return `<li>${personLink(id)} · ${esc(p.occupation ?? 'no occupation')} · ${p.dna.sex} · ${personaAge(state, id)} Winters</li>`;
        }).join('')}</ul><p>Residence: ${esc(residence ? housingName(state, 'residence', residence.id) : 'none')}</p><label>Residence<select id="residence">${option('', 'Tent', home.residenceId)}${Object.values(state.residences).filter(r => r.kind === 'house' && canApplyCommand(state, { type: 'AssignResidence', householdId: home.id, residenceId: r.id })).map(r => option(r.id, housingName(state, 'residence', r.id), home.residenceId)).join('')}</select></label><button data-action="residence" data-household="${esc(home.id)}">Move household</button><small data-availability hidden></small>${this.button(state, { type: 'BuildHouse', householdId: home.id }, `Build house (${state.mechanics!.config.houseCost} Materials)`)}` : ''}`;
        const house = building ?? (residence?.buildingId ? state.buildings[residence.buildingId] : null);
        if (house) {
            const status = inspectBuilding(state, house.id), yard = landingSummary(state).farmyards.find(f => f.id === house.id);
            html += `<p>${this.select('building', house.id, housingName(state, 'building', house.id))} · ${status.occupied ? 'occupied' : 'vacant'}<br>Upkeep: ${status.upkeep} Materials/Winter<br>Debt: ${status.debtWinters} Winters<br>Upgrade level: ${status.upgradeLevel}</p><p>Farmyard: ${yard ? `active · ${yard.occupants} livestock · space ${yard.occupancy}/${yard.capacity} · overcrowding ${yard.overcrowding}` : 'inactive'}</p>${yard ? Object.values(state.landing!.cattle).filter(c => c.deathWinter === null && c.farmyardId === yard.id).map(c => this.select('cattle', c.id, inspectLivestock(state, c.id).name)).join(' ') : ''}`;
            if (options.homeImprovements !== false) {
                html += `<label>Specialization<select id="specialization">${this.roles(house.specialization)}</select></label><button data-action="specialize" data-building="${esc(house.id)}">Specialize</button><small data-availability hidden></small>${this.button(state, { type: 'UpgradeBuilding', buildingId: house.id }, `Upgrade (${state.mechanics!.config.upgradeCosts[status.upgradeLevel] ?? 'max'} Materials)`)}`;
            }
            html += this.button(state, { type: 'SalvageBuilding', buildingId: house.id }, `Salvage house (${Math.floor(status.investedMaterials / 2)} Materials)`);
        }
        return html;
    }
}
export function panelCommand(button: HTMLButtonElement, selection: SettlementSelection, field: (id: string) => string): SimulationCommand | null {
    if (button.dataset.command)
        return JSON.parse(button.dataset.command);
    const id = selection?.id;
    switch (button.dataset.action) {
        case 'occupation': return { type: 'AssignOccupation', personaId: id!,
            occupation: (field('occupation') || null) as Occupation | null };
        case 'caregiver': return { type: 'AssignCaregiver', motherId: id!, caregiverId: field('caregiver') || null };
        case 'residence': return { type: 'AssignResidence', householdId: button.dataset.household!,
            residenceId: field('residence') || null };
        case 'specialize': return { type: 'SpecializeBuilding', buildingId: button.dataset.building ?? id!,
            occupation: (field('specialization') || null) as Occupation | null };
        case 'cattle': return { type: 'AssignLivestock', livestockId: id!, farmyardId: field('farmyard') || null };
        default: return null;
    }
}
export function updateManagementAvailability(root: HTMLElement, campaign: import('./SharedSettlement').SharedSettlement) {
    const field = (id: string) => root.querySelector<HTMLInputElement | HTMLSelectElement>('#' + id)?.value ?? '';
    for (const button of Array.from(root.querySelectorAll<HTMLButtonElement>('button[data-action],button[data-command]'))) {
        const command = panelCommand(button, campaign.selection, field);
        if (!command)
            continue;
        const status = campaign.availability(command);
        button.disabled = !status.allowed;
        button.title = status.reason;
        let reason = button.nextElementSibling;
        if (!reason?.matches('[data-availability]')) {
            reason = document.createElement('small');
            reason.setAttribute('data-availability', '');
            button.after(reason);
        }
        reason.textContent = status.reason;
        (reason as HTMLElement).hidden = status.allowed;
    }
}
