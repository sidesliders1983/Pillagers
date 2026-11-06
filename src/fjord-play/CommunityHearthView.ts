import { inspectCommunityHearth } from '../simulation/SimulationCore';
import { communityHearthTiers } from '../simulation/CommunityHearth';
import type { SimulationCommand, SimulationState } from '../simulation/SimulationCore';

type Upgrade = Extract<SimulationCommand, { type: 'UpgradeCommunityHearth' }>;
export type HearthUpgradeOffer = { command?: Upgrade; reason?: string };

const escape = (value: unknown) => String(value ?? '').replace(/[&<>"']/g,
    character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]!));
const percent = (bps: number) => `${bps / 100}%`;
const multiplier = (bps: number) => `×${(bps / 10000).toFixed(2)}`;

export function renderCommunityHearth(state: SimulationState, offer: HearthUpgradeOffer, canFocus: boolean) {
    const hearth = inspectCommunityHearth(state);
    if (!hearth.enabled) return '';
    const { coverage, lastAssessment } = hearth;
    const next = hearth.nextTier === null ? undefined : communityHearthTiers[hearth.nextTier];
    const exposed = hearth.affectedResidentIds.map(id => escape(state.personas[id]?.name ?? id));
    const assessment = lastAssessment ? `<details data-view-key="hearth-assessment">
        <summary>Last winter assessment · ${lastAssessment.weatherWinter}</summary>
        <p>Warmth factor for eligible weather exposure: ${percent(lastAssessment.heatReductionBps)}.</p>
        ${lastAssessment.risks.length ? `<ul>${lastAssessment.risks.map(row => `<li>${escape(state.personas[row.personaId]?.name ?? row.personaId)}:
            ${percent(row.baselineWeatherExposureBps)} exposed → ${percent(row.heatedWeatherExposureBps)} after warmth
            → ${percent(row.weatherExposureBps)} after prepared support. Natural risk ${percent(row.naturalRiskBps)}.</li>`).join('')}</ul>` :
            '<p>No local resident had extra cold exposure in this assessment.</p>'}
        </details>` : '';
    const upgrade = next ? `<div class="fjord-culture-price" data-view-key="hearth-upgrade">
        <h3>${escape(next.name)} · ${hearth.upgradeMaterials} Materials</h3>
        <p>Full winter warmth ${percent(hearth.fullWinterHeatReductionBps)} → ${percent(next.fullWinterHeatReductionBps)}.
            New occasion support ${multiplier(hearth.venueMultiplierBps)} → ${multiplier(next.venueMultiplierBps)}.</p>
        <button type="button" data-ui="hearth-upgrade"
            ${offer.command ? `data-hearth-command="${escape(JSON.stringify(offer.command))}"` : 'disabled'}>
            Upgrade to ${escape(next.name)} · ${hearth.upgradeMaterials} Materials</button>
        ${offer.reason ? `<p class="fjord-caption">${escape(offer.reason)}</p>` : ''}
        </div>` : `<p class="fjord-caption">Clan Hall is the final upgrade.</p>
        ${offer.reason ? `<p class="fjord-caption">${escape(offer.reason)}</p>` : ''}`;
    return `<section class="fjord-culture" aria-label="Community Hearth" data-view-key="community-hearth">
        <small class="fjord-culture-prototype">Community Hearth trial</small>
        <h3>Winter warmth</h3>
        <p>Winter ${coverage.winter}: ${coverage.heatedTicks} / ${coverage.coldWindowTicks} cold ticks heated.
            Effective reduction earned: ${percent(coverage.effectiveHeatReductionBps)}.</p>
        <p class="fjord-caption">Paid fire operation protects local residents with extra cold exposure.
            A full winter at this tier reduces that component by ${percent(hearth.fullWinterHeatReductionBps)}.
            Permanent homes prevent that exposure.</p>
        ${exposed.length ? `<details data-view-key="hearth-exposed"><summary>${exposed.length} exposed local residents</summary>
            <ul>${exposed.map(name => `<li>${name}</li>`).join('')}</ul></details>` :
            '<p class="fjord-caption">No local residents currently have extra cold exposure.</p>'}
        ${assessment}
        <p>Newly earned occasion support: ${multiplier(hearth.venueMultiplierBps)} effectiveness.</p>
        ${canFocus ? '<button type="button" data-ui="hearth-focus">View community hearth</button>' : ''}
        ${upgrade}
    </section>`;
}
