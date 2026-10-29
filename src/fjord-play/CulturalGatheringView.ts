import { gatheringOffer, weddingCandidates } from '../simulation/SimulationCore';
import type { SimulationState } from '../simulation/SimulationCore';
import './cultural-gathering.css';

export type GatheringOffer = ReturnType<typeof gatheringOffer>;
export type GatheringChoice = { occasion: GatheringOffer['occasion']; sourceEventId?: string };
const occasionLabels: Record<GatheringOffer['occasion'], string> = {
    storytelling_music: 'Storytelling & music',
    communal_ceremony: 'Communal ceremony',
    wedding: 'Wedding celebration',
};
const escape = (value: unknown) => String(value ?? '').replace(/[&<>"']/g,
    character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]!));

function foodQuote(offer: GatheringOffer): string {
    if (offer.foodCostBasis === 'per_participant' && offer.foodPerParticipant !== null) {
        return `<p class="fjord-culture-price" data-culture-price><span>${offer.foodPerParticipant} Food per attendee</span>
            × <span>${offer.participantIds.length} attendees</span> = <strong>${offer.foodCost} Food total</strong></p>`;
    }
    return `<p class="fjord-culture-price" data-culture-price><strong>${offer.foodCost} Food total</strong>
        · ${offer.participants.length} available residents</p>`;
}

/** Exact shared resource quote, including ordinary campfire fuel when required. */
export function renderGatheringPrice(offer: GatheringOffer): string {
    return foodQuote(offer) + (offer.requiresCampfire ?
        `<p class="fjord-caption" data-culture-materials>+ ${offer.materialsCost} ${offer.materialsCost === 1 ? 'Material' : 'Materials'}
            · ${offer.materialsCost ? 'campfire fuel' : 'uses existing campfire fuel'}</p>` : '');
}

function partnershipChoice(state: SimulationState, choice: GatheringChoice, canReadHistory: boolean): string {
    if (choice.occasion !== 'wedding') return '';
    const candidates = weddingCandidates(state);
    const selected = candidates.find(candidate => candidate.sourceEventId === choice.sourceEventId);
    return `<label class="fjord-culture-choice">Couple
        <select data-culture-partnership aria-label="Wedding partnership">
            <option value="">Select a recent partnership</option>
            ${candidates.map(candidate => `<option value="${escape(candidate.sourceEventId)}"${
                candidate.sourceEventId === choice.sourceEventId ? ' selected' : ''}${candidate.allowed ? '' : ' disabled'}>${
                escape(candidate.spouses.map(person => person.name).join(' & '))}</option>`).join('')}
        </select></label>
        <p class="fjord-caption">Celebrate within one game year of a new partnership formed during play.
            Founding partnerships are not wedding occasions. The partnership already exists.</p>
        ${!candidates.length ? '<p class="fjord-caption">No recent eligible partnership is recorded.</p>' : ''}
        ${canReadHistory && selected ? `<button type="button" data-ui="culture-partnership-record"
            data-culture-event="${escape(selected.sourceEventId)}">Read partnership record</button>` : ''}`;
}

/** A current Core quote; displaying the card never commits a cultural event. */
export function renderGatheringCard(state: SimulationState, canReadHistory = false,
    choice: GatheringChoice = { occasion: 'storytelling_music' }): string {
    const offer = gatheringOffer(state, choice.occasion, choice.sourceEventId);
    if (!offer.enabled) return '';
    return `<section class="fjord-culture" aria-label="Community gathering">
        <small class="fjord-culture-prototype">Community occasions</small>
        <label class="fjord-culture-choice">Occasion
            <select data-culture-occasion aria-label="Cultural occasion">
                ${Object.entries(occasionLabels).map(([value, label]) => `<option value="${value}"${
                    offer.occasion === value ? ' selected' : ''}>${escape(label)}</option>`).join('')}
            </select></label>
        <h3>${escape(occasionLabels[offer.occasion])}</h3>
        ${partnershipChoice(state, choice, canReadHistory)}
        <p>Share a gathering with available residents. Sponsorship is optional.</p>
        ${renderGatheringPrice(offer)}
        <p class="fjord-caption">Prepared support: ${offer.supportCount} of ${offer.supportCapacity}.
            One support reduces added Harsh/Severe weather-exposure risk by ${offer.exposureReductionBps / 100}%.
            It does not reduce natural mortality.</p>
        <button type="button" data-ui="culture-review"${offer.allowed ? '' : ' disabled aria-describedby="culture-unavailable"'}>Support gathering</button>
        ${canReadHistory && offer.lastGatheringEventId ? `<button type="button" data-ui="culture-record"
            data-culture-event="${escape(offer.lastGatheringEventId)}">Read last gathering</button>` : ''}
        ${offer.reason ? `<p id="culture-unavailable" class="fjord-caption">${escape(offer.reason)}</p>` : ''}
    </section>`;
}

/** The roster and cost are the quote the player is reviewing, not renderer attendance. */
export function renderGatheringReview(offer: GatheringOffer, current = offer, feedback = '', pending = false): string {
    const spouseNames = (offer.spouseIds ?? []).flatMap(id => {
        const person = offer.participants.find(participant => participant.id === id);
        return person ? [person.name] : [];
    });
    const changed = offer.expectedSequence !== current.expectedSequence || offer.foodCost !== current.foodCost ||
        offer.occasion !== current.occasion || offer.sourceEventId !== current.sourceEventId ||
        offer.materialsCost !== current.materialsCost ||
        JSON.stringify(offer.participantIds) !== JSON.stringify(current.participantIds);
    const reason = current.reason ?? (changed ? 'The gathering has changed. Review the updated attendance.' : null);
    return `<section class="fjord-culture" aria-label="Gathering review">
        <small class="fjord-culture-prototype">Community occasions</small>
        <h3>${escape(occasionLabels[offer.occasion])}</h3>
        ${offer.occasion === 'wedding' ? `${spouseNames.length === 2 ?
            `<p data-culture-couple><strong>${spouseNames.map(escape).join(' &amp; ')}</strong></p>` : ''}
            <p>The partnership is already recorded. This sponsors its celebration.</p>` : ''}
        ${renderGatheringPrice(offer)}
        <details><summary>${current.participants.length} currently available residents</summary>
            <ul>${current.participants.map(person => `<li>${escape(person.name)}</li>`).join('')}</ul>
        </details>
        <p class="fjord-caption">One prepared support is used when it can reduce a real resident’s weather-exposure risk.
            Up to ${offer.supportCapacity} supports can be kept; their strength does not stack. No penalty for declining.</p>
        <p class="fjord-culture-feedback" role="status">${escape(feedback || (pending ? 'Supporting gathering…' : reason ?? ''))}</p>
        <div class="fjord-actions"><button type="button" data-ui="culture-sponsor"${pending || reason ? ' disabled' : ''}>Sponsor · ${offer.foodCost} Food</button>
            ${changed && current.allowed ? '<button type="button" data-ui="culture-review">Review updated gathering</button>' : ''}
            <button type="button" data-ui="culture-cancel"${pending ? ' disabled' : ''}>Not now</button></div>
    </section>`;
}
