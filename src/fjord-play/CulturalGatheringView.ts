import { gatheringOffer } from '../simulation/SimulationCore';
import type { SimulationState } from '../simulation/SimulationCore';
import './cultural-gathering.css';

export type GatheringOffer = ReturnType<typeof gatheringOffer>;
const escape = (value: unknown) => String(value ?? '').replace(/[&<>"']/g,
    character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]!));

/** A current Core quote; displaying the card never commits a cultural event. */
export function renderGatheringCard(state: SimulationState, canReadHistory = false): string {
    const offer = gatheringOffer(state);
    if (!offer.enabled) return '';
    return `<section class="fjord-culture" aria-label="Community gathering">
        <small class="fjord-culture-prototype">Cultural gathering prototype</small>
        <h3>Storytelling &amp; music</h3>
        <p>Share a gathering with available residents. Sponsorship is optional.</p>
        <p><strong>${offer.foodCost} Food</strong> · ${offer.participants.length} available residents</p>
        <p class="fjord-caption">Prepared support: ${offer.supportCount} of ${offer.supportCapacity}.
            One support reduces added Harsh/Severe weather-exposure risk by ${offer.exposureReductionBps / 100}%.
            It does not reduce natural mortality.</p>
        <button type="button" data-ui="culture-review"${offer.allowed ? '' : ' disabled aria-describedby="culture-unavailable"'}>Support gathering</button>
        ${canReadHistory && offer.lastGatheringEventId ? `<button type="button" data-ui="culture-record" data-culture-event="${escape(offer.lastGatheringEventId)}">Read last gathering</button>` : ''}
        ${offer.reason ? `<p id="culture-unavailable" class="fjord-caption">${escape(offer.reason)}</p>` : ''}
    </section>`;
}

/** The roster and cost are the quote the player is reviewing, not renderer attendance. */
export function renderGatheringReview(offer: GatheringOffer, current = offer, feedback = '', pending = false): string {
    const changed = offer.expectedSequence !== current.expectedSequence || offer.foodCost !== current.foodCost ||
        JSON.stringify(offer.participantIds) !== JSON.stringify(current.participantIds);
    const reason = current.reason ?? (changed ? 'The gathering has changed. Review the updated attendance.' : null);
    return `<section class="fjord-culture" aria-label="Gathering review">
        <small class="fjord-culture-prototype">Cultural gathering prototype</small>
        <h3>Storytelling &amp; music</h3>
        <p>This will cost <strong>${offer.foodCost} Food</strong>.</p>
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
