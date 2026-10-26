# Player journey: voluntary cultural support

Baseline: `fb327996013b115bff985f7f87b7a69ff37eb24f`.
Based on the dedicated UI/UX audit of current Fjord Play, not an implemented screen.
English UI; existing campfire card, mobile sheet, simulation controls and history remain the owners.

## Journey map

| Player need | Entry/state | Feedback and next step | Authority |
| --- | --- | --- | --- |
| Find community actions | Select the existing settlement campfire | A compact Community gathering section below, separate from Material fuel | Existing picking/contextual panel |
| Understand value | View a current offer | Actual Food quote, eligible count and the specific exposure-only benefit | Read-only public culture offer |
| See who can attend | Expand participant details | Real current names/IDs; no invented crowd or all-residents claim | Core eligibility and event-time snapshots |
| Choose freely | Support gathering | Review in the same contextual card; no pause or second modal | Transient UI draft only |
| Check the commitment | Review | Sponsor · 3 Food and Not now; no automatic spending | Explicit validated command |
| Decline | Not now, close, Escape or selection change | Discard draft, restore focus; retain normal play/camera | No Core command |
| Complete once | Explicit sponsor | One accepted receipt, actual cost, actual attendance and finite contribution | Atomic Core transaction |
| Understand a rejection | Stale roster, insufficient Food, full support bank or unavailable state | Specific visible reason; recoverable draft/refreshed offer | Core revalidation, not a stuck pending flag |
| See the occasion | Optional visible approach/gathering | Existing real actors walk/stage when available; missing assets skip decoration | Presentation consumes committed facts |
| Read what happened | Recorded gathering/history | Existing Activity Center, Chronicle and real participant links | Canonical event and frozen facts |
| Understand later value | Actual adverse exposure assessment | Explain the applied bounded weather-exposure change and source, without claiming a saved life from an unobserved counterfactual | Existing shared mortality authority |
| Keep playing without sponsorship | Ignore the section indefinitely | No compulsory prompt, upkeep, missed-event penalty or clock manipulation | Existing baseline rules |

## Offer and commit integrity

The proposed public contract contains a stable expected gathering sequence, quoted integer Food
and the sorted expected participant IDs. Recompute eligibility on commit: a changed roster is
rejected for a fresh review rather than silently replacing the people the player saw.
A matching accepted request returns unchanged; a conflicting receipt rejects. UI completion is
not the duplicate-charge authority. At the finite support cap, reject before spending anything.

The current interface only has success callbacks for queued commands. The implementation must
provide a settled/rejection path or keep drafts recoverable, so a failed command cannot leave
Sponsor disabled forever. Selection, pause, tab return and reload must never resubmit a draft.

## Mobile and accessibility

- Reuse the existing MobileShell/mobile-horizon safe-area sheet and 44px targets.
- Keep the quote, Sponsor, Not now and close visible; expand names only on demand.
- Contain scrolling within the card and preserve map/camera gestures outside it.
- Return focus after cancellation and announce accepted/rejected status with role=status.
- Do not add another navigation row, cultural HUD meter, full-screen festival editor or annual modal.
- Ordinary legacy/disabled campaigns do not get a purchasable Food-for-no-benefit placeholder.
- Use an honest prototype label until the connected benefit is measured and reviewed.

## Follow-on occasions

#277 uses the same card/transaction for an eligible existing partnership and a generic communal
ceremony. It cannot create or redate a partnership, invent gods or add a separate faith system.
#278 genuine assistance should appear through existing history/attention, not another sponsorship
modal. Funeral/remembrance remains deferred unless explicitly selected by the owner.

## Planned ownership

- UI agent: CulturalGatheringView, narrow contextual interface integration and CSS.
- Core agent: offer, validation, snapshots, idempotency and real consequence.
- Integration owner: existing history projections and scene/presentation coordination.
- Motion/audio/lighting/performance: bounded decoration of a current accepted event only.

The journey is a design input. No browser, touch, keyboard or physical-device acceptance is claimed
until the actual integrated screen is exercised.
